# Rehearsal — UX and Visual Guidelines

These are product-specific rules informed by established UX, accessibility, content, and human-AI guidance. They are not a visual template to copy. Rehearsal should look like a polished operations product with its own brand.

## Reference guides
- [Nielsen Norman Group: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) — keep frequently needed information visible, reveal secondary detail on request, and label expansion controls clearly. Keep facts users compare together on the same screen.
- [Material 3: Typography](https://m3.material.io/styles/typography/overview) — use a consistent type hierarchy and tokenized roles rather than many unrelated font sizes.
- [IBM Carbon: Content](https://www.carbondesignsystem.com/guidelines/content/overview/) — use sentence case, consistent terms, and concise, actionable interface text.
- [WCAG 2.2: Contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html), and [Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) — text contrast, meaning that is not color-only, and usable pointer targets.
- [Google People + AI Guidebook](https://pair.withgoogle.com/guidebook/) — keep people in control, explain AI limits and outputs, and handle failures clearly.

## Visual direction
- Build a confident, contemporary logistics tool, not a government-service look or generic AI chat page.
- Use a recognizable brand accent, restrained surfaces, clear type roles, and strong dark-on-light contrast.
- Use warning color, a recognizable icon, and a plain-language label together. Color is never the only signal.
- Keep repeated elements consistent through the shared tokens and components in `frontend/src/design-system/`.

## Page hierarchy
- Use persistent desktop navigation for Overview, Orders, Inventory, Suppliers, and Rehearsals; use a labeled bottom bar on mobile.
- Each navigation item opens its own view. Do not only change the selected label while leaving the same dashboard content in place.
- Overview is a summary, not a duplicate of every section: show the active disruption, the two decision-driving impact numbers, the most urgent affected orders, and one checked response. Full order lists, stock by location, supplier records, and all plan alternatives belong in their own views.
- Show the active disruption first, with its source and updated arrival.
- Put the two decision-driving impact measures next: exposed cases and affected orders.
- Keep the two most urgent orders visible; label the control that reveals the rest.
- Keep recovery choices together so people can compare impact, cost, and required facts without navigating back and forth.
- Each option must show its state, why it has that state, its consequence, and the action available. Do not rely on status color alone.

## Plain-language rules
- Prefer everyday wording: “North Hub can accept 8 transfers today” over “receiving capacity constraint.”
- Say what is known, missing, or blocked, and why. Avoid unexplained technical terms such as “feasibility” when “can this work?” is clearer.
- Make button labels describe the result: “View all 3,” “Approve plan,” “Ask AI.”
- Keep numbers with their units and dates with their time zone when relevant.

## Ask AI behavior
- The assistant may explain current facts and suggest candidate recovery ideas.
- It must distinguish confirmed facts, assumptions, and unknowns.
- Every candidate action goes through deterministic planner checks; a generated suggestion is not a feasible plan until checked.
- The user remains in control of approval and any business-data change.
- When the AI service is unavailable, say plainly that the prompt was not sent. Never display a fake answer or imply an external action occurred.

## Accessibility and usability checks
- Aim for at least 44 CSS px for primary touch actions; WCAG 2.2 AA's minimum target-size criterion is 24 by 24 CSS px or an applicable spacing exception.
- Meet WCAG contrast requirements: 4.5:1 for normal text and 3:1 for large text.
- Check that status is understandable in grayscale and with assistive technology.
- Test desktop and narrow mobile widths for clipped labels, overlapping content, and horizontal scrolling.
- Ask a non-technical user to explain what happened, which orders are affected, why each option has its status, and what happens when they approve it.
