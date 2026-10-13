# Rehearsal — Project Plan

## Project direction
- Product: Rehearsal
- Theme: Retail & Commerce
- Demo business: Distributor
- Stack: React frontend + Firebase + Firestore + Cloud Run + Gemini
- Goal: build a reliable disruption-recovery planning workflow that can be demoed in under 3 minutes

## Working rule
- Start with the Distributor workflow only.
- Define the business data, constraints, and plan model together as a single evolving design.
- If a rule, field, or scenario turns out to be wrong, update the model and the docs in the same pass instead of layering on a brittle workaround.
- Keep the first implementation small, realistic, and demoable.

## Core user value
When a business faces disruption, the system should help answer three questions fast:
1. What is affected?
2. Which responses are actually feasible?
3. Which approved plan should be applied?

The product is not a generic chatbot. It is a decision-support and validation system that checks feasibility against real constraints.

## MVP success definition
The V1 product should be able to:
- intake a disruption via text, voice, or uploaded document
- identify affected orders, inventory, and capacity
- ask only the minimum missing questions
- compare 2–3 plan options with tradeoffs
- reject or flag impossible options with reasons
- let the user approve a plan
- prepare internal actions and customer/supplier drafts

## Execution plan

### Phase 1 — Product lock and assumptions
- confirm final theme and demo business
- confirm the story for the hackathon video
- lock the core workflow and sample data
- agree on the level of automation for V1

### Phase 2 — Data model and core rules
- define business objects: locations, SKUs, suppliers, inventory, orders, warehouse capacity, incoming shipments, incidents, plans, and action drafts
- define fact provenance and source tracking
- define hard constraints: stock availability, budget, dates, capacity, no double allocation
- define soft preferences: cost minimisation, promised delivery protection, balance mode

### Phase 3 — AI + planner split
- Gemini handles document and voice understanding, plan suggestions, and user-friendly explanations
- backend code checks every plan against business rules
- numbers, dates, and quantities are recomputed by code, never trusted blindly from AI output
- missing facts become guided questions instead of unsupported recommendations

### Phase 4 — Frontend workflow
- workspace landing screen
- disruption intake step
- impact view
- option comparison screen
- approval and apply screen
- action summary / prepared drafts

### Phase 5 — Integration and deployment
- create Firebase project structure
- build Cloud Run API endpoints
- store workspace and business state in Firestore
- keep Gemini keys server-side only
- add public demo safeguards: rate limiting, budget caps, sample-only workspace isolation

### Phase 6 — Demo, proof, and submission
- create golden scenarios for the most important business cases
- verify the planner rejects impossible options clearly
- run end-to-end smoke tests with sample data
- prepare the 3-minute demo script
- prepare deck, repo, and deployed prototype link

## Recommended V1 scope
In scope:
- Distributor template
- sample workspace with 2–3 locations
- 2–3 SKUs and a few orders
- supplier delay, stock shortage, and warehouse issue scenarios
- impact view and plan comparison
- user confirmation before data changes
- prepared action drafts

Out of scope for V1:
- full ERP integrations
- auto-send external messages
- full role-based permission system
- spreadsheet parsing for arbitrary formats
- advanced forecasting or reinforcement learning

## Risks to watch
- scope creep from adding too many business types
- over-engineering the optimizer before demo confidence is proven
- AI misreading documents without user confirmation
- public demo abuse or budget overrun
- weak demo story if the product looks like a chatbot instead of a planner

## Immediate next step
Build the distributor sample scenario first and prove the workflow in a fully mocked-but-realistic end-to-end flow before adding any more business types or features.

## First build target
The first implementation will focus on one distributor scenario:
- 2 warehouses
- one impacted SKU in the first vertical slice; broaden the catalog only after validating this flow
- 1 delayed inbound shipment
- 1 warehouse capacity restriction
- multiple customer orders at risk
- 2–3 response options, with one clearly rejected by the planner because it violates a hard rule

## Current sample scenario (provisional)
These values are demo assumptions, not verified business facts. Review and revise them together before treating them as product rules.
- North Hub has 14 cases on hand; South Hub has 14 unallocated cases.
- North Hub can receive up to 8 transferred cases per day.
- The sample transfer is confirmed to arrive Thursday at noon, before the priority order is due at 2:00 PM.
- Shipment SH-204 contains 24 cases and moved from Tuesday, 13 October to Friday, 16 October at 3:00 PM IST.
- Three orders for the affected SKU require 18, 12, and 8 cases by Thursday 2:00 PM or Friday noon.
- Before the delayed inbound arrives, 38 cases are due and only 14 are at North Hub, so 24 cases are exposed.
- An 8-case transfer fits the receiving limit and leaves 16 cases exposed before inbound arrival.
- A 14-case one-day transfer exceeds the receiving limit by 6 cases and must be rejected.
- Supplier B availability, price, and arrival time are unknown, so its option remains conditional.
- Transfer cost values shown in the interface are estimates for the sample only.
