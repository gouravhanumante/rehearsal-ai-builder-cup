import { defineConfig } from 'vitest/config'

// Runs against the Firestore emulator only: npm run test:rules
export default defineConfig({ test: { include: ['rules-tests/**/*.test.ts'], testTimeout: 20_000 } })
