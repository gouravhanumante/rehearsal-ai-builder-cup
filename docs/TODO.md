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
- [ ] implement disruption intake flow
- [ ] create evidence-backed extraction confirmation, followed by separate apply confirmation
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
- [ ] add receipt upload with Gemini extraction and privacy notice
- [ ] add Gemini-backed disruption extraction with proposed-update confirmation
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
