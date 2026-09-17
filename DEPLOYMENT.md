# CodeCoach — Backend Deployment (hosted, multi-tenant)

The extension talks to a hosted FastAPI backend backed by Postgres. This doc covers
deploying that backend and pointing the extension at it.

> Status: the backend is mid-migration to multi-tenant. Auth (device token) and the
> schema (`user_id` columns, `user_problems`) are in place; endpoint scoping is being
> rolled out (Phase 3). You can deploy today to validate infra against the already-scoped
> routes (`/auth/*`, `/problems/{id}`, `/problems/{id}/notes`).

## Prerequisites

- A Groq API key (server-side only — never shipped in the extension).
- A Render **or** Fly.io account. Both configs are in the repo.

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ (prod) | Postgres URL. `postgres://` and driver-less `postgresql://` are auto-normalized. Unset → SQLite (local/dev). |
| `GROQ_API_KEY` | ✅ | Server-side LLM key. Set as a secret; never commit. |
| `GROQ_MODEL` | – | Default `openai/gpt-oss-20b`. |
| `AI_DAILY_QUOTA_LIMIT` | – | Default `50`. |
| `RUN_MIGRATIONS` | – | `1` (default) runs `alembic upgrade head` on container boot. Set `0` when a release/pre-deploy step owns migrations (recommended for >1 instance). |
| `WEB_CONCURRENCY` | – | uvicorn workers (default `2`). |
| `EXTRA_CORS_ORIGINS` | – | Comma-separated extra web origins. |
| `CHROME_EXTENSION_ID` | – | Pin CORS to your published extension id. Unset → any `chrome-extension://` origin is allowed (fine pre-launch). |

## Free stack (recommended): Render free web service + Neon Postgres + Groq

All three are $0 and sustainable. Render's own free Postgres **expires after 30 days**,
so the DB lives on **Neon** (free tier is persistent).

1. **Neon** — create a free project at [neon.tech](https://neon.tech). Copy the
   connection string (starts `postgresql://…`). This is your `DATABASE_URL`.
2. **Groq** — create a free API key at [console.groq.com](https://console.groq.com).
3. Push this repo to GitHub.
4. Render → **New + → Blueprint** → select the repo. It reads [`render.yaml`](render.yaml)
   and creates `codecoach-backend` (free Docker web service). No Render DB is provisioned.
5. In the service's **Environment**, set the secrets: `DATABASE_URL` (Neon),
   `GROQ_API_KEY` (Groq), and optionally `EXTRA_CORS_ORIGINS` / `CHROME_EXTENSION_ID`.
6. Deploy. Migrations run at boot (`RUN_MIGRATIONS=1`) — safe on the single free instance.
7. Verify: `curl https://<service>.onrender.com/health` → `{"status":"ok"}`.

> Free-plan caveat: the web service sleeps after ~15 min idle and cold-starts
> (~30–60s) on the next request. Fine for personal use; upgrade the plan later if
> you want it always-on. For a paid, always-on setup, switch `plan: free` → `starter`,
> set `RUN_MIGRATIONS=0`, and add `preDeployCommand: "alembic upgrade head"`.

## Option B — Fly.io

```bash
fly launch --no-deploy            # uses fly.toml
fly postgres create --name codecoach-db
fly postgres attach codecoach-db  # sets DATABASE_URL
fly secrets set GROQ_API_KEY=sk-...
fly deploy                        # release_command runs `alembic upgrade head`
curl https://codecoach-backend.fly.dev/health
```

## Migrations

Alembic owns the Postgres schema (SQLite dev uses `create_all`). See
[`backend/migrations/README.md`](backend/migrations/README.md). Every deploy runs
`alembic upgrade head`; add `alembic check` to CI to catch model/migration drift.

## Point the extension at the deployed backend

Two edits once you have the HTTPS URL (e.g. `https://codecoach-backend.onrender.com`):

1. **`extension/public/manifest.json`** — add the origin to `host_permissions`
   (MV3 requires host permission for the service worker to fetch it), and drop
   `http://localhost:8000/*` for production builds:
   ```json
   "host_permissions": ["https://leetcode.com/*", "https://codecoach-backend.onrender.com/*"]
   ```
2. **`extension/public/background.js`** — set the default:
   ```js
   let DEFAULT_BACKEND_URL = "https://codecoach-backend.onrender.com";
   ```
   (Users can still override via the stored `customBackendUrl`.) Then `npm run build`.

## Chrome Web Store submission checklist

- [x] **Icons** — 16/32/48/128 PNGs in `extension/public/icons/`, wired into
  `manifest.json` (`icons` + `action.default_icon`). Rebuild (`npm run build`) so
  they land in `dist/`.
- [ ] **Privacy policy URL** — required (the extension reads LeetCode history and
  sends code to a third-party LLM). Fill the `<CONTACT_EMAIL>` / `<BACKEND_URL>`
  placeholders in [PRIVACY_POLICY.md](PRIVACY_POLICY.md), then host it and paste the
  URL into the listing. Easiest: enable GitHub Pages, or use the rendered file URL
  `https://github.com/AnishaDhoot/CodeCoach/blob/main/PRIVACY_POLICY.md`.
- [ ] **Production `host_permissions`** — replace `http://localhost:8000/*` with your
  deployed HTTPS backend (see "Point the extension at the deployed backend" above).
- [ ] **Data-use disclosure** — in the Store dashboard's Privacy tab, declare that the
  extension handles "Website content" (user's code) and sends it to an AI service.
- [ ] **Screenshots + listing copy** — 1–5 screenshots (1280×800 or 640×400) of the
  overlay in action, a short + detailed description, and a category (Developer Tools).
- [ ] **Package** — zip the contents of `extension/dist/` (not the folder itself) and
  upload; or upload the unpacked `dist/` via the dashboard.

## Scaling notes

- **DB pooling** is on (`pool_pre_ping`, size 5 + overflow 10 per worker). On small
  Postgres plans, keep `WEB_CONCURRENCY` modest so total connections stay under the cap.
- **Migrations once**: with multiple instances, keep `RUN_MIGRATIONS=0` and rely on
  the release/pre-deploy step.
- Several read endpoints still load full tables and group in Python (`/problems/solved`,
  `/journal/weekly`, `/export/solved-csv`) — fine per-user, revisit with indexed
  `WHERE user_id = …` queries as data grows (tracked for the Phase-3 scoping pass).
- **Secrets**: `GROQ_API_KEY` lives only in the host's secret store. Never place it in
  the repo, the image, or the extension.
