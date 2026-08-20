# M2Y pairing service

This NestJS application is the narrow coordination boundary for Android identity registration and pairing. It persists public routing/pre-key metadata and opaque pairing packets only. It must never receive or log identity private keys, session keys, safety numbers, display names, message plaintext, or decrypted attachments.

Local development defaults to `127.0.0.1:3100` and `server/.data/pairing.sqlite`. Override these values with `M2Y_SERVER_HOST`, `M2Y_SERVER_PORT`, and `M2Y_SERVER_DATABASE_PATH`.

```powershell
pnpm --filter @m2y/server build
pnpm --filter @m2y/server test
pnpm --filter @m2y/server start
```

Database changes are explicit ordered migrations under `src/persistence/migrations.ts`. Production schema auto-sync and in-memory fallback are forbidden.
