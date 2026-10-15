import type { Workspace } from '../../../shared/planner/model'
import { rehearse, type Plan } from '../../../shared/planner/plan'
import type { Format } from './format'
import type { Wording } from './planText'
import { emailOf } from './supplierAsk'

export type ReadyMessage = { to: string; email: string | null; subject: string; body: string }

/**
 * What to send after approving a plan, written by code from the checked plan: the supplier order or
 * transfer request, and a note to each customer still short. No date is ever guessed; when nothing
 * more is on its way, the note says the date will follow.
 */
export function approvalMessages(plan: Plan, before: Workspace, after: Workspace, format: Format, words: Wording, now: string): ReadyMessage[] {
  const from = before.businessName
  const sign = ['', 'Thanks,', from].join('\n')
  const product = words.productName(plan.productId)
  const amount = (quantity: number) => `${words.quantity(quantity, plan.productId)} of ${product}`
  const destination = words.locationName(plan.locationId)
  const messages: ReadyMessage[] = []

  if (plan.kind === 'supplier' && plan.quantity && plan.arrivalAt) {
    const supplier = before.suppliers.find((item) => item.id === plan.supplierId)
    const offer = supplier?.offers.find((item) => item.productId === plan.productId && item.locationId === plan.locationId)
    const unit = before.products.find((item) => item.id === plan.productId)?.unit ?? 'unit'
    const price = offer?.pricePerUnit.value != null ? ` at ${format.money(offer.pricePerUnit.value)} per ${unit}` : ''
    const delivery = offer?.deliveryCharge?.value ? `, plus ${format.money(offer.deliveryCharge.value)} delivery` : ''
    const total = plan.cost ? ` That is ${format.money(plan.cost.amount)} in total.` : ''
    messages.push({
      to: supplier?.name ?? 'Supplier',
      email: emailOf(supplier?.contact),
      subject: `Order: ${amount(plan.quantity)} to ${destination}`,
      body: [`Hello ${supplier?.name ?? ''},`.replace(' ,', ','), '', `Please supply ${amount(plan.quantity)}${price}${delivery}, delivered to ${destination} by ${format.dateTime(plan.arrivalAt)}, as you offered.${total}`, 'Please confirm.', sign].join('\n'),
    })
  }

  if (plan.kind === 'transfer' && plan.quantity && plan.arrivalAt) {
    const source = words.locationName(plan.sourceLocationId ?? '')
    const leaveBy = plan.bookBy ? ` It needs to leave by ${format.dateTime(plan.bookBy)}.` : ''
    messages.push({
      to: `${source} team`,
      email: null,
      subject: `Transfer: ${amount(plan.quantity)} to ${destination}`,
      body: [`Hello ${source} team,`, '', `Please send ${amount(plan.quantity)} to ${destination}, to arrive by ${format.dateTime(plan.arrivalAt)}.${leaveBy}`, sign].join('\n'),
    })
  }

  if (plan.kind === 'ship-from' && plan.orderId) {
    const order = before.orders.find((item) => item.id === plan.orderId)
    const source = words.locationName(plan.sourceLocationId ?? '')
    if (order) messages.push({
      to: `${source} team`,
      email: null,
      subject: `Please deliver ${order.customer}'s order ${order.id}`,
      body: [`Hello ${source} team,`, '', `Please deliver ${order.customer}'s order ${order.id} (${order.lines.map((line) => `${words.quantity(line.quantity, line.productId)} of ${words.productName(line.productId)}`).join(', ')}) from ${source} instead of ${destination}. It is due ${format.dateTime(order.dueAt)}.`, sign].join('\n'),
    })
  }

  // Customers this problem still leaves short once the plan is in place.
  const stillShort = rehearse(after, now).impact.groups
    .filter((group) => group.locationId === plan.locationId && group.productId === plan.productId)
    .flatMap((group) => group.allocations.filter((item) => item.covered < item.ordered))
  for (const line of stillShort) {
    const order = after.orders.find((item) => item.id === line.orderId)
    if (!order) continue
    const nextArrival = after.shipments
      .filter((shipment) => shipment.locationId === order.locationId && shipment.lines.some((item) => item.productId === plan.productId) && Date.parse(shipment.confirmedArrivalAt) > Date.parse(order.dueAt))
      .map((shipment) => shipment.confirmedArrivalAt)
      .sort((first, second) => Date.parse(first) - Date.parse(second))[0]
    const missing = line.ordered - line.covered
    const onTime = line.covered > 0 ? `We can deliver ${amount(line.covered)} on time. ` : `We can't deliver it on time. `
    const rest = nextArrival
      ? `The ${line.covered > 0 ? 'remaining ' : ''}${amount(missing)} should follow after our next delivery arrives on ${format.dateTime(nextArrival)}.`
      : `We will confirm when the ${line.covered > 0 ? 'remaining ' : ''}${amount(missing)} can follow.`
    messages.push({
      to: order.customer,
      email: null,
      subject: `Your order ${order.id}: part will be late`,
      body: [`Hello ${order.customer},`, '', `About your order ${order.id} for ${amount(line.ordered)}, due ${format.dateTime(order.dueAt)}: a supplier delivery to us is late. ${onTime}${rest}`, 'Sorry for the trouble.', sign].join('\n'),
    })
  }
  return messages
}
