/// <reference types="vite/client" />

// Ambient types for Vite-injected globals.
//
// Pulls in `import.meta.env` (including `ImportMetaEnv`/`ImportMeta`) so
// `src/lib/constants.ts` can read `import.meta.env.VITE_*` without a
// `@ts-ignore`. See vite.config.ts for the `define` entries.
