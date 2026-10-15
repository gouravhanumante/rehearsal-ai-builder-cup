/// <reference types="node" />
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Evidence, Goal, InboundShipment, Order, OrderLine, Supplier, TransferRoute, Workspace } from '../../../shared/planner/model'
import { createBlankWorkspace } from '../../../shared/planner/blank'
import { orderCoverage, recommendPlan, rankPlans, rehearse, type Plan } from '../../../shared/planner/plan'
import { addHistory, applyPlan, receiveDelivery } from '../../../shared/planner/apply'
import { cancelRemaining, correctMovement, countStock, departTransfer, effectiveMovements, hasOutstanding, remainingLines, reopenOrder, sendOrder, sentLines, setSplitAllowed, stockFrom } from '../../../shared/planner/ledger'
import { sliceForPlan } from '../../../shared/planner/slice'
import { parseWorkspace } from '../../../shared/planner/validate'
import { splitWorkspace, joinWorkspace } from '../cloud/chunks'
import { editorFor, parseField } from '../components/editing/editorConfigs'
import { approvalMessages } from '../presentation/approvalMessages'
import { createFormat } from '../presentation/format'
import { createWording, type EditTarget } from '../presentation/planText'
import { serializeBackup } from '../data/backup'

// One week (Mon 19 - Sun 25 Oct) of a mid-sized distributor, run through the same code the app uses.
// Each rule checked here comes from plain reasoning about the business, not from the code.

function random(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = random(20261019)
const between = (low: number, high: number) => low + Math.floor(rand() * (high - low + 1))
const chance = (p: number) => rand() < p
const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)]

const IST = '+05:30'
const at = (day: number, hour: number, minute = 0) => `2026-10-${String(19 + day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${IST}`
const plusHours = (iso: string, hours: number) => new Date(Date.parse(iso) + hours * 3_600_000).toISOString()
const localDay = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3_600_000).toISOString().slice(0, 10)
const typed = (now: string): Evidence => ({ kind: 'manual', source: 'Entered manually', recordedAt: now })

const PRODUCTS = ['Basmati Rice 25kg', 'Sona Masoori 25kg', 'Toor Dal 30kg', 'Moong Dal 30kg', 'Chana Dal 30kg', 'Sunflower Oil 15L', 'Groundnut Oil 15L', 'Mustard Oil 15L', 'Atta 50kg', 'Maida 50kg',
  'Sugar 50kg', 'Jaggery 30kg', 'Salt 25kg', 'Tea 10kg', 'Coffee 5kg', 'Turmeric 5kg', 'Chilli Powder 5kg', 'Coriander 5kg', 'Cumin 5kg', 'Tamarind 10kg',
  'Poha 25kg', 'Rava 25kg', 'Besan 25kg', 'Ghee 15kg', 'Milk Powder 25kg', 'Biscuits Case', 'Noodles Case', 'Soap Case', 'Detergent 25kg', 'Matchbox Case']

function buildBusiness(): { workspace: Workspace; initialTotal: number } {
  const workspace = createBlankWorkspace('Deccan Wholesale', 'IN')
  workspace.locations = [
    { id: 'dc', name: 'Hyderabad DC', kind: 'distribution-centre', receivingLimitPerDay: 200, deliveryCostPerOrder: 300, area: 'Shamshabad, Hyderabad' },
    { id: 'sec', name: 'Secunderabad Warehouse', kind: 'warehouse', receivingLimitPerDay: 120, deliveryCostPerOrder: 250, area: 'Secunderabad' },
    { id: 'vja', name: 'Vijayawada Depot', kind: 'warehouse', receivingLimitPerDay: 80, deliveryCostPerOrder: 350, area: 'Vijayawada' },
    { id: 'wgl', name: 'Warangal Store', kind: 'store', receivingLimitPerDay: 40, deliveryCostPerOrder: 150, area: 'Warangal' },
    { id: 'kpl', name: 'Kukatpally Store', kind: 'store', receivingLimitPerDay: 40, deliveryCostPerOrder: 120, area: 'Kukatpally, Hyderabad' },
    { id: 'gnt', name: 'Guntur Store', kind: 'store', receivingLimitPerDay: null, deliveryCostPerOrder: 160, area: 'Guntur' },
  ]
  workspace.products = PRODUCTS.map((name, index) => ({ id: `p${index}`, name, unit: 'bag', pack: '1 per package', perPackage: 1, pricePerUnit: chance(0.8) ? between(300, 4000) : null }))
  const big = new Set(['dc', 'sec', 'vja'])
  workspace.movements = workspace.locations.flatMap((location) => workspace.products
    .filter(() => chance(0.85))
    .map((product) => ({ id: `CNT-${location.id}-${product.id}`, kind: 'count' as const, locationId: location.id, productId: product.id, quantity: big.has(location.id) ? between(20, 300) : between(0, 40), at: at(0, 8), evidence: typed(at(0, 8)) })))
  workspace.stock = stockFrom(workspace.movements)
  workspace.storageLimits = workspace.stock.filter((record) => !big.has(record.locationId) && chance(0.3)).map((record) => ({ locationId: record.locationId, productId: record.productId, limit: 60 }))
  const route = (from: string, to: string, hours: number): TransferRoute => ({ id: `${from}-${to}`, fromLocationId: from, toLocationId: to, arrivalAt: { value: null, evidence: null }, travelHours: { value: hours, evidence: typed(at(0, 8)) }, costPerTrip: between(300, 900), costPerUnit: between(5, 15), quotes: [] })
  workspace.routes = [
    ...['sec', 'vja', 'wgl', 'kpl', 'gnt'].map((to) => route('dc', to, between(3, 9))),
    route('sec', 'kpl', 2), route('vja', 'gnt', 2), route('sec', 'dc', 4),
  ]
  workspace.suppliers = Array.from({ length: 6 }, (_, index): Supplier => ({
    id: `sup${index}`, name: ['Godavari Traders', 'Krishna Agro', 'Nizam Foods', 'Charminar Supplies', 'Tungabhadra Mills', 'Deccan Oils'][index],
    contact: index % 2 === 0 ? `orders@supplier${index}.in` : `+91 98480 1000${index}`,
    offers: workspace.products.filter(() => chance(0.3)).flatMap((product) => ['dc', 'sec', 'vja'].filter(() => chance(0.5)).map((locationId) => {
      const known = chance(0.5)
      const fact = <T,>(value: T) => (known ? { value, evidence: typed(at(0, 8)) } : { value: null, evidence: null })
      return { productId: product.id, locationId, available: fact(between(10, 200)), pricePerUnit: fact(between(250, 3500)), arrivalAt: fact(at(between(0, 2), between(9, 18))), deliveryCharge: fact(between(0, 800)) }
    })),
  }))
  let shipmentNo = 1
  const shipment = (supplierName: string, locationId: string, arrival: string, repeat?: 7): InboundShipment => ({
    id: `SH-${String(shipmentNo++).padStart(3, '0')}`, supplierName, locationId,
    lines: Array.from(new Set(Array.from({ length: between(1, 4) }, () => pick(workspace.products).id))).map((productId) => ({ productId, quantity: between(30, 150) })),
    originalArrivalAt: arrival, confirmedArrivalAt: arrival, updateSource: 'Supplier schedule', evidence: typed(at(0, 8)), ...(repeat ? { repeatEveryDays: repeat } : {}),
  })
  workspace.shipments = [
    ...Array.from({ length: 8 }, () => shipment(pick(workspace.suppliers).name, pick(['dc', 'sec', 'vja']), at(between(0, 3), 10), 7)),
    ...Array.from({ length: 20 }, () => shipment(pick(workspace.suppliers).name, pick(['dc', 'sec', 'vja', 'wgl']), at(between(0, 6), between(8, 18)))),
  ]
  workspace.orders = Array.from({ length: 60 }, (_, index) => newOrder(workspace, `ORD-${1000 + index}`, 0, between(0, 3)))
  const initialTotal = workspace.stock.reduce((total, record) => total + record.available.value, 0)
  return { workspace, initialTotal }
}

const CUSTOMERS = ['Hotel Paradise', 'Bawarchi Caterers', 'Ratnadeep Mart', 'Vijetha Supermarket', 'Shah Ghouse', 'Kritunga', 'Chutneys', 'Minerva Coffee Shop', 'Spencer Retail', 'More Megastore', 'Heritage Fresh', 'Balaji Kirana']
function newOrder(workspace: Workspace, id: string, today: number, inDays: number): Order {
  const locationId = chance(0.6) ? pick(['wgl', 'kpl', 'gnt']) : pick(['dc', 'sec', 'vja'])
  const lines = Array.from(new Set(Array.from({ length: between(1, 3) }, () => pick(workspace.products).id))).map((productId) => ({ productId, quantity: between(2, 30) }))
  return { id, customer: pick(CUSTOMERS), locationId, dueAt: at(Math.min(6, today + inDays), between(10, 18)), priority: chance(0.15) ? 'protected' : 'standard', lines, evidence: typed(at(today, 8)), status: 'open' }
}

/** Fills in an editor the way a person would, so delays go through the real Report a delay form. */
function enter(workspace: Workspace, target: EditTarget, values: Record<string, string>, now: string) {
  const format = createFormat(workspace.settings)
  const config = editorFor(target, workspace, format)
  if (!config) throw new Error('no editor')
  const raw = { ...config.initial, ...values }
  const parsed = Object.fromEntries(config.fields.map((field) => {
    const result = parseField(field, raw[field.key] ?? '', format)
    if ('error' in result) throw new Error(`${field.key}: ${result.error}`)
    return [field.key, result.value]
  }))
  const evidence = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, value === null ? null : typed(now)]))
  return config.apply(parsed, evidence)
}
const toLocalInput = (workspace: Workspace, iso: string) => createFormat(workspace.settings).toInput(iso)

const goalFor = (day: number): Goal => (day <= 1 ? 'protect' : day <= 3 ? 'cost' : 'balanced')
// Same content regardless of the order fields were written in.
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) => (item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item))

describe('one week at Deccan Wholesale, every feature, every rule checked after every step', () => {
  it('runs Mon 19 to Sun 25 Oct with no rule broken', () => {
    let { workspace } = buildBusiness()
    const count: Record<string, number> = {}
    const tally = (key: string, by = 1) => { count[key] = (count[key] ?? 0) + by }
    const broken: string[] = []
    const slowest = { ms: 0, when: '' }
    let orderNo = 2000
    const record = (now: string, kind: Parameters<typeof addHistory>[1]['kind'], text: string) => { workspace = addHistory(workspace, { at: now, kind, text }) }

    // The test's own stock book, kept by plain rules and never read back from the app:
    // a count sets the number; arrivals add; sends and transfers out take away; a correction gives back
    // the difference unless a count was taken after that send (the count already saw the truth).
    const pairOf = (locationId: string, productId: string) => `${locationId}|${productId}`
    const book = new Map(workspace.stock.map((item) => [pairOf(item.locationId, item.productId), item.available.value]))
    const bookAdd = (locationId: string, productId: string, by: number) => book.set(pairOf(locationId, productId), (book.get(pairOf(locationId, productId)) ?? 0) + by)
    const sentBook = new Map<string, Map<string, number>>()
    const sentOf = (orderId: string, productId: string) => sentBook.get(orderId)?.get(productId) ?? 0
    const addSent = (orderId: string, productId: string, by: number) => sentBook.set(orderId, new Map(sentBook.get(orderId) ?? []).set(productId, sentOf(orderId, productId) + by))
    let stepNo = 0
    const countStep = new Map<string, number>()
    const sends = new Map<string, { orderId: string; locationId: string; productId: string; quantity: number; step: number }>()
    let sendNo = 0
    const afterCount: string[] = []
    const send = (order: Order, lines: OrderLine[], now: string) => {
      const id = `DSP-sim-${sendNo++}`
      const result = sendOrder(workspace, order.id, lines, now, id)
      if ('error' in result) return result
      workspace = result.workspace
      stepNo += 1
      for (const line of lines.filter((item) => item.quantity > 0)) {
        bookAdd(order.locationId, line.productId, -line.quantity)
        addSent(order.id, line.productId, line.quantity)
        sends.set(`${id}:${line.productId}`, { orderId: order.id, locationId: order.locationId, productId: line.productId, quantity: line.quantity, step: stepNo })
      }
      // Pressing Send again with the same action id must record nothing more.
      const again = sendOrder(workspace, order.id, lines, now, id)
      if ('error' in again || again.workspace !== workspace) broken.push(`${now}: repeating send ${id} changed the records`)
      return result
    }
    const orderedOf = (order: Order, productId: string) => order.lines.filter((line) => line.productId === productId).reduce((total, line) => total + line.quantity, 0)

    const check = (now: string, step: string) => {
      const where = `${step} @ ${now}`
      const started = performance.now()
      const result = rehearse(workspace, now)
      const ms = performance.now() - started
      if (ms > slowest.ms) { slowest.ms = ms; slowest.when = where }
      // Saved data must stay readable, and come back from Firestore exactly as it went in.
      if (!parseWorkspace(JSON.parse(JSON.stringify(workspace)))) broken.push(`${where}: business no longer passes validation`)
      const { coreJson, chunks } = splitWorkspace(workspace)
      if (canonical(joinWorkspace(coreJson, chunks)) !== canonical(workspace)) broken.push(`${where}: Firestore round trip changed the business`)
      // Every warehouse and product matches the test's own book, and stock is exactly what the movements say.
      for (const key of new Set([...book.keys(), ...workspace.stock.map((item) => pairOf(item.locationId, item.productId))])) {
        const [locationId, productId] = key.split('|')
        const app = workspace.stock.find((item) => item.locationId === locationId && item.productId === productId)?.available.value ?? 0
        if (app !== (book.get(key) ?? 0)) { broken.push(`${where}: ${key} stock ${app}, book says ${book.get(key) ?? 0}`); break }
      }
      if (canonical(stockFrom(workspace.movements)) !== canonical(workspace.stock)) broken.push(`${where}: stock differs from what the movements say`)
      // Every order: sent matches the book; still to send = ordered - sent, or nothing if cancelled.
      for (const order of workspace.orders) {
        for (const productId of new Set(order.lines.map((line) => line.productId))) {
          const appSent = sentLines(workspace, order.id).find((line) => line.productId === productId)?.quantity ?? 0
          const appLeft = remainingLines(workspace, order).find((line) => line.productId === productId)?.quantity ?? 0
          const left = order.status === 'cancelled' ? 0 : Math.max(0, orderedOf(order, productId) - sentOf(order.id, productId))
          if (appSent !== sentOf(order.id, productId) || appLeft !== left) broken.push(`${where}: ${order.id} ${productId} sent ${appSent}/left ${appLeft}, book says sent ${sentOf(order.id, productId)}/left ${left}`)
          if (sentOf(order.id, productId) > orderedOf(order, productId)) broken.push(`${where}: ${order.id} sent more ${productId} than ordered`)
        }
      }
      // The planner never plans for more than is still to be sent.
      for (const line of orderCoverage(workspace)) {
        const order = workspace.orders.find((item) => item.id === line.orderId)!
        if (line.ordered !== orderedOf(order, line.productId) - sentOf(order.id, line.productId)) { broken.push(`${where}: planner sees ${line.ordered} owed on ${line.orderId}, book says ${orderedOf(order, line.productId) - sentOf(order.id, line.productId)}`); break }
      }
      const inTransit = workspace.shipments.filter((item) => item.fromLocationId && item.transferStatus !== 'booked' && item.lines.length > 0).flatMap((item) => item.lines)
      if (inTransit.some((line) => line.quantity <= 0)) broken.push(`${where}: a transfer in transit has no goods`)
      if (workspace.stock.some((item) => item.available.value < 0)) broken.push(`${where}: negative stock`)
      if (new Set(workspace.shipments.map((item) => item.id)).size !== workspace.shipments.length) broken.push(`${where}: a delivery is listed twice`)
      if (workspace.disruptions.some((item) => !workspace.shipments.some((shipment) => shipment.id === item.shipmentId))) broken.push(`${where}: a delay points at a delivery that no longer exists`)
      // At risk = left short. Every short allocation is at risk; nothing covered is.
      const shortInProblems = new Set(result.impact.groups.flatMap((group) => group.allocations.filter((item) => item.covered < item.ordered).map((item) => item.orderId)))
      const atRisk = new Set(result.impact.affectedOrderIds)
      if ([...shortInProblems].some((id) => !atRisk.has(id)) || [...atRisk].some((id) => !shortInProblems.has(id))) broken.push(`${where}: at-risk list differs from the orders actually short`)
      if (result.impact.watchOrderIds.some((id) => atRisk.has(id))) broken.push(`${where}: an order is both at risk and watch`)
      // The Orders list's "Short" badge (orderCoverage) and the at-risk count must agree for open orders.
      const shortLines = orderCoverage(workspace).filter((line) => line.status === 'short')
      for (const line of shortLines.filter((item) => !atRisk.has(item.orderId))) {
        const order = workspace.orders.find((item) => item.id === line.orderId)
        broken.push(`${where}: ${line.orderId} at ${line.locationId} due ${order?.dueAt}: Orders page ${line.covered} of ${line.ordered}, shown Short in Orders but not at risk`)
      }
      const exposure = result.impact.groups.reduce((total, group) => total + group.allocations.reduce((sum, item) => sum + item.ordered - item.covered, 0), 0)
      if (exposure !== result.impact.exposedQuantity) broken.push(`${where}: exposed ${result.impact.exposedQuantity} but shortfalls add to ${exposure}`)
      // No wording shows "NaN" or "undefined".
      const words = createWording(workspace, createFormat(workspace.settings))
      for (const plan of result.plans) {
        const text = words.planText(plan)
        const all = `${text.title} ${text.detail} ${text.impact} ${text.cost} ${text.statusLabel} ${text.worthNote ?? ''}`
        if (/NaN|undefined|Infinity/.test(all)) { broken.push(`${where}: option text "${all.slice(0, 120)}"`); break }
      }
      // Transfers already booked share the destination's daily receiving limit.
      for (const location of workspace.locations.filter((item) => item.receivingLimitPerDay !== null)) {
        const byDay = new Map<string, number>()
        for (const shipment of workspace.shipments.filter((item) => item.locationId === location.id && item.fromLocationId)) {
          const day = localDay(shipment.confirmedArrivalAt)
          byDay.set(day, (byDay.get(day) ?? 0) + shipment.lines.reduce((total, line) => total + line.quantity, 0))
        }
        for (const receipt of workspace.movements.filter((item) => item.kind === 'receipt' && item.locationId === location.id && item.fromLocationId)) {
          const day = localDay(receipt.at)
          byDay.set(day, (byDay.get(day) ?? 0) + receipt.quantity)
        }
        for (const [day, total] of byDay) if (total > (location.receivingLimitPerDay ?? Infinity)) broken.push(`${location.name} ${day}: ${total} arriving by transfer, limit ${location.receivingLimitPerDay}`)
      }
      return result
    }

    for (let day = 0; day < 7; day += 1) {
      for (const hour of [9, 13, 17]) {
        const now = at(day, hour)
        const goal = goalFor(day)
        if (workspace.goal !== goal) { workspace = { ...workspace, goal }; record(now, 'edit', `Goal set to ${goal}.`); tally('goal changes') }

        // Morning: new orders come in.
        if (hour === 9) {
          for (let n = 0; n < 35; n += 1) workspace = { ...workspace, orders: [...workspace.orders, newOrder(workspace, `ORD-${orderNo++}`, day, between(1, 4))] }
          tally('orders placed', 35)
          check(now, 'new orders')
        }

        // Deliveries due by now: most arrive in full, some in part, some are late.
        for (const shipment of workspace.shipments.filter((item) => item.transferStatus !== 'booked' && Date.parse(item.confirmedArrivalAt) <= Date.parse(now))) {
          const isTransfer = Boolean(shipment.fromLocationId)
          const roll = rand()
          if (roll < 0.08 && !isTransfer) {
            workspace = enter(workspace, { type: 'report-delay', shipmentId: shipment.id }, { shipmentId: shipment.id, arrivalAt: toLocalInput(workspace, plusHours(now, between(20, 72))), updateSource: 'Supplier call' }, now)
            record(now, 'delay', `Delay reported on ${shipment.id}`)
            tally('delays reported (on arrival day)')
          } else {
            const partial = roll < 0.25
            const received = shipment.lines.map((line) => ({ productId: line.productId, quantity: partial ? Math.floor(line.quantity * (0.5 + rand() * 0.4)) : line.quantity }))
            const missing = shipment.lines.reduce((total, line, index) => total + line.quantity - received[index].quantity, 0)
            const restComing = partial && chance(0.6)
            workspace = receiveDelivery(workspace, shipment.id, received, restComing ? { arrivalAt: plusHours(now, 24) } : null, now)
            stepNo += 1
            for (const line of received) bookAdd(shipment.locationId, line.productId, line.quantity)
            if (missing > 0 && !restComing) tally(isTransfer ? 'transfer goods never arrived (unresolved, not built yet)' : 'supplier goods never arrived')
            record(now, 'received', `Received ${shipment.id}`)
            tally(partial ? (restComing ? 'received in part, rest coming' : 'received in part, rest lost') : 'received in full')
            if (isTransfer) tally('transfers received')
            if (shipment.repeatEveryDays) tally('regular deliveries received')
            if (shipment.repeatEveryDays && !workspace.shipments.some((item) => item.id === shipment.id && Date.parse(item.confirmedArrivalAt) > Date.parse(now))) broken.push(`${now}: regular delivery ${shipment.id} did not move to its next date`)
          }
          check(now, `delivery ${shipment.id}`)
        }

        // A supplier calls ahead about a delivery not due yet.
        if (chance(0.35)) {
          const upcoming = workspace.shipments.filter((item) => Date.parse(item.confirmedArrivalAt) > Date.parse(now) && !item.fromLocationId)
          if (upcoming.length) {
            const shipment = pick(upcoming)
            workspace = enter(workspace, { type: 'report-delay', shipmentId: shipment.id }, { shipmentId: shipment.id, arrivalAt: toLocalInput(workspace, plusHours(shipment.confirmedArrivalAt, between(24, 96))), updateSource: 'Email from supplier' }, now)
            record(now, 'delay', `Delay reported on ${shipment.id}`)
            tally('delays reported (in advance)')
            check(now, `delay ${shipment.id}`)
          }
        }

        // Work the problems: answer questions, record supplier replies, settle conflicts, approve the best fix.
        for (let round = 0; round < 60; round += 1) {
          const result = check(now, `planning round ${round}`)
          let changed = false
          for (const plan of result.plans) {
            if (plan.reason.code === 'ship-from-ask' && plan.sourceLocationId && !workspace.deliveryAnswers?.some((item) => item.fromLocationId === plan.sourceLocationId && item.forLocationId === plan.locationId)) {
              const canDeliver = chance(0.6)
              workspace = { ...workspace, deliveryAnswers: [...(workspace.deliveryAnswers ?? []), { fromLocationId: plan.sourceLocationId, forLocationId: plan.locationId, canDeliver }] }
              record(now, 'edit', 'Delivery answer'); tally(canDeliver ? 'answered: can deliver' : 'answered: cannot deliver'); changed = true
            }
            if (plan.reason.code === 'supplier-missing' && chance(0.5)) {
              const supplier = workspace.suppliers.find((item) => item.id === plan.supplierId)
              const offerIndex = supplier?.offers.findIndex((offer) => offer.productId === plan.productId && offer.locationId === plan.locationId) ?? -1
              if (supplier && offerIndex >= 0) {
                const reply = { available: { value: between(0, 120), evidence: typed(now) }, pricePerUnit: { value: between(250, 3500), evidence: typed(now) }, arrivalAt: { value: plusHours(now, between(4, 60)), evidence: typed(now) }, deliveryCharge: { value: between(0, 600), evidence: typed(now) } }
                workspace = { ...workspace, suppliers: workspace.suppliers.map((item) => item.id !== supplier.id ? item : { ...item, offers: item.offers.map((offer, index) => index === offerIndex ? { ...offer, ...reply } : offer) }) }
                record(now, 'edit', `Reply from ${supplier.name}`); tally('supplier replies recorded'); changed = true
              }
            }
          }
          for (const conflict of result.conflicts.filter((item) => !item.decided)) {
            workspace = { ...workspace, conflictDecisions: [...workspace.conflictDecisions, { conflictId: conflict.id, winner: chance(0.5) ? 'priority' : 'earliest-due' }] }
            record(now, 'edit', 'Conflict decided'); tally('conflicts decided'); changed = true
          }
          if (changed) continue

          const fresh = rehearse(workspace, now)
          const problem = fresh.impact.groups.find((group) => group.exposedQuantity > 0 && recommendPlan(fresh.plans.filter((plan) => plan.disruptionId === group.disruptionId && plan.productId === group.productId && plan.locationId === group.locationId), goal))
          if (!problem) break
          const options = fresh.plans.filter((plan) => plan.disruptionId === problem.disruptionId && plan.productId === problem.productId && plan.locationId === problem.locationId)
          const best = recommendPlan(options, goal) as Plan
          const ready = options.filter((plan) => plan.status === 'ready' && plan.outcome)
          // The goal is honoured.
          const cost = (plan: Plan) => plan.cost?.amount ?? Number.MAX_SAFE_INTEGER
          if (goal === 'cost' && ready.some((plan) => cost(plan) < cost(best))) broken.push(`${now}: Lowest cost picked ${best.id} but a cheaper ready option exists`)
          if (goal !== 'cost' && !best.outcome?.protectsPriority && ready.some((plan) => plan.outcome?.protectsPriority)) broken.push(`${now}: ${goal} picked an option that leaves a priority order short when another covers it`)
          if (rankPlans(options, goal)[0].status !== 'ready') broken.push(`${now}: a non-ready option ranked above a ready one`)
          // The server's re-check, on only the slice it receives, agrees.
          const slice = sliceForPlan(workspace, best.id)
          if (!slice || rehearse(slice, now).plans.find((plan) => plan.id === best.id)?.status !== 'ready') broken.push(`${now}: server re-check would reject ${best.id}`)

          const exposureBefore = fresh.impact.exposedQuantity
          const next = applyPlan(workspace, best, now)
          if (next === workspace) { broken.push(`${now}: approving ${best.id} changed nothing`); break }
          // Messages carry the approved numbers; customer notes go only to customers still short.
          const format = createFormat(workspace.settings)
          const words = createWording(workspace, format)
          const messages = approvalMessages(best, workspace, next, format, words, now)
          const body = messages.map((message) => message.body).join('\n')
          if (/NaN|undefined/.test(body)) broken.push(`${now}: message text "${body.slice(0, 120)}"`)
          if (best.kind !== 'ship-from' && best.quantity && !messages[0]?.body.includes(words.quantity(best.quantity, best.productId))) broken.push(`${now}: ${best.kind} message does not state the approved ${best.quantity}`)
          const shortAfter = new Set(rehearse(next, now).impact.affectedOrderIds.map((id) => next.orders.find((order) => order.id === id)?.customer))
          if (messages.filter((message) => message.subject.startsWith('Your order')).some((message) => !shortAfter.has(message.to))) broken.push(`${now}: a customer note went to someone not short`)
          let committed = next
          if (best.kind === 'transfer' && best.sourceLocationId && best.quantity) {
            const booking = next.shipments.find((item) => item.transferStatus === 'booked' && item.fromLocationId === best.sourceLocationId && item.locationId === best.locationId && item.lines.some((line) => line.productId === best.productId && line.quantity === best.quantity))
            if (!booking) broken.push(`${now}: approved transfer ${best.id} has no stock booking`)
            else {
              const departed = departTransfer(next, booking.id, booking.lines, now, `DEP-week-${stepNo}`)
              if ('error' in departed) broken.push(`${now}: transfer ${booking.id} could not depart: ${departed.error}`)
              else {
                committed = departed.workspace
                stepNo += 1
                bookAdd(best.sourceLocationId, best.productId, -best.quantity)
                tally('transfer bookings')
                tally('transfer departures')
              }
            }
          }
          workspace = addHistory(committed, { at: now, kind: 'approval', text: `Approved ${best.id}`, messages: messages.slice(0, 20) })
          tally(`approved: ${best.kind}`)
          tally('messages written', messages.length)
          const exposureAfter = rehearse(workspace, now).impact.exposedQuantity
          if (exposureAfter > exposureBefore) broken.push(`${now}: approving ${best.id} made the shortage worse (${exposureBefore} -> ${exposureAfter})`)
        }

        // Evening: orders due today leave if the stock is there; some go out in part; some are cancelled; some wait.
        if (hour === 17) {
          const endOfDay = at(day, 23, 59)
          const lineTotal = (lines: OrderLine[]) => lines.reduce((total, line) => total + line.quantity, 0)
          const onHand = (order: Order, productId: string) => workspace.stock.find((item) => item.locationId === order.locationId && item.productId === productId)?.available.value ?? 0
          for (const order of workspace.orders.filter((item) => hasOutstanding(workspace, item) && Date.parse(item.dueAt) <= Date.parse(endOfDay))) {
            const left = remainingLines(workspace, order)
            const enough = left.every((line) => onHand(order, line.productId) >= line.quantity)
            const possible = left.map((line) => ({ productId: line.productId, quantity: Math.min(line.quantity, onHand(order, line.productId)) }))
            if (enough || (lineTotal(possible) > 0 && chance(0.4))) {
              const lines = enough ? left : possible
              if (!enough) {
                // Ask the customer first; some say no, and then a part send must be refused.
                const refuses = chance(0.2)
                workspace = setSplitAllowed(workspace, order.id, !refuses)
                if (refuses) {
                  if (!('error' in sendOrder(workspace, order.id, lines, now))) broken.push(`${now}: part send of ${order.id} allowed although the customer said no`)
                  tally('part send refused: customer wants one delivery'); continue
                }
              }
              const sent = send(order, lines, now)
              if ('error' in sent) { broken.push(`${now}: sending ${order.id} refused: ${sent.error}`); continue }
              record(now, 'order', `${order.id} sent`); tally(enough ? 'orders sent in full' : 'orders sent in part')
            } else if (chance(0.35)) {
              const cancelled = cancelRemaining(workspace, order.id, now)
              if ('error' in cancelled) { broken.push(`${now}: cancelling ${order.id} refused: ${cancelled.error}`); continue }
              workspace = cancelled.workspace
              record(now, 'order', `${order.id} cancelled`); tally('orders cancelled')
            } else tally('orders left open past due')
          }
          // Sends recorded wrong are corrected: down, up, or to zero. Sometimes a shelf count happened in between.
          for (const [id, original] of [...sends].filter(() => chance(0.04)).slice(0, 4)) {
            const current = effectiveMovements(workspace.movements).find((item) => item.id === id)
            if (!current) { broken.push(`${now}: send ${id} disappeared`); continue }
            const target = pick([0, Math.max(0, current.quantity - 2), current.quantity + 1])
            if (target === current.quantity) continue
            const recountedSince = (countStep.get(pairOf(original.locationId, original.productId)) ?? -1) > original.step
            const order = workspace.orders.find((item) => item.id === original.orderId)!
            const shelf = book.get(pairOf(original.locationId, original.productId)) ?? 0
            const tooMuch = sentOf(order.id, original.productId) - current.quantity + target > orderedOf(order, original.productId)
            const takesBelowZero = !recountedSince && target - current.quantity > shelf
            const fixed = correctMovement(workspace, id, target, now)
            if (tooMuch || takesBelowZero) {
              if (!('error' in fixed)) broken.push(`${now}: correcting ${id} to ${target} allowed although it ${tooMuch ? 'exceeds the order' : 'takes stock below zero'}`)
              tally('corrections refused'); continue
            }
            if ('error' in fixed) { broken.push(`${now}: correcting ${id} to ${target} refused: ${fixed.error}`); continue }
            const shelfOf = (data: Workspace) => data.stock.find((item) => item.locationId === original.locationId && item.productId === original.productId)?.available.value ?? 0
            const moved = shelfOf(fixed.workspace) - shelfOf(workspace)
            const expectedMove = recountedSince ? 0 : current.quantity - target
            if (moved !== expectedMove) broken.push(`${now}: correcting ${id} ${current.quantity}->${target}${recountedSince ? ' after a later count' : ''} moved stock by ${moved}, expected ${expectedMove}`)
            if (recountedSince) afterCount.push(`${id} at ${original.locationId}/${original.productId}: ${current.quantity}->${target}, stock moved ${moved}; history ${effectiveMovements(fixed.workspace.movements).filter((item) => item.locationId === original.locationId && item.productId === original.productId).map((item) => `${item.kind} ${item.quantity} @${item.at.slice(5, 16)}`).join(', ')}`)
            workspace = fixed.workspace
            addSent(order.id, original.productId, target - current.quantity)
            if (!recountedSince) bookAdd(original.locationId, original.productId, current.quantity - target)
            record(now, 'order', `${id} corrected`)
            tally(recountedSince ? 'sends corrected after a later shelf count' : target === 0 ? 'sends corrected to zero' : target > current.quantity ? 'sends corrected up' : 'sends corrected down')
          }
          // Every evening, on purpose: a send is followed by a shelf count, then found to be recorded 1 too high.
          // The count already saw what really left, so the correction must not move stock.
          const lastSend = [...sends].reverse().find(([id, item]) => item.quantity >= 2 && effectiveMovements(workspace.movements).find((movement) => movement.id === id)?.quantity === item.quantity)
          if (lastSend) {
            const [id, original] = lastSend
            const shelfOf = (data: Workspace) => data.stock.find((item) => item.locationId === original.locationId && item.productId === original.productId)?.available.value ?? 0
            const counted = countStock(workspace, original.locationId, original.productId, shelfOf(workspace), typed(plusHours(now, 1)), plusHours(now, 1))
            if ('error' in counted) broken.push(`${now}: count refused: ${counted.error}`)
            else {
              workspace = counted.workspace
              stepNo += 1
              countStep.set(pairOf(original.locationId, original.productId), stepNo)
              const before = shelfOf(workspace)
              const fixed = correctMovement(workspace, id, original.quantity - 1, plusHours(now, 2))
              if ('error' in fixed) broken.push(`${now}: correcting ${id} after a count refused: ${fixed.error}`)
              else {
                if (shelfOf(fixed.workspace) !== before) broken.push(`${now}: correcting ${id} after a shelf count changed stock ${before} -> ${shelfOf(fixed.workspace)}`)
                workspace = fixed.workspace
                addSent(original.orderId, original.productId, -1)
                tally('sends corrected after a later shelf count (on purpose)')
              }
            }
          }
          // Shelf counts: a few warehouses are counted, and the count is what is there from now on.
          for (const item of workspace.stock.filter(() => chance(0.03))) {
            const counted = Math.max(0, item.available.value + between(-3, 3))
            const result = countStock(workspace, item.locationId, item.productId, counted, typed(now), now)
            if ('error' in result) { broken.push(`${now}: count refused: ${result.error}`); continue }
            workspace = result.workspace
            stepNo += 1
            book.set(pairOf(item.locationId, item.productId), counted)
            countStep.set(pairOf(item.locationId, item.productId), stepNo)
            tally('shelf counts')
          }
          // Things that must be refused: sending more than is owed, or more than is on the shelf.
          const open = workspace.orders.filter((item) => hasOutstanding(workspace, item))
          if (open.length) {
            const order = pick(open)
            const line = remainingLines(workspace, order)[0]
            if (!('error' in sendOrder(workspace, order.id, [{ productId: line.productId, quantity: line.quantity + 1 }], now))) broken.push(`${now}: sending more than ${order.id} still needs was allowed`)
            const shelf = book.get(pairOf(order.locationId, line.productId)) ?? 0
            if (shelf < line.quantity && !('error' in sendOrder(setSplitAllowed(workspace, order.id, true), order.id, [{ productId: line.productId, quantity: line.quantity }], now))) broken.push(`${now}: sending ${line.quantity} from a shelf of ${shelf} was allowed`)
            tally('impossible sends tried')
          }
          // Editing an order below what already left must be refused by the order editor.
          const partlySent = workspace.orders.filter((item) => sentLines(workspace, item.id).length > 0 && hasOutstanding(workspace, item))
          if (partlySent.length) {
            const order = pick(partlySent)
            const config = editorFor({ type: 'order', orderId: order.id }, workspace, createFormat(workspace.settings))!
            const sentLine = sentLines(workspace, order.id)[0]
            const values = Object.fromEntries(config.fields.map((field) => [field.key, parseField(field, config.initial[field.key] ?? '', createFormat(workspace.settings))]).map(([key, result]) => [key, 'value' in (result as object) ? (result as { value: unknown }).value : null]))
            if (!config.validate?.({ ...values, [`line:${sentLine.productId}`]: sentLine.quantity - 1 } as never)) broken.push(`${now}: ${order.id} could be edited below what was sent`)
            tally('edits below sent tried')
          }
          // A cancelled order comes back: only what was not sent counts again.
          const cancelled = workspace.orders.filter((item) => item.status === 'cancelled')
          if (cancelled.length && chance(0.3)) {
            const order = pick(cancelled)
            const reopened = reopenOrder(workspace, order.id)
            if (!('error' in reopened)) {
              workspace = reopened.workspace; record(now, 'order', `${order.id} reopened`); tally('orders reopened')
              const reopenedOrder = workspace.orders.find((item) => item.id === order.id)!
              if (!hasOutstanding(workspace, reopenedOrder) && order.lines.some((line) => orderedOf(order, line.productId) > sentOf(order.id, line.productId))) broken.push(`${now}: reopened ${order.id} owes nothing although not all was sent`)
            }
          }
          // Saved and loaded again (browser, account, backup all go through this): nothing changes.
          const loaded = parseWorkspace(JSON.parse(JSON.stringify(workspace)))
          if (!loaded || canonical(loaded) !== canonical(workspace)) broken.push(`${now}: saving and loading changed the business`)
          check(now, 'end of day')
        }
      }
    }

    const final = rehearse(workspace, at(6, 18))
    const summary = {
      business: `${workspace.locations.length} locations, ${workspace.products.length} products, ${workspace.orders.length} orders, ${workspace.shipments.length} deliveries still incoming, ${workspace.suppliers.length} suppliers, ${workspace.routes.length} routes`,
      actions: count,
      endOfWeek: { exposed: final.impact.exposedQuantity, atRisk: final.impact.affectedOrderIds.length, watch: final.impact.watchOrderIds.length, problems: final.impact.groups.length, readyOptions: final.plans.filter((plan) => plan.status === 'ready').length },
      history: { entries: workspace.history?.length, kinds: [...new Set(workspace.history?.map((item) => item.kind))] },
      slowestPlannerRunMs: Math.round(slowest.ms), slowestAt: slowest.when,
      savedSizeKb: Math.round(JSON.stringify(workspace).length / 1024),
      correctionsAfterACount: afterCount,
      broken,
    }
    console.log(JSON.stringify(summary, null, 2))
    writeFileSync('/tmp/deccan-week-summary.json', JSON.stringify(summary, null, 2))
    writeFileSync('/tmp/deccan-week-backup.json', serializeBackup({ ...workspace, mode: 'real' }))

    expect(broken).toEqual([])
    expect(count['approved: transfer'] ?? 0).toBeGreaterThan(0)
    expect(count['received in part, rest coming'] ?? 0).toBeGreaterThan(0)
    expect(slowest.ms).toBeLessThan(2000)
  }, 180_000)
})
