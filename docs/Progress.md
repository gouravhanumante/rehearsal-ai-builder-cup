# Rehearsal — Progress Tracker

## Stock Ledger Rebuild (2026-10-15)
User approved replacing direct stock edits with a movement ledger, starting fresh (no live users; old saves are not migrated). Local only; nothing committed or deployed.

| Slice | What | Status |
|---|---|---|
| 1. Shared ledger | `Movement` records; stock derived by `stockFrom`; `sendOrder` (partial, split permission, retry-safe), `correctMovement` (one send, keeps original time so a later count is respected), `cancelRemaining`, `reopenOrder` (demand only). Planner uses outstanding quantities. | Done: 117 shared tests pass; focused red/green for planner double subtraction, slice movement and recount correction |
| 2. Data paths | Stock editor/import record counts; same-number physical recount can be explicitly recorded; demo key v3; Firestore `movements-N` chunks. Transfer origin, booking, departure-batch, and receipt links persist. | Built; Firestore rules emulator: 7 passed |
| 3. Orders UI | Send full/partial, asks split; Correct selected dispatch; Cancel remainder; Reopen cancellation; outstanding shown. | Browser-tested split Yes/No, 6/18 send, selected correction, same-number recount, cancel/reopen (`browser-test-matrix.md` O02/O03/O06-O09) |
| 4. Transfer booking | Approval reserves without deducting on-hand; Inventory shows on-hand/booked/free. Each departure creates a separate ETA batch. Cancel releases only undeparted stock. | Browser-tested booking, pre-depart cancel, 3-of-8 departure, remainder cancel and receipt (`browser-test-matrix.md` T01-T07) |
| 5. Remaining gaps | Generic customer physical returns; repeat occurrence identity; actual customer dispatch/delivery confirmation; immutable Firestore snapshots; two-device booking race. Optional `Location.customerTravelHours` sets the warehouse cutoff; unknown time is explicitly unconfirmed (`mustLeaveBy`, `orderCoverage`). | Current frontend, backend, and rules gates pass; remaining browser cases are listed in `browser-test-matrix.md` |

Checks (`frontend/package.json`, `backend/package.json`): frontend 241 tests, typecheck, lint and build pass; backend 25 tests, typecheck and build pass; Firestore rules emulator 7 tests pass. The one-week simulation (`frontend/src/simulation/week.test.ts`) passes with `broken: []` in 70.5 seconds. The frontend build still warns that the cloud chunk exceeds 500 kB. Browser scenarios and statuses are in `browser-test-matrix.md`; Google account/two-device cases need authenticated test setup.

The earlier six-step feedback list remains tracked below; partial dispatch is implemented in slices 1-3, while other feedback items remain open.

## Active Feedback Implementation (2026-10-15)
User requested implementation of the six decisions below and asked to track work here. No commit or deployment is implied. Existing local changes remain intact. Work proceeds one item at a time: state the business rule, observe a focused regression fail, implement, rerun checks, update owning docs, then mark done.

| Step | Agreed behaviour and planned check | Status |
|---|---|---|
| 1. Factual customer messages | No guessed cause: only a reported supplier delay for this product/location that moved arrival past the customer's due time is mentioned (`approvalMessages`). Two rule tests observed red against the hard-coded claim; all 7 message tests now pass. | Done locally; full release gates follow remaining work |
| 2. Header-only import matching | Send column headers to Gemini, not spreadsheet row contents. Test the actual mapping request body (`frontend/src/import/suggest.ts`). | Paused for dispatch-flow review; interrupted edit did not land |
| 3. Late-but-useful transfers | Offer a transfer that helps a later customer even when a short priority customer's deadline is missed; explicitly warn who remains short. Test planner readiness, warning wording and approval behaviour (`shared/planner/plan.ts`, `frontend/src/presentation/planText.ts`, `WorkspaceScreen.tsx`). | Pending |
| 4. Supplier reply freshness | Reconfirm when demand/delays change or arrival passes; purchases for unchanged demand may reuse the remaining reply. Keep old details visible but not ready. Test these boundaries (`SupplierOffer`, `rehearse`, supplier reply editor). | Pending; follow-up choice agreed |
| 5. Dated storage forecast | Keep incoming separate from on-hand; show projected storage at expected arrival times; a delay moves the forecast. Warn on existing overflow and block new rescues that worsen it. Do not assume unshipped customer orders have left; still allow recording actual arrivals (`storageCap`, `rehearse`, `InventoryView`, `receiveDelivery`). Test arrival ordering, delays, repeated deliveries and server rechecks. | Pending |
| 6. Partial dispatch | Record 6 of 10 sent; keep 4 outstanding under the original due date unless edited. Ask once per order about customer split permission. Edit a selected dispatch, correcting only its stock difference. Test conservation, repeated partials, cancellation, closure, isolated corrections and save/restore. | Implemented locally; browser coverage is in `browser-test-matrix.md` O02/O03/O06-O09; broader save/restore and edge cases remain |

Follow-up answers explicitly agreed: original remaining due date; ask once whether the customer accepts splits; edit only a selected dispatch and apply its stock difference, not a global undo; reuse supplier replies until demand/delays change or arrival passes. User then paused implementation for in-chat diagrams and restriction/calculation review. `07-bug-map.md` now separates current A-C, proposed D-F, their connected map and an independent quantity example. Current receipt/closing tests: 19 passed in `shared/planner/apply.test.ts`; documentation whitespace check passed. This is not a full release check or proof of the proposed flows.

Completion gate: focused red/green evidence for changed business rules, matching docs, frontend types/lint/tests/build, backend types/tests/build, and rules tests if persistence rules change. Browser checks must preserve and restore the user's guest business. Exact counts and any unverified flows will be recorded here after execution.

## Status summary (checked against code 2026-10-15, commit 25e5e0f)
- Project status: sample and own-business workspaces, shared planner, Gemini document reading / column matching / Ask AI, and approvals that record the plan are implemented
- Theme direction: Retail & Commerce
- Demo hero: Distributor
- Architecture: React + Vite on Firebase Hosting, Node API on Cloud Run (project rehearsal-ai-builder-cup-2026), Gemini via AI Studio key; own business saved per Google account in Firestore
- Deployed: yes, but the work after 2026-10-14 (costs, worth-it, book-by, supplier asks) is not redeployed yet
- Submission date: 2026-10-18

## Completed
- product concept agreed
- business problem framed
- core behaviour documented
- architecture split documented
- MVP scope narrowed
- hackathon requirements reviewed
- project direction refined for a clearer demo story
- React + TypeScript frontend scaffold created
- sectioned operations overview with an expandable affected-order list and distinct recovery-option cards
- persistent desktop sidebar and labeled mobile navigation for Overview, Orders, Inventory, Suppliers, and Rehearsals
- dedicated views show their own data; Overview stays focused on urgent details and one checked response
- branded header, higher-contrast status colors, clearer plan wording, and larger primary actions
- Manrope typography, evergreen/lime brand treatment, and plain-language option states
- Ask AI drawer wired to the local API; key setup and stateless live sample question verified
- Cloud Run-compatible backend with `/api/health` and `/api/assistant/ask`; API key stays server-side
- Gemini response validation filters option IDs to known planner options and recommendations to ready options
- Gemini Interactions use `store: false`; Rehearsal backend does not persist prompts or context
- Live sample question returned a planner-checked option reference; no key value is stored in the repository
- Ask AI uses Gemini 3.5 Flash-Lite; one local sample UI request completed in about 2.1 seconds
- research-backed UX guidelines recorded for future screens
- distributor sample fixture centralized separately from UI
- deterministic impact and recovery-option calculations implemented
- planner tests cover stock exposure, receiving capacity, and unknown supplier facts
- responsive browser checks for incident details, approval, reset, and mobile overflow
- editable Demo data (stock counts, orders, backup suppliers) with two paths: type it in (marked unverified) or attach a photo/PDF that Gemini reads (marked verified by document)
- two-step edit: check values, then review the effect on the shortage and options before saving; Demo edits kept in the browser until Reset
- Add supplier; each backup supplier is its own option with an Add details action instead of a dead-end "Waiting for details"
- plans relying on typed-in details show "Ready · unverified" and warn before approval, with Attach proof per record
- Orders view lists orders due after the delayed shipment separately
- live check: a sample supplier quote PDF was read by Gemini (all 4 fields, with quotes) and moved Supplier B to Ready to use
- Phase 1 scale-up: any number of products, locations, shipments, transfer routes and supplier offers; planner shared by browser and API (`shared/planner/`)
- currency and timezone from the workspace country (sample: India, ₹); times correct across daylight saving
- priority-vs-due-date conflict card (default: order due first) and conflict warning at approval
- approvals saved with edits; server re-checks a plan before it is approved
- Add location, Add product, edit transfer arrival (fixes the transfer "Waiting for details" dead end)
- browser saves from the first version are carried into the new format; unreadable saves are reported, not dropped
- live check after scale-up: same sample numbers (24 exposed, transfer leaves 16); Gemini read a quote's arrival time in India time and correctly declined a USD price for a ₹ workspace

- blank workspace: start screen (set up my business / try the sample), empty Real workspace saved in the browser, Setup guide, empty states, backup download/restore, delete (2026-10-14)
- spreadsheet import (csv/xlsx) with Gemini column suggestions; four test scenarios in `test-data/` (2026-10-14)
- deployed to Cloud Run + Firebase Hosting (2026-10-14)
- products by items per package; storage limit per product per warehouse; repeating deliveries (2026-10-14)
- every open order checked against its warehouse's stock and deliveries, not only delayed ones; short orders get recovery options too (2026-10-14)
- Between locations section: routes with travel time, edit/remove, "can't move this way" answers (2026-10-14)
- edit and remove suppliers; backup suppliers can supply several products (2026-10-14)
- ship an order from another warehouse, after the user says it can deliver to those customers (2026-10-15)
- orders can be marked delivered, cancelled, or reopened (2026-10-15)
- a missing stock count counts as 0 and is labelled so (2026-10-15)
- approving a transfer, purchase or ship-from records it in the workspace (2026-10-15)
- costs: per trip + per package on routes, supplier delivery charge, delivery cost per order for ship-from; ranked on total (2026-10-15)
- options grouped by problem with a best pick each; next steps when a problem has no option (2026-10-15)
- worth-it warning from an optional selling price; Book by time on ready transfers (2026-10-15)
- Ask your backup suppliers per problem, one message per product, Email all (BCC) (2026-10-15)
- own business saved per Google account in Firestore; owner-only rules tested on the emulator and deployed (2026-10-15)
- Google sign-in switched on in the Firebase console (2026-10-15)
- all four `test-data/` businesses checked end to end against their READMEs; Excel 10:00 no longer read as 09:59 (2026-10-15)

## Build plan (agreed 2026-10-15)
Worked through one at a time, top to bottom. Each item is committed with its tests and docs before the next
starts, and ticked here only after that commit. Rule for every item: nothing existing breaks (all checks green,
data already saved still opens).

### 1. Guest mode + several businesses per account — done (2026-10-15), Google sign-in itself still to be tried by hand
- [x] Guest: **Start as a guest** / **Continue without signing in**; one business per browser, saved only in this browser; the top bar says so
- [x] Several businesses per account in Firestore (`users/{uid}/businesses/{id}`): list with **Open**, **Add another business**, **Switch business** in the menu; **Delete** removes only the open one
- [x] A business saved under the earlier one-per-account layout is carried into the list, not dropped (`listBusinesses`)
- [x] Guest signs in at any time (top bar button): asked "Save {name} to your account?" **Save to my account** / **Not now**; added as a new business, never replacing one
- [x] The browser copy is deleted only after Firestore confirms the save; a pending guest save finishes first; a failed or cancelled sign-in leaves the guest business untouched (`moveGuest.test.ts`, seen failing with the wrong order)
- [x] Firestore rules for the new layout, deployed; rules tests updated, plus "another person can't open someone's second business", seen failing
- [x] Browser run as a guest: Kaveri Distributors, 3 locations, 3 products, 5 orders, 2 deliveries (one weekly), a delay, a transfer route, a backup supplier, approve a transfer (Mysuru 60 → 45, 15 arriving), answer "can it deliver?", approve ship-from, mark an order delivered (oil 25 → 5), Ask AI, reload, blocked sign-in. Findings are in `TODO.md`
- [ ] Real Google sign-in, saving a guest business to an account, two businesses, two devices: needs a person (the built-in browser blocks the Google window)

### 2. Mark received + History — done (2026-10-15)
- [x] **Mark received** on an incoming delivery: enter what arrived; stock goes up and the delivery closes; a delay on it is cleared (`receiveDelivery`, seen failing when the delivery was left incoming)
- [x] Part arrived (40 of 50): "Are the other 10 still coming?" Yes needs a date and keeps 10 incoming; No closes it. A regular delivery moves to next week
- [x] **History**: read-only list of delays, approvals, deliveries received, orders delivered/cancelled/reopened, edits and imports; newest 500 kept; saved with the business (Firestore rules and chunking allow it)
- [x] Browser run on Kaveri: received the Mysuru transfer (15), part of the late rice (40 of 50, rest Fri 23 Oct), the weekly oil (moved to Mon 26 Oct); rice at Bengaluru 40 → 95; History shows each step

### 3. Messages after approval — done (2026-10-15)
- [x] Ready-to-send texts after approving: purchase order to the supplier (with email), transfer request to the sending location, ship-from request, note to each customer still short (no guessed dates). Copy or email; nothing sent automatically; a copy kept in History (`approvalMessages.test.ts`, seen failing)
- [x] Also: "at risk" now means left short; covered only by stock on its way is Watch (`8610514`)

### 4. Pick a goal — done (2026-10-15)
- [x] **Protect deliveries** (default), **Lowest cost**, **Balanced** (priority first, then cheapest per package saved); saved per business, noted in History; options and the Overview's best pick follow it; Ask AI sees the goal's order (`plan.test.ts`, seen failing)

## In progress
- Deep distributor testing: priority choice, late-but-still-short orders, receiving capacity before and after arrival, source-order quantity protection, duplicate delay groups, server capacity slices, on-time incoming Watch, useful-order booking deadlines and insufficient-stock delivery have regression coverage (`shared/planner/plan.test.ts`, `apply.test.ts`, `blank.test.ts`). Each new rule test was observed failing against the corresponding mistake. Final checks pass: 214 frontend/shared tests, 25 backend tests, 7 Firestore rules tests, frontend/backend types and builds, frontend ESLint, and `git diff --check`. Remaining gaps are in `TODO.md`.
- Browser matrix exercised below. Real Google sign-in and two-device testing remain unverified.
- review provisional distributor sample quantities, dates, and estimated costs together
- finalize the exact V1 demo flow and confirm hackathon theme

## Pending
- the build plan above, in order
- redeploy backend and frontend once item 1 is done
- review provisional distributor sample quantities, dates, and estimated costs together
- deck, demo video, demo script, and submission assets

## Current working assumption
Demo remains the sample distributor workflow, no sign-up, kept in the browser. Real mode needs Google sign-in and is saved to the user's account in Firestore; users explicitly submit questions/documents to Gemini, check its proposed values, review the calculated effect, then save. Approving a plan changes the workspace only; no external action is sent.

## Deep Browser Run (2026-10-15)
Integrated browser at `http://localhost:5173`, backed by the local API. Small JSON backups restored through the top-bar file input; dates moved forward so browser/API use the real clock. Expected quantities below were worked out from counts, not from planner output. These are manual browser checks, not a reusable Playwright suite. View checks do not claim full workflow coverage.

| Case | Expected and observed | Scope / Result |
|---|---|---|
| 1. One transfer | 14 on hand, 38 due before late delivery: move 24; source 40 to 16, incoming 24, no short orders; message in History | Approval + saved records: pass |
| 2. Transfer plus purchase | Limit 8: transfer 8, then buy remaining 16; second transfer ruled out; incoming 8 + 16, zero short | Both approvals + messages: pass |
| 3. Transfer too slow | 200-hour route rejected; supplier's 24 arrive in time | Ready/rejected views: pass |
| 4. Supplier reply | Unknown offer stays waiting; enter 24 at 10, review, approve with warning; PO states 24 and total 240 | Reply through approval: pass |
| 5. Suppliers and goal | Equal coverage: supplier at 10 beats supplier at 20. Case 2: Lowest cost picks transfer 8 for 95 instead of purchase 24 for 240 | Ranking views + goal interaction: pass |
| 6. Ship from elsewhere | Answer Yes, approve: order moves north to south; stock remains 40 until dispatch | Approval + saved records: pass |
| 7. Who gets stock | 14 for Cafe A 10 and Hotel B 10: priority choice leaves A covered 4, B covered 10; both screens agree | Choice + Orders: pass |
| 8. Storage | Limit 20 minus count 14: transfer and purchase capped at 6, shortage 18 remains | Option views: pass |
| 9. No option | Short 24, no routes/suppliers/spare stock: supplier/delivery next steps offered | View: pass |
| 10. Worth warning | Fix costs 175, 24 saved packages worth 24: warning shown; approval remains enabled | View + enabled control: pass |
| 11. Nothing late | 48 ordered, 14 on hand, no deliveries: shortage 34 and transfer 34 offered | View: pass |
| 12. Delivery slips | Zero on hand, 10 incoming, order 10: initially showed Covered; after the follow-up fix it shows Watch and dependency note. Report arrival after due time: 0 covered, at risk | Original delay interaction passed; Watch fixed and browser rechecked below |
| 13. Partial receipt | Receive 6 of 10; date required for rest; count 6, incoming 4; delay rest: order covered 6 of 10, at risk | Receipt + delay: pass |
| 14. Two products | Short 24 coffee and 8 second SKU; approve coffee transfer: second shortage stays 8 | Approval + independent problem: pass |
| 15. Uncounted | Missing count explicitly counts as 0; short 38, transfer 38 offered; Add count shown | Orders + options: pass |
| 16. Previously missed later order | 38 on hand covers earlier orders, late delivery 24 against later order 30: later customer short 6, transfer 6 offered | View: pass; overly early book-by fixed in follow-up below |
| Extra: two delays, same SKU/place | Initially two copies of 24 short; after fix one recovery group, shortage 24 | Browser reproduction + recheck: pass |
| Extra: deliver/reopen shortage | Initially 14 to 0 to 18 created 4 cases. After user ruling/fix: delivery blocked, stock 14, order open, no History entry | Browser reproduction + recheck: pass |

Implementation anchors: `rehearse`, `orderCoverage`, `sliceForPlan`, `setOrderStatus`, `receiveDelivery`; `WorkspaceScreen`, `CommitmentsPanel`, `RecoveryPlans`, `approvalMessages`. At 390 px, the checked Recovery options page measured 391 px wide; no comprehensive mobile visual claim. Kaveri Distributors was restored through the backup input, reloaded, and its stored workspace compared equal to the original (all 5 orders); browser time advances again. Nothing from this run is deployed.

Final automated run: `frontend/src/simulation/week.test.ts` passes with receiving overbooking treated as a failure, not an exemption. `frontend/src/import/scenarios.test.ts` now checks that TechNest cannot dispatch 60 chargers from 35, and can dispatch both products after the count is corrected to 60. These imported scenarios are regression checks; the dispatch rule's observed-red proof is in `shared/planner/apply.test.ts`. The production frontend build still warns about the 563 kB Firebase cloud-store chunk. Rules required Java 25 on PATH as well as JAVA_HOME; the first attempt selected Java 17 and did not run tests.

## Three-Risk Follow-up (2026-10-15)
User approved all three fixes after clarifying that "receipt" means an automatic arrival record, not an uploaded document. No new user control was added.

| Item | Implementation and proof | Status |
|---|---|---|
| Remember received capacity | `receiveDelivery` appends `GoodsReceipt`; `rehearse` sums actual transfer arrivals plus remaining bookings by business day. Full/partial/local-midnight tests in `apply.test.ts` observed red, then green. Validation, small approval slices, size-bounded chunks and owner-only rules also tested red/green. | Done |
| Watch without a delay | `orderCoverage.onHandCovered` identifies dependence; `rehearse` includes these pairs, while `IncidentOverview` suppresses false zero-shortage alerts. Test checks stock cover, incoming cover and mixed-product at-risk precedence. | Done |
| Useful-order deadlines | `rehearse` ignores covered priority deadlines and uses the earliest due time whose coverage the transfer increases. Tests reject the old covered-priority gate and premature deadline for an earlier standard order it cannot help. Still-short priority timing is unchanged. Wording tests observed red/green too. | Done |

Browser follow-up on the local app: zero counted + 10 timely incoming for order 10 showed Watch and dependency note; Overview showed no false shortage. Received all 8 of `TR-CAP` through the existing dialog, without an upload: stock 14 to 22, incoming transfer removed, structured receipt persisted on reload, receiving-full with 8 booked/used and zero further transfer. A 3-hour route arriving after a covered priority order remained ready for a customer due 48 hours later; its deadline equalled that customer's due time minus 3 hours, the API approved it, and the message used that deadline. Initial hot-reload view was stale; reload verified the current Overview component. These are browser checks, not new reusable browser tests.

Final gates: 214 frontend/shared tests, 25 backend tests, 7 rules tests; types, frontend lint and both builds pass. The week simulation now counts both received and incoming transfer quantities in its capacity invariant. Kaveri was restored through backup input, reloaded, and compared exactly equal to the original (5 orders). No commit or deployment. Deploy updated rules before the receipt-writing frontend, plus the matching backend planner. Remaining boundaries: old saves cannot recover unrecorded arrivals, transfer identity still uses a name prefix, and customer messages can invent a late-supplier cause for plain shortages (logged in `TODO.md`).
