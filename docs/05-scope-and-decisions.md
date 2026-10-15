# 05 — Scope, Decisions, Open Questions, Risks

## Feedback Decisions Approved 2026-10-15
- Customer messages state the known shortage without inventing its cause; a relevant reported supplier delay may be mentioned (`approvalMessages`).
- Gemini column matching receives headers only, not spreadsheet row contents (`suggestMapping`, implementation tracked in `Progress.md`).
- Offer late-but-useful transfers with a warning naming customers still short, rather than ruling them out solely for missing a short priority order (`rehearse`, implementation pending).
- Incoming stock stays separate from on-hand, with dated storage projections that move when arrival dates change. Warn on existing overflow and block rescues that worsen it; do not assume unshipped orders have already left (`rehearse`, `InventoryView`, implementation pending).
- Supplier replies need reconfirmation when demand/delays change or arrival passes; a purchase for unchanged demand does not invalidate the remaining reply (`SupplierOffer`, implementation pending).
- Partial dispatch is approved: deduct 6 sent and keep 4 outstanding from an order of 10 under the original due date unless edited. Ask once per order whether the customer accepts splits. Correct only a selected dispatch by editing quantities and applying its stock difference, not a global undo (`Order`, implementation pending).
- User requested small in-chat diagrams, a connected overview and restriction/calculation review before implementation. `07-bug-map.md` distinguishes current and proposed paths. Allocation warnings, booking versus departure, historical-fact exceptions and dispatched-versus-delivered naming remain open decisions.
- **Stock ledger, fresh start** (user decision 2026-10-15): stock is derived from recorded movements instead of edited directly; old saved data need not load (no live users). Bookings lock stock (show on-hand, booked and free); a later physical count is respected when correcting a send; missing transfer goods stay unresolved until their fate is recorded; an order's due time means arrival at the customer. Slices 1-3 built (`Progress.md`); bookings, returns, transit fate and arrival timing are next.

## MVP scope for the 18 October submission (PROPOSED)
In:
- Three business templates (Seller, Distributor, Manufacturer) with sample businesses.
- No-signup "Try a sample business" entry for judges.
- Disruption input by text, voice and document/photo upload → proposed update → confirm/edit.
- Disruption types: supplier/shipment delay, stock shortage, capacity loss (warehouse,
  machine, staff, vehicle).
- Incident sets with more than one disruption.
- Impact view: affected orders and resources.
- Guided questions for missing facts.
- Two or three checked plan options with tradeoffs; rejected options show why.
- Objective selection (protect deliveries / minimise cost / balance).
- Approve → apply internally → prepared drafts (messages, purchase requests, tasks).
- Undo last update, start new rehearsal, discard draft.

Out (later):
- Real integrations (inventory systems, email sending, supplier APIs, purchasing).
- Automatic execution of external actions.
- Full role/permission management (MVP may have Owner only).
- Spreadsheet upload for arbitrary formats (MVP may support one template format).
- Learning from history, forecasting.

## Decisions made
| Decision | Date |
|---|---|
| Build "Rehearsal": disruption recovery for small businesses | 2026-10-13 |
| Generic core with Seller, Distributor, Manufacturer templates | 2026-10-13 |
| Web app (mobile-friendly), not a native mobile app — judges need a link | 2026-10-13 |
| Gemini proposes, code checks; no numbers trusted from the model | 2026-10-13 |
| Every data change needs user confirmation | 2026-10-13 |
| First version prepares external actions, does not send them | 2026-10-13 |
| No AI training/fine-tuning; prompting + structured output + function calling | 2026-10-13 |
| TypeScript/Node backend; AI Studio API key held server-side | 2026-10-14 |
| Demo and Real are separate workspaces; Real is browser-local in V1, sign-in/sync in V2 (superseded 2026-10-15) | 2026-10-14 |
| Real-mode stock counts require attached evidence; extraction and applying changes are separately confirmed | 2026-10-14 |
| Real-mode questions/selected evidence may be sent to Gemini for processing; Rehearsal does not persist those requests/files | 2026-10-14 |
| Docs first, then code. Folder: /Users/gourav.hanumante/AIBuilder2026 | 2026-10-13 |
| Cloud save and search/paging skipped for V1; data stays per device with backup/restore (cloud save superseded 2026-10-15) | 2026-10-14 |
| Priority-vs-due-date conflict: the order due first gets the stock until the user switches it | 2026-10-14 |
| Every open order is checked against stock and deliveries, delay or not; shortages are rehearsed too | 2026-10-14 |
| Transfers move only what is short, from what the source can spare; storage limit per product per warehouse | 2026-10-14 |
| Ship-from another warehouse is an option; "Transfers" section renamed "Between locations" | 2026-10-14 |
| A missing stock count counts as 0 and is labelled so (replaces "unknown, never zero") | 2026-10-15 |
| Routes store travel time; cost = per trip + per package; suppliers have a delivery charge; ranked on total | 2026-10-15 |
| Ship-from waits for the user's "can it deliver to those customers?" answer | 2026-10-15 |
| Options grouped by problem; ask suppliers per problem with Email all (BCC) | 2026-10-15 |
| Optional selling price gives a worth-it warning only, ranking unchanged; ready transfers show Book by | 2026-10-15 |
| Orders can be marked delivered, cancelled or reopened | 2026-10-15 |
| Approving a plan changes the records (transfer, purchase, ship-from) | 2026-10-15 |
| Every code change updates the docs it affects in the same commit (`.github/copilot-instructions.md`) | 2026-10-15 |
| Own business saved to Firestore per Google account; Google sign-in only; the sample stays no-signup in the browser; a business saved in the browser can be moved to the account in one click | 2026-10-15 |
| Guest mode: one business per browser without signing in; signing in asks first, then adds it to the account; the browser copy is removed only after the account save succeeds | 2026-10-15 |
| An account can hold several businesses, picked from a list; Delete removes only the open one | 2026-10-15 |
| "At risk" means left short; covered only by stock on its way is "Watch"; covered from stock on hand is fine (user asked for a recommendation; this was it) | 2026-10-15 |
| After approving: ready-to-send messages (supplier order, transfer request to the sending location, note to a customer still short) shown right away and kept in History | 2026-10-15 |
| Goal per business: Protect deliveries (default), Lowest cost, Balanced = priority orders first, then cheapest per package saved | 2026-10-15 |
| Next, in order: Mark received (partial asks "are the rest still coming?") + read-only History; ready-to-send messages after approval (supplier order, transfer booking, late customer); pick a goal (default Protect deliveries) | 2026-10-15 |
| A delay checks every order at that place for that product, the late delivery at its new date: an order due after it that is still short gets options; one that relies on it is Watch | 2026-10-16 |
| Approved transfers consume their arrival day's receiving limit; new options use only the remainder (`rehearse`, `localDay`). Received quantities are now retained by the automatic arrival records below. | 2026-10-16 |
| Mark received automatically records actual goods arrivals, without a receipt upload. Received transfers retain their local-day capacity; a partial receipt counts today and its remainder reserves its expected day. Inventory count corrections do not imply arrivals (`GoodsReceipt`, `receiveDelivery`, `rehearse`). | 2026-10-15 |
| Fully covered orders relying on incoming goods are Watch even with no delay; a shortage on another product keeps the order at risk. Book by follows the earliest short order the transfer actually helps, not an already-covered priority order. The still-short priority timing rule is unchanged (`orderCoverage`, `rehearse`). | 2026-10-15 |
| Block Mark delivered when counted on-hand stock cannot cover every order line. Correct the count first; do not clamp stock to zero then add the whole order back on reopening (`setOrderStatus`, `WorkspaceScreen`). | 2026-10-15 |

Details and the code behind each 2026-10-14/15 row are in `03-behaviour.md` (search "user decision").

## OPEN questions (ask the user)
1. **Theme:** Retail & Commerce or Manufacturing? Must pick one.
   - Retail & Commerce explicitly lists inventory, demand planning, operational efficiency;
     sellers and distributors are the larger user group.
   - Manufacturing lists supply and demand, operational data → actions.
2. **Demo hero business:** which template leads the video? (Others shown briefly.)
3. **Stack:** settled and deployed (React on Firebase Hosting, Node API on Cloud Run). Still open: whether to use Firestore at all (see `TODO.md`).
4. **Name:** keep "Rehearsal"? Not checked for conflicts.
5. **Languages:** English only, or also voice in Hindi/other languages for the demo?
6. **Team:** who is on the team (2–4 required, formation closes 14 Oct)? User does all work.
7. **Video length:** confirm with organisers (3 vs 3–4 minutes).
8. **Deck template:** read the provided .pptx and plan slides.
9. **Employer policy:** confirm outside-work approval if required.
10. **Prior art:** quick search for similar products before final pitch wording.

## Risks
| Risk | Mitigation |
|---|---|
| 5 days, one builder | Strict MVP; sample data first; cut integrations |
| Engine scope explodes (real scheduling is hard) | Small models: few items, orders, resources; simple rules |
| Gemini misreads a document | Proposed update + confirmation; highlight low confidence |
| Plans look clever but are wrong | Engine re-checks every plan; golden scenarios |
| Public demo abused / cost spike | Rate limits, spend cap, isolated demo workspaces |
| Prototype down during evaluation | Keep deployment simple; monitor; no expiring credentials |
| Looks like "just another chatbot" | Demo must show the checker rejecting a tempting plan |

## Ideas considered and rejected (for context)
- Document analysers (food label compliance, supplier certificate checker, claim checker):
  useful but generic "AI reads files and flags issues".
- Insurance fraud detection: crowded market.
- Policyholder claim-cut fighter / hospital room-rent calculator: interesting, but narrower
  and depends on regulation text we would need to verify.
- Rental deposit dispute, flat handover defects: weaker theme fit.
- Disaster coordination: powerful, but hard to make dependable and demo honestly.
- Personal bureaucracy agent: brittle portal automation.
Chosen instead: a system that **rehearses responses to disruption** and carries one into action.
