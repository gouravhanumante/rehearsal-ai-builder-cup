import type { Goal } from '../../../shared/planner/model'

export const goals: { id: Goal; label: string; description: string }[] = [
  { id: 'protect', label: 'Protect deliveries', description: 'Priority orders first, then the fewest packages left short.' },
  { id: 'cost', label: 'Lowest cost', description: 'The cheapest option first, even if more is left short.' },
  { id: 'balanced', label: 'Balanced', description: 'Priority orders first, then the lowest cost for each package it saves.' },
]

export const goalLabel = (goal: Goal | undefined) => goals.find((item) => item.id === (goal ?? 'protect'))?.label ?? 'Protect deliveries'
