# Frontend Design System

The UI is organized into domain components under `src/components/` and shared primitives under `src/design-system/`.

## Foundations
- `tokens.css` owns semantic colors, typography, control radii, spacing, and focus-ring tokens.
- `primitives.css` owns shared button and status-badge styles.
- `index.css` owns global font loading and browser reset rules.

## Components
- `Button.tsx` provides primary, secondary, and quiet variants. Use Lucide icons through its `icon` prop where an icon improves scanning or action recognition.
- `StatusBadge.tsx` provides success, warning, danger, and neutral states. Choose tone from the state, not the component's location.
- Domain-specific components belong under `components/layout/`, `components/operations/`, or `components/planning/`.

## Conventions
- Keep business calculations in `src/domain/`, sample facts in `src/data/`, and display-only composition in `src/components/`.
- Prefer semantic token references over new one-off colors and sizes.
- Keep repeated visual states on the shared primitives; add a new primitive only when it is reused or makes behavior meaningfully clearer.
- The current data and cost estimates are illustrative demo assumptions, not confirmed business rules.