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

## 2. Reading receipts and documents
- Gemini reads the document/photo and produces a **proposed update** (e.g. "Shipment #12 from
  Supplier A: 100 units, arrival moved Tue → Fri").
- The user sees the proposal next to the source, edits if needed, and **confirms**. Only then
  does business data change.
- Low-confidence fields are highlighted.
- Names on documents often do not match records ("Choc chips 5kg" vs item "CHOC-500").
  The user maps it once; the mapping is remembered.

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

## 10. Objectives
- User chooses what matters most: **protect delivery promises**, **minimise extra cost**, or
  a balance. Possibly "protect these customers first".
- Hard constraints always win over objectives.

## 11. Core loop
Understand the business → capture and confirm changes → ask targeted questions →
compare checked plans → approve → apply / prepare actions → track results → replan.

"Minimal interaction" means fewer unnecessary questions — **not fewer checks**.
