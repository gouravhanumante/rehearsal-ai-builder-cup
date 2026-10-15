# 07 — Bug map

Small diagrams of each feature, coloured by **what protects each step**, so weak spots are
easy to see. Updated 2026-10-15 to match the code at commit 25e5e0f.

| Colour | Tag | Meaning |
|---|---|---|
| Green | `[proven]` | A test exists **and** was seen failing against wrong code |
| Blue | `[test]` | A test exists but was never seen failing — it might not catch anything |
| Amber | `[manual]` | Only checked by hand in the browser |
| Red | `[GAP]` | Known missing rule or behaviour, recorded in `TODO.md` |

When a box changes colour, update this file in the same commit.

## Dispatch Review: Small Flows And Connected Map

Requested 2026-10-15 before partial-dispatch implementation. **Current status:** stock ledger, transfer booking/departure, transfer-fate resolution, explicit zero-arrival cancellation, and the order CSV below-sent guard are implemented; C is historical, D-F are current. Remaining gaps include generic customer physical returns and actual customer dispatch/delivery confirmation; repeat-delivery occurrence identity and two-device save conflicts are covered (`occurrenceAt`, `publishCore`). Browser cases/statuses are maintained in `browser-test-matrix.md`.

### A. Planning And Recovery Approval (Current)

```mermaid
flowchart TD
  orders["Open orders plus counted stock and dated incoming"] --> cover["Planner allocates cover without deducting stock"]
  cover --> options["Recovery options"]
  options --> gate{"Option ready and server recheck succeeds?"}
  gate -->|No or unreachable| stop["No approval; explain why"]
  gate -->|Yes| evidence{"Unverified facts or unresolved allocation conflicts?"}
  evidence -->|Yes| warning["Review warning; approve anyway or attach proof"]
  evidence -->|No| apply["Apply approved plan"]
  warning -->|Approve| apply
  warning -->|Attach proof| edit["Edit evidence; return to planning"]
  apply --> transfer["Transfer: source stock booked; count unchanged; free stock reduced"]
  transfer --> depart["Record actual departure: source count down; create dated inbound batch"]
  apply --> purchase["Purchase: offer reduced; incoming up; on-hand unchanged"]
  apply --> origin["Ship-from: order origin changes; stock unchanged"]
```

Owners: `allocate`, `rehearse` in `shared/planner/plan.ts`; `requestApproval`, `approve` in `WorkspaceScreen.tsx`; `applyPlan`, `receiveDelivery` and `departTransfer` in `shared/planner/{apply,ledger}.ts`. Inventory subtracts active bookings from free stock but not physical on-hand. Departures create independent inbound shipment batches.

### B. Incoming Receipt (Current)

```mermaid
flowchart TD
  incoming["Incoming shipment"] --> actual["Enter actual counts per product"]
  actual --> valid{"Whole counts and total greater than zero?"}
  valid -->|No| stop["Invalid counts blocked; zero total can only report late"]
  valid -->|Yes| missing{"Any expected quantity missing?"}
  missing -->|No| receive["Add actual counts; stop counting this arrival as incoming; record receipt"]
  missing -->|Yes| rest{"Will the remainder come?"}
  rest -->|Unknown or no date for Yes| ask["Ask; cannot save yet"]
  rest -->|Yes with date| dated["Create incoming remainder with its date"]
  rest -->|No| abandon["No incoming remainder"]
  dated --> receive
  abandon --> receive
  receive --> regular{"Repeating delivery?"}
  regular -->|Yes| next["Keep next occurrence on original schedule"]
  regular -->|No| complete["This shipment occurrence is finished"]
```

Owners: `ReceiveDialog.tsx`, `receiveDelivery` in `shared/planner/apply.ts`; existing receipt tests in `shared/planner/apply.test.ts`. Over-delivery is allowed: actual received quantities can exceed expected counts. Missing supplier goods do not automatically become cancelled customer demand. Repeating arrivals advance from the confirmed/original schedule, not from actual receipt time; very late actual receipt needs review.

### C. Customer Completion And Reopening (Current)

```mermaid
flowchart TD
  open["Open order"] --> action{"Staff action?"}
  action -->|Send full or part| check{"Unreserved count covers each sent product quantity?"}
  check -->|No| block["Blocked; unchanged workspace"]
  check -->|Yes| delivered["Record sent movement; deduct only sent quantity"]
  action -->|Cancel remainder| cancelled["Close unsent demand; stock unchanged"]
  delivered --> reopen["Reopen cancellation restores only unsent demand; stock unchanged"]
  cancelled --> reopenCancel["Reopen cancellation: restore demand; stock unchanged"]
  reopen --> open
  reopenCancel --> open
```

Current owners: `sendOrder`, `cancelRemaining` and `reopenOrder` in `shared/planner/ledger.ts`. Full physical returns remain separate and are not modeled.

### D. Partial Dispatch (Current)

```mermaid
flowchart TD
  order["Order 10; choose quantities to send"] --> valid{"Positive whole quantities no greater than outstanding?"}
  valid -->|No| fix["Correct entry; no save"]
  valid -->|Yes| count{"Unreserved counted on-hand covers all selected quantities?"}
  count -->|No| wait["Correct stale count, receive actual arrivals, or wait"]
  count -->|Yes| split{"Partial remaining order?"}
  split -->|No| review["Review effect on other customers; proposed warning, not reservation lock"]
  split -->|Yes| consent{"Customer accepts splits? Ask once for this order"}
  consent -->|Unknown| ask["Record customer's answer"]
  ask --> consent
  consent -->|No| full["Wait for the whole remaining order"]
  consent -->|Yes| review
  review --> record["Confirm goods actually sent; save one dispatch and deduct its quantities once"]
  record --> remaining{"Outstanding left?"}
  remaining -->|Yes| part["6 sent; 4 outstanding; original due date stays; replan only 4"]
  remaining -->|No| done["Fully dispatched; customer delivery still unconfirmed"]
```

Customer split permission and original remaining deadline are enforced. If a real split already happened despite the saved permission, staff must update the customer's answer before recording; never falsify inventory. Planner allocations are advice, while transfer bookings are explicit source holds.

### E. Correcting One Dispatch (Current)

```mermaid
flowchart TD
  selected["Select one dispatch D1; recorded 6"] --> edit["Correct actual quantity to 4"]
  edit --> valid{"Nonnegative whole counts; fits order totals; extra deduction fits current stock?"}
  valid -->|No| stop["Resolve inconsistency; never silently clamp"]
  valid -->|Yes| delta["Restore only difference 2 at D1's original warehouse; other dispatches untouched"]
  delta --> save["Save corrected record and old/new values in History"]
  save --> plan["Now 4 sent and 6 outstanding; recalculate cover and order status"]
  physical["Actual goods physically returned"] --> returns["Separate returns workflow; do not falsify dispatch history"]
```

Increasing 6 to 8 deducts only 2 extra. Correcting 6 to 0 restores only that dispatch's 6 and retains the audit record; a correction can be zero even though a new dispatch must be positive. Corrections use current stock, not a historical stock snapshot. Original product/warehouse identity stays on the dispatch. Changing those identities or correcting an already-cancelled order still needs an agreed rule.

### F. Cancelling The Remainder (Current)

```mermaid
flowchart TD
  order["10 ordered; 6 sent; 4 outstanding"] --> cancel["Confirm cancellation of remaining 4"]
  cancel --> closed["6 remain sent; stock unchanged; outstanding becomes 0"]
  closed --> label["Closed: remainder cancelled; NOT fully dispatched"]
  closed --> reopen["Reopen cancellation: restore unsent demand only; never restore sent stock"]
```

### Connected Overview

```mermaid
flowchart TD
  orders["Orders and Inventory"] --> A["A: Plan and approve recovery"]
  A -->|Purchase incoming| B["B: Receive actual goods"]
  A -->|Book transfer| reserve["Show on-hand / booked / free"]
  reserve -->|Departure| batch["Create dated inbound batch"] --> B
  A -->|Ship-from changes origin| D["D: Record full or partial dispatch"]
  B -->|On-hand updated| A
  B -->|Counted goods available| D
  orders --> D
  D -->|Remainder open| A
  D -->|Correction| E["E: Edit selected dispatch"]
  E -->|Stock and demand recalculated| A
  D -->|Cancel remainder| F["F: Cancel unsent demand"]
  F -->|Reopen unsent demand only| A
  D -->|No remainder| fully["Fully dispatched; delivery-confirmation decision open"]
  A --> save["Persist changes with History"]
  B --> save
  D --> save
  E --> save
  F --> save
  save -->|Success| saved["Saved in browser or account"]
  save -->|Failure or account revision conflict| issue["Do not claim synced; preserve local work and resolve before retry"]
  reserve --> save
  batch --> save
```

The connected map uses current D-F. C above remains the historical behavior that the movement ledger replaced. The save-failure box is a required handling boundary, not a claim that all persistence failure cases have been tested.

### Branch Audit And Calculation Cases

| Path | Check / finding | Evidence or next action |
|---|---|---|
| A: allocation to dispatch | Coverage is advice, not stock deduction. Do not subtract coverage and sent quantities from stock twice | `allocate`, `outstandingOrders`; `ledger.test.ts` and week simulation |
| A: transfer booking | Approval holds source stock but leaves physical count intact; departure deducts once and creates an ETA-specific inbound batch | `applyPlan`, `departTransfer`, `freeStock`; browser T01-T06 |
| B: full receipt | Add actual count once; remove this occurrence from incoming; keep repeat schedule separately | Existing `apply.test.ts` receipt tests |
| B: partial with Yes / No | 6 of 8 received gives +6 on-hand; Yes keeps 2 incoming at entered date; No keeps no remainder | Existing `apply.test.ts` receipt tests |
| B: zero and never coming | UI blocks zero total and only offers Report late, so it cannot record a fully cancelled arrival through this dialog | `ReceiveDialog.canSave`; missing workflow, not a fixed bug |
| B: late repeating receipt | Receipt timestamp can be after several scheduled dates, but next occurrence advances from old confirmed/original date | `receiveDelivery`; duplicate occurrence/old-date risk needs a worked policy and regression |
| D: insufficient count / repeated product lines | Send checks each product's selected quantity against unreserved counted stock; incoming stock is not dispatchable | `sendOrder`, browser O06 (full quantity refused on count 14) |
| E: correct after recount | Later count already includes actual movement; historical correction changes demand, not current count | `correctMovement`, same-number stocktake control, browser O08 and red/green week simulation |
| D: partial and multi-product | Planner uses remaining quantities per product; fully sent coffee is not demanded again while tea remains | `outstandingOrders`, `plan.ts`, `ledger.test.ts`; browser O05 |
| D: overdue remainder | Past due does not mean fulfilled; outstanding stays demand | `remainingLines`; `overdueOrderIds` shows it as Overdue; browser O11 |
| E: isolated correction | Start stock 12; send 6 -> 6; correct sent to 4 -> 8; send final 6 -> 2. Totals sent 10; remaining 0 | Independent arithmetic example, not a passing-test claim |
| F: cancel after 6 sent | Stock stays at 6; sent remains 6; cancel only 4; no goods return | `cancelRemaining`, `reopenOrder`; browser O09 |
| Save: account write | Changed pieces are written under new content-based ids first; the core manifest is published in one revision-checked transaction. Old pieces are deleted only after publication | `cloudStore.write`, `publishCore`; `chunks.test.ts` |
| Save: two devices at once | Both loaded revision 1; exactly one save wins, the other gets ConflictError and nothing is overwritten | `publishCore`; two emulator tests, observed red with the revision check removed |
| Save: repeat deliveries | Each receipt records its scheduled occurrence | `Movement.occurrenceAt`; `apply.test.ts`, browser R05 |

## 1. Approving a plan
```mermaid
flowchart LR
  a["Click Approve"] --> s{"Server re-runs planner: still ready? [proven]"}
  s -->|"No or unreachable"| stop["Not approved, user told why [manual]"]
  s -->|"Yes"| c{"Typed-in details or open conflicts? [test]"}
  c -->|"No"| ok["Approved [manual]"]
  c -->|"Yes"| w["Warning lists details and conflicts [manual]"]
  w -->|"Approve with warning"| ok
  w -->|"Attach proof"| ed["Opens that record's editor [manual]"]
  ok --> ap["Transfer: reserve source stock; on-hand unchanged. Purchase: incoming added, offer reduced. Ship-from: order moved [test]"]
  ap --> depart["Record actual departure: source count down; separate inbound batch with ETA [manual]"]
  depart --> keep["Saved; the approval mark itself is cleared because the records changed [manual]"]
  rcv["Delivery arrives: Mark received adds it to stock and stops it counting as incoming, never twice [proven]"]
  part["Part arrived: rest stays incoming only with a date the user gives; regular delivery moves to next week [test]"]
  msg["Messages after approving: exact approved quantity, price, arrival; notes only to customers still short; no guessed date [proven]"]
  classDef proven fill:#CDF4D3,stroke:#3E9B4B
  classDef test fill:#C2E5FF,stroke:#007AD2
  classDef manual fill:#FFECBD,stroke:#E8A302
  classDef gap fill:#FFCDC2,stroke:#DC3009
  class s,rcv,msg proven
  class c,ap,part test
  class stop,ok,w,ed,keep,depart manual
```
`ap`, `rcv` and `part` are `shared/planner/apply.test.ts`; `keep` is `saveChange` in `frontend/src/WorkspaceScreen.tsx`. `depart` was manually exercised in `browser-test-matrix.md` T03-T06. `rcv` failed (4 tests) when receiving was changed to leave the delivery listed as incoming. `msg` is `frontend/src/presentation/approvalMessages.test.ts`; it failed when notes were sent to covered customers too.

`msg` also protects factual causes: two rule tests failed against the hard-coded late-supplier claim. Plain shortages, unrelated-product delays and arrivals originally scheduled after the customer's deadline cannot be blamed on a relevant supplier delay; all six message tests pass after the fix (`approvalMessages`).

## 2. Adding or editing details
```mermaid
flowchart LR
  o["Editor opens"] --> m{"Type or attach?"}
  m -->|"Type"| t["Marked unverified [proven]"]
  m -->|"Attach"| d["Marked verified by document [proven]"]
  d -->|"User changes a value"| t
  t & d --> r["Review: old to new, effect on options [manual]"]
  r --> s["Saved; proof stamped at review time; approval cleared [manual]"]
  p["Priority, location and names need no proof [proven]"]
  dl["Report a delay changes only the next arrival [test]"]
  rt["Routes and suppliers: edit and remove in Between locations / Suppliers [manual]"]
  ed["Transfer quotes not editable; shipments, orders, locations, products can't be removed [GAP]"]
  classDef proven fill:#CDF4D3,stroke:#3E9B4B
  classDef test fill:#C2E5FF,stroke:#007AD2
  classDef manual fill:#FFECBD,stroke:#E8A302
  classDef gap fill:#FFCDC2,stroke:#DC3009
  class t,d,p proven
  class dl test
  class r,s,rt manual
  class ed gap
```
`dl` is `frontend/src/components/editing/recordingEditors.test.ts`.

## 3. Reading a document (API)
```mermaid
flowchart LR
  f["Upload file"] --> sz["Over 4 MB rejected [test]"]
  f --> mg["File type faked? Rejected [proven]"]
  mg --> g["Gemini reads it, nothing stored"]
  g --> q["Value without a quote dropped [proven]"]
  g --> n["Unclear number like 12-15 dropped [proven]"]
  g --> tz["Time without timezone read as business local time [test]"]
  g --> k["Fields not asked for ignored [test]"]
  g --> cur["Price in another currency not read [manual]"]
  classDef proven fill:#CDF4D3,stroke:#3E9B4B
  classDef test fill:#C2E5FF,stroke:#007AD2
  classDef manual fill:#FFECBD,stroke:#E8A302
  class mg,q,n proven
  class sz,tz,k test
  class cur manual
```

## 4. Planner: affected orders and options
```mermaid
flowchart LR
  o["Orders"] --> loc{"Same location and product as the delay? [proven]"}
  loc -->|"No"| na["Not affected [proven]"]
  loc -->|"Yes"| due{"Every order there, late delivery at its new date; one due after it and still short gets options too [proven]"}
  due --> st{"Stock counted? [test]"}
  risk["At risk only if left short; counted-stock cover is fine; incoming-only cover is Watch even without a delay [proven]"]
  st -->|"No"| unk["Counts as 0, labelled no stock count, Add count link [test]"]
  st -->|"Yes"| al["Stock counts only once arrived; repeating deliveries keep counting [test]"]
  all["Every open order checked against its warehouse's stock and deliveries, not only delayed ones [test]"]
  al --> cf["Conflict: order due first by default, user can switch; Orders page follows the choice [proven]"]
  al --> tr["Transfer: receiving limit, timing, storage room, cost per trip + per package, book-by time [test]"]
  al --> sf["Ship-from: source orders cannot lose covered quantity [proven]"]
  tr --> booked["Approved incoming transfers share local-day capacity across products [proven]"]
  booked --> slice["Server slice retains other-product transfer bookings [proven]"]
  booked --> received["Full or partial receipts retain local-day capacity; remainder reserves its own arrival day [proven]"]
  received --> persisted["Receipts validated, chunked and saved with owner-only access [proven]"]
  tr --> deadline["Book by uses earliest order actually helped; covered priority order does not constrain it [proven]"]
  al --> once["Two late deliveries: one shortage per location/product [proven]"]
  al --> dispatch["Dispatch cannot exceed counted stock; blocked action creates no stock [proven]"]
  al --> sup["Supplier: missing details mean Waiting for reply [test]"]
  sup --> buy["Buys only what is short and fits storage; price per package + delivery charge [test]"]
  al --> grp["Each option belongs to exactly one problem [test]"]
  al --> rec["Ranked by the business's goal: protect deliveries (default), lowest cost, balanced per package saved [proven]"]
  worth["Costs more than the stock saved is worth: warning only [test]"]
  classDef proven fill:#CDF4D3,stroke:#3E9B4B
  classDef test fill:#C2E5FF,stroke:#007AD2
  class loc,na,cf,risk,rec,due,sf,booked,slice,once,dispatch,received,persisted,deadline proven
  class st,unk,al,all,tr,sup,buy,grp,worth test
```
All `[test]` boxes here are in `shared/planner/plan.test.ts`, except `worth` (`frontend/src/presentation/planText.test.ts`). New proven boxes: `booked` and `dispatch` in `shared/planner/apply.test.ts`; `slice` in `shared/planner/blank.test.ts`; `sf` and `once` in `shared/planner/plan.test.ts`. Each was observed failing against the corresponding mistake. The counts-as-0 rule replaced "unknown, not zero" on 2026-10-15 (`docs/03-behaviour.md`); its new test has not been seen failing yet, so it dropped from `[proven]` to `[test]`.

Three-risk follow-up: `received` failed with 6 cases offered after all 8 slots were used; partial receipts check local midnight and the remainder's day (`apply.test.ts`). `risk` failed with no Watch orders for timely incoming cover; `deadline` failed with a rejected useful transfer and an earlier missed standard order's deadline (`plan.test.ts`). `persisted` failed on invalid accepted receipts, unrelated receipt history in slices and oversized core documents (`blank.test.ts`, `frontend/src/cloud/chunks.test.ts`); removing the receipt rule caused permission denied in `frontend/rules-tests/firestore.rules.test.ts`, then all seven passed when restored. Capacity/deadline wording tests in `planText.test.ts` were also observed red. The week simulation now includes received transfer quantities in its daily-capacity invariant.

## 5. Saving and Reset
```mermaid
flowchart LR
  s["Confirm and save (signed in)"] --> sp["Split into documents under 1 MiB, rejoined exactly, order kept [test]"]
  sp --> dmg["Damaged or tampered pieces refused, not loaded [test]"]
  sp --> only["Only changed pieces written; removed ones deleted so they don't come back [test]"]
  sp --> fs[("Firestore, per account, several businesses")]
  fs --> own["Another signed-in person can't list, read or change any of them, including a second business [proven]"]
  fs --> anon["Signed-out visitor, stray documents, bad ids, extra fields, oversized bodies refused [test]"]
  fs --> old["Old one-business copy: owner can read and remove it, nobody can write it [test]"]
  fs --> two["Saved first on another device: newer version shown, not overwritten [manual, not yet tried]"]
  g["Guest: this browser only"] --> keep["Reload keeps it; blocked sign-in leaves it as it was [manual]"]
  g --> mv["Save to account: browser copy removed only after the account save succeeds; last edit waited for [proven]"]
  d["Sample: browser storage"] --> bad["Unreadable data: sample loaded and user told [proven]"]
  d --> v1["First-version saves moved to new format [test]"]
  rs["Reset"] --> seed["Sample data back [manual]"]
  classDef proven fill:#CDF4D3,stroke:#3E9B4B
  classDef test fill:#C2E5FF,stroke:#007AD2
  classDef manual fill:#FFECBD,stroke:#E8A302
  class own,bad,mv proven
  class sp,dmg,only,anon,old,v1 test
  class two,keep,seed manual
```
Splitting is `frontend/src/cloud/chunks.test.ts`; the move is `frontend/src/data/moveGuest.test.ts`; the rules boxes are `frontend/rules-tests/firestore.rules.test.ts` (`npm run test:rules`, needs Java 21+). `own` failed on 2026-10-15 when the read rule for a business's data was loosened to "any signed-in person". `mv` failed (3 tests) when the browser copy was cleared before the account save. `keep` was checked in the browser on 2026-10-15. `two` and a real Google sign-in have **not been tried yet**: the built-in browser blocks the Google window.

## 6. Ask AI
```mermaid
flowchart LR
  q["Question plus facts"] --> cut["More than 40 facts: says how many were left out [test]"]
  q --> money["Prices in the workspace currency [test]"]
  q --> api["API checks the request [test]"]
  api --> g["Gemini answers"]
  g --> num["Numbers not in our facts replaced [test]"]
  g --> rec["Can only recommend ready options [test]"]
  h["Health check reports the model actually used [proven]"]
  esc["Panels and dialogs close with Escape [manual]"]
  classDef proven fill:#CDF4D3,stroke:#3E9B4B
  classDef test fill:#C2E5FF,stroke:#007AD2
  classDef manual fill:#FFECBD,stroke:#E8A302
  class h proven
  class cut,money,api,num,rec test
  class esc manual
```

## 7. Importing a file
Where a wrong number could slip in, and what stops it. Every `[test]` is in `frontend/src/import/import.test.ts`, `frontend/src/import/scenarios.test.ts` or `backend/src/importMapping.test.ts`.

```mermaid
flowchart LR
  f["File (csv/xlsx, read in the browser)"] --> cells["Quoted commas, semicolons, Windows line endings [test]"]
  f --> xt["Excel time 10:00 read as 10:00, not 09:59 [proven]"]
  f --> cols["Column names matched; one column never used twice [test]"]
  cols --> ai["Gemini suggests only real fields and real columns [test]"]
  cells --> val["Dates in the country's order; impossible dates refused [test]"]
  cells --> num["Unreadable count is never zero [test]"]
  val --> ord["Bad row drops its whole order, so demand is never understated [test]"]
  num --> ord
  ord --> twice["Same file twice changes nothing [test]"]
  twice --> mark["Marked Imported from file, not typed in [test]"]
  mark --> sc["All four test-data businesses: import, report the delay, exposed and orders at risk match each README [test]"]
  sc --> multi["Delivering an order with several products takes every product off stock [proven]"]
  ui["Preview and confirm screens [manual]"]
  classDef proven fill:#CDF4D3,stroke:#3E9B4B
  classDef test fill:#C2E5FF,stroke:#007AD2
  classDef manual fill:#FFECBD,stroke:#E8A302
  class xt,multi proven
  class cells,cols,ai,val,num,ord,twice,mark,sc test
  class ui manual
```
`xt` failed before the fix in `cellText` (`frontend/src/import/table.ts`). `multi` failed when delivery was changed to take only an order's first product off stock; the older single-product tests did not notice.

## 8. Stock ledger (built 2026-10-15)
```mermaid
flowchart LR
  ev["Count, receipt, send, transfer-out: one movement each"] --> calc["Stock = latest count + later movements [test]"]
  ev --> once["Same action id twice is recorded once [proven]"]
  calc --> neg["Nothing may go below zero [test]"]
  send["Send 6 of 10"] --> plan["Planner looks only at the 4 left [proven]"]
  send --> split["Part send needs the customer's yes [test]"]
  fix["Correct one send 6 to 4"] --> only["Only that send changes; others untouched [test]"]
  fix --> recount["A later shelf count is not added to again [proven]"]
  cancel["Cancel the rest"] --> keep["Sent stays; stock unchanged; reopen brings back only unsent demand [test]"]
  load["Load saved data"] --> again["Stock recomputed from movements; edited stock ignored [test]"]
  ui["Send, Correct and Cancel dialogs [manual: not yet checked in the browser]"]
  classDef proven fill:#CDF4D3,stroke:#3E9B4B
  classDef test fill:#C2E5FF,stroke:#007AD2
  classDef manual fill:#FFECBD,stroke:#E8A302
  class once,plan,recount proven
  class calc,neg,split,only,keep,again test
  class ui manual
```
All boxes are `shared/planner/ledger.test.ts`. `plan` failed when the planner was given full order quantities; `recount` failed when a correction was dated when it was entered instead of when the send happened; `once` failed against the first version of `sendOrder`, which checked the remainder before noticing the action was already recorded.

Found and fixed by the week simulation (`frontend/src/simulation/week.test.ts`), each with a red/green test in `ledger.test.ts`: planner functions calling each other subtracted sends twice (Hill Cafe shown covered while 3 short); the server slice treated a partly-sent order moved to another warehouse as fully owed. The simulation keeps its own stock book by plain rules and compares every warehouse, product and order after every step; it failed when corrections were dated at entry time.

### Gaps still open (current code)
```mermaid
flowchart LR
  appr["Approve transfer"] --> dep["Source stock leaves at approval: no booked/free split [GAP]"]
  rcv["6 of 8 transfer arrive, rest not coming"] --> lost["2 vanish: no 'in transit, unresolved' record [GAP]"]
  zero["Nothing will ever arrive"] --> late["Only 'Report late' offered [GAP]"]
  ret["Goods physically come back"] --> none["No return; only correction [GAP]"]
  imp["Re-import orders file"] --> below["Can set quantity below what was sent [GAP]"]
  due["Due time = arrival at customer"] --> travel["Recorded travel sets dispatch cutoff; unknown stays unconfirmed"]
  save["Very large account save"] --> part["Pieces written before revision check [GAP]"]
  classDef gap fill:#FFCDC2,stroke:#DC3009
  class dep,lost,late,none,below,part gap
```
