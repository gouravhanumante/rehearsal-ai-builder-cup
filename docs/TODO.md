# Rehearsal — TODO and Priority Backlog

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
- [ ] spreadsheet import (CSV and Excel): column matching with Gemini suggestions, preview, confirm, saved as "Imported from file"
- [ ] cloud save for Real workspaces (Google sign-in, Firestore, owner-only rules); fallback is local save + backup
- [ ] search and paging for hundreds of locations/orders
- [ ] before real users: decide whether Gemini sees sample rows from imported files (free Gemini tier lets Google use content; test data only). Keep one switch to send headers only.
- [x] create evidence-backed extraction confirmation, followed by separate apply confirmation (Demo edits)
- [x] calculate sample impact and receiving-capacity feasibility
- [x] show plan options, conditional facts, and rejection reason
- [ ] let the user select a planning objective and compare options against it
- [ ] persist business changes only after user confirmation
- [ ] prepare action drafts after approval
- [ ] connect synthetic Demo workspace to Firestore
- [ ] deploy working prototype on Google Cloud stack
- [ ] create demo script and 3-minute flow

## Priority P1 — important for a solid hackathon demo
- [ ] add separate Demo and Real workspace selector
- [ ] persist Real workspace facts and evidence in browser-local storage only
- [x] add document upload with Gemini extraction and privacy notice (supplier quotes, stock sheets, orders)
- [ ] add Gemini-backed disruption extraction with proposed-update confirmation
- [ ] known gaps (updated 2026-10-14 after the scale-up), deliberately left out:
  - the delayed shipment itself, transfer quotes, and new transfer routes are not editable on screen yet (transfer arrival and receiving limits are)
  - no Add order / add order line / delete anything
  - "check for mistakes" is a human review of the listed typed-in details; there is no AI cross-check
  - orders not affected by the delay are not checked against the late stock that will cover them
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
