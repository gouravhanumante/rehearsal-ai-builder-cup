# Rehearsal — Progress Tracker

## Status summary
- Project status: distributor UI/planner and live local Gemini integration implemented; workspace modes and cloud persistence pending
- Theme direction: Retail & Commerce
- Demo hero: Distributor
- Architecture direction: TypeScript/Node + AI Studio API key; Cloud Run/Firebase deployment pending
- Code status: sample workflow and local Ask AI integration verified; cloud deployment and receipt evidence flow pending
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

## In progress
- review provisional distributor sample quantities, dates, and estimated costs together
- finalize the exact V1 demo flow and confirm hackathon theme

## Pending
- configure the Gemini key as a Cloud Run secret for deployment
- cloud save for Real workspaces (sign-in + Firestore); spreadsheet import; add orders/shipments and report a delay on a shipment
- evidence-backed two-stage receipt review/apply flow for Real workspace stock (Demo supplier/stock/order edits done)
- Firestore sample-workspace implementation, then Firebase Hosting and Cloud Run deployment
- expand planning rules only after the sample assumptions are confirmed
- approval/apply workflow
- deployment and public demo setup
- deck, demo video, and submission assets

## Current working assumption
Demo remains the sample distributor workflow. Real mode will be a separate browser-local workspace; users explicitly submit questions/receipts to Gemini, review its proposed interpretation, inspect calculated consequences, then separately approve applying changes. No live business data is connected and no external action is sent.
