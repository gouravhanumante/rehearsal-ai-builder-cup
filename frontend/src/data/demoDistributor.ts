export type PlanStatus = 'ready' | 'conditional' | 'rejected'

export type RecoveryPlan = {
  id: string
  title: string
  description: string
  impact: string
  cost: string
  status: PlanStatus
  statusLabel: string
  detail: string
  /** Typed-in (manual) facts this plan relies on. Non-empty means approval needs a warning. */
  unverifiedFacts: UnverifiedFact[]
  /** Set on supplier options so the UI can open that supplier's details. */
  supplierId?: string
  /** For ready plans: what is left after this plan, used to choose the Overview recommendation. */
  outcome?: { exposedCases: number; protectsPriority: boolean }
}

export type UnverifiedFact = {
  label: string
  value: string
  target: { type: 'inventory' } | { type: 'order'; orderId: string } | { type: 'supplier'; supplierId: string }
}
