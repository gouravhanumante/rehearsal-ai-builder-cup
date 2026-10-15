# Rehearsal frontend

React and TypeScript client for the distributor workflow. It calls the local TypeScript API at `/api`; the Gemini key belongs only in the backend environment.

## Run locally

Use two terminals.

```sh
cd backend
cp .env.example .env
```

Add your Gemini API key directly to `backend/.env`, then start the API:

```sh
npm install
npm run dev
```

In the second terminal:

```sh
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://localhost:8080`.

## Checks

- `npx tsc -b` — type check
- `npm run lint` — ESLint
- `npm test` — Vitest, including the shared planner tests in `../shared/**` (`vite.config.ts`)
- `npm run build` — TypeScript and production build
- `npm run test:rules` — Firestore security rules against the local emulator (`rules-tests/`). Needs Java 21+; with Java 17 installed, point `JAVA_HOME` at Android Studio's bundled Java: `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" npm run test:rules`

To deploy, run the **Deploy frontend (Firebase Hosting + Firestore rules)** workflow from GitHub Actions (`.github/workflows/deploy-frontend.yml`). It runs these checks, tests the Firestore rules on the emulator (Java 21), builds, and publishes `dist/` and `firestore.rules` together, using `firebase.json` from the repository root. Its service account needs `roles/firebasehosting.admin` and `roles/firebaserules.admin`.

## Code layout

- `src/WorkspaceScreen.tsx` — the workspace: sections, saving changes, approving plans
- `src/components/` — start screen, Setup, navigation, data views, recovery options, editors, import dialog, Ask AI panel
- `src/presentation/` — wording and formatting (option labels, supplier messages, Setup steps, paging)
- `src/import/` — reads csv/xlsx in the browser, matches columns, builds the import preview
- `src/cloud/` — Google sign-in and saving the own workspace to Firestore (`cloudStore.ts`), splitting it into documents under 1 MiB (`chunks.ts`), publishing a version only if nobody saved since (`publish.ts`)
- `src/data/` — sample in localStorage (`demoStore.ts`), the guest business in IndexedDB (`realStore.ts`), saving a guest business to the account without losing it (`moveGuest.ts`), backup/restore, server plan check
- `src/domain/` — facts sent to Ask AI (`assistantContext.ts`)
- `src/design-system/` — shared tokens and UI primitives
- `src/lib/` — small shared hooks: Escape to close (`useEscapeKey.ts`), keyboard focus in dialogs (`useDialogFocus.ts`)
- The planner itself is in `../shared/planner/`, shared with the backend.
