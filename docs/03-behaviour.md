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
  **Attach proof** once per record, or **Approve with warning**.
  (`frontend/src/components/planning/ApprovalWarning.tsx`)
- A transfer, purchase or ship-from approval changes the records (see "Approving changes the
  records" below) and shows a "Recorded: …" notice. Because the records changed, the approval mark
  itself is cleared, so no "Approved" or "with a warning" label stays on the option (`approve` and
  `saveChange` in `frontend/src/WorkspaceScreen.tsx`). The "Approved … with a warning" label only
  appears for a plan whose approval changes no records.
- Changing a value read from a document turns that value back into "entered manually".
  Order priority, ship-from location and a supplier's name are the user's own choices and need
  no proof. (`isFact` in `frontend/src/components/editing/editorConfigs.ts`)
- Every edit is two steps: (1) type it in, or attach a photo/PDF and check what Gemini read,
  with the quoted source text beside each value; (2) review old → new values plus the effect on
  the shortage and on each recovery option, then **Confirm and save**.
  (`frontend/src/components/editing/DetailsEditor.tsx`)
- Saving any change clears an existing approval, because it was given for the old numbers
  (`saveChange` in `frontend/src/WorkspaceScreen.tsx`). Approvals are saved with the edits, so they survive
  a page reload (user decision 2026-10-14); Reset clears them.
- Demo edits stay in this browser until **Reset**, which restores the sample
  (`frontend/src/data/demoStore.ts`). Edits saved by the first version are moved to the new
  format; saved data that cannot be read is replaced by the sample **and the user is told**.

### 1b. Orders, locations and suppliers (implemented 2026-10-14)
- A workspace can hold any number of products, locations (warehouse, store, distribution
  centre), shipments, transfer routes and supplier offers (`shared/planner/model.ts`).
- A delayed shipment affects only orders **at the same location, for the same product**. All of
  them are checked, with the late delivery counted at its new date (user decision 2026-10-16): an
  order due before it may be short (**at risk**), an order due after it that relies on it is
  **Watch**, and an order due after it that is still short gets recovery options like any other
  shortage. An order with several products counts only the delayed product. Everything else is
  listed as **Not affected**. (`rehearse` in `shared/planner/plan.ts`)
- A location with no stock count for the product **counts as 0** (user decision 2026-10-15; it
  replaces the earlier "unknown, never zero" rule because most missing counts really are none, and
  unknown blocked every fix). It is never silent: the order says "No stock count for Broom at
  Warehouse A, so it counts as 0" with **Add count**, the Overview counts such locations, and the
  order form says so under Quantity (`ImpactGroup.counted`, `OrderCoverage.counted`).
- Stock only counts for an order if it has arrived by that order's due time. By default the
  order **due first** gets the stock (user decision 2026-10-14: it leaves more time to find stock
  for the later order).
- **Conflicts:** when a priority order is left short because an earlier standard order took the
  stock, the app asks "Who gets the 14 cases?" with **Order due first** / **Priority order**.
  Until answered, the order due first keeps it. Approving with an unanswered conflict shows a
  warning and records how many conflicts used the default. (`ConflictCards.tsx`) The answer
  applies everywhere: the Orders page shares the stock out the same way, so both screens name
  the same customer as short (`priorityConflicts` in `shared/planner/plan.ts`).
- Each transfer route into the delayed location is its own option. It moves **only what is
  short**, and only what the source can **spare** after covering its own orders (`spareStock`,
  user decision 2026-10-14), capped by the destination's daily receiving limit and storage room,
  and checked against the priority order's due time. A route stores **how long a transfer takes**
  (`travelHours`, user decision 2026-10-15); arrival = now + that time (`routeArrival`), so it never
  goes stale. The sample uses a fixed morning (`SAMPLE_NOW`); older saves with a fixed arrival time
  still work until edited. **Cost** (user decision 2026-10-15) = cost per trip + cost per package ×
  quantity (`costPerTrip`, `costPerUnit`); an older quote for exactly that quantity wins; neither set
  → "Transfer cost not set". A route with unknown travel time
  is **Needs information** with **Add details** (no dead end). A ready transfer says **Book by**
  {time}: the earlier of when it is needed and the priority order's due time, minus the travel time
  (`plan.bookBy`, user decision 2026-10-15).
- Each supplier offer for that product and location is its own option. At setup a backup
  supplier is only who / contact / products / where; **Add backup supplier** ticks every product
  they supply and saves one supplier with one offer per product (user decision 2026-10-14,
  `editorConfigs.ts`). Stock, price and arrival are their **reply**, recorded per product,
  when a delay happens. Until all three are recorded the option is **Waiting for reply**, with
  **Record reply**. Arrives after every affected order is due → **Can't be done**. It buys only
  what is short and fits (`min(offer, shortage, storage room)`) at the quoted price per unit, plus
  their **delivery charge** if they gave one (otherwise the card says "delivery charge not given").
  The Suppliers page shows one card per supplier, with a row per product, plus **Edit supplier**
  (name, contact, products, deliver to: replies stay for products kept at the same place; removed
  products lose theirs; a new product starts waiting) and **Remove** (confirm first).
- **Ask suppliers, per problem** (`AskSuppliers.tsx`, user decision 2026-10-15, replacing one
  message per supplier): each problem block has its own "Ask suppliers for {product}" panel with
  one message for that product — the shortage capped by storage room, needed by the first order
  that is short (`plan.request`). A supplier missing two products gets two emails. Copy it, email
  one supplier, or **Email all N waiting** (BCC, when 2+ waiting suppliers have an email). Each
  supplier row has **Record reply** and **Attach reply**. The panel starts folded so the next
  problem stays in view; its header says how many suppliers are still waiting (user decision
  2026-10-15). Only a plain email address becomes a link (`emailOf`). The app does not send anything
  itself.
- **Storage limits** (user decision 2026-10-14): set an optional limit for one product at one
  location on that stock count (`storageLimits`). A different warehouse can have a different
  limit; blank means unlimited for that pair (`storageCap`). Room = limit minus
  today's count (stock leaving for orders before arrival is not credited). Transfers and
  supplier options are capped to the room; a full location rejects them as **Can't be done**.
- "Transfer all … in one day" is only shown when it would break the receiving limit;
  otherwise it is the same move as the normal transfer.
- **Closing orders** (user decision 2026-10-15, `setOrderStatus` in `shared/planner/apply.ts`):
  **Delivered** takes the order's goods off its warehouse's stock; **Cancel** leaves stock alone.
  Both ask first, and the order moves to "Delivered and cancelled" on the Orders page, where
  **Reopen** undoes it (a delivered order's goods are counted back in). The planner only looks at
  open orders (`isOpen`).
- Adding or editing an order shows, under each quantity, how much the warehouse can **spare**
  after its other orders, and an amber warning when the order needs more. It never blocks saving.
- **Every order is checked, delay or not** (user decision 2026-10-14, `orderCoverage`): stock on
  hand at its warehouse plus deliveries arriving by its due time, shared with orders due first.
  Covered / Short ("no incoming shipment recorded" when nothing is on its way — the app only knows
  deliveries the user entered); a warehouse never counted counts as 0 and is labelled so.
- **What "at risk" means** (user decision 2026-10-15, `affectedOrderIds` / `watchOrderIds` in
  `rehearse`): an order is **at risk** only when the problem leaves it short. An order due before
  the late delivery but fully covered by stock already on hand is **not at risk** and is listed
  with the fine orders. An order covered only by stock still on its way (an approved transfer, an
  expected delivery) is **Watch**: listed under the problem with an amber tag, not counted, because
  it becomes short if that delivery slips. The Orders badge, the Overview count, the heading and
  Ask AI all use this; exposed quantities are unchanged. Example: Kaveri has 40 bags on hand and a
  15-bag transfer arriving; Hotel Annapoorna (30) is covered from stock (not at risk), Green Leaf
  (25) relies on the transfer (Watch), and the Orders heading reads "No order short · 1 to watch".
- **Shortages are rehearsed too** (user decision 2026-10-14): a warehouse+product with a Short
  order and no reported delay becomes its own problem (`ImpactGroup.kind: 'shortage'`), shown on
  the Overview as "Not enough stock", with the same options (transfers in, backup suppliers) and
  recommendation. A warehouse+product already in a reported delay is handled by that delay only,
  so nothing is counted twice. When no option exists, Recovery options offers **Add expected
  delivery** and **Add backup supplier**, prefilled.
- **Ship the order from another warehouse** (user decision 2026-10-14, `kind: 'ship-from'` in
  `shared/planner/plan.ts`): for each short order, every other location holding the product is an
  option. It is ready only if, with the order moved there, the whole order (every product in it)
  is covered and none of that location's own orders becomes short (`orderCoverage`). It needs no
  transfer route and no storage room at the short warehouse. Its cost is the **extra delivery
  cost**: the other location's cost to deliver an order minus the usual one's
  (`deliveryCostPerOrder` on each location); unknown unless both are set.
- **Can it deliver to those customers?** (user decision 2026-10-15, `deliveryAnswers`): Rehearsal
  never guesses from city or state. Until the user answers "Can Warehouse B deliver to Warehouse A's
  customers?", a ship-from option that would work is **Needs your answer** (Yes / No on the card and
  at the top of Recovery options; the Overview says how many questions could unlock options). It
  is asked only when B can cover a short order. **No** hides B for A's orders for good (e.g. a Delhi
  warehouse for Bangalore customers); answers are listed and changeable in **Between locations**,
  where they can also be given ahead of time. A location's **City or area** is shown in these
  questions to help answer them, and is never used to decide.
- The best option is picked by: covers priority orders → fewest left short → **lowest total cost**
  (unknown cost last) → fewest typed-in details (`rankPlans`).
- Recovery options are **grouped by problem** (user decision 2026-10-15): one block per late
  delivery or shortage (one product at one place) titled e.g. "Not enough Broom at Warehouse A ·
  1 package short · SHIVA KIRANA", with that problem's options ranked and the first ready one marked
  **Best for this problem**. Questions stay shared above; asking suppliers is inside each problem.
  Options that can't be done fold into one "Ruled out (n)" line with their reasons. When nothing
  workable is left, the problem lists next steps instead: **Add backup supplier**, **Does
  {existing supplier} sell {product}?** (opens that supplier with the product added) and **Add
  expected delivery**.
  When every workable option is a supplier still waiting for a reply and fewer than three are being
  asked, the block says "Only {supplier} is left to ask" with the same **Add backup supplier** and
  **Does … sell …?** buttons, so there is a fallback if they say no.
- **Is it worth it?** (user decision 2026-10-15): a product can have an optional **selling price per
  package**. A ready option whose cost is more than the packages it saves are worth
  (`plan.savedQuantity` × price) gets a warning, e.g. "Costs ₹21,000, more than the 3 packages it
  saves are worth (₹900)." It warns only; it does not change the ranking (`worthNote` in
  `planText.ts`).
- **Approving changes the records** (user decision 2026-10-15, `applyPlan` in
  `shared/planner/apply.ts`), so the picture stays true afterwards: a **transfer** takes the stock
  out of the source now and adds "Transfer from …" as an incoming delivery at the destination; a
  **purchase** adds the supplier's delivery and lowers what they still offer; **ship from another
  warehouse** moves the order. Changed counts are marked typed-in until recounted.
- **Messages to send after approving** (user decision 2026-10-15, `approvalMessages` in
  `frontend/src/presentation/approvalMessages.ts`, `ReadyMessages.tsx`): written by code from the
  approved plan, never by Gemini. A purchase states the quantity, quoted price, delivery charge,
  total and arrival, addressed to the supplier's email; a transfer asks the sending location's
  team to send exactly the approved quantity by the plan's arrival (and leave by the book-by time);
  ship-from asks the other location to deliver that order. Each customer the problem still leaves
  short gets a note: how much arrives on time and when the rest should follow, taken from the next
  delivery recorded after their due date, or "we will confirm" when none is recorded. They open in
  a "Messages to send" box right after approving, with **Copy message** and **Email** (when an email
  is known); a copy stays on that approval in History. Nothing is sent automatically.
- **Mark received** (user decision 2026-10-15, `receiveDelivery` in `shared/planner/apply.ts`,
  `ReceiveDialog.tsx`): every incoming delivery in Suppliers has it. The user enters what actually
  arrived per product (prefilled with what was expected). It is added to that location's stock (a
  count is started if there was none) and the delivery stops counting as incoming, so it is never
  counted twice; a delay reported on it is cleared. If part is missing (6 of 8) Rehearsal asks "Are
  the other 2 still coming?": **Yes** needs a date, and the 2 stay incoming as `{id}-REST` for that
  date; **No** closes it. **Add to stock** stays disabled until that is answered, so no date is
  guessed. A regular delivery moves to its next date on the original schedule. Nothing arrived:
  the dialog offers **Report it late** instead.
- **History** (user decision 2026-10-15, `HistoryView.tsx`, `addHistory`): a read-only list, newest
  first, written whenever a change is saved: delays reported or resolved, plans approved (and whether
  with a warning), deliveries received, orders delivered/cancelled/reopened, edits (the editor's
  title and changed fields), imports, conflict and "can it deliver?" answers, routes and suppliers
  removed. It keeps the newest 500 entries and is saved with the business (guest or account).
- **Can stock move between them?** (`RecoveryPlans.tsx`): when another location can spare a short
  product and there is no transfer route from it, Recovery options asks. **Yes, add transfer**
  opens the route form prefilled; **No** saves the pair (`noTransfers`) and stops asking.
- **Between locations** section (formerly Transfers; `TransfersView.tsx`, user decision 2026-10-14): lists every route
  (from → to, arrival if booked now, quotes) with **Edit** and **Remove** (confirm first). Removing
  a route records the pair as "can't move this way" so the question doesn't come straight back.
  Pairs answered **No** are listed under "Can't move stock this way" with **It can, add route** and
  **Ask me again**. Adding a route clears an earlier No; the same route can't be added twice.
- **Repeating deliveries** (`repeatEveryDays`: 7, 14 or 28): the next delivery is
  `confirmedArrivalAt`, later ones follow the original schedule (`arrivalsOf`). Reporting one late
  moves only that delivery; later ones still count for the delay plan.
- The Overview shows one ready plan per problem, the best for the business's goal (`recommendPlan`,
  see section 10). If none is ready it says so instead of recommending something.
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
- The first screen (`frontend/src/App.tsx`, `StartScreen.tsx`; user decisions 2026-10-15):
  - Signed out: **Sign in with Google**, **Start as a guest** (or **Continue without signing in** when a guest
    business exists) and **Try the sample**.
  - Signed in: **Your businesses**, a list with **Open** for each (an account can hold several), **Add another
    business**, and, if this browser has a guest business, **Save {name} to my account** or **Keep using it here**.
- **Guest** business: one per browser, saved only in this browser (IndexedDB, `frontend/src/data/realStore.ts`). The
  top bar says "Saved in this browser only" and shows **Sign in to save** (or **Save to my account** when already
  signed in). Clicking it signs in if needed, then asks "Save {name} to your account?" with **Save to my account**
  or **Not now**. Saving adds it as a new business next to any already in the account; it never replaces one. The
  browser copy is removed only after Firestore confirms the save, and a guest save still in progress finishes
  first (`moveGuestToAccount` in `frontend/src/data/moveGuest.ts`). A cancelled or blocked sign-in, or a failed
  save, leaves the guest business as it was.
- **Demo** is a resettable, no-signup sample workspace for judges (`mode: 'demo'`, saved in localStorage).
- **Real** (`mode: 'real'`) starts completely empty (`shared/planner/blank.ts`): name and country (which set
  currency, number format and timezone). The user adds locations, products, stock, orders and shipments in any
  order; the **Setup** tab lists what is added and what is next (`presentation/setup.ts`). Nothing blocks
  anything: missing facts stay unknown, and a plan that needs one says so.
- A signed-in business is saved to the Google account in Firestore (`frontend/src/cloud/cloudStore.ts`), so it
  opens on any device. Saves run one at a time; if another device or tab saved first, this one shows the newer
  version and asks the user to make their last change again, instead of overwriting it. Only the account's owner
  can read or write it (`firestore.rules`). A business saved under the earlier one-business-per-account layout is
  carried into the list the first time the list is read, and the old copy is removed only after that save. The
  menu has **Switch business** (back to the list), **Download backup**, **Restore from backup** (signed in: added
  as a new business; guest: replaces the guest business), **Delete this business** (asks first; removes only that
  one) and **Sign out**.
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
- **Import from a file** (.csv or .xlsx, read in the browser, max 20 MB / 100,000 rows) for stock counts, orders and
  incoming shipments (`frontend/src/import/`, `components/import/ImportDialog.tsx`). Three steps: choose file, match
  columns, check before saving. Rules:
  - Columns are matched by their usual names; **Ask Gemini** fills the gaps when the user clicks it (it gets the
    column names and, while `SEND_SAMPLE_ROWS` is on, three trimmed sample rows; the backend only returns real fields
    and real column numbers).
  - Names are matched to existing locations and products ignoring case and spacing; unseen names are created, but
    only if a kept row uses them.
  - A bad row is left out and listed with its row number; an unreadable count is never turned into zero, so that
    stock stays unknown. Rows with the same reference are lines of one order or shipment; if any row of it is bad,
    the whole order or shipment is left out so demand or supply is never understated.
  - Importing the same file twice changes nothing the second time. Imported values are marked "Imported from file"
    and count as verified.
  - Dates follow the country's order (day first for India, month first for the US, changeable); a date with no time
    means the end of that day. An Excel time is read to the nearest minute, because Excel stores 10:00 as a fraction
    that can come out as 09:59:59.999 (`cellText` in `frontend/src/import/table.ts`). A new arrival date for a known shipment keeps the original promise and is not
    treated as a delay until the user reports one.
- Not built yet: several products on one order when typing it in, importing routes and suppliers.

## 10. Goal (built 2026-10-15)
- Recovery options shows "What matters most right now?" with three choices (`GoalPicker.tsx`); it is
  saved with the business (`workspace.goal`) and the change is noted in History. Ready options
  re-rank straight away (`rankPlans(plans, goal)` in `shared/planner/plan.ts`); waiting and
  can't-be-done options always come after ready ones.
  - **Protect deliveries** (default, the earlier ranking): priority orders covered, then fewest
    packages left short, then cheaper (unknown cost last), then fewer typed-in details.
  - **Lowest cost**: cheapest total first, even if more is left short; ties as above.
  - **Balanced**: priority orders covered, then the lowest cost for each package it saves
    (`cost / savedQuantity`); ties as above.
- Example (sample, short 24): transfer 8 for ₹95 (₹11.88 a case) vs buy all 24 from Supplier B.
  At ₹10 a case (₹240): Protect and Balanced buy, Lowest cost transfers. At ₹13 (₹312): Protect
  still buys, Balanced transfers.
- The Overview labels its pick "Best option · {goal}". Ask AI sees options in the goal's order.
- Hard rules always win: an option that can't be done is never ranked above one that can.

## 11. Core loop
Understand the business → capture and confirm changes → ask targeted questions →
compare checked plans → approve → apply / prepare actions → track results → replan.

"Minimal interaction" means fewer unnecessary questions — **not fewer checks**.
