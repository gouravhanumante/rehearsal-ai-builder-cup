import { describe, expect, it } from 'vitest'
import type { AssistantRequest } from './contracts.js'
import { answerWithGemini, validateAssistantOutput } from './gemini.js'

const request: AssistantRequest = {
  workspaceName: 'Northstar Supply',
  question: 'Can the transfer protect the priority order?',
  facts: [
    { id: 'north-stock', label: 'North Hub stock', value: '14 cases', evidenceStatus: 'confirmed', source: 'Opening sample count' },
    { id: 'supplier-b', label: 'Supplier B stock', value: null, evidenceStatus: 'unknown' },
  ],
  options: [
    { id: 'transfer', title: 'Transfer stock from South Hub', status: 'ready', reason: '8 cases fit within the 8-case daily limit.', outcome: 'Protects the priority order.', cost: 'Estimated $95.' },
    { id: 'expedite', title: 'Emergency supplier shipment', status: 'conditional', reason: 'Supplier facts are unknown.', outcome: 'May protect the order.', cost: 'Unknown.' },
  ],
}

describe('Gemini response guardrails', () => {
  it('references only known options and recommends only a planner-ready option', () => {
    const response = validateAssistantOutput({
      answer: 'The transfer can protect the priority order.',
      referencedOptionIds: ['transfer', 'invented-option'],
      recommendedOptionId: 'expedite',
    }, request)

    expect(response).toEqual({
      answer: 'The transfer can protect the priority order.',
      referencedOptionIds: ['transfer'],
      recommendedOptionId: null,
    })
  })

  it('replaces ungrounded numeric claims with a safe dashboard reference', () => {
    const response = validateAssistantOutput({
      answer: 'North Hub has 40 cases available.',
      referencedOptionIds: [],
      recommendedOptionId: 'transfer',
    }, request)

    expect(response.answer).toContain('use the confirmed values shown in the dashboard')
    expect(response.recommendedOptionId).toBe('transfer')
  })

  it('allows exact figures already present in confirmed facts or checked options', () => {
    const response = validateAssistantOutput({
      answer: 'The checked transfer stays within the 8-case daily limit.',
      referencedOptionIds: ['transfer'],
      recommendedOptionId: 'transfer',
    }, request)

    expect(response.answer).toContain('8-case')
    expect(response.recommendedOptionId).toBe('transfer')
  })

  it('a long but sound answer is shortened at a sentence, not thrown away', () => {
    const sentence = 'The transfer from South Hub protects the priority order. '
    const response = validateAssistantOutput({
      answer: sentence.repeat(40),
      referencedOptionIds: Array.from({ length: 12 }, () => 'transfer'),
      recommendedOptionId: 'transfer',
    }, request)
    expect(response.answer.length).toBeLessThanOrEqual(1400)
    expect(response.answer.endsWith('order.')).toBe(true)
    expect(response.referencedOptionIds).toEqual(['transfer'])
  })

  it('asks once more when the first reply is cut off mid-way, instead of failing the question', async () => {
    let calls = 0
    const flaky = async () => {
      calls += 1
      if (calls === 1) throw new SyntaxError('Unterminated string in JSON')
      return { answer: 'Use the transfer.', referencedOptionIds: [], recommendedOptionId: null }
    }
    await expect(answerWithGemini(request, flaky)).resolves.toMatchObject({ answer: 'Use the transfer.' })
    expect(calls).toBe(2)
  })
})
