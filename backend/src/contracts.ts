import { z } from 'zod'

const factSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(100),
  value: z.string().max(500).nullable(),
  evidenceStatus: z.enum(['confirmed', 'unknown']),
  source: z.string().max(160).optional(),
}).strict()

const checkedOptionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(140),
  status: z.enum(['ready', 'conditional', 'rejected']),
  reason: z.string().max(500),
  outcome: z.string().max(300),
  cost: z.string().max(120),
}).strict()

export const assistantRequestSchema = z.object({
  workspaceName: z.string().min(1).max(80),
  question: z.string().trim().min(1).max(1200),
  facts: z.array(factSchema).max(40),
  options: z.array(checkedOptionSchema).max(8),
}).strict()

export type AssistantRequest = z.infer<typeof assistantRequestSchema>

export const assistantResponseSchema = z.object({
  answer: z.string().trim().min(1).max(1400),
  referencedOptionIds: z.array(z.string()).max(8),
  recommendedOptionId: z.string().nullable(),
}).strict()

export type AssistantResponse = z.infer<typeof assistantResponseSchema>
