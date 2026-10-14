import { GoogleGenAI } from '@google/genai'
import { z, ZodError } from 'zod'
import { assistantResponseSchema, type AssistantRequest, type AssistantResponse } from './contracts.js'

const DEFAULT_MODEL = 'gemini-3.5-flash-lite'
const UNSAFE_NUMERIC_ANSWER = 'I can explain the options, but I may have misstated a figure. Please use the confirmed values shown in the dashboard.'

const outputSchema = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    referencedOptionIds: { type: 'array', items: { type: 'string' } },
    recommendedOptionId: { type: ['string', 'null'] },
  },
  required: ['answer', 'referencedOptionIds', 'recommendedOptionId'],
  additionalProperties: false,
}

const MAX_ANSWER = 1400
const rawOutputSchema = z.object({
  answer: z.string().trim().min(1),
  referencedOptionIds: z.array(z.string()),
  recommendedOptionId: z.string().nullable(),
})

/** Cut an over-long answer at the last full sentence that fits. */
function trimAnswer(answer: string) {
  if (answer.length <= MAX_ANSWER) return answer
  const cut = answer.slice(0, MAX_ANSWER - 1)
  const end = cut.lastIndexOf('. ')
  return end > MAX_ANSWER / 2 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`
}

export class GeminiNotConfiguredError extends Error {
  constructor() {
    super('Gemini is not configured on the server.')
    this.name = 'GeminiNotConfiguredError'
  }
}

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim())
}

export function geminiModel() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL
}

function hasUnsupportedNumbers(answer: string, request: AssistantRequest) {
  const verifiedContext = JSON.stringify({
    facts: request.facts.filter((fact) => fact.evidenceStatus !== 'unknown'),
    options: request.options,
  })
  const verifiedNumbers = new Set(verifiedContext.match(/\d[\d,]*(?:\.\d+)?/g) ?? [])
  const answerNumbers = answer.match(/\d[\d,]*(?:\.\d+)?/g) ?? []
  return answerNumbers.some((number) => !verifiedNumbers.has(number))
}

export function validateAssistantOutput(
  value: unknown,
  request: AssistantRequest,
): AssistantResponse {
  // Shape is checked strictly; length is trimmed rather than failing a good answer for being long.
  const loose = rawOutputSchema.parse(value)
  const parsed = assistantResponseSchema.parse({
    answer: trimAnswer(loose.answer),
    referencedOptionIds: loose.referencedOptionIds.slice(0, 8),
    recommendedOptionId: loose.recommendedOptionId,
  })
  const optionsById = new Map(request.options.map((option) => [option.id, option]))
  const referencedOptionIds = [...new Set(parsed.referencedOptionIds)]
    .filter((id) => optionsById.has(id))
  const recommendedOption = parsed.recommendedOptionId
    ? optionsById.get(parsed.recommendedOptionId)
    : undefined
  const recommendedOptionId = recommendedOption?.status === 'ready' ? recommendedOption.id : null

  return {
    answer: hasUnsupportedNumbers(parsed.answer, request) ? UNSAFE_NUMERIC_ANSWER : parsed.answer,
    referencedOptionIds,
    recommendedOptionId,
  }
}

async function askGemini(request: AssistantRequest): Promise<AssistantResponse> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) throw new GeminiNotConfiguredError()

  const ai = new GoogleGenAI({ apiKey })
  const model = geminiModel()
  const prompt = JSON.stringify({
    workspaceName: request.workspaceName,
    earlierInThisConversation: request.history ?? [],
    question: request.question,
    facts: request.facts,
    checkedOptions: request.options,
  })
  const interaction = await ai.interactions.create({
    model,
    input: prompt,
    store: false,
    generation_config: {
      thinking_level: 'low',
      max_output_tokens: 900,
      temperature: 0.2,
    },
    system_instruction: [
      'You are Rehearsal, an assistant for small-business operations recovery.',
      'Use only the supplied workspace facts. A fact marked unknown is not known; say so plainly. Treat every other fact as the business\'s own data: never comment on whether something is verified, unverified, typed in, or backed by a document.',
      'earlierInThisConversation holds the previous questions and your answers, oldest first. Use it to understand follow-up questions such as "what about the other one?", but answer from the current facts, which may have changed.',
      'Never invent or calculate quantities, dates, prices, stock, or capacity. You may repeat a number exactly as it appears in the facts or options (for example how many are short at a warehouse); never add, subtract, or estimate one.',
      'Keep the answer under 120 words.',
      'Explain the checked options in everyday language. You may recommend only an option whose supplied status is ready.',
      'Return referencedOptionIds only for supplied option IDs. Do not claim that business data changed, that an order was placed, or that a message was sent.',
      'If the supplied facts do not answer the question, say what information is missing.',
    ].join(' '),
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: outputSchema,
    },
  }, { timeout: 15_000, maxRetries: 0 })

  if (!interaction.output_text) throw new Error('Gemini returned no text response.')
  return validateAssistantOutput(JSON.parse(interaction.output_text), request)
}

/** Ask once more if the first reply could not be read; a second bad reply is reported to the user. */
export async function answerWithGemini(request: AssistantRequest, ask = askGemini): Promise<AssistantResponse> {
  try {
    return await ask(request)
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) return ask(request)
    throw error
  }
}
