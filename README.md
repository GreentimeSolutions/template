# Youcognito (Youcog)

TanStack Start + React 19 + Vite app, exported from an AI app builder.

## Run locally
```bash
npm install
npm run dev        # http://localhost:8080
npm run build      # production build (outputs .vercel/output)
npm run typecheck
```

## Environment
Copy `.env.example` to `.env`. Nothing is required for a basic run; without
`DATABASE_URL` the app falls back to an embedded PGLite database. For production
set `DATABASE_URL` (Postgres, e.g. Neon/Supabase) so data persists, plus
`BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` if sign-in is enabled.

## Deploy (Vercel)
1. Import this repo at https://vercel.com/new.
2. Framework preset: Other (build command `npm run build`; output is generated in `.vercel/output`).
3. Add env vars from `.env.example` as needed, then Deploy.
