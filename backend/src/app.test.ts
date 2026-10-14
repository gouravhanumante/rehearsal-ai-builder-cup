import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { geminiModel } from './gemini.js'

const originalApiKey = process.env.GEMINI_API_KEY
const originalModel = process.env.GEMINI_MODEL

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
  if (originalModel === undefined) delete process.env.GEMINI_MODEL
  else process.env.GEMINI_MODEL = originalModel
})

describe('assistant API', () => {
  it('reports the model it actually uses, without exposing credentials', async () => {
    delete process.env.GEMINI_API_KEY
    delete process.env.GEMINI_MODEL
    await withServer(async (url) => {
      const response = await fetch(`${url}/api/health`)
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body).toMatchObject({ status: 'ok', aiConfigured: false, model: geminiModel() })
      expect(body.model).toBe('gemini-3.5-flash-lite')
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

describe('document reading API', () => {
  it('rejects a file whose contents do not match the type it claims, before any model call', async () => {
    process.env.GEMINI_API_KEY = 'test-key-not-used'
    await withServer(async (url) => {
      const response = await fetch(`${url}/api/documents/extract`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: 'quote.png',
          mimeType: 'image/png',
          dataBase64: Buffer.from('this is not really an image').toString('base64').replace(/=+$/, ''),
          fields: [{ key: 'availableCases', label: 'Stock', type: 'integer' }],
        }),
      })
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: { code: 'INVALID_DOCUMENT' } })
    })
  })

  it('answers an oversized upload with a clear JSON error', async () => {
    await withServer(async (url) => {
      const response = await fetch(`${url}/api/documents/extract`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dataBase64: 'A'.repeat(7 * 1024 * 1024) }),
      })
      expect(response.status).toBe(413)
      expect(await response.json()).toMatchObject({ error: { code: 'TOO_LARGE' } })
    })
  })
})
