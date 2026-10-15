# Rehearsal — TODO and Priority Backlog

## Open gaps found while testing (2026-10-15)
- [ ] **Mark a delivery received**: approved transfers and purchases become incoming deliveries; when one arrives the user must recount stock and delete the delivery by hand, or it counts twice.
- [x] **Shipping cost**: routes cost per trip + per package; supplier replies have a delivery charge; locations have a delivery cost per order for ship-from (2026-10-15).
- [x] **Is it worth it?** Optional selling price per product; options costing more than the packages they save are worth get a warning (2026-10-15). Warning only, ranking unchanged.
- [x] **Latest time to book**: ready transfers show "Book by …" (2026-10-15). Suppliers give an arrival time, not a lead time, so purchases have no book-by yet.
- [ ] **Move more per trip** (idea, not agreed): when the trip cost is high, consider moving extra stock in the same trip instead of exactly the shortfall.
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
- [ ] SKIPPED for V1 (decision 2026-10-14): cloud save for Real workspaces. Data stays per device in the browser, with backup/restore. Groundwork (chunking, Firestore rules, rules tests) is parked on branch `cloud-save-wip`; the rules were never run against the emulator (needs Java 21)
- [ ] SKIPPED for V1: search and paging for hundreds of locations/orders (lists render every row; the sample is small, a 100-store import is just long). Also: the inventory and order views do a linear lookup per row, which will be slow in the thousands
- [ ] before real users: decide whether Gemini sees sample rows from imported files (free Gemini tier lets Google use content; test data only). Keep one switch to send headers only.
- [x] create evidence-backed extraction confirmation, followed by separate apply confirmation (Demo edits)
- [x] calculate sample impact and receiving-capacity feasibility
- [x] show plan options, conditional facts, and rejection reason
- [ ] let the user select a planning objective and compare options against it
- [x] persist business changes only after user confirmation (two-step editor; approval applies the plan)
- [ ] prepare action drafts after approval (supplier ask messages exist before approval; nothing is drafted after)
- [ ] OPEN RISK: Firestore is not used anywhere in the build. The hackathon requires Firebase, Firestore, Cloud Run and Gemini to all be genuinely used and described. Cheapest honest fix: Cloud Run writes an approval audit record to Firestore (server-side only, client access denied, no sign-in). Not decided
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
- [x] persist Real workspace facts and evidence in browser-local storage only (IndexedDB)
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
