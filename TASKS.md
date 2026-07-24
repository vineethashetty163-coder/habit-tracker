# Habit Tracker — Build Progress

## Step 1: Scaffold project structure
- [x] Create root folder structure (backend/, frontend/)
- [x] Backend skeleton: FastAPI app boots with `/health` endpoint
- [x] PostgreSQL 16 installed natively via Homebrew (`brew services`), `habit_tracker` DB + `habit_user` role created
- [x] Frontend skeleton: Next.js 15.5.21 (App Router, TS, Tailwind) via create-next-app
- [x] shadcn/ui initialized in frontend
- [x] .gitignore at root
- [x] Verify: backend starts (`/health` OK), frontend starts (HTTP 200), Postgres running + reachable via psycopg2

**Environment notes (this machine):**
- System Node was v16.14.0 (too old for Next.js). Installed `nvm` + Node 20.20.2 as default, system Node untouched.
- No Docker/Homebrew/Postgres pre-existed. Installed Homebrew (user ran manually, needed real TTY for sudo), then `postgresql@16` as a brew service — dropped the original docker-compose.yml plan.
- `/etc/hosts` on this machine has `127.0.0.1 localhost` / `::1 localhost` commented out (corporate VPN/IT tooling), so "localhost" doesn't resolve at all. Fixed by binding Postgres to `listen_addresses = '127.0.0.1'` and using `127.0.0.1` (not `localhost`) everywhere in DB connection strings.

## Step 2: Backend — DB models + auth
- [x] SQLAlchemy models: User, Habit, HabitLog (`db/models.py`)
- [x] Alembic setup + initial migration (tables verified live in Postgres via `\dt`/`\d users`)
- [x] Password hashing + JWT utilities (`core/security.py`)
- [x] POST /auth/register
- [x] POST /auth/login
- [x] GET /auth/me
- [x] Wired into `main.py` via `app.include_router(auth.router)`
- [x] Verified end-to-end with curl: register, duplicate email, login (correct/wrong/nonexistent), protected endpoint (no token/valid/garbage)
- [x] Automated test suite: `backend/tests/test_auth.py`, 13 tests, all passing (`pytest tests/ -v`)

**Dependency fix:** `passlib==1.7.4` (unmaintained since 2020) is incompatible with `bcrypt>=4.1`'s stricter validation — pinned `bcrypt==4.0.1` in `requirements.txt` to resolve. See `LEARNING_GUIDE.md` for the full tradeoff discussion (pin vs. upgrade vs. drop passlib).

**Known gaps, deliberately deferred (not silently skipped):** no account revocation/deactivation (`is_active` column doesn't exist yet), no login rate limiting, no refresh-token rotation.

## Step 3: Backend — Habits + Stats
- [x] GET /habits (list with current streak)
- [x] POST /habits (create)
- [x] PUT /habits/{id} (edit)
- [x] DELETE /habits/{id}
- [x] POST /habits/{id}/complete (toggle today's completion — marks if not done, unmarks if already done)
- [x] Streak calculation logic (`services/streaks.py`, isolated + unit tested)
- [x] GET /stats/weekly (per-day completion counts + overall completion rate)
- [x] Ownership enforced on every habit endpoint — 404 (not 403) for another user's habit, to avoid leaking which ids exist
- [x] Wired into `main.py`
- [x] Verified end-to-end via curl: create, list, complete toggle on/off, update, weekly stats, cross-user 404, unauthenticated 401
- [x] Automated tests: `test_habits.py`, `test_stats.py`, `test_streaks.py` — 15 new tests, all passing (28 total)

## Step 4: Frontend — Auth pages
- [x] `lib/api.ts` — typed fetch wrapper (also includes habit/stats calls, built ahead for Step 5)
- [x] AuthContext (token + user state, `localStorage`, revalidates via `/auth/me` on mount)
- [x] /register page + form (shadcn Card/Input/Label/Button)
- [x] /login page + form
- [x] Route guard (`RequireAuth` client component — redirects to /login if no valid token)
- [x] `/dashboard` placeholder page behind the guard (real content in Step 5)
- [x] Root `/` redirects to `/dashboard` or `/login` based on auth state
- [x] `NEXT_PUBLIC_API_URL` via `.env.local` / `.env.local.example`
- [x] TypeScript compiles clean (`npx tsc --noEmit`), all routes return 200, no dev-server errors
- [x] Manually verified in browser by user: register → dashboard → logout → login → dashboard, refresh persists session, incognito redirects to /login

**Note on browser testing:** no Claude in Chrome extension or Playwright available this session (user deferred Playwright install until frontend MVP is complete, correctly noting it's a testing tool, not a build dependency). Verification for this step relied on TypeScript compilation, dev-server logs, and manual browser testing by the user rather than automated browser testing.

## Step 5: Frontend — Dashboard
- [x] Habit list (fetch from /habits)
- [x] Create habit dialog
- [x] Edit habit dialog
- [x] Delete habit (with confirmation)
- [x] Mark-complete toggle button
- [x] Streak badge per habit
- [x] Weekly stats summary view
- [x] TypeScript/ESLint clean, all routes 200, no dev-server errors

**Design overhaul (user-directed, after the functional MVP was built and confirmed working):**
- [x] Full violet/pink/purple visual redesign of the dashboard: 4 animated stat tiles, day-circle weekly progress row, redesigned habit cards (icon avatars, tiered streak badges 🌱/🔥/🥉/🥈/🥇/💎 with thresholds 0/7/14/30/90/365 days), confetti on complete/create/milestone/70%-weekly-goal, dark mode toggle (`next-themes`)
- [x] Login/register pages redesigned to match: two-column hero (headline + 3 feature cards) + glassmorphic auth card, floating-label inputs, gradient buttons, brief "Welcome"/"Welcome back" transition screen before landing on the dashboard
- [x] Typography pass: heading/stat-number scale, `Card`/`Button` base style refinements (spacing, elevation, hover states)
- [x] New dependencies: `framer-motion`, `canvas-confetti`, `next-themes`
- [x] Theming implemented by overriding shadcn's existing CSS variables (not new component-level colors), so every existing component picked it up automatically

**Bugs found and fixed during the redesign:**
- [x] **Font not applying (Geist).** Two stacked bugs: (1) `next/font`'s CSS variable was defined on `<body>` but consumed on `<html>` — an ancestor can't see a descendant's custom property, so it silently fell back to the system font. Fixed by moving the font variable class to `<html>`. (2) Tailwind v4's `@theme inline` substitutes values at compile time rather than emitting a reusable variable, so the mapping had to go through Tailwind's actual override hook (`--default-font-family`) rather than a competing rule of uncertain cascade priority. Verified by fetching and inspecting the actual compiled CSS, not just asserting the fix worked.
- [x] **`[object Object]` error messages.** `apiFetch` passed FastAPI's `detail` field straight into the error message. Hand-written `HTTPException`s return a string `detail` (fine), but Pydantic 422 validation errors return an *array* of error objects, which JS stringifies to `[object Object]`. Fixed with an `extractErrorMessage()` helper handling both shapes. (Found and fixed via a forked `/btw` side-task; verified independently afterward by tracing both real backend response shapes — 401 and 422 — through the fixed function by hand.)

**Note on browser testing:** still no Claude in Chrome/Playwright this session — verification relies on TypeScript/ESLint, dev-server logs, compiled-CSS inspection for the font bug, and manual review by the user.

## Step 6: End-to-end local run
- [x] Backend + frontend + Postgres running together
- [x] Full automated backend suite re-run clean (28/28) immediately before the manual pass, to rule out regressions from the Step 5 redesign work
- [x] Full API-level journey re-verified with a brand-new account (not reused test data): register → login → create habit → complete → streak (0→1) → weekly stats (correct day + total + rate) → habit list → `/me` (no `hashed_password` leak) → delete
- [x] TypeScript + ESLint clean on the frontend immediately before the run
- [x] Full flow manually tested by the user in browser: register → "Welcome" transition → dashboard → create habit → complete (confetti) → streak badge + weekly circle update → logout → login → "Welcome back" transition — confirmed smooth end to end
- [x] No integration issues found

## Step 7: Git, GitHub, Deployment
- [x] git init + initial commit (`ab08cc1`) — local git identity set per-repo (Vineetha / vineethashetty163@gmail.com), not global
- [x] Pushed to GitHub: **https://github.com/vineethashetty163-coder/habit-tracker** (public)
- [x] Deploy backend + managed Postgres (Render, via `render.yaml` blueprint) — **https://habit-tracker-api-9acn.onrender.com**
- [x] Deploy frontend (Vercel) — **https://frontend-one-self-23.vercel.app**
- [x] CORS updated to allow the deployed frontend origin (`CORS_ORIGINS` in `render.yaml`)
- [x] Verified live URL end-to-end: register → login → create habit → complete (streak 0→1) against the real deployed backend + Postgres, with the actual Vercel origin header, mirroring exactly what the deployed frontend does

**A real deployment issue hit and fixed:** Render defaulted to Python 3.14, on which `pydantic-core` (a compiled/Rust-backed dependency) failed to build. Pinned to Python 3.12.5 (matching local dev) via both a `PYTHON_VERSION` env var in `render.yaml` and a `backend/.python-version` file, for redundancy across how different tooling detects the version.

**A real trust-but-verify moment:** the Vercel CLI reported being signed in without any authorization step visible to the assistant — flagged and confirmed with the user before proceeding, rather than assumed safe.

**Full lifecycle now complete:** Local Development → Git → GitHub → Deployment → Live URL, exactly as originally scoped.

---
*This file is updated after each completed step.*
