# Rehearsal — TODO and Priority Backlog

## Dispatch Diagram Review (2026-10-15)
Updated after the movement ledger and transfer lifecycle implementation. Diagrams are in `07-bug-map.md`; manual browser matrix and status are in `browser-test-matrix.md`.
- [x] Separate recording corrections, cancellation reversal and physical returns: done by the ledger (`correctMovement`, `reopenOrder`; `setOrderStatus` removed 2026-10-15). Physical returns themselves are not built.
- [x] Transfer approval means booking, not departure: source keeps physical on-hand and shows booked/free; each departure creates its own incoming batch with actual-departure ETA (`applyPlan`, `departTransfer`, `reservedStock`, `InventoryView`). Browser cases T01-T07 exercised booking, partial departure, cancellation and receipt.
- [x] Support a fully cancelled supplier arrival: explicit zero-arrival confirmation closes the incoming expectation without stock movement (`ReceiveDialog`, browser R03).
- [x] Keep missing departed transfer goods unresolved and out of forecasts until staff record returned/lost; only a physical return restores source stock (`receiveDelivery`, `resolveTransferFate`, browser T15).
- [ ] Review very late repeating receipts and occurrence identity: `receiveDelivery` advances from confirmed/original dates and reuses the recurring shipment ID, not an immutable occurrence ID.
- [ ] Review large account saves under concurrency: `cloudStore.write` writes oversized changed chunks before the core revision transaction; conflict detection can occur after chunk changes. This is a code-identified risk, not a live two-device reproduction.
- [x] Partial dispatch plans outstanding quantities per product, keeps each send's warehouse, allows correcting a send to zero, and never restores sent goods on cancellation (`shared/planner/ledger.ts`, `ledger.test.ts`).
- [x] Transfers identified by `InboundShipment.fromLocationId`, not the editable supplier name; ids used by past movements are never reused (`applyPlan`).
- [x] A delivery listing one product twice: the missing quantity is worked out from that product's total (`receiveDelivery`).
- [x] Check the Send / Correct / Cancel dialogs in the browser for partial send, split permission, selected correction, recount, cancel remainder and reopen (`browser-test-matrix.md`, O02/O03/O06-O09).
- [x] Re-importing an orders file cannot set an order's quantity below what was already sent (`import/build.ts`); browser case I02 confirmed.
- [ ] Agree delivery-confirmation naming, allocation warnings versus reservation locks, recording an already-happened split without permission, and order edits/corrections after cancellation (proposed D-F diagrams).

## Found by seeded browser scenarios (2026-10-15, `browser-test-matrix.md`)
- [ ] **Needs ruling (P05):** after approving a transfer, the plan says "Priority orders covered" but the customer messages still say those cases are short, because a booking counts only once it departs (`approvalMessages`).
- [ ] **Needs ruling (I01):** importing a stock count equal to current stock is skipped as "already the same", but the editor's **Record this count again** saves it on purpose so later send corrections are not added twice (`import/build.ts` vs `DetailsEditor`).
- [ ] **Needs ruling (O11):** a past-due order with stock is shown as Watch under "No order short"; nothing says its promised date has passed.
- [ ] **Bug (B01):** restore accepts a backup with an impossible history (a 500-case send on a 12-case order); `parseWorkspace` checks shape, not sends against orders or stock.
- [ ] **Bug (U01):** dialogs (Send, Receive, Edit count, Ask AI) do not move focus inside, do not keep Tab inside, and do not return focus on close.
- [ ] **Gap (T08b):** a booking larger than the source's current count after a recount shows "0 free" with no warning; departure is refused only on submit.
- [ ] **Gap (T11):** two separate problems can each show a ready transfer from the same source that together need more than it has, with no "these compete" note.
- [ ] Small: booked remainder keeps its original, now-past ETA after a partial departure; "Are the other 1 case…"; "from Transfer from South Hub"; a two-product order repeats Send/Edit/Cancel on each product row.

## Open gaps found while testing (2026-10-15)
- [x] **Mark a delivery received** (2026-10-15): stock goes up, the delivery stops counting as incoming; part arrived asks whether the rest is still coming and when. Plus a read-only **History**.
- [x] **Shipping cost**: routes cost per trip + per package; supplier replies have a delivery charge; locations have a delivery cost per order for ship-from (2026-10-15).
- [x] **Is it worth it?** Optional selling price per product; options costing more than the packages they save are worth get a warning (2026-10-15). Warning only, ranking unchanged.
- [x] **Latest time to book**: ready transfers show "Book by …" (2026-10-15). Suppliers give an arrival time, not a lead time, so purchases have no book-by yet.
- [ ] **Move more per trip** (idea, not agreed): when the trip cost is high, consider moving extra stock in the same trip instead of exactly the shortfall.
- [ ] **Needs a ruling (found 2026-10-15, scenario 01):** a transfer that lands after a priority order is due (Surat DC to Mumbai arrives 17 Oct 8 am; Spice Route Cafe is due 16 Oct 2 pm) still helps the later order (Metro Mart). Should it be offered, and how should it be labelled? Not tested until decided.
- [x] Excel times read to the nearest minute: 10:00 had been imported as 09:59, which at midnight would have moved a date to the day before (`cellText`, 2026-10-15).

## Found in the browser run as a new distributor (2026-10-15, Kaveri Distributors)
- [x] **"Orders at risk" counted covered orders** (fixed 2026-10-15): at risk now means short; covered only by stock on its way is Watch; covered from stock on hand is fine. Kaveri now reads "No order short · 1 to watch".
- [x] **Ask AI repeated that wrong count**: it now gets short and watch orders labelled as such.
- [x] **Book-by used an already-covered priority order.** `rehearse` now uses the earliest order whose covered quantity increases, minus travel time. Covered priority orders no longer reject later useful transfers; a missed standard order the transfer cannot help does not set its deadline. Two `plan.test.ts` regressions observed red; browser approval and message confirmed the later deadline. A still-short priority order's timing rule is unchanged.
- [ ] Small: the route review shows "How long it takes 5" with no unit (hours). Ask AI does not send on Enter, only with the Send button.
- [x] **Receiving limit ignored approved transfers still incoming.** User ruled that bookings use the arrival day's limit. `rehearse` now subtracts them across products using the business timezone (`localDay`); `shared/planner/apply.test.ts` covers full capacity, remaining capacity and another day, with the first two seen failing against the wrong calculation. The week simulation now fails on overbooked incoming transfers.
- [x] **Receiving capacity after receipt:** `receiveDelivery` appends structured `goodsReceipts` automatically, with no upload. `rehearse` counts actual transfer arrivals and remaining bookings by business day across products. Full/partial/local-midnight regressions in `apply.test.ts` observed red; validator/slice/chunk tests and owner-only rules cover persistence. Browser receipt plus reload retained all 8 used slots.
- [ ] **Transfer identity and legacy arrivals:** incoming transfers still use the editable `Transfer from` supplier-name prefix; receipt records retain the classification made at receipt time. Old saves have no historical arrivals to backfill safely. A broader dispatch/returns ledger and correcting recorded arrival mistakes remain separate designs (`InboundShipment`, `GoodsReceipt`, `receiveDelivery`).

## Found by the one-week simulation (2026-10-15, `frontend/src/simulation/week.test.ts`)
- [x] **Two late deliveries duplicated the same shortage and options.** Browser case with two late deliveries of coffee at North Hub showed two copies of 24 short (48 in total). `rehearse` now creates one recovery group per location/product, retaining the first delay as the group's context while counting every delivery. The rule test in `shared/planner/plan.test.ts` failed with 48 instead of 24 before the guard was restored.
- [x] **Server slice lost receiving bookings for other products.** `sliceForPlan` now retains destination transfers even when their products differ from the chosen option. The `blank.test.ts` regression failed with a server quantity of 8 instead of the correct 5 before the fix.
- [x] **Deliver/reopen created stock.** Browser: count 14, mark order 18 delivered, reopen: count became 18. User ruled to block insufficient-stock dispatch. `setOrderStatus` now returns the unchanged workspace; `WorkspaceScreen` shows the correction notice and writes no success History. Tests in `apply.test.ts` observed failing; browser recheck leaves stock 14, order open, History empty.
- [x] **On-time incoming stock was not consistently Watch.** `orderCoverage.onHandCovered` and `rehearse` now include incoming-dependent pairs without reported delays. Browser recheck: zero on hand, 10 incoming for order 10 shows Watch and the dependency note; Overview shows no false shortage. The `plan.test.ts` rule test was observed red and also checks counted-stock coverage and mixed-product at-risk precedence.
- [x] **Customer approval messages invented a delay cause.** `approvalMessages` mentions a supplier delay only when a reported delay for the same product/destination moved arrival across this customer's deadline. Plain shortages, unrelated-product delays and deliveries already scheduled after the deadline no longer invent that cause. Two new rule tests observed red; all 6 `approvalMessages.test.ts` tests pass.
- [x] **Orders page ignored "priority order first"** (fixed 2026-10-16). Warangal Store, after the user chose "priority order first": the problem view gave ORD-1006 its 7 bags but the Orders page still showed ORD-1006 Short, 0 of 7. 8 orders in the simulated week. Now `orderCoverage` uses the same `priorityConflicts` as the problem view; test 'after the user chooses "priority order first", the Orders page gives the stock to the priority order too' in `shared/planner/plan.test.ts` (seen failing), and the week simulation fails on any mismatch again.
- [x] **An order due after a delayed delivery that was still short got no options** (fixed 2026-10-16, user ruling: include it). Hyderabad DC: a delay until Thu 22 Oct; ORD-2119 (22 bags, due Sun 25 Oct) was Short on the Orders page but no problem listed it. Now a delay checks every order at that place with the late delivery at its new date. Side effect, accepted: in the sample, Lakeview Grocers (ORD-1104) is Watch instead of Not affected, because it relies on the late delivery. Test 'an order due after the late delivery that is still short gets recovery options' in `shared/planner/plan.test.ts` (seen failing); the week simulation now fails on any order Short in Orders but not at risk.
- Both discrepancies now fail the simulation; neither is exempted (`frontend/src/simulation/week.test.ts`).
- [x] **Ship-from deepened an already-short source customer's shortage.** A customer with 9 of 24 covered lost another 4 when an earlier 4-case order moved there; the check only compared Short/Covered labels. `rehearse` now preserves covered quantity for every source order line. The focused test in `shared/planner/plan.test.ts` was seen failing with the old comparison; the week simulation also caught this (total shortage 749 to 752).
- [x] Fixed during the run: transfer message read "arrive by Thu 4:30 pm … leave by Sun 6 am"; now "If it leaves now it arrives …; it must leave by … at the latest". Overview counted delivered/cancelled orders as "open".
- Scale seen: ~300 orders, 500 History entries, 286 KB saved; planner at most 92 ms per run; every section renders under 0.35 s in the browser. Orders, Suppliers and History are 20,000+ px long (no search or paging outside Inventory).
- [x] Inventory row for a missing count now says "Not counted · counts as 0", matching the planner (`InventoryView.tsx`, 2026-10-15).
- [x] `03-behaviour.md` now says a record-changing approval clears the approval mark, as the code does (`WorkspaceScreen.tsx`, 2026-10-15).

## Priority P0 — must have for V1
- [ ] confirm theme and hero demo business
- [x] define first sample distributor scenario (assumptions still need user review)
- [x] keep incident, affected orders, and recovery options in distinct dashboard sections
- [x] separate Overview, Orders, Inventory, Suppliers, and Rehearsals into real navigation views
- [x] clarify status wording and use icon, label, and color together
- [x] establish the Rehearsal brand treatment and increase contrast/type/action sizes
- [ ] test the overview and plan comparison with a non-technical user
- [x] add stateless Ask AI API route, server-held key, schema validation, and ready-option filtering
- [x] configure local `GEMINI_API_KEY` and verify a live Gemini response
- [x] label AI service status and show referenced planner-checked options in the drawer
- [x] implement disruption intake flow (report a delay on a shipment; optional supplier-message reading)
- [x] blank workspace: start screen, empty Real workspace in the browser, Setup guide, empty states, backup/restore/delete
- [x] add orders and shipments by hand in a Real workspace (one product per order/shipment; several lines per order still to do)
- [x] spreadsheet import (CSV and Excel): column matching with Gemini suggestions, preview, confirm, saved as "Imported from file"
- [x] cloud save for Real workspaces (2026-10-15): Google sign-in, saved per account in Firestore, rules tested against the emulator and deployed. Google sign-in still has to be turned on in the Firebase console
- [ ] Firestore rules tests need Java 21+; this Mac has 17, so run them with Android Studio's Java: `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" npm run test:rules`. Not in the GitHub deploy workflows yet
- [ ] SKIPPED for V1: search and paging for hundreds of locations/orders (lists render every row; the sample is small, a 100-store import is just long). Also: the inventory and order views do a linear lookup per row, which will be slow in the thousands
- [ ] before real users: decide whether Gemini sees sample rows from imported files (free Gemini tier lets Google use content; test data only). Keep one switch to send headers only.
- [x] create evidence-backed extraction confirmation, followed by separate apply confirmation (Demo edits)
- [x] calculate sample impact and receiving-capacity feasibility
- [x] show plan options, conditional facts, and rejection reason
- [x] let the user select a planning objective and compare options against it (2026-10-15: goal picker)
- [x] persist business changes only after user confirmation (two-step editor; approval applies the plan)
- [x] prepare action drafts after approval (2026-10-15: supplier order, transfer request, notes to customers still short)
- [x] Firestore is used: each signed-in user's workspace (2026-10-15). Hackathon requirement for Firebase, Firestore, Cloud Run and Gemini now met in the build
- [x] deploy working prototype on Google Cloud stack (Cloud Run + Firebase Hosting, project rehearsal-ai-builder-cup-2026)
- [ ] create demo script and 3-minute flow

- [ ] before real users: set `SEND_SAMPLE_ROWS` to false in `frontend/src/import/suggest.ts` (send only column names to Gemini) and move to a paid Gemini tier or Vertex AI, because the free tier lets Google use submitted content
- [ ] import suppliers/offers and transfer routes from files
- [ ] several products on one order/shipment when typing it in (import already supports several lines)
- [ ] edit/delete a shipment, delete orders/locations/products (only add and edit exist; delete is not built)
- [ ] sign-in and cross-device sync (V2)
- [ ] supplier replies are not tied to a delay: a reply recorded for one delay is still used for the next one until edited
- [ ] storage room uses today's count only; it does not credit stock leaving for orders before the new stock arrives, and the delayed shipment itself is not checked against storage
- [ ] the per-day unloading limit is still one number for every product and is not checked on supplier shipments

## Priority P1 — important for a solid hackathon demo
- [x] add separate Demo and Real workspace selector (start screen)
- [x] persist Real workspace facts and evidence per Google account in Firestore (was browser IndexedDB until 2026-10-15)
- [x] add document upload with Gemini extraction and privacy notice (supplier quotes, stock sheets, orders)
- [ ] add Gemini-backed disruption extraction with proposed-update confirmation
- [ ] known gaps (updated 2026-10-15), deliberately left out:
  - transfer quotes are not editable on screen (routes, travel time and costs are)
  - no delete for shipments, orders, locations or products (suppliers and routes can be removed; orders can be cancelled)
  - "check for mistakes" is a human review of the listed typed-in details; there is no AI cross-check
  - document names are not mapped to records ("Choc chips 5kg" vs item code)
  - a quote in a different currency from the workspace is not read (no currency conversion, by design)
  - Phase 2 (after the hackathon): Firestore per organization, sign-in and roles, server-side planning for large workspaces, paged lists, background document reading via Cloud Storage, shared rate limits, request logs
- voice input flow
- document upload / OCR extraction
- guided questions for missing facts
- undo and reset experience
- clearer visual reasoning for affected orders and shortages
- stronger tradeoff explanations for each option
- sample no-signup demo workspace

## Priority P2 — future release work
- add seller and manufacturer templates
- support more than one incident set at a time
- richer role and permission model
- real integrations with supplier and inventory systems
- persistent workflow history and audit trail
- auto-generated customer/supplier communication by approved workflow
- richer forecasting and optimization
- support more business rules and specialized constraint logic

## Release plan
### V1
- single theme
- single business template (Distributor)
- one polished demo path
- reliable planning logic and clear validation
- no external system integrations beyond sample data and demo workflows

### Future release
- multi-template support
- more realistic operational data
- broader business coverage
- deeper automation and integrations
- enterprise-ready permission and audit features
