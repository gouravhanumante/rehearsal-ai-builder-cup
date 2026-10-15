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
  rcv["Approved delivery arrives: no Mark received, user must recount and can't remove it on screen [GAP]"]
  classDef proven fill:#CDF4D3,stroke:#3E9B4B
  classDef test fill:#C2E5FF,stroke:#007AD2
  classDef manual fill:#FFECBD,stroke:#E8A302
  classDef gap fill:#FFCDC2,stroke:#DC3009
  class s proven
  class c,ap test
  class stop,ok,w,ed,keep manual
  class rcv gap
```
`ap` is `shared/planner/apply.test.ts`; `keep` is `saveChange` in `frontend/src/WorkspaceScreen.tsx`.

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
  class loc,na,cf proven
  class due,st,unk,al,all,tr,sf,sup,buy,grp,rec,worth test
```
All `[test]` boxes here are in `shared/planner/plan.test.ts`, except `worth` (`frontend/src/presentation/planText.test.ts`). The counts-as-0 rule replaced "unknown, not zero" on 2026-10-15 (`docs/03-behaviour.md`); its new test has not been seen failing yet, so it dropped from `[proven]` to `[test]`.

## 5. Saving and Reset
```mermaid
flowchart LR
  s["Confirm and save (own business)"] --> sp["Split into documents under 1 MiB, rejoined exactly, order kept [test]"]
  sp --> dmg["Damaged or tampered pieces refused, not loaded [test]"]
  sp --> only["Only changed pieces written; removed ones deleted so they don't come back [test]"]
  sp --> fs[("Firestore, per account")]
  fs --> own["Another signed-in person can't read or change it [proven]"]
  fs --> anon["Signed-out visitor, stray documents, extra fields, oversized bodies refused [test]"]
  fs --> two["Saved first on another device: newer version shown, not overwritten [manual]"]
  mv["Move browser save to account [manual]"]
  d["Sample: browser storage"] --> bad["Unreadable data: sample loaded and user told [proven]"]
  d --> v1["First-version saves moved to new format [test]"]
  rs["Reset"] --> seed["Sample data back [manual]"]
  classDef proven fill:#CDF4D3,stroke:#3E9B4B
  classDef test fill:#C2E5FF,stroke:#007AD2
  classDef manual fill:#FFECBD,stroke:#E8A302
  class own,bad proven
  class sp,dmg,only,anon,v1 test
  class two,mv,seed manual
```
Splitting is `frontend/src/cloud/chunks.test.ts`. The rules boxes are `frontend/rules-tests/firestore.rules.test.ts` (`npm run test:rules`, needs Java 21+). `own` was seen failing on 2026-10-15 when the read rule was loosened to "any signed-in person". `two` and `mv` are **not checked yet**: they can only be tried once Google sign-in is turned on in the Firebase console.

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
Where a wrong number could slip in, and what stops it. Every `[test]` is in `frontend/src/import/import.test.ts` or `backend/src/importMapping.test.ts`.

```mermaid
flowchart LR
  f["File (csv/xlsx, read in the browser)"] --> cells["Quoted commas, semicolons, Windows line endings [test]"]
  f --> cols["Column names matched; one column never used twice [test]"]
  cols --> ai["Gemini suggests only real fields and real columns [test]"]
  cells --> val["Dates in the country's order; impossible dates refused [test]"]
  cells --> num["Unreadable count is never zero [test]"]
  val --> ord["Bad row drops its whole order, so demand is never understated [test]"]
  num --> ord
  ord --> twice["Same file twice changes nothing [test]"]
  twice --> mark["Marked Imported from file, not typed in [test]"]
  ui["Preview and confirm screens [manual]"]
  classDef test fill:#C2E5FF,stroke:#007AD2
  classDef manual fill:#FFECBD,stroke:#E8A302
  class cells,cols,ai,val,num,ord,twice,mark test
  class ui manual
```
