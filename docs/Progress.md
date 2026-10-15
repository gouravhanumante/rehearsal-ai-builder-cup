# Rehearsal — Progress Tracker

## Status summary (checked against code 2026-10-15, commit 25e5e0f)
- Project status: sample and own-business workspaces, shared planner, Gemini document reading / column matching / Ask AI, and approvals that record the plan are implemented
- Theme direction: Retail & Commerce
- Demo hero: Distributor
- Architecture: React + Vite on Firebase Hosting, Node API on Cloud Run (project rehearsal-ai-builder-cup-2026), Gemini via AI Studio key; Firestore not used
- Deployed: yes, but the work after 2026-10-14 (costs, worth-it, book-by, supplier asks) is not redeployed yet
- Submission date: 2026-10-18

## Completed
- product concept agreed
- business problem framed
- core behaviour documented
- architecture split documented
- MVP scope narrowed
- hackathon requirements reviewed
- project direction refined for a clearer demo story
- React + TypeScript frontend scaffold created
- sectioned operations overview with an expandable affected-order list and distinct recovery-option cards
- persistent desktop sidebar and labeled mobile navigation for Overview, Orders, Inventory, Suppliers, and Rehearsals
- dedicated views show their own data; Overview stays focused on urgent details and one checked response
- branded header, higher-contrast status colors, clearer plan wording, and larger primary actions
- Manrope typography, evergreen/lime brand treatment, and plain-language option states
- Ask AI drawer wired to the local API; key setup and stateless live sample question verified
- Cloud Run-compatible backend with `/api/health` and `/api/assistant/ask`; API key stays server-side
- Gemini response validation filters option IDs to known planner options and recommendations to ready options
- Gemini Interactions use `store: false`; Rehearsal backend does not persist prompts or context
- Live sample question returned a planner-checked option reference; no key value is stored in the repository
- Ask AI uses Gemini 3.5 Flash-Lite; one local sample UI request completed in about 2.1 seconds
- research-backed UX guidelines recorded for future screens
- distributor sample fixture centralized separately from UI
- deterministic impact and recovery-option calculations implemented
- planner tests cover stock exposure, receiving capacity, and unknown supplier facts
- responsive browser checks for incident details, approval, reset, and mobile overflow
- editable Demo data (stock counts, orders, backup suppliers) with two paths: type it in (marked unverified) or attach a photo/PDF that Gemini reads (marked verified by document)
- two-step edit: check values, then review the effect on the shortage and options before saving; Demo edits kept in the browser until Reset
- Add supplier; each backup supplier is its own option with an Add details action instead of a dead-end "Waiting for details"
- plans relying on typed-in details show "Ready · unverified" and warn before approval, with Attach proof per record
- Orders view lists orders due after the delayed shipment separately
- live check: a sample supplier quote PDF was read by Gemini (all 4 fields, with quotes) and moved Supplier B to Ready to use
- Phase 1 scale-up: any number of products, locations, shipments, transfer routes and supplier offers; planner shared by browser and API (`shared/planner/`)
- currency and timezone from the workspace country (sample: India, ₹); times correct across daylight saving
- priority-vs-due-date conflict card (default: order due first) and conflict warning at approval
- approvals saved with edits; server re-checks a plan before it is approved
- Add location, Add product, edit transfer arrival (fixes the transfer "Waiting for details" dead end)
- browser saves from the first version are carried into the new format; unreadable saves are reported, not dropped
- live check after scale-up: same sample numbers (24 exposed, transfer leaves 16); Gemini read a quote's arrival time in India time and correctly declined a USD price for a ₹ workspace

- blank workspace: start screen (set up my business / try the sample), empty Real workspace saved in the browser, Setup guide, empty states, backup download/restore, delete (2026-10-14)
- spreadsheet import (csv/xlsx) with Gemini column suggestions; four test scenarios in `test-data/` (2026-10-14)
- deployed to Cloud Run + Firebase Hosting (2026-10-14)
- products by items per package; storage limit per product per warehouse; repeating deliveries (2026-10-14)
- every open order checked against its warehouse's stock and deliveries, not only delayed ones; short orders get recovery options too (2026-10-14)
- Between locations section: routes with travel time, edit/remove, "can't move this way" answers (2026-10-14)
- edit and remove suppliers; backup suppliers can supply several products (2026-10-14)
- ship an order from another warehouse, after the user says it can deliver to those customers (2026-10-15)
- orders can be marked delivered, cancelled, or reopened (2026-10-15)
- a missing stock count counts as 0 and is labelled so (2026-10-15)
- approving a transfer, purchase or ship-from records it in the workspace (2026-10-15)
- costs: per trip + per package on routes, supplier delivery charge, delivery cost per order for ship-from; ranked on total (2026-10-15)
- options grouped by problem with a best pick each; next steps when a problem has no option (2026-10-15)
- worth-it warning from an optional selling price; Book by time on ready transfers (2026-10-15)
- Ask your backup suppliers per problem, one message per product, Email all (BCC) (2026-10-15)

## In progress
- review provisional distributor sample quantities, dates, and estimated costs together
- finalize the exact V1 demo flow and confirm hackathon theme

## Pending
- mark an approved delivery as received (see `TODO.md`)
- redeploy backend and frontend with the 2026-10-15 work
- decide on the Firestore open risk (`TODO.md`)
- review provisional distributor sample quantities, dates, and estimated costs together
- deck, demo video, demo script, and submission assets

## Current working assumption
Demo remains the sample distributor workflow. Real mode is a separate browser-local workspace; users explicitly submit questions/documents to Gemini, check its proposed values, review the calculated effect, then save. Approving a plan changes the workspace only; no external action is sent.
