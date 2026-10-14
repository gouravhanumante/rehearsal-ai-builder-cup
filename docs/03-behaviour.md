# 03 — Behaviour: How Rehearsal Works

Agreed in discussion on 2026-10-13. These are behaviour rules, not implementation.

## 1. Where the data comes from
| Source | Examples |
|---|---|
| Business setup | Orders, inventory, suppliers, capacity, budget, rules |
| Documents and updates | Receipts, invoices, delivery notes, supplier emails/chat screenshots, voice notes |
| Follow-up questions | Missing dates, supplier availability, customer permissions, preferences |
| Later: integrations | Inventory systems, email, supplier APIs — with permission |

First version: **sample businesses, spreadsheet upload, guided entry, document/photo upload,
voice and text.**

Rules:
- Every fact keeps its **source** and **when it was last confirmed**.
- Conflicting facts are shown to the user, never silently overwritten.
- An alternative supplier is a *possible* option, not an available one, until stock, price
  and date are known.
- Fact states are explicit: **proposed**, **confirmed**, **unknown**, **conflicting**, or **outdated**. Unknown is never treated as zero or as available.
- Real workspace stock counts require attached evidence in V1. A receipt scan can propose a received quantity, but does not change available stock until the user confirms the extracted fields and then confirms the resulting inventory update.
- These are two distinct checks: “Did Rehearsal read this evidence correctly?” and “Should this confirmed update change the workspace?”
- A purchase order or supplier confirmation changes expected inbound supply only. On-hand stock changes only after a received quantity is confirmed; damaged or held goods are not available stock.

### 1a. Typed-in vs document-backed details (implemented 2026-10-14, Demo workspace)
Agreed with the user: both paths exist, and the difference is always visible.
- Every editable value shows where it came from: **Sample data**, **Verified by document**
  (file name and time on hover), or **Unverified · entered manually**. A blank value is
  **Unknown** and is never treated as zero. (`frontend/src/components/evidence/EvidenceMark.tsx`,
  `Evidence`/`Fact` in `shared/planner/model.ts`)
- Typed-in details are usable. A plan that relies on them is labelled **Ready · unverified**
  instead of **Ready to use** (`statusLabel` in `frontend/src/presentation/planText.ts`).
- Approving such a plan first opens a warning that lists each typed-in detail, offers
  **Attach proof** once per record, or **Approve with warning**. The approval is then shown as
  "approved with a warning". (`frontend/src/components/planning/ApprovalWarning.tsx`)
- Changing a value read from a document turns that value back into "entered manually".
  Order priority, ship-from location and a supplier's name are the user's own choices and need
  no proof. (`isFact` in `frontend/src/components/editing/editorConfigs.ts`)
- Every edit is two steps: (1) type it in, or attach a photo/PDF and check what Gemini read,
  with the quoted source text beside each value; (2) review old → new values plus the effect on
  the shortage and on each recovery option, then **Confirm and save**.
  (`frontend/src/components/editing/DetailsEditor.tsx`)
- Saving any change clears an existing approval, because it was given for the old numbers
  (`saveChange` in `frontend/src/App.tsx`). Approvals are saved with the edits, so they survive
  a page reload (user decision 2026-10-14); Reset clears them.
- Demo edits stay in this browser until **Reset**, which restores the sample
  (`frontend/src/data/demoStore.ts`). Edits saved by the first version are moved to the new
  format; saved data that cannot be read is replaced by the sample **and the user is told**.

### 1b. Orders, locations and suppliers (implemented 2026-10-14)
- A workspace can hold any number of products, locations (warehouse, store, distribution
  centre), shipments, transfer routes and supplier offers (`shared/planner/model.ts`).
- A delayed shipment affects only orders **at the same location, for the same product**, due
  **before** the delayed stock arrives. An order with several products counts only the delayed
  product. Everything else is listed as **Not affected**. (`rehearse` in `shared/planner/plan.ts`)
- A location with no stock count for the product has **unknown** exposure, never zero, and no
  options are offered for it until a count is added.
- Stock only counts for an order if it has arrived by that order's due time. By default the
  order **due first** gets the stock (user decision 2026-10-14: it leaves more time to find stock
  for the later order).
- **Conflicts:** when a priority order is left short because an earlier standard order took the
  stock, the app asks "Who gets the 14 cases?" with **Order due first** / **Priority order**.
  Until answered, the order due first keeps it. Approving with an unanswered conflict shows a
  warning and records how many conflicts used the default. (`ConflictCards.tsx`)
- Each transfer route into the delayed location is its own option, checked against the
  destination's daily receiving limit and against the priority order's due time. Its cost is
  shown only when someone quoted a price for exactly that quantity. A route with unknown arrival
  is **Needs information** with **Add details** (no dead end).
- Each supplier offer for that product and location is its own option. Missing stock, price per
  unit, or arrival → **Needs information**, naming what is missing, with **Add details**. Arrives
  after every affected order is due → **Can't be done**. It buys only what is short
  (`min(offer, shortage)`) at the quoted price per unit.
- "Transfer all … in one day" is only shown when it would break the receiving limit;
  otherwise it is the same move as the normal transfer.
- The Overview shows one ready plan: the one that protects the priority order, then leaves the
  least exposed, then relies on fewer typed-in details (`recommendPlan`). If none is ready it
  says so instead of recommending something.
- Money and times follow the workspace country (sample: India → ₹ and India time). A time typed
  in, or read from a document without a timezone, is taken as the business's local time,
  including daylight-saving changes (`shared/planner/time.ts`, `countries.ts`).
- Before an approval is recorded, the server re-runs the same planner on the submitted data. If
  it disagrees, or cannot be reached, nothing is approved and the user is told why.

## 2. Reading receipts and documents
- Gemini reads the document/photo and produces a **proposed update** (e.g. "Shipment #12 from
  Supplier A: 100 units, arrival moved Tue → Fri").
- The user sees the proposal next to the source, edits if needed, and **confirms**. Only then
  does business data change.
- Low-confidence fields are highlighted.
- Names on documents often do not match records ("Choc chips 5kg" vs item "CHOC-500").
  The user maps it once; the mapping is remembered.

### Confirmation sequence
1. Gemini extracts a proposed record and points to its source; uncertain fields are highlighted.
2. The user confirms or edits the extraction. This confirms what the source says, not that stock is available.
3. Rehearsal previews the calculated effect on orders and inventory.
4. The user separately confirms applying that effect. Only then does the confirmed workspace state change.

## 3. Missing information: ask or proceed?
**Analyse immediately; never present an unsupported plan as feasible.**

| Kind of gap | Example | Behaviour |
|---|---|---|
| Critical | Does Supplier B have stock? | Ask, or mark the option **conditional** |
| Preference | Spend more or accept delay? | Show the tradeoff, let the user choose |
| Non-blocking | Customer contact name | Keep planning; ask before sending anything |

- Ask only questions that change the next decision. No 30-question forms.
- "I don't know" is always a valid answer.

## 4. Guided questions (Plan-mode style)
- Questions come one or a few at a time, like a planning conversation.
- Answer types: pick one, pick many, date, number, short text, voice, "I don't know", skip.
- The user can go back and change an earlier answer; dependent results recalculate.
- The current facts are always visible.
- **No AI training needed.** Our code works out *which* fact is missing (it knows what each
  plan depends on). Gemini turns that into a clear question with options and reads the answer
  back into structured data.

## 5. Reporting a disruption (including voice)
- User types, speaks, or uploads the message. Later: connected systems report automatically.
- Voice and text create a **proposed update**, read back for confirmation:
  "I heard: Supplier A's 100-unit shipment moves from Tuesday to Friday. Confirm or edit?"
- Ambiguous supplier, item or date → clarification question before anything changes.

## 6. Undo, discard, start again
| Control | What it does |
|---|---|
| **Undo last update** | Records a correction, restores affected facts, recalculates dependent plans |
| **Start new rehearsal** | Fresh scenario; business data kept |
| **Discard this draft** | Throws away the current rehearsal (with confirmation) |
| **Reset workspace** | Separate, protected action; never the same button as the above |

- Undo cannot unsend an email or reverse a completed purchase. Those need a cancellation or
  corrective action, which Rehearsal can prepare.
- When facts change, previously approved plans that depended on them are marked **outdated**.

## 7. Multiple problems at once
- Disruptions are grouped into an **incident set** (e.g. shipment late + warehouse unavailable
  + item X out of stock).
- All incidents are evaluated **together** against one business state. The engine must never
  use stock in an unavailable warehouse or allocate the same stock twice.
- Incidents can be added, corrected or resolved individually; each change re-runs affected
  planning.
- If **no feasible plan** exists, show the commitments that cannot be met, the unavoidable
  tradeoffs, and which constraint would need to change.
- Emergencies (e.g. fire) come first in the real world. Rehearsal handles business recovery
  only; affected stock and facilities count as unavailable until an authorised person
  confirms otherwise.

## 8. Suggest or do? Three levels
| Level | Behaviour |
|---|---|
| **Rehearse** | Calculate options. No business data changes. |
| **Apply** | After approval, update the internal schedule, allocations and tasks. |
| **Execute** | Through authorised integrations, send messages or submit purchase orders. |

- First version: rehearse + apply + **prepared** external actions (drafts), not sent.
- Later: user-granted, bounded automation (e.g. auto-notify staff).
- States are always explicit: *prepared*, *sent*, *confirmed by supplier* are different.
- Spending money and changing customer commitments require approval.

## 9. Business type vs user role
Two separate choices:
- **Business template** (Seller / Distributor / Manufacturer, combinable) — chosen when the
  workspace is created, not at every login. Drives terminology, setup questions, constraints.
- **User role** (Owner / Planner / Warehouse staff / Viewer) — controls who can view, edit,
  approve, or execute.

## 9a. Demo and Real workspaces (V1 decision; blank start implemented 2026-10-14)
- The first screen offers **Set up my business** or **Try the sample**; a returning visitor also gets **Continue**
  (`frontend/src/App.tsx`, `StartScreen.tsx`).
- **Demo** is a resettable, no-signup sample workspace for judges (`mode: 'demo'`, saved in localStorage).
- **Real** (`mode: 'real'`) starts completely empty (`shared/planner/blank.ts`): name and country (which set
  currency, number format and timezone). The user adds locations, products, stock, orders and shipments in any
  order; the **Setup** tab lists what is added and what is next (`presentation/setup.ts`). Nothing blocks
  anything: missing facts stay unknown, and a plan that needs one says so.
- A Real workspace is saved in this browser (IndexedDB, `data/realStore.ts`) and kept in step across tabs. The menu
  has **Download backup**, **Restore from backup** (checked like any saved data; always restored as the user's
  own workspace, never the sample) and **Delete this workspace** (asks first). Browser storage can be cleared by the
  user or the browser, so a backup is the safety net; the app asks the browser to keep the data (best effort).
- With no disruption reported, the Overview says "No disruption right now" and what is being watched, instead of
  showing a recommendation. Orders, Inventory, Suppliers and Rehearsals each have an empty state with the next action.
- Reset exists only for the sample; it never touches a Real workspace.
- A user can explicitly send a question and its relevant facts or an uploaded receipt to Google Gemini for processing.
  Rehearsal does not persist those requests or files on its server.
- The UI identifies the active workspace ("Sample workspace" / "Your workspace"), so sample facts cannot be mistaken
  for the user's own.
- A Real workspace can add orders (one product per order for now), incoming shipments, suppliers and transfer
  routes by hand (`components/editing/editorConfigs.ts`). A transfer must go between two different locations.
  Anything typed in is marked unverified; attaching a document makes it verified, as everywhere else.
- **Report a delay** picks a shipment and its new arrival. It keeps the original promised date, creates one
  problem per shipment (reporting the same shipment again moves the date, it does not add a second problem), and
  the Overview then shows the orders at risk. **Mark resolved** takes the problem off once the shipment arrives.
  The delay arrival can be read from a supplier message or email the same way other documents are.
- Not built yet: spreadsheet import, several products on one order, and cloud save/sign-in (see `TODO.md`).

## 10. Objectives
- User chooses what matters most: **protect delivery promises**, **minimise extra cost**, or
  a balance. Possibly "protect these customers first".
- Hard constraints always win over objectives.

## 11. Core loop
Understand the business → capture and confirm changes → ask targeted questions →
compare checked plans → approve → apply / prepare actions → track results → replan.

"Minimal interaction" means fewer unnecessary questions — **not fewer checks**.
