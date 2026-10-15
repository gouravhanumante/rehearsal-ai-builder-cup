import type { Workspace } from '../../../shared/planner/model'
import { parseWorkspace } from '../../../shared/planner/validate'

/** The long lists are stored as separate size-bounded documents; Firestore refuses documents over 1 MiB. */
export const LIST_NAMES = ['products', 'locations', 'stock', 'storageLimits', 'orders', 'shipments', 'routes', 'suppliers', 'history'] as const
export type ListName = typeof LIST_NAMES[number]
/** Lists older or smaller workspaces may not have; when absent or empty they stay in the core document as they are. */
const OPTIONAL_LISTS: readonly ListName[] = ['storageLimits', 'history']
export const MAX_CHUNK_BYTES = 600_000

export type Chunk = { id: string; list: ListName; index: number; json: string }
export type CoreDocument = { json: string; chunkIds: string[]; revision: number }

const encoder = new TextEncoder()
const byteLength = (text: string) => encoder.encode(text).length

/** Splits a workspace into one small "core" document and size-bounded chunks, keeping the order of every list. */
export function splitWorkspace(workspace: Workspace, maxBytes = MAX_CHUNK_BYTES): { coreJson: string; chunks: Chunk[] } {
  const core: Record<string, unknown> = { ...workspace }
  const chunks: Chunk[] = []
  for (const list of LIST_NAMES) {
    const all = workspace[list] as unknown[] | undefined
    if (OPTIONAL_LISTS.includes(list) && !all?.length) continue
    delete core[list]
    let items: unknown[] = []
    let size = 2
    const flush = () => {
      if (items.length === 0) return
      chunks.push({ id: `${list}-${chunks.filter((chunk) => chunk.list === list).length}`, list, index: chunks.filter((chunk) => chunk.list === list).length, json: JSON.stringify(items) })
      items = []
      size = 2
    }
    for (const item of all ?? []) {
      const itemSize = byteLength(JSON.stringify(item)) + 1
      if (itemSize > maxBytes) throw new Error(`One ${list.slice(0, -1)} is too large to save online.`)
      if (size + itemSize > maxBytes) flush()
      items.push(item)
      size += itemSize
    }
    flush()
  }
  return { coreJson: JSON.stringify(core), chunks }
}

/** Puts the pieces back together and checks the result like any other saved data: it came from outside the app. */
export function joinWorkspace(coreJson: string, chunks: Pick<Chunk, 'list' | 'index' | 'json'>[]): Workspace | null {
  try {
    const joined: Record<string, unknown> = { ...JSON.parse(coreJson) as Record<string, unknown> }
    for (const list of LIST_NAMES) {
      const pieces = chunks.filter((chunk) => chunk.list === list)
      if (pieces.length === 0 && OPTIONAL_LISTS.includes(list)) continue
      joined[list] = pieces.sort((a, b) => a.index - b.index).flatMap((chunk) => JSON.parse(chunk.json) as unknown[])
    }
    return parseWorkspace(joined)
  } catch {
    return null
  }
}

export async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export type SyncedState = { revision: number; hashes: Record<string, string> }

/** What a save has to write: only chunks whose content changed, and the ids of chunks that no longer exist. */
export async function diffChunks(chunks: Chunk[], previous: Record<string, string>) {
  const hashes: Record<string, string> = {}
  const write: Chunk[] = []
  for (const chunk of chunks) {
    hashes[chunk.id] = await hashText(chunk.json)
    if (previous[chunk.id] !== hashes[chunk.id]) write.push(chunk)
  }
  const remove = Object.keys(previous).filter((id) => !(id in hashes))
  return { write, remove, hashes }
}
