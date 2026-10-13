# 02 — Product: What Rehearsal Is

## The problem
Small businesses run on promises (orders, delivery dates) that depend on limited resources
(stock, incoming shipments, people, machines, warehouse space, money). When one thing changes,
a person has to work out by hand — across spreadsheets, chats, PDFs and memory — which promises
break and what to do about it. This is slow, stressful and error-prone, and the mistakes cost
money and customers.

Different businesses, same pattern: **commitments depend on limited resources, and something
changes.**

## The idea
Rehearsal lets a business **rehearse its response before acting**:

1. **Report a disruption** — type it, say it, or upload the supplier's message/receipt.
2. **See the consequences** — which orders, customers and resources are affected.
3. **Compare recovery options** — each one checked against stock, capacity, dates, budget
   and business rules, with clear tradeoffs.
4. **Approve one** — Rehearsal updates the plan and prepares the follow-up work
   (revised schedule, purchase requests, customer messages, tasks).
5. **Replan when reality changes** — new facts invalidate affected plans and trigger
   another rehearsal.

The defining capability: **every proposed action must survive a rehearsal before execution.**
It is not a chatbot, not a dashboard, and not (at first) a replacement for the business's
existing systems.

## Who it is for (business templates)
One shared core; templates add terminology, setup questions and relevant constraints.

| Template | Typical resources | Typical disruptions |
|---|---|---|
| **Seller** (online/offline) | Stock, incoming purchases, packing and dispatch capacity | Supplier delay, stock-out, courier problem |
| **Distributor** | Stock across locations, warehouse capacity, delivery vehicles | Warehouse unavailable, vehicle down, late inbound |
| **Manufacturer** | Raw materials, production steps, machines, staff, finished goods | Material late, machine breakdown, staff shortage |

A business can combine templates (e.g. makes products and sells them directly).
We support these three; we do not claim to support every industry.

## Shared core concepts
- **Commitments** — orders: items, quantities, promised dates, priority, customer rules
  (e.g. partial delivery allowed or not).
- **Resources** — inventory by location, incoming shipments, capacity (people, machines,
  packing, vehicles), budget.
- **Dependencies** — what each commitment needs, in what order.
- **Constraints / rules** — hard (cannot break: budget cap, working hours, approved
  substitutes only) and soft (preferences: minimise cost, protect key customers).
- **Options** — alternative suppliers, shipping methods, substitutions, resequencing,
  splitting orders, accepting a delay.
- **Incidents** — the disruptions being handled now.
- **Plans** — a set of actions plus their checked outcome.
- **Actions** — what happens after approval (internal update, prepared message, request).

## Worked example
An online seller has a Thursday order for 20 units. Only 8 are in stock. The supplier's
shipment moves from Tuesday to Friday. An approved alternative supplier can deliver 12 units
by Wednesday for ₹1,200 extra.

| Response | Outcome | Tradeoff |
|---|---|---|
| Wait for original shipment | Thursday promise missed | No extra cost |
| Buy 12 emergency units | Thursday met, if packing capacity is available | ₹1,200 extra |
| Ship 8 now, 12 later | Partial delivery | Needs customer agreement |

The user picks a goal ("protect delivery promises" or "minimise extra spending"). Hard limits
still apply — the system never exceeds the budget to improve delivery.

## What makes it different (our claim, to be validated)
- Builds a working model of the operation from ordinary business records.
- Tests responses against real constraints instead of just generating advice.
- Separates facts, assumptions and unknowns: "feasible **only if** Supplier B confirms
  Wednesday arrival".
- Carries the approved response into preparation/execution and replans on new facts.

Not novel on its own: digital twins, scheduling software and planning tools exist. The
combination for small businesses, from ordinary records, is our hypothesis. **No prior-art
check done yet.**

## What we promise and what we do not
- We promise: checked feasibility **under stated facts and assumptions**.
- We do not promise: predictions, guaranteed outcomes, or facts nobody has supplied.
- We never invent supplier stock, prices or delivery dates.
- When no feasible plan exists, we say so and show which constraint would have to change.

## The demo story (draft)
1. A sample business running normally.
2. A disruption arrives (e.g. a supplier's message uploaded as a screenshot).
3. Rehearsal proposes the update; user confirms.
4. Affected orders light up.
5. Two or three checked options with tradeoffs; one tempting option is **rejected by the
   checker** with the reason shown.
6. User approves a plan; schedule and drafted messages update.
7. A second disruption arrives; Rehearsal handles both together and replans.
