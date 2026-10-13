export type DemoOrder = {
  id: string
  customer: string
  initials: string
  avatar: 'green' | 'blue' | 'yellow'
  productId: string
  dueAt: string
  dueLabel: string
  dueTime?: string
  cases: number
  priority: 'protected' | 'standard'
}

export const distributorDemo = {
  businessName: 'Northstar Supply',
  product: { id: 'harbor-blend', name: 'Harbor Blend Coffee', pack: '1 kg case' },
  warehouses: {
    north: { id: 'north', name: 'North Hub', receivingLimitPerDay: 8 },
    south: { id: 'south', name: 'South Hub' },
  },
  inventory: { northCases: 14, southUnallocatedCases: 14 },
  transfer: {
    confirmed: true,
    expectedArrivalAt: '2026-10-15T12:00:00+05:30',
  },
  shipment: {
    id: 'SH-204',
    supplier: 'Meridian Foods',
    cases: 24,
    originalArrivalAt: '2026-10-13T09:00:00+05:30',
    confirmedArrivalAt: '2026-10-16T15:00:00+05:30',
    updateSource: 'Supplier update',
    updateConfirmed: true,
    updatedAt: '08:42',
  },
  orders: [
    { id: 'ORD-1082', customer: 'Common Ground Cafe', initials: 'CG', avatar: 'green', productId: 'harbor-blend', dueAt: '2026-10-15T14:00:00+05:30', dueLabel: 'Today', dueTime: '2:00 PM', cases: 18, priority: 'protected' },
    { id: 'ORD-1086', customer: 'Harbor Market', initials: 'HM', avatar: 'blue', productId: 'harbor-blend', dueAt: '2026-10-16T12:00:00+05:30', dueLabel: 'Fri, Oct 16', cases: 12, priority: 'standard' },
    { id: 'ORD-1091', customer: 'Daily Goods Co.', initials: 'DG', avatar: 'yellow', productId: 'harbor-blend', dueAt: '2026-10-16T12:00:00+05:30', dueLabel: 'Fri, Oct 16', cases: 8, priority: 'standard' },
  ] satisfies DemoOrder[],
  alternativeSupplier: {
    name: 'Supplier B',
    availableCases: null,
    quotedPrice: null,
    confirmedArrivalAt: null as string | null,
    confirmed: false,
  },
  sampleTransferCosts: { eightCases: 95, fourteenCases: 165 },
}
