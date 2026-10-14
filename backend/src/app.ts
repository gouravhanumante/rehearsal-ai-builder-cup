import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { ZodError } from 'zod'
import { assistantRequestSchema } from './contracts.js'
import { answerWithGemini, GeminiNotConfiguredError, isGeminiConfigured } from './gemini.js'

const assistantLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many questions. Try again in a minute.' } },
})

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(express.json({ limit: '24kb' }))

  app.get('/api/health', (_request, response) => {
    response.json({
      status: 'ok',
      aiConfigured: isGeminiConfigured(),
      model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
    })
  })

  app.post('/api/assistant/ask', assistantLimiter, async (request, response) => {
    const parsed = assistantRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Check the question and supplied workspace facts, then try again.',
          fields: parsed.error.issues.map((issue) => issue.path.join('.')),
        },
      })
      return
    }

    if (!isGeminiConfigured()) {
      response.status(503).json({
        error: { code: 'AI_NOT_CONFIGURED', message: 'Gemini is not configured on the server yet.' },
      })
      return
    }

    try {
      const result = await answerWithGemini(parsed.data)
      response.json(result)
    } catch (error) {
      if (error instanceof GeminiNotConfiguredError) {
        response.status(503).json({
          error: { code: 'AI_NOT_CONFIGURED', message: 'Gemini is not configured on the server yet.' },
        })
        return
      }
      if (error instanceof ZodError || error instanceof SyntaxError) {
        response.status(502).json({
          error: { code: 'AI_RESPONSE_INVALID', message: 'The AI response could not be verified. Please retry.' },
        })
        return
      }
      response.status(502).json({
        error: { code: 'AI_UNAVAILABLE', message: 'Gemini could not answer right now. Please retry.' },
      })
    }
  })

  app.use((_request, response) => {
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'This API route does not exist.' } })
  })

  return app
}
