import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from './app.js'

const originalApiKey = process.env.GEMINI_API_KEY

async function withServer(run: (url: string) => Promise<void>) {
  const server = createApp().listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server did not bind a TCP port.')
  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

afterEach(() => {
  if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = originalApiKey
})

describe('assistant API', () => {
  it('reports readiness without exposing credentials', async () => {
    delete process.env.GEMINI_API_KEY
    await withServer(async (url) => {
      const response = await fetch(`${url}/api/health`)
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body).toMatchObject({ status: 'ok', aiConfigured: false, model: 'gemini-3.8-flash' })
      expect(JSON.stringify(body)).not.toContain('GEMINI_API_KEY')
    })
  })

  it('returns a clear setup error instead of pretending Gemini answered', async () => {
    delete process.env.GEMINI_API_KEY
    await withServer(async (url) => {
      const response = await fetch(`${url}/api/assistant/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceName: 'Northstar', question: 'What is at risk?', facts: [], options: [] }),
      })
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({ error: { code: 'AI_NOT_CONFIGURED' } })
    })
  })

  it('rejects oversized or malformed assistant context before any model call', async () => {
    await withServer(async (url) => {
      const response = await fetch(`${url}/api/assistant/ask`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: '   ', facts: [], options: [] }),
      })
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } })
    })
  })
})
