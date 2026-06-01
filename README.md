# FieldBoard

Test commit from OpenClaw.

## Phase 1 web scaffold

This repo now starts as a root Vite React TypeScript app for the FieldBoard web editor.

```bash
npm install
npm run dev
npm run build
```

Firebase client configuration is read only from `VITE_FIREBASE_*` variables. Copy `.env.example` to `.env.local` for local development and fill in client-safe web app values only. Do not add Firebase service-account or admin keys to this app.

Next-phase editor note: the future board editor should document and implement empty-slot anchor bulk creation with direction `위`/`아래` and a count such as `5`; it is not implemented in this Phase 1 scaffold.
