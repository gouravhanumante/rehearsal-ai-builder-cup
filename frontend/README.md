# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  # Rehearsal frontend
  {
  React and TypeScript app for the Rehearsal distributor demo. The current workflow uses sample data only; it does not call a backend or external services.
    extends: [
  ## Development

  ```sh
  npm install
  npm run dev
  ```
      // Alternatively, use this for stricter rules
  ## Checks
      // Optionally, add this for stylistic rules
  - `npm test` — deterministic distributor planning rules
  - `npm run lint` — ESLint
  - `npm run build` — TypeScript and production build

  ## Source layout
    ],
  - `src/components/` — page and domain component groups
  - `src/design-system/` — reusable primitives, semantic tokens, and design-system notes
  - `src/data/` — sample facts and plan types
  - `src/domain/` — deterministic calculations and focused tests
])
