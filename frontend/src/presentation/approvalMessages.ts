import type { Workspace } from '../../../shared/planner/model'
import { mustLeaveBy, rehearse, type Plan } from '../../../shared/planner/plan'
import type { Format } from './format'
import { pluralUnit } from './format'
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
    const when = plan.bookBy
      ? ` If it leaves now it arrives ${format.dateTime(plan.arrivalAt)}; it must leave by ${format.dateTime(plan.bookBy)} at the latest to arrive in time.`
      : ` If it leaves now it arrives ${format.dateTime(plan.arrivalAt)}.`
    messages.push({
      to: `${source} team`,
      email: null,
      subject: `Transfer: ${amount(plan.quantity)} to ${destination}`,
      body: [`Hello ${source} team,`, '', `Please send ${amount(plan.quantity)} to ${destination}.${when}`, sign].join('\n'),
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
  // A booking only counts once it departs; customers are told what it is expected to cover (user decision 2026-10-15).
  const newBookings = new Set(after.shipments.filter((shipment) => shipment.transferStatus === 'booked' && !before.shipments.some((old) => old.id === shipment.id)).map((shipment) => shipment.id))
  const asExpected: Workspace = { ...after, shipments: after.shipments.map((shipment) => newBookings.has(shipment.id) ? { ...shipment, transferStatus: 'in-transit' as const } : shipment) }
  const expectedCovered = new Map(rehearse(asExpected, now).impact.groups
    .filter((group) => group.locationId === plan.locationId && group.productId === plan.productId)
    .flatMap((group) => group.allocations).map((item) => [item.orderId, item.covered]))
  for (const line of stillShort) {
    const order = after.orders.find((item) => item.id === line.orderId)
    if (!order) continue
    const customerCutoff = mustLeaveBy(after, order)
    const lastMileHours = after.locations.find((location) => location.id === order.locationId)?.customerTravelHours?.value ?? null
    const warehouseCutoff = customerCutoff ?? order.dueAt
    const nextArrival = after.shipments
      .filter((shipment) => shipment.locationId === order.locationId && shipment.lines.some((item) => item.productId === plan.productId) && Date.parse(shipment.confirmedArrivalAt) > Date.parse(warehouseCutoff))
      .map((shipment) => lastMileHours === null ? shipment.confirmedArrivalAt : new Date(Date.parse(shipment.confirmedArrivalAt) + lastMileHours * 3_600_000).toISOString())
      .sort((first, second) => Date.parse(first) - Date.parse(second))[0]
    const missing = line.ordered - line.covered
    const expectedExtra = newBookings.size && plan.arrivalAt ? Math.max(0, (expectedCovered.get(line.orderId) ?? line.ordered) - line.covered) : 0
    const stillMissing = missing - expectedExtra
    const delayedSupplier = before.shipments.some((shipment) => shipment.locationId === order.locationId
      && !shipment.fromLocationId
      && shipment.lines.some((item) => item.productId === plan.productId)
      && before.disruptions.some((disruption) => disruption.shipmentId === shipment.id)
      && Date.parse(shipment.originalArrivalAt) <= Date.parse(warehouseCutoff)
      && Date.parse(shipment.confirmedArrivalAt) > Date.parse(warehouseCutoff))
    const onTime = customerCutoff === null
      ? `${line.covered > 0 ? `We have ${amount(line.covered)} ready at ${words.locationName(order.locationId)}. ` : ''}Customer arrival time is not confirmed because delivery travel time from ${words.locationName(order.locationId)} is not recorded. `
      : line.covered > 0 ? `We can deliver ${amount(line.covered)} on time. ` : expectedExtra > 0 ? '' : `We can't deliver it on time. `
    const source = words.locationName(plan.sourceLocationId ?? '')
    const unit = before.products.find((item) => item.id === plan.productId)?.unit ?? 'unit'
    const extra = line.covered > 0 ? `${format.number(expectedExtra)} more ${pluralUnit(unit, expectedExtra)} of ${product}` : amount(expectedExtra)
    const expectedText = expectedExtra === 0 || !plan.arrivalAt ? ''
      : lastMileHours === null
        ? `${extra} are expected at ${words.locationName(order.locationId)} on ${format.dateTime(plan.arrivalAt)}, once our transfer from ${source} arrives. `
        : `${extra} are expected on ${format.dateTime(new Date(Date.parse(plan.arrivalAt) + lastMileHours * 3_600_000).toISOString())}, once our transfer from ${source} arrives. `
    const someBefore = line.covered > 0 || expectedExtra > 0
    const rest = stillMissing === 0 ? ''
      : nextArrival
        ? `The ${someBefore ? 'remaining ' : ''}${amount(stillMissing)} should follow after our next delivery arrives on ${format.dateTime(nextArrival)}.`
        : `We will confirm when the ${someBefore ? 'remaining ' : ''}${amount(stillMissing)} can follow.`
    messages.push({
      to: order.customer,
      email: null,
      subject: stillMissing === 0 ? `Your order ${order.id}: part is coming from ${source}` : `Your order ${order.id}: part will be late`,
      body: [`Hello ${order.customer},`, '', `About your order ${order.id} for ${amount(line.ordered)}, due ${format.dateTime(order.dueAt)}:${delayedSupplier ? ' a supplier delivery to us is late.' : ''} ${onTime}${expectedText}${rest}`.trimEnd(), 'Sorry for the trouble.', sign].join('\n'),
    })
  }
  return messages
}
