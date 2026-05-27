// tests/setup-env.ts
// Loads .env.local into process.env before tests run.
// Required because vitest doesn't auto-load .env.local outside Next.js runtime.
import { config } from "dotenv";
import path from "node:path";

config({ path: path.resolve(__dirname, "../.env.local"), override: false });
