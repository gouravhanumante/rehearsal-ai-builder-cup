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
}
