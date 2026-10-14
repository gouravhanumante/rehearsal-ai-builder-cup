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

## In progress
- review provisional distributor sample quantities, dates, and estimated costs together
- finalize the exact V1 demo flow and confirm hackathon theme
- settle the minimal business data model

## Pending
- configure the Gemini key as a Cloud Run secret for deployment
- finish separate Demo/Real workspace selector and Real browser-local storage
- evidence-backed two-stage receipt review/apply flow
- Gemini receipt image extraction with proposed field confirmation
- Firestore sample-workspace implementation, then Firebase Hosting and Cloud Run deployment
- expand planning rules only after the sample assumptions are confirmed
- approval/apply workflow
- deployment and public demo setup
- deck, demo video, and submission assets

## Current working assumption
Demo remains the sample distributor workflow. Real mode will be a separate browser-local workspace; users explicitly submit questions/receipts to Gemini, review its proposed interpretation, inspect calculated consequences, then separately approve applying changes. No live business data is connected and no external action is sent.
