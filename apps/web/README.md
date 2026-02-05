# Web app

Next.js App Router layout that matches the provided UI screenshot, with a tiny demo chat interaction.

## Run locally (from repo root)

```bash
npm install
npm run dev:api
npm run dev:web
```

Frontend expects backend at `http://localhost:4000` by default.  
If needed, copy `apps/web/.env.example` to `apps/web/.env.local` and update `NEXT_PUBLIC_API_BASE_URL`.

## Notes

The earlier static prototype is kept in `legacy-static/`.
