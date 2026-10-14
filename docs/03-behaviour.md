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
  `Evidence`/`Fact` in `frontend/src/data/distributorDemo.ts`)
- Typed-in details are usable. A plan that relies on them is labelled **Ready · unverified**
  instead of **Ready to use** (`statusLabel` in `frontend/src/domain/rehearseDistributor.ts`).
- Approving such a plan first opens a warning that lists each typed-in detail, offers
  **Attach proof** once per record, or **Approve with warning**. The approval is then shown as
  "approved with unverified details". (`frontend/src/components/planning/ApprovalWarning.tsx`)
- Changing a value read from a document turns that value back into "entered manually".
  Order priority and a supplier's name are the user's own choices and need no proof.
  (`isFact` in `frontend/src/components/editing/editorConfigs.ts`)
- Every edit is two steps: (1) type it in, or attach a photo/PDF and check what Gemini read,
  with the quoted source text beside each value; (2) review old → new values plus the effect on
  the shortage and on each recovery option, then **Confirm and save**.
  (`frontend/src/components/editing/DetailsEditor.tsx`)
- Saving any change clears an existing approval, because it was given for the old numbers
  (`saveData` in `frontend/src/App.tsx`).
- Demo edits stay in this browser until **Reset**, which restores the sample
  (`frontend/src/data/demoStore.ts`). Saved data with a broken shape is ignored, not shown.

### 1b. Orders and suppliers (implemented 2026-10-14)
- Only orders due **before** the delayed shipment arrives count as affected. Later orders are
  listed separately as **Due after arrival** — not "on track", because nothing checks yet
  whether the late shipment covers them. (`unaffectedOrderIds`, `CommitmentsPanel.tsx`)
- Stock only counts for an order if it has arrived by that order's due time; orders are served
  in due-date order, priority first on ties (`allocate` in `rehearseDistributor.ts`).
- Each backup supplier becomes its own recovery option. Missing stock, price per case, or
  arrival time → **Needs information**, naming what is missing, with an **Add details** button
  (no dead end). Arrives after every affected order is due → **Can't be done**.
- A supplier option buys only what is short (`min(offer, shortage)`) at the quoted price per case.
- "Transfer all cases in one day" is only shown when it would break the receiving limit;
  otherwise it is the same move as the normal transfer.
- The Overview shows one ready plan: the one that protects the priority order, then leaves the
  fewest cases exposed, then relies on fewer typed-in details (`recommendPlan`). If none is
  ready it says so instead of recommending something.

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

## 9a. Demo and Real workspaces (V1 decision)
- **Demo** is a resettable, no-signup sample workspace for judges.
- **Real** is a separate workspace whose confirmed records and uploaded source files remain in the current browser in V1; it does not sync across devices and does not require sign-in yet.
- A user can explicitly send a question and its relevant facts or an uploaded receipt to Google Gemini for processing. Rehearsal does not persist those Real-mode requests or files on its server. Sign-in and synced Real workspaces are V2.
- The UI must identify the active workspace and data source so sample facts cannot be mistaken for Real facts.

## 10. Objectives
- User chooses what matters most: **protect delivery promises**, **minimise extra cost**, or
  a balance. Possibly "protect these customers first".
- Hard constraints always win over objectives.

## 11. Core loop
Understand the business → capture and confirm changes → ask targeted questions →
compare checked plans → approve → apply / prepare actions → track results → replan.

"Minimal interaction" means fewer unnecessary questions — **not fewer checks**.
