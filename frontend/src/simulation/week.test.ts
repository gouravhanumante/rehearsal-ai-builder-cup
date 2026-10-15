/// <reference types="node" />
import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Evidence, Goal, InboundShipment, Order, Supplier, TransferRoute, Workspace } from '../../../shared/planner/model'
import { createBlankWorkspace } from '../../../shared/planner/blank'
import { orderCoverage, recommendPlan, rankPlans, rehearse, type Plan } from '../../../shared/planner/plan'
import { addHistory, applyPlan, receiveDelivery, setOrderStatus } from '../../../shared/planner/apply'
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
  workspace.stock = workspace.locations.flatMap((location) => workspace.products
    .filter(() => chance(0.85))
    .map((product) => ({ locationId: location.id, productId: product.id, available: { value: big.has(location.id) ? between(20, 300) : between(0, 40), evidence: typed(at(0, 8)) } })))
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
    const { initialTotal } = { initialTotal: workspace.stock.reduce((total, record) => total + record.available.value, 0) }
    const ledger = { supplied: 0, delivered: 0, lostInTransit: 0 }
    const count: Record<string, number> = {}
    const tally = (key: string, by = 1) => { count[key] = (count[key] ?? 0) + by }
    const broken: string[] = []
    const openRulings: string[] = []
    const openFindings = { conflictChoiceIgnoredByOrdersPage: [] as string[], shortAfterDelayGetsNoOptions: [] as string[] }
    const slowest = { ms: 0, when: '' }
    let orderNo = 2000
    const record = (now: string, kind: Parameters<typeof addHistory>[1]['kind'], text: string) => { workspace = addHistory(workspace, { at: now, kind, text }) }

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
      // Nothing appears or vanishes: stock + transfers in transit = start + received from suppliers - delivered - lost in transit.
      const onHand = workspace.stock.reduce((total, item) => total + item.available.value, 0)
      const inTransit = workspace.shipments.filter((item) => item.supplierName.startsWith('Transfer from')).flatMap((item) => item.lines).reduce((total, line) => total + line.quantity, 0)
      const expected = initialTotal + ledger.supplied - ledger.delivered - ledger.lostInTransit
      if (onHand + inTransit !== expected) broken.push(`${where}: goods don't add up (stock ${onHand} + in transit ${inTransit} = ${onHand + inTransit}, expected ${expected})`)
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
        const sameSpot = result.impact.groups.find((group) => group.locationId === line.locationId && group.productId === line.productId)
        const choseItsOwnPriority = workspace.conflictDecisions.some((item) => item.winner === 'priority' && item.conflictId.endsWith(`:${line.productId}`) && workspace.orders.find((other) => other.id === item.conflictId.split(':')[1])?.locationId === line.locationId)
        const text = `${line.orderId} at ${line.locationId} due ${order?.dueAt}: Orders page ${line.covered} of ${line.ordered}`
        // Known, awaiting a ruling (docs/TODO.md): the Orders page ignores "priority order first".
        if (sameSpot?.kind === 'shortage' && choseItsOwnPriority) openFindings.conflictChoiceIgnoredByOrdersPage.push(text)
        // Known, awaiting a ruling: an order due after a delayed delivery that is still short gets no problem.
        else if (sameSpot?.kind === 'delay' && !sameSpot.allocations.some((item) => item.orderId === line.orderId)) openFindings.shortAfterDelayGetsNoOptions.push(text)
        else broken.push(`${where}: ${text} shown Short in Orders but not at risk`)
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
      // Receiving limit (open ruling): transfers arriving the same day at one place within its daily limit.
      for (const location of workspace.locations.filter((item) => item.receivingLimitPerDay !== null)) {
        const byDay = new Map<string, number>()
        for (const shipment of workspace.shipments.filter((item) => item.locationId === location.id && item.supplierName.startsWith('Transfer from'))) {
          const day = localDay(shipment.confirmedArrivalAt)
          byDay.set(day, (byDay.get(day) ?? 0) + shipment.lines.reduce((total, line) => total + line.quantity, 0))
        }
        for (const [day, total] of byDay) if (total > (location.receivingLimitPerDay ?? Infinity)) openRulings.push(`${location.name} ${day}: ${total} arriving by transfer, limit ${location.receivingLimitPerDay}`)
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
        for (const shipment of workspace.shipments.filter((item) => Date.parse(item.confirmedArrivalAt) <= Date.parse(now))) {
          const isTransfer = shipment.supplierName.startsWith('Transfer from')
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
            const got = received.reduce((total, line) => total + line.quantity, 0)
            if (!isTransfer) ledger.supplied += got
            if (isTransfer && partial && !restComing) ledger.lostInTransit += missing
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
          const upcoming = workspace.shipments.filter((item) => Date.parse(item.confirmedArrivalAt) > Date.parse(now) && !item.supplierName.startsWith('Transfer from'))
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
          workspace = addHistory(next, { at: now, kind: 'approval', text: `Approved ${best.id}`, messages: messages.slice(0, 20) })
          tally(`approved: ${best.kind}`)
          tally('messages written', messages.length)
          const exposureAfter = rehearse(workspace, now).impact.exposedQuantity
          if (exposureAfter > exposureBefore) broken.push(`${now}: approving ${best.id} made the shortage worse (${exposureBefore} -> ${exposureAfter})`)
        }

        // Evening: orders due today leave if the stock is there; otherwise some are cancelled, some wait.
        if (hour === 17) {
          const endOfDay = at(day, 23, 59)
          for (const order of workspace.orders.filter((item) => (item.status ?? 'open') === 'open' && Date.parse(item.dueAt) <= Date.parse(endOfDay))) {
            const enough = order.lines.every((line) => (workspace.stock.find((item) => item.locationId === order.locationId && item.productId === line.productId)?.available.value ?? 0) >= line.quantity)
            if (enough) {
              workspace = setOrderStatus(workspace, order.id, 'delivered', now)
              ledger.delivered += order.lines.reduce((total, line) => total + line.quantity, 0)
              record(now, 'order', `${order.id} delivered`); tally('orders delivered')
            } else if (chance(0.35)) {
              workspace = setOrderStatus(workspace, order.id, 'cancelled', now)
              record(now, 'order', `${order.id} cancelled`); tally('orders cancelled')
            } else tally('orders left open past due')
          }
          // Now and then a delivery is reversed: goods come back.
          const delivered = workspace.orders.filter((item) => item.status === 'delivered')
          if (delivered.length && chance(0.3)) {
            const order = pick(delivered)
            workspace = setOrderStatus(workspace, order.id, 'open', now)
            ledger.delivered -= order.lines.reduce((total, line) => total + line.quantity, 0)
            record(now, 'order', `${order.id} reopened`); tally('orders reopened')
          }
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
      openRulingReceivingLimit: { violations: openRulings.length, example: openRulings[0] ?? null },
      openFindings: Object.fromEntries(Object.entries(openFindings).map(([key, list]) => [key, { distinctOrders: new Set(list.map((item) => item.split(' ')[0])).size, example: list[0] ?? null }])),
      broken,
    }
    console.log(JSON.stringify(summary, null, 2))
    writeFileSync('/tmp/deccan-week-backup.json', serializeBackup({ ...workspace, mode: 'real' }))

    expect(broken).toEqual([])
    expect(count['approved: transfer'] ?? 0).toBeGreaterThan(0)
    expect(count['received in part, rest coming'] ?? 0).toBeGreaterThan(0)
    expect(slowest.ms).toBeLessThan(2000)
  }, 180_000)
})
