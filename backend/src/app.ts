import express from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { ZodError } from 'zod'
import { assistantRequestSchema } from './contracts.js'
import { detectMimeType, extractRequestSchema, extractWithGemini } from './documents.js'
import { mapColumnsWithGemini, mappingRequestSchema } from './importMapping.js'
import { answerWithGemini, GeminiNotConfiguredError, geminiModel, isGeminiConfigured } from './gemini.js'
import { rehearse } from '../../shared/planner/plan.js'
import { parseWorkspace } from '../../shared/planner/validate.js'

const assistantLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many questions. Try again in a minute.' } },
})

const documentLimiter = rateLimit({
  windowMs: 60_000,
  limit: 6,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many documents. Try again in a minute.' } },
})

const mappingLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in a minute.' } },
})

const notConfigured = { error: { code: 'AI_NOT_CONFIGURED', message: 'Gemini is not configured on the server yet.' } }

const planCheckLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many checks. Try again in a minute.' } },
})

function sendAiFailure(error: unknown, response: express.Response) {
  if (error instanceof GeminiNotConfiguredError) {
    response.status(503).json(notConfigured)
    return
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    response.status(502).json({
      error: { code: 'AI_RESPONSE_INVALID', message: 'The AI response could not be verified. Please retry.' },
    })
    return
  }
  if (error instanceof Error && /timeout|timed out/i.test(error.message)) {
    response.status(504).json({
      error: { code: 'AI_TIMEOUT', message: 'Gemini is taking too long. Please retry.' },
    })
    return
  }
  response.status(502).json({
    error: { code: 'AI_UNAVAILABLE', message: 'Gemini could not answer right now. Please retry.' },
  })
}

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(helmet())
  // Documents and whole workspaces need bigger bodies than questions; these parsers run first for those routes.
  app.use('/api/documents', express.json({ limit: '6mb' }))
  app.use('/api/plans', express.json({ limit: '2mb' }))
  app.use(express.json({ limit: '24kb' }))

  app.get('/api/health', (_request, response) => {
    response.json({
      status: 'ok',
      aiConfigured: isGeminiConfigured(),
      model: geminiModel(),
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
      response.status(503).json(notConfigured)
      return
    }

    try {
      const result = await answerWithGemini(parsed.data)
      response.json(result)
    } catch (error) {
      sendAiFailure(error, response)
    }
  })

  // The browser shows plans from its own copy of the planner; this re-runs it on the server before approval.
  app.post('/api/plans/check', planCheckLimiter, (request, response) => {
    const body = request.body as { workspace?: unknown; planId?: unknown }
    const workspace = parseWorkspace(body?.workspace)
    if (!workspace || typeof body.planId !== 'string' || body.planId.length > 200) {
      response.status(400).json({ error: { code: 'INVALID_WORKSPACE', message: 'The workspace data could not be checked.' } })
      return
    }
    const { plans, conflicts } = rehearse(workspace)
    const plan = plans.find((item) => item.id === body.planId)
    response.json({
      planId: body.planId,
      ready: plan?.status === 'ready',
      status: plan?.status ?? 'missing',
      unverified: plan?.unverified.length ?? 0,
      openConflicts: conflicts.filter((conflict) => !conflict.decided).length,
    })
  })

  app.post('/api/documents/extract', documentLimiter, async (request, response) => {
    const parsed = extractRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({
        error: {
          code: 'INVALID_DOCUMENT',
          message: 'Use a PNG, JPG, WEBP photo or a PDF under 4 MB.',
          fields: parsed.error.issues.map((issue) => issue.path.join('.')),
        },
      })
      return
    }
    if (detectMimeType(parsed.data.dataBase64) !== parsed.data.mimeType) {
      response.status(400).json({
        error: { code: 'INVALID_DOCUMENT', message: 'That file does not look like the photo or PDF it claims to be.' },
      })
      return
    }
    if (!isGeminiConfigured()) {
      response.status(503).json(notConfigured)
      return
    }

    try {
      response.json(await extractWithGemini(parsed.data))
    } catch (error) {
      sendAiFailure(error, response)
    }
  })

  app.post('/api/imports/map', mappingLimiter, async (request, response) => {
    const parsed = mappingRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      response.status(400).json({ error: { code: 'INVALID_IMPORT', message: 'The column names could not be read.' } })
      return
    }
    if (!isGeminiConfigured()) {
      response.status(503).json(notConfigured)
      return
    }
    try {
      response.json(await mapColumnsWithGemini(parsed.data))
    } catch (error) {
      sendAiFailure(error, response)
    }
  })

  app.use((_request, response) => {
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'This API route does not exist.' } })
  })

  app.use((error: { type?: string; status?: number }, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error.type === 'entity.too.large') {
      response.status(413).json({ error: { code: 'TOO_LARGE', message: 'That upload is too large. Use a file under 4 MB.' } })
      return
    }
    response.status(error.status && error.status < 500 ? error.status : 500).json({
      error: { code: 'BAD_REQUEST', message: 'The request could not be read.' },
    })
  })

  return app
}
