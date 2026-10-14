import { createContext, useContext } from 'react'
import type { Workspace } from '../../../shared/planner/model'
import type { Rehearsal } from '../../../shared/planner/plan'
import type { Format } from './format'
import type { Wording } from './planText'

export type WorkspaceView = { workspace: Workspace; rehearsal: Rehearsal; format: Format; words: Wording }

export const WorkspaceViewContext = createContext<WorkspaceView | null>(null)

export function useWorkspaceView() {
  const view = useContext(WorkspaceViewContext)
  if (!view) throw new Error('useWorkspaceView must be used inside WorkspaceViewContext')
  return view
}
