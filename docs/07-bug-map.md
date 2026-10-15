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
  ok --> ap["Transfer: source stock down, delivery added. Purchase: delivery added, offer reduced. Ship-from: order moved [test]"]
  ap --> keep["Saved; the approval mark itself is cleared because the records changed [manual]"]
  rcv["Delivery arrives: Mark received adds it to stock and stops it counting as incoming, never twice [proven]"]
  part["Part arrived: rest stays incoming only with a date the user gives; regular delivery moves to next week [test]"]
  msg["Messages after approving: exact approved quantity, price, arrival; notes only to customers still short; no guessed date [proven]"]
  classDef proven fill:#CDF4D3,stroke:#3E9B4B
  classDef test fill:#C2E5FF,stroke:#007AD2
  classDef manual fill:#FFECBD,stroke:#E8A302
  classDef gap fill:#FFCDC2,stroke:#DC3009
  class s,rcv,msg proven
  class c,ap,part test
  class stop,ok,w,ed,keep manual
```
`ap`, `rcv` and `part` are `shared/planner/apply.test.ts`; `keep` is `saveChange` in `frontend/src/WorkspaceScreen.tsx`. `rcv` failed (4 tests) when receiving was changed to leave the delivery listed as incoming. `msg` is `frontend/src/presentation/approvalMessages.test.ts`; it failed when notes were sent to covered customers too.

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
  loc -->|"Yes"| due{"Due before the delayed stock arrives? [test]"}
  due -->|"No"| na
  due -->|"Yes"| st{"Stock counted? [test]"}
  risk["At risk only if left short; covered from stock on hand is fine; covered only by stock on its way is Watch [proven]"]
  st -->|"No"| unk["Counts as 0, labelled no stock count, Add count link [test]"]
  st -->|"Yes"| al["Stock counts only once arrived; repeating deliveries keep counting [test]"]
  all["Every open order checked against its warehouse's stock and deliveries, not only delayed ones [test]"]
  al --> cf["Conflict: order due first by default, user can switch [proven]"]
  al --> tr["Transfer: receiving limit, timing, storage room, cost per trip + per package, book-by time [test]"]
  al --> sf["Ship-from: a question until the user says it can deliver there [test]"]
  al --> sup["Supplier: missing details mean Waiting for reply [test]"]
  sup --> buy["Buys only what is short and fits storage; price per package + delivery charge [test]"]
  al --> grp["Each option belongs to exactly one problem [test]"]
  al --> rec["Ranked on total cost; best ready plan picked [test]"]
  worth["Costs more than the stock saved is worth: warning only [test]"]
  classDef proven fill:#CDF4D3,stroke:#3E9B4B
  classDef test fill:#C2E5FF,stroke:#007AD2
  class loc,na,cf,risk proven
  class due,st,unk,al,all,tr,sf,sup,buy,grp,rec,worth test
```
All `[test]` boxes here are in `shared/planner/plan.test.ts`, except `worth` (`frontend/src/presentation/planText.test.ts`). The counts-as-0 rule replaced "unknown, not zero" on 2026-10-15 (`docs/03-behaviour.md`); its new test has not been seen failing yet, so it dropped from `[proven]` to `[test]`.

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
