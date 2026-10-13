# Rehearsal — Progress Tracker

## Status summary
- Project status: initial distributor vertical slice implemented; integration work not started
- Theme direction: Retail & Commerce
- Demo hero: Distributor
- Architecture direction: proposed; backend stack remains to be confirmed
- Code status: frontend sample workflow and deterministic planner in progress
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
- Ask AI drawer designed as a preview; prompts are not sent until Gemini is connected
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
- backend project scaffolding and API
- persist the current sample data in Firestore
- AI extraction and structured output flow
- expand planning rules only after the sample assumptions are confirmed
- approval/apply workflow
- deployment and public demo setup
- deck, demo video, and submission assets

## Current working assumption
The first milestone is a working frontend-only sample: a distributor sees a confirmed shipment delay, reviews the affected orders and checked recovery options, and approves one internal plan. No live business data is connected and no external action is sent.
