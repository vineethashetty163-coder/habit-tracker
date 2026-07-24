# Habit Tracker Learning Guide

*A living textbook for this project. Updated after every major milestone — never replaced, only extended and refined.*

*Last updated: Step 6 COMPLETE — full end-to-end local run verified: 28/28 backend tests re-run clean, the complete API journey re-verified with a brand-new account, and the full browser flow (register → dashboard → complete → confetti → logout/login) confirmed smooth by the user. Steps 1–6 are now done; only Step 7 (Git/GitHub/deployment) remains.*

---

## How to read this guide

Each concept below is explained twice: once in plain, mechanical terms, and once as a simple analogy. The analogies are a memory aid, not a substitute for the mechanical explanation — in an interview or a code review, you want the mechanical version.

Three analogies recur throughout this guide, so they're worth memorizing up front:

- **Engine = the road.** A paved, ready-to-use route to the database's "city." Expensive to build, built once, reused forever.
- **Session = one conversation/errand using that road.** You drive over, do some business (read/change data), then either keep the results (`commit`) or throw them away (`rollback`), then head home (`close`). A new errand always gets a new car (a new Session), never a shared one.
- **Base = the blueprint catalog.** Not a building, not a road — a book of architectural plans that describes what buildings (tables) *should* exist. The city planning office (Alembic) reads this catalog to decide what to actually build.

---

## Project Architecture

### The three-tier system

```
┌─────────────────┐        HTTP/JSON         ┌──────────────────┐        SQL          ┌──────────────┐
│   Next.js        │  ──────────────────────▶ │   FastAPI         │ ──────────────────▶ │  PostgreSQL   │
│  (localhost:3000) │ ◀────────────────────── │  (localhost:8000)  │ ◀────────────────── │  (127.0.0.1:  │
│  browser UI       │      JSON responses      │  business logic +  │     rows/results     │   5432)       │
└─────────────────┘                          │  auth + validation │                     └──────────────┘
                                              └──────────────────┘
```

Three independent pieces, each with one job:

- **PostgreSQL** stores the data. Habits, users, and completions are relational — a user owns many habits, a habit has many completion logs, streak math needs ordered date queries. A relational database with real joins and constraints is the natural fit.
- **FastAPI** owns all business logic: password hashing, JWT issuance/verification, streak calculation, ownership checks ("can this user touch this habit?"). This must live on the server — a browser can never be trusted to self-report "yes I'm logged in" or "yes this streak is 5."
- **Next.js** is purely a UI + API client. It renders pages and holds the JWT after login, but never talks to Postgres directly — the browser has no business holding database credentials.

### Why three separate services instead of one Next.js app with API routes?

This was a deliberate choice, not the only valid one. Next.js *can* host its own backend via API routes, which would mean one less server to run locally and no CORS to configure. We chose the split anyway because:

- It demonstrates a *real* frontend/backend separation for portfolio purposes — visible, not simulated.
- The backend becomes reusable by any future client (a mobile app, a CLI) without change.
- It's independently deployable (frontend → Vercel, backend → its own host) and independently testable.

The tradeoff, honestly stated: more moving parts. Two servers to run locally, and CORS configuration that a single Next.js app wouldn't need at all.

### Why PostgreSQL specifically

Habit tracking data has real relational structure and constraints:
- One user → many habits (foreign key)
- One habit → many completion log rows (foreign key)
- "No completing the same habit twice on the same day" (a database-enforced unique constraint, not just an app-level check)
- Streak math and weekly stats are naturally expressed as ordered/grouped SQL queries

A relational database enforces these rules at the source of truth, rather than hoping every code path remembers to check them.

### Layer responsibility table

| Layer | Owns | Never does |
|---|---|---|
| Next.js (frontend) | Rendering, holding the JWT, calling the API | Talk to Postgres directly, verify passwords, decide if a JWT is valid |
| FastAPI (backend) | Auth, validation, business rules, DB access | Render HTML/UI |
| PostgreSQL (database) | Durable storage, referential integrity, constraints | Know anything about HTTP, JWTs, or business rules |

---

## Configuration

### `backend/app/core/config.py` — centralizing environment-dependent values

```python
class Settings(BaseSettings):
    database_url: str = "postgresql://habit_user:habit_pass@127.0.0.1:5432/habit_tracker"
    secret_key: str = "dev-secret-change-me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

settings = Settings()
```

**Problem it solves:** without this, the database URL and JWT secret would be hardcoded and copy-pasted across every file that needs them — painful the moment dev and production values differ (and they always do: a different DB host, a real secret instead of `"dev-secret-change-me"`).

`pydantic-settings`'s `BaseSettings` automatically reads matching environment variables (or a `.env` file) and overrides the defaults above. Every other file that needs configuration imports the single `settings` object — one source of truth.

### `.env` vs `.env.example`

- `.env` — the real file, holds actual local secrets, is **git-ignored** (see `.gitignore`), never committed.
- `.env.example` — a template showing *which* variables are needed, safe to commit, contains no real secrets.

This is a standard industry pattern: it lets a new developer (or future-you on a new machine) know exactly what to configure without ever seeing a real secret in version control.

### CORS — why the backend must explicitly allow the frontend's origin

Browsers enforce the **same-origin policy**: a page loaded from `http://localhost:3000` is, by default, blocked from reading responses from `http://localhost:8000` — even though both are "localhost," the port makes them different origins.

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

This middleware is the backend explicitly telling browsers: "requests from `localhost:3000` are allowed to read my responses." Without it, every fetch from the frontend would be silently blocked by the browser itself, not by our code.

### Real-world configuration gotcha hit this session: "localhost" isn't always safe to assume

While setting up the database, we discovered this machine's `/etc/hosts` has the standard `127.0.0.1 localhost` and `::1 localhost` entries **commented out** (an artifact of corporate VPN/IT tooling that also added many `foundit.in`/`monsterindia.com` entries to the file). This meant the hostname `"localhost"` couldn't resolve to anything at all — not a Postgres-specific bug, a machine-wide one.

**Evidence trail that led to this diagnosis:**
1. Postgres's own log said: `could not translate host name "localhost" ... nodename nor servname provided, or not known` — a `getaddrinfo()` failure, not a Postgres bug.
2. `/etc/hosts` showed the loopback entries prefixed with an extra `#`.
3. `scutil --dns` showed the fallback DNS servers were corporate DNS — which has no reason to know "localhost" (that's supposed to resolve locally, never hit the network).

**The fix, applied in two places** (both needed — fixing only one leaves the other half broken):
- **Server-side:** `postgresql.conf`'s `listen_addresses` changed from the default `'localhost'` to the numeric literal `'127.0.0.1'` — Postgres needs *some* address to bind its listening socket to at startup, before any client ever connects.
- **Client-side:** `DATABASE_URL` in both `config.py` and `.env.example` changed from `localhost:5432` to `127.0.0.1:5432` — otherwise the *client* (our FastAPI app, via psycopg2) would hit the identical resolution failure trying to connect.

**Why this matters as a lesson:** a numeric IP literal (`127.0.0.1`) never needs hostname resolution at all — it bypasses `/etc/hosts` and DNS entirely, which is exactly why it sidesteps a broken resolver. This is a good general debugging instinct: when "localhost" misbehaves, try the numeric loopback address to isolate whether the problem is the *service* or the *machine's name resolution*.

---

## Database

### The data model

```
User                          Habit                          HabitLog
─────────                     ─────────                     ─────────
id (PK)                       id (PK)                       id (PK)
email (unique)      ──1:N──▶  user_id (FK → User.id)        habit_id (FK → Habit.id)  ◀──1:N──
hashed_password                name                           completed_date (Date)
created_at                     description                    UNIQUE(habit_id, completed_date)
                                created_at
```

`HabitLog` is deliberately **one row per completion**, not a boolean flag on `Habit`. This is what makes streak calculation possible (count consecutive dates going backward from today) and weekly stats a simple date-range query. The `UNIQUE(habit_id, completed_date)` constraint prevents double-completing the same habit twice in one day — enforced by Postgres itself, not just application logic.

### Engine, Session, and Base — three objects, three jobs, three lifetimes

This is one of the most commonly confused parts of SQLAlchemy, because all three feel like "the database connection" at a glance. They aren't the same thing at all:

| Object | Analogy | Real job | Lifetime |
|---|---|---|---|
| **Engine** | The road | Owns the connection pool to Postgres, knows the Postgres dialect | Created **once**, lives the whole process |
| **Session** | One conversation/errand on that road | Tracks changes during one unit of work, borrows a connection, commits or rolls back | Created and destroyed **once per HTTP request** |
| **Base** | The blueprint catalog | A registry of table definitions (`Base.metadata`), used at class-definition time and by Alembic | Never "runs" — it's a design-time bookkeeping object |

```python
# backend/app/db/base.py
engine = create_engine(settings.database_url)                          # the road — built once
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)  # the car-rental agency
Base = declarative_base()                                                # the blueprint catalog — empty until models.py fills it in
```

**Lifecycle, spelled out:**

```
Process startup (import time — happens ONCE)
  engine = create_engine(settings.database_url)     lives for the whole process
  SessionLocal = sessionmaker(bind=engine)           a factory, not a session itself
  Base = declarative_base()                          empty registry, filled in by models.py

Per incoming HTTP request (deps.py::get_db)
  db = SessionLocal()      ← Session borrows a connection from engine's pool
  yield db                 ← router handler runs db.query()/db.add()/db.commit()
  db.close()               ← connection returned to the pool

Design/migration time (not at runtime)
  db/models.py     class User(Base): ...     registers a table into Base.metadata
  alembic/env.py   target_metadata = Base.metadata   diffed against live DB to generate migrations
```

### Why not just use psycopg2 directly everywhere?

You could — but you'd be hand-building everything SQLAlchemy gives for free:

- **No pooling** — every query would open a fresh TCP connection unless you built pooling yourself.
- **Hand-written SQL strings with manual parameter binding** — easy to get wrong, and getting it wrong means SQL injection.
- **Rows come back as plain tuples** (`row[2]`) instead of typed, named objects (`habit.name`).
- **No relationship traversal** — every join hand-written, every time.
- **No migration autogeneration** — Alembic's autogenerate needs a declarative metadata registry (`Base.metadata`) to diff against; raw psycopg2 gives it nothing to diff.

For a tiny app this is survivable. Once streak calculations need joins across `Habit`/`HabitLog` and the schema needs to evolve safely over time, the ORM layer earns its cost.

### How a Python class becomes a Postgres table

This happens in two genuinely separate phases — conflating them is the source of most confusion:

**Phase 1 — class definition (pure Python, touches no database):**

```python
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True)
```

1. SQLAlchemy's declarative machinery builds a `Table` object named `"users"` from every `Column(...)` and registers it into `Base.metadata.tables["users"]` — schema *description*, not schema *creation*. No SQL has been sent anywhere.
2. Each `Column` attribute is rewritten into an `InstrumentedAttribute` — a descriptor. On an instance (`some_user.email`), it reads/writes tracked state; on the class (`User.email == "x"`), it produces a SQL expression usable in queries. A `Mapper` links the class to the Table, which is what a `Session` consults to turn `session.add(user)` into an `INSERT` and a query result row back into a `User` instance.

**Phase 2 — schema applied to Postgres (a separate, explicit step):**

None of Phase 1 creates anything in the actual database. The real `CREATE TABLE` only runs when something calls `Base.metadata.create_all(engine)`, or — what we'll do — when **Alembic** diffs `Base.metadata` against the live database and applies a migration. This decoupling is deliberate: changing a Python model doesn't silently mutate a production database.

### `Column`, `ForeignKey`, `relationship()` — three different jobs

| Construct | What it is | What Postgres sees |
|---|---|---|
| `Column(...)` | Describes one column: type, nullability, uniqueness, defaults | The literal column in `CREATE TABLE` |
| `ForeignKey("users.id")` | A **real** database constraint: "this value must reference a row in `users.id`" | An actual `FOREIGN KEY ... REFERENCES` constraint — Postgres itself rejects a dangling reference, whether you connect via SQLAlchemy, raw `psql`, or anything else |
| `relationship("Habit", back_populates=...)` | A **Python-only** convenience, no column, no constraint | **Nothing at all.** Postgres has no concept of this |

**Why define `relationship()` at all, if Postgres only understands the `ForeignKey`?**

Postgres's job ends at "store rows, enforce constraints" — it has no concept of "give me this user's habits as a nested object graph." `relationship()` exists purely so application code can navigate that graph naturally:

1. **Natural traversal** — streak calculation needs "this habit's logs, ordered by date." With the relationship, that's `habit.logs`; without it, a hand-written JOIN plus manual row-mapping, repeated everywhere it's needed.
2. **Cascade behavior in Python-land** — `cascade="all, delete-orphan"` means deleting a `Habit` via the ORM automatically deletes its `HabitLog` children too.
3. **Query optimization hooks** — later, `selectinload`/`joinedload` let us fetch a user's habits and their logs efficiently instead of one query per habit (the N+1 problem).

**Our actual models:**

```python
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    habits = relationship("Habit", back_populates="owner", cascade="all, delete-orphan")

class Habit(Base):
    __tablename__ = "habits"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    owner = relationship("User", back_populates="habits")
    logs = relationship("HabitLog", back_populates="habit", cascade="all, delete-orphan")

class HabitLog(Base):
    __tablename__ = "habit_logs"
    __table_args__ = (UniqueConstraint("habit_id", "completed_date", name="uq_habit_completed_date"),)
    id = Column(Integer, primary_key=True)
    habit_id = Column(Integer, ForeignKey("habits.id"), nullable=False)
    completed_date = Column(Date, nullable=False)
    habit = relationship("Habit", back_populates="logs")
```

### Alembic — turning models into real tables, safely and with history

`Base.metadata` only exists in Python memory until something tells Postgres to actually create the tables. The naive option, `Base.metadata.create_all(engine)`, only knows how to create tables that don't exist yet — it has no concept of *altering* a table that already has data (e.g. adding a `NOT NULL` column safely requires a default or backfill step, which is a decision only a human or a written migration script can make). Alembic solves this with versioned, reviewable migration scripts.

**How Alembic discovers the models:**

```
db/models.py            defines User/Habit/HabitLog as subclasses of Base
      │  (class definition time — registers each table into Base.metadata)
      ▼
db/base.py::Base.metadata     the in-memory "this is what the schema SHOULD look like" catalog
      │
alembic/env.py            imports settings, Base, AND models (importing models.py is what
      │                    actually populates Base.metadata — without that import, the
      │                    classes would never register, and autogenerate would see nothing)
      │  target_metadata = Base.metadata
      ▼
alembic revision --autogenerate
      │  Alembic connects to the LIVE database, introspects its ACTUAL current schema,
      │  diffs it against target_metadata (the "should be" catalog)
      │  → writes a new file into alembic/versions/ containing only the DIFFERENCE
      ▼
alembic/versions/54f130134d52_....py     upgrade() applies the diff, downgrade() reverses it
      ▼
alembic upgrade head
      │  Alembic checks the `alembic_version` table (its own bookkeeping row in Postgres,
      │  tracking which migration ran last) and runs every migration between the current
      │  version and "head" (the latest), in order
      ▼
Postgres now has the real users/habits/habit_logs tables
```

**Anatomy of the generated migration file** (`alembic/versions/54f130134d52_create_users_habits_habit_logs_tables.py`):

- `revision` / `down_revision` — this migration's own id and its parent's id, forming an ordered chain (like a linked list, or git commits each pointing at their parent).
- `op.create_table(...)` — one call per table, each `sa.Column(...)` a direct translation of the matching `Column(...)` in `models.py`.
- `op.create_index(...)` — a separate operation from `create_table`, because `email = Column(String, unique=True, ..., index=True)` actually requests two things (a column, and an index) — Alembic represents them as two DDL operations.
- `sa.ForeignKeyConstraint(...)` — generated directly from `ForeignKey("users.id")` etc.
- `upgrade()` / `downgrade()` — `downgrade()` is the exact inverse, but tables are dropped in **reverse** creation order (children before parents) — you can't drop `users` while `habits.user_id` still references it.

**Why version-controlled files instead of regenerating from models every time:** a fresh `create_all()` has no way to express "how to get from the old shape to the new one" — it can only create what's missing. Migrations are incremental diffs, checked into git, reviewable like any other code change, and reversible via `downgrade()`.

**Verifying it actually worked** — not just "the command didn't error":
```
psql -h 127.0.0.1 -p 5432 -d habit_tracker -c "\dt"       # lists all tables — confirms users/habits/habit_logs
                                                            # PLUS alembic_version (Alembic's own bookkeeping row)
psql -h 127.0.0.1 -p 5432 -d habit_tracker -c "\d users"   # full column/constraint/index detail for one table
```
Cross-checking `\d users`'s output line-by-line against `models.py` is the real verification — e.g. `models.py` line 11 (`id = Column(Integer, primary_key=True)`) should produce both a `PRIMARY KEY` constraint *and* an auto-generated sequence default (`nextval('users_id_seq'...)`) that was never written explicitly anywhere — SQLAlchemy infers "auto-incrementing" from `primary_key=True` on an `Integer` automatically.

---

## Security

### Why hashing and JWT logic live in standalone functions, not inside `auth.py`

`core/security.py` contains pure functions — no `Request`, no DB `Session`, no `HTTPException`. Primitives in, primitives out. This buys:

- **Testability in isolation** — `assert verify_password("x", hash_password("x"))` needs no test client, no DB, no running server.
- **Reuse without duplication** — `routers/auth.py` uses these to issue tokens on register/login; `deps.py`'s `get_current_user` calls `decode_access_token` on *every* protected route we'll ever add. If this logic lived inline in route handlers, `deps.py` would need to import route-handler code (backwards layering) or the logic would get copy-pasted.
- **One place to change the algorithm** — bcrypt → argon2, or HS256 → RS256, changes exactly one file.

### bcrypt — hashing, not encryption

**Analogy:** making a smoothie. You can always blend a *new* smoothie from a fruit and compare it to a stored reference smoothie — but you can never un-blend a smoothie back into the original whole fruit. Hashing is one-way by design; there is no "decrypt" operation.

Two properties matter:
- **Adaptive cost** — bcrypt has a tunable work factor (rounds), so as hardware gets faster, the cost can increase to keep brute-forcing slow. A fast general-purpose hash (like SHA-256) is the *wrong* tool here — it's deliberately fast, which is exactly what an attacker wants for guessing passwords at scale.
- **Built-in salt** — every hash embeds a random salt, so two users with the same password get different stored hashes, defeating precomputed rainbow-table attacks.

**Verifying without ever decrypting:** the stored hash (e.g. `$2b$12$saltsalt...hashhash`) encodes the salt and cost factor it was created with. To verify, bcrypt extracts that salt/cost, reruns the *exact same computation* on the candidate password just typed, and compares the two resulting hashes byte-for-byte. This is "recompute and compare," never "decrypt and compare" — the original password is never reconstructed at any point.

**Our actual cost factor:** `CryptContext(schemes=["bcrypt"], deprecated="auto")` doesn't specify a rounds count, so passlib uses bcrypt's standard default — **12 rounds**, i.e. 2^12 (4096) internal iterations per hash. That `12` is exactly what appears in a real stored hash: `$2b$12$...` — the `12` right there in the string is the cost factor, read back out on every verification. This is a deliberate default, not an unconfigured gap — it's a reasonable balance for 2026-era hardware; raising it (e.g. to 13–14) would be a one-line change here if it ever needed to be stronger.

**A real incident hit while testing this:** the very first `/auth/register` call crashed with a `500` and a traceback rooted inside **passlib's own internal self-test** (`detect_wrap_bug`), not in our code. Cause: `passlib==1.7.4` (its last-ever release, from 2020 — the project is effectively unmaintained) predates a behavioral change introduced in `bcrypt>=4.1`, which now raises `ValueError` for inputs its self-test wasn't written to expect. Since we hadn't pinned `bcrypt` directly, `pip` had silently resolved the newest one (`5.0.0`) as a transitive dependency of `passlib[bcrypt]`.

Three options existed, worth naming explicitly since this is a common real-world situation, not specific to us:
| Option | Verdict |
|---|---|
| Upgrade `passlib` | **Not available** — 1.7.4 is already the newest release on PyPI |
| Pin `bcrypt` down to a version passlib was tested against | **Chosen** — `bcrypt==4.0.1`, added explicitly to `requirements.txt`. Smallest possible change; keeps every line of `security.py` exactly as designed |
| Drop `passlib`, call the `bcrypt` library directly | A reasonable modern alternative (increasingly common since passlib's stall), but a real rewrite of `hash_password`/`verify_password` — deferred as a deliberate choice, not implemented here |

The lesson generalizes: an unpinned transitive dependency (we pinned `passlib`, but not the `bcrypt` it pulls in) can silently jump major versions between environment setups and break something that "hasn't changed" in our own code at all.

### JWT — a signed, not encrypted, claim of identity

**Analogy:** a letter in a wax-sealed envelope, but the letter itself is written in plain, readable ink. Anyone who intercepts it can open and read the contents — the wax seal doesn't hide anything. What the seal *does* prove is that the letter genuinely came from the sender and wasn't altered in transit. Breaking the seal and re-sealing it convincingly requires the sender's unique stamp (the secret key), which an attacker doesn't have.

**Format:** `base64url(header).base64url(payload).signature`

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9   .   eyJzdWIiOiI0MiIsImV4cCI6MTc1MzM1MDAwMH0   .   4f8a2e...signature
──────────── Header ────────────           ──────────── Payload ────────────           ── Signature ──
```

- **Header** — `{"alg": "HS256", "typ": "JWT"}` — tells the verifier which algorithm to check the signature with.
- **Payload** — `{"sub": "42", "exp": 1753350000}` for us: `sub` is the user id, `exp` is the Unix expiry. **Only base64url-encoded, not encrypted** — decodable by anyone (paste it into jwt.io). Never put secrets in it.
- **Signature** — `HMAC-SHA256(header + "." + payload, SECRET_KEY)`. Recomputed by the server on every request; if it doesn't match, the token was tampered with or wasn't issued by us. Change even one byte of the payload and the signature no longer matches.

**Why sign instead of encrypt?** The problem being solved is *"prove this came from us and wasn't altered,"* not *"hide this payload from whoever holds it."* A signature (HMAC) gives that cheaply and fast. The payload (a user id and an expiry) isn't secret in the first place — encrypting it would add cost and key-management complexity for a confidentiality guarantee we don't need.

**A small but real type detail — why `sub` is cast to a string:** JSON only has a handful of primitive types (string, number, bool, null, object, array), and by long-standing JWT convention, the `sub` (subject) claim is always a string — even when the underlying value, our `User.id`, is a Postgres integer. That's why `create_access_token` is called as `create_access_token({"sub": str(user.id)})` — encoding the int as a string before it goes into the token — and why `get_current_user` does the reverse on the way out: `db.query(User).filter(User.id == int(user_id)).first()`, casting the decoded string claim back to an int before comparing it against an integer primary key. Skipping either cast wouldn't crash immediately, but `User.id == "42"` (string) against an integer column is exactly the kind of subtle bug this explicit casting avoids.

### Why we don't store login sessions in Postgres

The entire point of a JWT is statelessness: the server verifies it using only its secret key and the token itself — no "is this session still active" database query. That means every protected request costs at most one DB query (reloading the `User` row for fresh data), and there's no session table to create, expire, or garbage-collect. For this MVP's scope (register, login, and a client-side "logout" that just discards the token), that's the simplest thing that works.

**The honest tradeoff:** whoever holds a JWT can act as that user until it expires — that's inherent to "Bearer" tokens (possession *is* authorization). We can't invalidate one specific stolen token early without reintroducing state (a revoked-token table, or short-lived tokens with server-tracked refresh tokens) — deliberately out of scope for the MVP, but a real limitation worth naming, not an oversight. This is why the expiry is bounded (24h) rather than infinite, and why production deployment must only ever transmit these over HTTPS.

### Full flow: password entry → protected endpoint

```
 1. User types email+password in the Next.js login form, submits.
 2. Frontend: POST /auth/login  { email, password }
 3. routers/auth.py::login — validates body against schemas/user.py::UserLogin
 4. deps.py::get_db — opens a Session, handler queries User by email
 5. security.py::verify_password(candidate, user.hashed_password) — bcrypt recompute-and-compare
 6. security.py::create_access_token({"sub": str(user.id)}) — builds header+payload, HMAC-signs with SECRET_KEY
 7. Handler returns { access_token, token_type: "bearer" }
 8. Frontend stores the token (AuthContext — Step 4, not yet built)
 9. Later: GET /habits  with header  Authorization: Bearer <token>
10. deps.py::get_current_user — extracts token, calls security.py::decode_access_token(token)
11. decode_access_token recomputes the signature + checks exp; on failure → 401 Unauthorized, stops here
12. On success: extracts sub (user id) → db.query(User) loads the CURRENT row fresh from Postgres
13. That User is injected as current_user into the route handler, which runs the actual business logic
```

Step 11's dependency (`get_current_user`) is written exactly once and reused by every protected route we add from here on — habits CRUD, stats, everything.

### Two more security patterns from `routers/auth.py`

- **Defense in depth on duplicate email:** the register handler checks for an existing email before inserting, giving a clean `400 "Email already registered"`. But the *actual* guarantee is the `unique=True` constraint on `User.email` in the database — which also protects against a race where two requests both pass the pre-check before either commits. The app-level check is a UX nicety; the DB constraint is the real backstop.
- **Identical error for "no such user" and "wrong password":** login deliberately returns the same `401 "Incorrect email or password"` either way. Distinguishing them ("no account with that email" vs. "wrong password") would let an attacker enumerate which emails have accounts on the system — a known, real vulnerability class.

---

## FastAPI

### `APIRouter` — grouping related endpoints

```python
router = APIRouter(prefix="/auth", tags=["auth"])
```

`prefix` means every route in this file is defined as just `/register`, but actually lives at `/auth/register`. `tags` groups them together in the auto-generated Swagger docs (`/docs`). This is why `main.py` only needs one line (`app.include_router(auth.router)`) to plug the whole file in — thin composition at the top level.

### `Depends()` — dependency injection

**Analogy:** a coffee shop where an assistant (`get_db`) fetches a fresh cup for every single order automatically and washes it up afterward, so the barista (the route handler) never fetches or washes cups themselves — they just ask for one via `Depends()` and it's there.

Dependencies can depend on other dependencies — FastAPI resolves the whole graph per request, and **shares** one result across everything in that request that asks for it. Example: `get_current_user` itself declares `Depends(oauth2_scheme)` and `Depends(get_db)` as inputs; if three parts of handling one request all need `get_db`, they get the *same* Session, not three separate ones.

### `OAuth2PasswordBearer` — extracting the token, and documenting the requirement

```python
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")
```

Pulls the raw token string out of `Authorization: Bearer <token>`, rejecting the request with a proper `401` if the header is missing or malformed. It also documents the requirement in `/docs` (the padlock icon + "Authorize" button). `tokenUrl` is pure documentation metadata for Swagger's "try it out" flow — it plays no role in our actual verification logic.

### Why route handlers stay thin

Every handler we've written orchestrates calls to `schemas` → `security` → `deps`/DB, but contains no cryptographic or session logic of its own. `GET /me` is the extreme example:

```python
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user
```

Almost nothing happens in this function body — deliberately. All the real work (extract token → decode → verify signature/expiry → load fresh `User` → raise `401` on any failure) already happened inside the `get_current_user` dependency before this line ever runs.

### `response_model` — an enforced output allowlist

`response_model=UserResponse` on a handler that returns a full ORM `User` object (which *does* carry `hashed_password`) means only the fields `UserResponse` declares (`id`, `email`, `created_at`) ever reach the JSON output. This isn't a manual "remember to strip the password" step — it's structural: there's no code path for an undeclared field to escape.

---

## Schemas

### Why the API can't accept or return SQLAlchemy models directly

A SQLAlchemy model is tied to a live session, can trigger lazy-loading DB queries just by attribute access, carries internal state (`_sa_instance_state`), and has **no built-in input validation** — nothing on the `User` class enforces "email must look like an email."

**Analogy:** a hotel's guest check-in form vs. the hotel's full internal guest record. Guests fill out a limited form (name, dates) — they don't get to directly edit the hotel's internal database record (billing overrides, staff notes) just because both "represent a guest." The form (a Pydantic schema) is the safe, limited surface; the internal record (the ORM model) is the full internal representation.

### The security problems this prevents

- **Mass assignment** — if a handler did `User(**request_body)`, a client controls every key in that JSON. Nothing would stop `{"email": "a@b.com", "password": "x", "hashed_password": "attacker-value", "id": 1}` from directly overwriting fields that should only ever be set by our own server-side logic.
- **Leaking internal fields on output** — returning a raw `User` object as JSON would serialize `hashed_password` straight into any response that includes a user (e.g. `/auth/me`). Even hashed, that's a real exposure — it enables offline brute-force attempts, and turns any future weakening of the hash scheme into an immediate incident.
- **No stable API contract** — the database schema and the public API shape are different concerns. Rename a column internally, and every API consumer breaks unless something decouples "how it's stored" from "how it's exposed."

### Why four separate schemas instead of one shared shape

| Schema | Direction | Fields | Why not merge it with another |
|---|---|---|---|
| `UserCreate` | request (register) | `email`, `password` | `password` must never appear in anything returned to a client |
| `UserLogin` | request (login) | `email`, `password` | Same shape today, but semantically distinct ("credentials to check" vs. "data to create a row from") — free to diverge later, e.g. stricter password rules on creation only |
| `UserResponse` | response | `id`, `email`, `created_at` | Deliberately excludes `password`/`hashed_password` — the safe public view |
| `Token` | response (login/register) | `access_token`, `token_type` | Not about the user at all — a different concept (the auth artifact) entirely |

**Why `Token` carries no user info at all.** It would be easy to bolt `email` or `id` onto the login response "while we're there" — but that blurs two separate questions: *"here is your credential"* (`Token`) vs. *"here is who you are"* (`UserResponse`, via `GET /me`). Keeping them separate means the frontend has one consistent way to fetch the current user (`/me`) whether it just logged in or is resuming a session from a previously stored token — no special-cased "user info that came bundled with login" vs. "user info fetched later" to keep in sync.

### Complete data flow (register endpoint)

```
JSON Request                  {"email": "a@b.com", "password": "secret123"}
     ↓
Pydantic Schema (UserCreate)  validates shape BEFORE any DB/business logic runs —
                               invalid email or missing password → 422, request stops here
     ↓
SQLAlchemy Model (User)       handler builds: User(email=schema.email,
                                                    hashed_password=hash_password(schema.password))
                               the plaintext password never becomes a column value —
                               it's transformed by security.py first
     ↓
PostgreSQL                    INSERT INTO users (...) VALUES (...) RETURNING id, created_at
     ↓
SQLAlchemy Model (User)       db.commit() + db.refresh(user) — object now has DB-generated
                               id and created_at populated
     ↓
Pydantic Response Schema      UserResponse reads ONLY id, email, created_at off that object
(UserResponse)                 (via from_attributes) — hashed_password is sitting right there on
                               the same Python object but has no declared field to travel through
     ↓
JSON Response                  {"id": 7, "email": "a@b.com", "created_at": "2026-07-24T12:00:00Z"}
```

### `from_attributes` and `EmailStr`

`model_config = ConfigDict(from_attributes=True)` on `UserResponse` is what allows a Pydantic schema to be built directly from an ORM object's attributes (`user.id`, `user.email`, ...) instead of requiring a plain dict.

`EmailStr` gives real email-format validation (not just "is this a string"), at the cost of one extra dependency: `email-validator`, added to `requirements.txt` and installed alongside this file.

---

## Business Logic: Streaks & Weekly Stats

### The streak algorithm — why it needs a "yesterday" exception

`services/streaks.py` follows the same isolation pattern as `core/security.py`: a pure function, no DB or HTTP awareness, taking a `set[date]` and returning an `int`.

```python
def calculate_current_streak(completed_dates: set[date], today: date | None = None) -> int:
    if today is None:
        today = date.today()

    if today in completed_dates:
        cursor = today
    elif (today - timedelta(days=1)) in completed_dates:
        cursor = today - timedelta(days=1)
    else:
        return 0

    streak = 0
    while cursor in completed_dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak
```

The naive version — "just count consecutive dates ending at today" — would report a streak of `0` for a user who completed a habit every day up through yesterday but hasn't opened the app yet today. That's wrong: the day isn't over, so the streak isn't broken yet. The fix is the `elif` branch: if today has no entry but yesterday does, start counting from *yesterday* instead — the streak is still "alive," just not yet extended for today. Only a genuine gap (neither today nor yesterday present) actually breaks it to `0`.

**Why `today` is a parameter, not `date.today()` called internally:** identical reasoning to why `hash_password`/`verify_password` are standalone functions — a function that silently reads the real system clock is nearly impossible to unit test deterministically. `test_streaks.py` passes fixed `date(2026, 7, 24)` values and asserts exact outcomes; a version hardcoded to `date.today()` couldn't do that without manipulating the system clock in tests.

### Computed response fields — when NOT to use `from_attributes`

`UserResponse` (Step 2) used `model_config = ConfigDict(from_attributes=True)` to read its fields straight off an ORM object. `HabitResponse` deliberately does **not** do this:

```python
class HabitResponse(BaseModel):
    id: int
    name: str
    description: str | None
    created_at: datetime
    current_streak: int   # not a column on Habit — nothing to read via from_attributes
```

`current_streak` isn't stored anywhere — it's computed fresh from `habit.logs` on every request. So the router builds the response explicitly instead:

```python
def _to_response(habit: Habit) -> HabitResponse:
    completed_dates = {log.completed_date for log in habit.logs}
    return HabitResponse(
        id=habit.id, name=habit.name, description=habit.description,
        created_at=habit.created_at, current_streak=calculate_current_streak(completed_dates),
    )
```

This reuses the exact `relationship()` (`habit.logs`) set up in `db/models.py` back in Step 2 — the payoff of that design choice showing up now: no manual JOIN needed to get a habit's completion history.

### Ownership enforcement — 404, not 403, continued from Step 2

Every habit endpoint (`update`, `delete`, `complete`) calls a shared helper:

```python
def _get_owned_habit(db: Session, habit_id: int, user: User) -> Habit:
    habit = db.query(Habit).filter(Habit.id == habit_id, Habit.user_id == user.id).first()
    if habit is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found")
    return habit
```

Notice the query filters by **both** `id` and `user_id` in one call — it doesn't fetch the habit and *then* check ownership as a second step. If Bob requests Alice's habit id, this query simply returns no row, and Bob gets the identical `404 "Habit not found"` he'd get for an id that doesn't exist anywhere. This is the same anti-enumeration principle as the login error in Step 2 (`test_cannot_access_or_modify_another_users_habit` in `test_habits.py` verifies exactly this): a `403 Forbidden` would confirm to Bob that habit `#57` exists and belongs to *someone* — information he has no business learning.

### Weekly stats — filling gaps, not just summing what exists

The tricky part of `GET /stats/weekly` isn't the SQL aggregation — it's that a `GROUP BY completed_date` query only returns rows for days that have *at least one* completion. A day with zero completions simply doesn't appear in the result set, but the response needs to show `0` for it explicitly (so a frontend chart has all 7 days to plot, not gaps).

```python
counts_by_date = {row[0]: row[1] for row in rows}   # only days WITH completions

daily_completions = []
cursor = start_date
while cursor <= today:
    daily_completions.append(DailyCompletion(date=cursor, completed_count=counts_by_date.get(cursor, 0)))
    cursor += timedelta(days=1)
```

Walking the full 7-day range explicitly and using `.get(cursor, 0)` is what turns "days with data" into "every day, defaulting to zero" — a general pattern any time a report needs a fixed calendar range regardless of which days actually have activity.

`completion_rate` is `total_completions / (habit_count * 7)` — the denominator is "how many completions would be possible if every habit were completed every day this week," guarded against division by zero when a user has no habits yet.

---

## Frontend Architecture

### Why the route guard is a client component, not Next.js middleware

Next.js middleware runs on the server (or edge) *before* any client JavaScript executes — which means it can only inspect things available at that point, like cookies or headers on the incoming request. Our JWT lives in `localStorage`, which is a browser-only API with no server-side equivalent — middleware simply cannot read it. So `RequireAuth` (`components/require-auth.tsx`) has to be a client component that checks auth *after* the page has hydrated:

```tsx
"use client";
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!isLoading && !token) router.replace("/login");
  }, [isLoading, token, router]);
  if (isLoading || !token) return null;
  return <>{children}</>;
}
```

This is a direct, honest tradeoff of the localStorage-based JWT design chosen back in Step 2 for simplicity over httpOnly cookies: a real user with JavaScript disabled, or a very fast crawler, would briefly see a blank page rather than being redirected before any HTML renders. For an MVP behind a login wall, that's an acceptable cost — a production app that cared about this would move to cookie-based auth specifically to unlock server-side/middleware route protection.

### `AuthContext` — why it revalidates on every page load instead of trusting the stored token

On mount, `AuthProvider` doesn't just check "is there a token in localStorage" — it sends that token to `GET /auth/me` and only treats the user as logged in if that call succeeds:

```tsx
useEffect(() => {
  const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!storedToken) { setIsLoading(false); return; }
  api.me(storedToken)
    .then((fetchedUser) => { setToken(storedToken); setUser(fetchedUser); })
    .catch(() => localStorage.removeItem(TOKEN_STORAGE_KEY))
    .finally(() => setIsLoading(false));
}, []);
```

This is the frontend mirror of a principle from Step 2: never trust a stored credential at face value — verify it against the source of truth. A token sitting in `localStorage` could be expired, or the backend's secret could have rotated — `/auth/me` is what actually confirms the token still means something *right now*, exactly like `get_current_user` re-fetching the `User` row from Postgres instead of trusting the JWT payload alone. `isLoading` exists specifically to give this round-trip time to complete before `RequireAuth` makes any redirect decision — without it, a page would flash a redirect to `/login` on every reload, even for a validly logged-in user, before the revalidation check had a chance to finish.

### `lib/api.ts` — one place that knows about the backend

Every backend call goes through a single `apiFetch` helper that attaches the `Authorization` header when a token is provided and throws a typed `ApiError` (carrying the HTTP status and the backend's own `detail` message) on any non-OK response:

```ts
if (!response.ok) {
  const body = await response.json().catch(() => ({}));
  throw new ApiError(response.status, extractErrorMessage(body));
}
```

This is why the login form can show the *exact* backend message ("Incorrect email or password") rather than a generic "something went wrong" — the specific, deliberately-generic error message chosen in Step 2 for anti-enumeration reasons flows all the way through to the UI unchanged. Centralizing this in one file also means `NEXT_PUBLIC_API_URL` (the backend's address) is configured in exactly one place, read from `.env.local` — the frontend's equivalent of `backend/.env` for keeping environment-specific values out of the code.

### Case study: the `[object Object]` bug

The original version of that snippet was simpler and looked reasonable: `body.detail ?? "Request failed"`. It broke in production-like use, and the failure mode is worth understanding because it's a general trap, not a one-off typo.

FastAPI's `detail` field isn't one shape — it's two, depending on *how* the error was raised:

```
Hand-written HTTPException (e.g. wrong password):
  { "detail": "Incorrect email or password" }              ← detail is a STRING

Pydantic validation failure (e.g. malformed email, a 422):
  { "detail": [{ "type": "value_error", "msg": "value is not a valid email address...", ... }] }
                                                              ← detail is an ARRAY of objects
```

`body.detail ?? "Request failed"` only guards against `null`/`undefined` — an array is neither, so for the 422 case the raw array of objects got passed straight into `new ApiError(status, arrayOfObjects)`. Later, wherever that message rendered as text, JavaScript's default `Object`-to-string coercion kicked in — which is *literally* the string `"[object Object]"`. This is a real, common failure mode: **a truthy value can still be the wrong type**, and `??`/`||` fallbacks only catch nullish or falsy values, not "wrong shape."

**The fix** — `extractErrorMessage(body: unknown): string` — explicitly checks the shape before trusting it:

```ts
function extractErrorMessage(body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (typeof item === "string" ? item : (item as { msg?: string })?.msg))
      .filter((msg): msg is string => Boolean(msg));
    if (messages.length > 0) return messages.join(", ");
  }
  return "Request failed";
}
```

**How this was actually found and fixed:** this session uses a `/btw` side-task mechanism that can fork off an isolated agent to investigate a tangent without derailing the main conversation. That fork traced the bug to this exact function, applied the fix, and reported back — but flagged that its sandbox couldn't run `npx tsc --noEmit` to confirm the fix typechecked. The main thread then independently verified it: ran the typecheck itself (clean), and — rather than trusting the fix by inspection alone — pulled the *actual* live backend responses for both the 401 and 422 cases via curl and traced each one through the function by hand before confirming it fixed. The general lesson: a subagent's own confidence in a fix is not the same as verification; re-checking against real data is what actually closes the loop.

### Case study: the font that silently never loaded

While polishing typography for the redesign, the custom Geist font simply never appeared — even after what looked like the right fix. It took two separate corrections to actually resolve, and both are genuinely useful CSS lessons.

**Bug 1 — a custom property defined in the wrong place in the DOM tree.** `next/font`'s `Geist({ variable: "--font-geist-sans" })` only *defines* that CSS variable on whatever element carries its generated class name. The original layout put that class on `<body>`:

```tsx
<html>
  <body className={geistSans.variable /* defines --font-geist-sans HERE */}>
```

But `globals.css` set `font-family: var(--font-sans)` on `<html>` — the *parent* of `<body>`. CSS custom properties inherit **downward only** (parent → child), never upward. So `<html>`'s own `font-family` declaration tried to read a variable that, from `<html>`'s perspective, didn't exist yet — it silently fell back to nothing, no error, no warning, just the browser default font. The fix: move the variable class onto `<html>` itself, so the element that *uses* the variable is the same element that *defines* it.

**Bug 2 — Tailwind v4's `@theme inline` doesn't emit a normal variable.** Even after fixing the DOM placement, the intuitive-looking mapping `--font-sans: var(--font-geist-sans)` inside `@theme inline` didn't reliably win, because `inline` mode **substitutes the value directly at every place it's used**, rather than emitting `--font-sans` as its own reusable custom property elsewhere in the stylesheet. That meant there could be two separate compiled rules both targeting `font-family` on the same element (Tailwind's own built-in default, and this custom mapping), and reasoning about which one wins by reading source code was genuinely unreliable — it depends on cascade-layer and emission order inside Tailwind's own compiled output, not something visible in the source files. The robust fix was to stop fighting the cascade and use Tailwind's own designed override hook instead — `--default-font-family` — so there was only **one** rule for `font-family`, correctly parameterized, not two rules competing.

**Verification, not assertion:** rather than declaring this fixed and moving on, the actual compiled CSS was fetched and inspected directly — confirming `<html>` really carried the variable class, that the variable's declared value really was `'Geist', 'Geist Fallback'`, and that Tailwind's base rule had actually compiled down to reference that variable as its primary value. This is the same discipline as the `[object Object]` case: a fix isn't confirmed by re-reading the source you just wrote, only by inspecting the *actual output* the browser will receive.

---

## Frontend Visual Design System

### Theming through variables, not per-component colors

The entire violet/pink/purple redesign was implemented by overriding shadcn's existing CSS custom properties (`--primary`, `--secondary`, `--accent`, `--card`, `--ring`, `--chart-1`..`5`, etc.) in `globals.css`, rather than hand-picking colors on individual components. Every component built back in Steps 4–5 (`Button`, `Card`, `Badge`, `Dialog`) already reads these variables — so redefining them once cascades everywhere automatically, with zero changes to the components themselves. This is the same "design system supplies the parameters" principle used for the dashboard's weekly-stats chart back in Step 5's first pass: consume the existing tokens, don't invent new ad-hoc colors per component.

### Streak badge tiers as a pure function

`lib/streak-badge.ts`'s `getStreakBadge(streak: number)` follows the identical pattern as `services/streaks.py` on the backend: a pure function, given a number, returning a fixed shape — no component coupling, trivially testable. The six tiers (🌱 New, 🔥 7 Day, 🥉 Bronze, 🥈 Silver, 🥇 Gold, 💎 Legendary at 0/7/14/30/90/365 days) are defined as a single ordered array checked in descending order, so adding a new tier later is a one-line insertion, not a rewrite of branching logic.

### Confetti as a deliberately narrow API

`lib/confetti.ts` doesn't expose the underlying `canvas-confetti` library directly — it exposes four named intents (`celebrateHabitCreated`, `celebrateHabitCompleted`, `celebrateMilestone`, `celebrateWeeklyGoal`, plus `celebrateAuthSuccess`), each a small, tasteful burst (not full-screen), each with `disableForReducedMotion: true` baked in. This means every call site expresses *why* it's celebrating, not *how* — and accessibility (respecting `prefers-reduced-motion`) is enforced centrally rather than something every call site has to remember.

### Dark mode via `next-themes`, not a hand-rolled toggle

A manually-built dark mode toggle (read `localStorage`, add/remove a class, track state) is a well-known source of a specific bug: the server has no idea which theme the user last chose, so the first paint can flash the wrong theme before JavaScript corrects it (a "flash of incorrect theme"). `next-themes` solves exactly this with a small inline script injected before hydration. `ThemeToggle`'s `mounted` guard (rendering nothing meaningful until `useEffect` confirms the client has mounted) exists for the same reason as `AuthProvider`'s `isLoading` — avoiding a decision being rendered before enough information exists to make it correctly.

### Why an in-memory SQLite database for tests, not the real Postgres

`tests/conftest.py` overrides the `get_db` dependency to point at a fresh, isolated SQLite database held entirely in memory, instead of the real `habit_tracker` Postgres database:

```python
engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
```

- **Isolation** — tests never touch (or pollute) real development data, and don't require Postgres to be running at all to execute.
- **Speed** — an in-memory database has no disk I/O and no network round-trip.
- **`StaticPool` is the detail that makes this actually work** — SQLite's default behavior creates a brand-new, separate in-memory database *per connection*, which would mean the app's request-handling code and the test's own verification queries (`db_session` fixture) could end up looking at two different, empty databases. `StaticPool` forces every connection in the test process to share the exact same one.

**The honest tradeoff:** SQLite isn't Postgres — it doesn't enforce every constraint identically (e.g., type coercion is looser) and doesn't test Postgres-specific behavior. What it *does* verify is our application logic: does the right validation run, does the right status code come back, does the right field get filtered out. For genuinely Postgres-specific behavior (e.g. a tricky migration), the real database (already verified manually via `psql` above) is the source of truth — the two approaches are complementary, not substitutes for each other.

### The 13 tests, and what each one guards against

| Test | Prevents |
|---|---|
| `test_register_success` | The happy path silently breaking |
| `test_register_duplicate_email_rejected` | Two accounts ending up with the same email (would break login, which looks up by email) |
| `test_register_invalid_email_rejected` | Malformed data reaching the database at all |
| `test_register_missing_password_rejected` | A missing field crashing as a raw `500` instead of a clean `422` |
| `test_password_never_stored_in_plaintext` | The single most important invariant here — catches a future change that accidentally stores the raw password instead of its hash, even if every other test still passes |
| `test_login_success` | The happy path silently breaking |
| `test_login_wrong_password_rejected` | The core authorization boundary — a correct email with a wrong password must be rejected |
| `test_login_nonexistent_email_gives_same_error_as_wrong_password` | A regression that makes the two error messages diverge, which would leak which emails have accounts (enumeration) |
| `test_me_without_token_rejected` | An accidentally-unprotected route |
| `test_me_with_valid_token_returns_user_without_password` | Both the happy path AND the exact leak `response_model` exists to prevent — `hashed_password` must never appear |
| `test_me_with_garbage_token_rejected` | Malformed input crashing the server instead of a clean `401` |
| `test_me_with_expired_token_rejected` | `exp` silently not being enforced — tokens working forever |
| `test_me_with_tampered_token_rejected` | A forged/edited claim (e.g. a changed `sub`) being trusted — proves the signature check is real |

### What a production system would add that isn't here yet

- **Revoked/deactivated accounts** — not testable today because there's no `is_active` column on `User` at all; would need a schema change (migration) plus a check inside `get_current_user`, not just a new test.
- **Rate limiting on login** — nothing currently throttles repeated password guesses against `/auth/login`.
- **Refresh-token rotation** — we only issue one longish-lived access token; production systems typically pair short-lived access tokens with rotating refresh tokens.
- **Token replay after logout** — not applicable under the current stateless design (logout is purely client-side), so there's no server-side state to test against yet.

These are named explicitly as deferred, not silently missing.

### Step 3 additions — 15 more tests (28 total)

| Test file | What it covers | Why it matters |
|---|---|---|
| `test_streaks.py` (5 tests) | The streak algorithm in complete isolation, with fixed dates — no completions, consecutive run, "yesterday done, today not yet" still active, gap before yesterday breaks it, gap further back stops the count | Pins down the exact edge case (the "yesterday exception") that's easy to get subtly wrong and hard to notice from casual manual testing |
| `test_habits.py` (7 tests) | Create/list/update/delete, complete-toggle both directions, auth required, **cross-user isolation** (`test_cannot_access_or_modify_another_users_habit`), streak reflecting seeded historical `HabitLog` rows | The cross-user test is the most important one here — it's the automated proof that the 404-not-403 ownership check actually blocks a second user, not just a manual spot-check |
| `test_stats.py` (3 tests) | Empty stats for a new user, correct counts from seeded historical logs, **stats only reflect the requesting user's own habits** | Without the last test, a regression that accidentally dropped the `Habit.user_id == current_user.id` filter in the stats query would leak one user's completion counts into another's dashboard — silently |

**A technique worth noting:** `test_streak_reflects_seeded_historical_logs` and the stats tests insert `HabitLog` rows directly via the `db_session` fixture with backdated `completed_date` values, rather than only exercising `POST /habits/{id}/complete` (which can only ever mark *today*). This is how multi-day behavior gets tested at all without literally waiting days between test runs — seed the database state directly, then verify the API's read path computes the right answer from it.

---

## Every File We've Built

For each file: **Purpose** · **Why it exists** · **Problem it solves** · **Who calls it** · **Who it calls** · **Lifetime** · **Request flow position** · **Key concepts**

### `backend/requirements.txt`
- **Purpose:** Pins every Python dependency and exact version.
- **Why it exists:** Reproducible installs — `pip install -r requirements.txt` gives the same environment on any machine.
- **Problem it solves:** "Works on my machine" drift between environments.
- **Who calls it:** `pip`, at environment-setup time.
- **Who it calls:** N/A.
- **Lifetime:** Edited whenever a new dependency is added (e.g. `email-validator` was added mid-session).
- **Request flow position:** Not part of runtime request flow — a setup-time artifact.
- **Key concepts:** Dependency pinning, reproducible builds.

### `backend/.env.example`
- **Purpose:** Documents which environment variables the app needs, with safe placeholder values.
- **Why it exists:** Lets a new environment be configured correctly without ever seeing a real secret in git.
- **Problem it solves:** Secrets leaking into version control; unclear required configuration.
- **Who calls it:** A human, copying it to `.env` on a new machine.
- **Who it calls:** N/A.
- **Lifetime:** Static reference; updated whenever a new config value is introduced.
- **Request flow position:** None — a template, not runtime code.
- **Key concepts:** 12-factor config, secrets hygiene.

### `backend/app/core/config.py`
- **Purpose:** Defines `Settings` (a `pydantic-settings` `BaseSettings`) and the single `settings` instance the whole app imports.
- **Why it exists:** One source of truth for `database_url`, `secret_key`, `algorithm`, token expiry — read once from `.env`/environment.
- **Problem it solves:** Hardcoded secrets/URLs scattered across files.
- **Who calls it:** `db/base.py` (for `database_url`), `core/security.py` (for `secret_key`, `algorithm`, expiry).
- **Who it calls:** The OS environment / `.env` file, via `pydantic-settings`.
- **Lifetime:** Instantiated once at import time; lives for the whole process.
- **Request flow position:** Read at process startup and whenever a dependent module needs a config value — not per-request.
- **Key concepts:** Centralized configuration, environment-based settings.

### `backend/app/main.py`
- **Purpose:** The FastAPI app entrypoint — creates `app`, registers CORS middleware, includes the auth router, exposes `/health`.
- **Why it exists:** Single place where the whole application gets assembled.
- **Problem it solves:** Without CORS middleware here, the browser blocks every frontend→backend request outright.
- **Who calls it:** `uvicorn app.main:app` (the ASGI server).
- **Who it calls:** `routers/auth.py` via `app.include_router(auth.router)` — this one line is what actually connects everything built in Step 2 to the outside world.
- **Lifetime:** Loaded once at server startup; the `app` object lives for the process.
- **Request flow position:** Every single incoming HTTP request passes through this app object and its middleware first.
- **Key concepts:** ASGI app, middleware, same-origin policy / CORS, router composition.

### `backend/app/db/base.py`
- **Purpose:** Defines `engine`, `SessionLocal`, and `Base` — the three foundational SQLAlchemy objects.
- **Why it exists:** Every other DB-related file depends on these three objects existing exactly once.
- **Problem it solves:** Without a single shared Engine, every part of the app would open its own connection pool; without a shared `Base`, models registered in different places wouldn't share one metadata catalog.
- **Who calls it:** `db/models.py` (imports `Base`), `deps.py` (imports `SessionLocal`), future `alembic/env.py` (imports `Base.metadata` and `engine`).
- **Who it calls:** `core/config.py` (for `settings.database_url`), SQLAlchemy itself.
- **Lifetime:** `engine` and `SessionLocal` are created once at import time and live for the whole process; `Base` accumulates model registrations over the app's startup but is never itself "run."
- **Request flow position:** `engine`/`SessionLocal` sit upstream of every request (used inside `get_db`); `Base` only matters at model-definition and migration time, never at request time.
- **Key concepts:** Engine vs. Session vs. Base, connection pooling, sessionmaker factory pattern.

### `backend/app/db/models.py`
- **Purpose:** Defines the `User`, `Habit`, `HabitLog` ORM classes.
- **Why it exists:** The actual, single definition of the data model — used both for querying and, via Alembic, for generating the real Postgres schema.
- **Problem it solves:** Without ORM classes, every DB interaction would be hand-written SQL with manual row-to-object mapping.
- **Who calls it:** `deps.py` (queries `User`), `routers/auth.py` (constructs/queries `User`), `alembic/env.py` (reads `Base.metadata`, populated by this file's import).
- **Who it calls:** `db/base.py` (inherits from `Base`).
- **Lifetime:** Classes are defined once at import time; instances (rows) are created/destroyed per Session.
- **Request flow position:** Instantiated/queried during request handling, inside a `Session` borrowed via `get_db`.
- **Key concepts:** Declarative mapping, `Column`, `ForeignKey` (real DB constraint), `relationship()` (Python-only convenience), `UniqueConstraint`.

### `backend/app/core/security.py`
- **Purpose:** Pure functions for password hashing/verification and JWT creation/decoding.
- **Why it exists:** Isolates cryptographic logic from HTTP/DB concerns — testable alone, reused everywhere identity needs checking.
- **Problem it solves:** Without this isolation, JWT/bcrypt logic would be duplicated or entangled with route-handler code across every file that needs to check identity.
- **Who calls it:** `routers/auth.py` (`hash_password`, `verify_password`, `create_access_token`), `deps.py` (`decode_access_token`).
- **Who it calls:** `core/config.py` (`settings.secret_key`, `settings.algorithm`, `settings.access_token_expire_minutes`), the `passlib` and `jose` libraries.
- **Lifetime:** Stateless functions — no persistent objects, called fresh on every invocation.
- **Request flow position:** Called during register/login (hash + issue token) and on every protected request (decode + verify).
- **Key concepts:** One-way hashing vs. encryption, adaptive cost, salting, JWT signing (HMAC) vs. encryption, stateless auth.

### `backend/app/schemas/user.py`
- **Purpose:** Pydantic request/response shapes — `UserCreate`, `UserLogin`, `UserResponse`, `Token`.
- **Why it exists:** The explicit, validated boundary between raw JSON and internal ORM models.
- **Problem it solves:** Mass assignment vulnerabilities, leaking `hashed_password` in responses, no input validation on incoming data.
- **Who calls it:** `routers/auth.py` (as request bodies and `response_model`s).
- **Who it calls:** `pydantic`/`email-validator` for validation logic.
- **Lifetime:** Instantiated once per request (for parsing the body) and once per response (for serialization) — never persisted.
- **Request flow position:** Sits immediately after "JSON arrives" (validates the request) and immediately before "JSON leaves" (filters the response).
- **Key concepts:** Data validation, output allowlisting, `from_attributes`, separation of API contract from DB schema.

### `backend/app/deps.py`
- **Purpose:** One module-level object plus two FastAPI dependencies — `oauth2_scheme` (the token-extraction scheme), `get_db` (per-request Session), and `get_current_user` (identify the caller).
- **Why it exists:** Both problems ("give every request its own DB session with guaranteed cleanup" and "identify who's calling") are needed by nearly every future route — written once here, reused via `Depends(...)`.
- **Problem it solves:** Without `get_db`, every handler would manually open/close sessions (and could forget to, leaking connections). Without `get_current_user`, every protected route would re-implement token extraction/decoding/user-lookup from scratch.
- **Who calls it:** `routers/auth.py` (`get_db`, `get_current_user`), and every future protected router (habits, stats).
- **Who it calls:** `db/base.py` (`SessionLocal`), `db/models.py` (`User`), `core/security.py` (`decode_access_token`).
- **Lifetime:** `get_db`'s session lives for exactly one request (generator, cleanup via `finally`); `get_current_user`'s result is computed once per request and shared across anything else in that request that also depends on it.
- **Request flow position:** Runs *before* the route handler's own body, on every route that declares these dependencies.
- **Key concepts:** Dependency injection, generator-based cleanup (`yield`/`finally`), `OAuth2PasswordBearer`, re-fetching live data instead of trusting token claims.

### `backend/app/routers/auth.py`
- **Purpose:** The actual `/auth/register`, `/auth/login`, `/auth/me` endpoints.
- **Why it exists:** Wires schemas, security functions, and dependencies into real HTTP behavior.
- **Problem it solves:** This is the concrete implementation of "how does a user actually sign up / log in / find out who they are."
- **Who calls it:** `main.py` registers it via `app.include_router(auth.router)`; externally, the Next.js frontend calls these HTTP endpoints.
- **Who it calls:** `schemas/user.py` (validation), `core/security.py` (hashing/tokens), `deps.py` (`get_db`, `get_current_user`), `db/models.py` (`User`).
- **Lifetime:** Router object built once at import time; each endpoint function runs once per matching HTTP request.
- **Request flow position:** The actual business-logic layer that request flow diagrams above walk through step by step.
- **Key concepts:** `APIRouter`, thin handlers, defense in depth (app check + DB constraint), generic auth errors to prevent enumeration.

### `backend/alembic/env.py`
- **Purpose:** Configures Alembic — points it at our `Base.metadata` (for autogenerate diffing) and our real `DATABASE_URL` (for connecting).
- **Why it exists:** Alembic is database-agnostic by default; this file is what connects it specifically to *our* models and *our* settings instead of a hardcoded placeholder.
- **Problem it solves:** Without importing `app.db.models`, `Base.metadata` would be empty and autogenerate would detect no tables at all — this file's imports are what make model discovery possible.
- **Who calls it:** The `alembic` CLI (`revision --autogenerate`, `upgrade`, `downgrade`).
- **Who it calls:** `core/config.py` (`settings.database_url`), `db/base.py` (`Base`), `db/models.py` (registers the tables as a side effect of import).
- **Lifetime:** Read once per Alembic CLI invocation — not part of the running application at all.
- **Request flow position:** None — purely a migration-time tool, never touched by a live HTTP request.
- **Key concepts:** Metadata diffing, migration tooling vs. runtime application code.

### `backend/alembic/versions/54f130134d52_create_users_habits_habit_logs_tables.py`
- **Purpose:** The first migration — the actual generated DDL to create `users`, `habits`, `habit_logs`.
- **Why it exists:** The concrete, versioned record of "how the schema went from nothing to this shape."
- **Problem it solves:** Turns Python model definitions into real `CREATE TABLE` statements, safely and reversibly.
- **Who calls it:** `alembic upgrade head` / `alembic downgrade` (via the `alembic_version` bookkeeping table deciding what's already applied).
- **Who it calls:** SQLAlchemy Core's `op.create_table`/`op.create_index` operations, executed against Postgres.
- **Lifetime:** Runs once (per environment) when applied; the file itself is permanent, checked into git.
- **Request flow position:** None — a one-time (per environment) schema-setup step, not part of request handling.
- **Key concepts:** `upgrade()`/`downgrade()`, migration ordering, DDL vs. DML.

### `backend/requirements-dev.txt`
- **Purpose:** Test-only dependencies (`pytest`, `httpx`), layered on top of `requirements.txt` via `-r requirements.txt`.
- **Why it exists:** Keeps test tooling out of what would ship to production — the production backend never needs `pytest`.
- **Problem it solves:** Bloating the production dependency set with dev-only tools.
- **Who calls it:** `pip install -r requirements-dev.txt`, run by a developer or CI, never by the deployed app.
- **Who it calls:** N/A.
- **Lifetime:** Static reference file.
- **Request flow position:** None.
- **Key concepts:** Separating production and development dependency sets.

### `backend/tests/conftest.py`
- **Purpose:** Shared pytest fixtures — an isolated in-memory SQLite database and a `client` (FastAPI `TestClient`) wired to use it instead of real Postgres.
- **Why it exists:** Every test needs a clean, isolated database and a way to make HTTP-like requests against the app without a real running server.
- **Problem it solves:** Without dependency overriding, tests would either need a live Postgres instance or would pollute real development data.
- **Who calls it:** Automatically discovered and used by `pytest` for any test that declares a `client` or `db_session` parameter.
- **Who it calls:** `app.main` (the real app), `app.deps.get_db` (overridden), `app.db.base.Base` (to create/drop tables per test run).
- **Lifetime:** Fixtures are created and torn down per test function (`Base.metadata.create_all`/`drop_all` around each `client` use).
- **Request flow position:** Test-time only — simulates the request flow without a real network call.
- **Key concepts:** Dependency overriding (`app.dependency_overrides`), test isolation, `StaticPool` for shared in-memory SQLite connections.

### `backend/tests/test_auth.py`
- **Purpose:** 13 automated tests covering register, login, and the protected `/me` endpoint.
- **Why it exists:** Turns the manual curl-based verification into something that runs in seconds and catches regressions automatically.
- **Problem it solves:** Manual testing doesn't scale and isn't repeatable; this makes every security property discussed (no plaintext passwords, no enumeration, signature/expiry enforcement) into an enforced, automated check.
- **Who calls it:** `pytest tests/ -v`, run by a developer or (eventually) CI.
- **Who it calls:** `tests/conftest.py` fixtures, `app.core.config.settings`, `app.db.models.User`, and — via the `client` fixture — the full real request path through `main.py` → `routers/auth.py` → everything else.
- **Lifetime:** Each test function runs once per invocation, against a freshly created/dropped database.
- **Request flow position:** Exercises the entire request flow end-to-end, in-process, without a real network socket.
- **Key concepts:** Test isolation, security regression testing, tampered/expired-token testing.

### `backend/app/schemas/habit.py`
- **Purpose:** `HabitCreate`, `HabitUpdate`, `HabitResponse` (the last including a computed `current_streak` field).
- **Why it exists:** Same boundary role as `schemas/user.py` — validated input, controlled output shape.
- **Problem it solves:** Input validation on habit creation/editing; and unlike `UserResponse`, demonstrates that a response schema can include fields that don't exist on the underlying ORM model at all.
- **Who calls it:** `routers/habits.py`.
- **Who it calls:** `pydantic` for validation.
- **Lifetime:** Instantiated per request (`HabitCreate`/`HabitUpdate` on the way in) and per response (`HabitResponse`, built explicitly rather than via `from_attributes`).
- **Request flow position:** Immediately after "JSON arrives" and immediately before "JSON leaves," same as `schemas/user.py`.
- **Key concepts:** Computed (non-ORM) response fields, explicit schema construction vs. `from_attributes`.

### `backend/app/schemas/stats.py`
- **Purpose:** `DailyCompletion` and `WeeklyStats` — the shape of the weekly stats response.
- **Why it exists:** Same reasoning as every other schema file — a validated, explicit output contract.
- **Problem it solves:** Without it, the stats endpoint would return an ad-hoc dict with no guaranteed shape or types.
- **Who calls it:** `routers/stats.py`.
- **Who it calls:** `pydantic`.
- **Lifetime:** Built once per `/stats/weekly` request.
- **Request flow position:** The final step before the JSON response leaves the stats endpoint.
- **Key concepts:** Nested schemas (`WeeklyStats` contains a `list[DailyCompletion]`).

### `backend/app/services/streaks.py`
- **Purpose:** `calculate_current_streak` — the one function that turns a set of completion dates into a streak count.
- **Why it exists:** Isolated exactly like `core/security.py` — pure function, no DB/HTTP coupling, trivially unit-testable with fixed dates.
- **Problem it solves:** Without isolation, this logic (with its "yesterday exception" edge case) would live inline in a route handler, untestable without a live database and a real clock.
- **Who calls it:** `routers/habits.py` (`_to_response`), and directly by `tests/test_streaks.py`.
- **Who it calls:** Nothing — pure Python, only `datetime`/`timedelta`.
- **Lifetime:** Stateless function, called fresh every time a habit's streak needs computing.
- **Request flow position:** Called once per habit, every time `GET /habits`, `POST /habits`, `PUT /habits/{id}`, or `POST /habits/{id}/complete` builds a response.
- **Key concepts:** Testable design via parameterizing "now" instead of reading the system clock internally.

### `backend/app/routers/habits.py`
- **Purpose:** `GET/POST/PUT/DELETE /habits`, `POST /habits/{id}/complete`.
- **Why it exists:** The concrete CRUD + completion-toggle implementation for the habit tracker's core feature.
- **Problem it solves:** This is the actual "create a habit, mark it done, see your streak" functionality the whole app exists for.
- **Who calls it:** `main.py` (`app.include_router(habits.router)`); externally, the Next.js frontend.
- **Who it calls:** `schemas/habit.py` (validation/response), `services/streaks.py` (streak calc), `deps.py` (`get_db`, `get_current_user`), `db/models.py` (`Habit`, `HabitLog`).
- **Lifetime:** Router built once at import; each endpoint runs once per matching request.
- **Request flow position:** The business-logic layer for every habit-related request.
- **Key concepts:** Ownership enforcement (404-not-403), toggle semantics, shared `_get_owned_habit`/`_to_response` helpers to avoid repeating the same checks across four endpoints.

### `backend/app/routers/stats.py`
- **Purpose:** `GET /stats/weekly`.
- **Why it exists:** The concrete implementation of the weekly-statistics feature.
- **Problem it solves:** Aggregating completion data across a user's habits into a fixed 7-day report, including days with zero activity.
- **Who calls it:** `main.py` (`app.include_router(stats.router)`); externally, the Next.js frontend/dashboard.
- **Who it calls:** `schemas/stats.py`, `deps.py` (`get_db`, `get_current_user`), `db/models.py` (`Habit`, `HabitLog`).
- **Lifetime:** Router built once at import; the endpoint runs once per request.
- **Request flow position:** A read-only aggregation endpoint, called whenever the dashboard's weekly view loads.
- **Key concepts:** `GROUP BY` + gap-filling, user-scoped aggregation (never another user's data), guarding against division by zero.

### `backend/tests/test_streaks.py`, `test_habits.py`, `test_stats.py`
- **Purpose:** 15 tests covering the streak algorithm in isolation, habit CRUD + ownership isolation, and weekly stats correctness/isolation.
- **Why they exist:** Same reasoning as `test_auth.py` — turn manual curl verification into fast, repeatable, automated checks.
- **Problem they solve:** Without `test_cannot_access_or_modify_another_users_habit` and `test_weekly_stats_only_includes_current_user` specifically, a future regression that dropped a `user_id` filter somewhere would leak one user's data to another — silently, and only visible in production with real users.
- **Who calls them:** `pytest tests/ -v`.
- **Who they call:** `tests/conftest.py` fixtures (`client`, `db_session`), the full real request path through `main.py` and its routers.
- **Lifetime:** Each test runs once per invocation against a fresh in-memory database.
- **Request flow position:** Exercises the full request flow end-to-end, in-process.
- **Key concepts:** Seeding historical data directly via `db_session` to test multi-day logic without waiting real days between test runs.

### `frontend/src/lib/api.ts`
- **Purpose:** The single typed client for every backend call — `apiFetch` plus one function per endpoint (`login`, `register`, `me`, `listHabits`, `createHabit`, `updateHabit`, `deleteHabit`, `toggleComplete`, `weeklyStats`).
- **Why it exists:** One place that knows the backend's URL and error shape, instead of `fetch()` calls scattered across every component.
- **Problem it solves:** Without it, the `Authorization` header, JSON parsing, and error handling would be duplicated in every form/page that talks to the backend.
- **Who calls it:** `AuthContext.tsx`, `login`/`register` pages, and (Step 5) the dashboard.
- **Who it calls:** The FastAPI backend, at `NEXT_PUBLIC_API_URL` (from `.env.local`).
- **Lifetime:** Stateless functions, called fresh on every request.
- **Request flow position:** The only bridge between any React component and the backend.
- **Key concepts:** Centralized API client, typed responses, surfacing backend error messages via a custom `ApiError`.

### `frontend/src/contexts/AuthContext.tsx`
- **Purpose:** React context holding `user`/`token`/`isLoading`, persisted to `localStorage`, exposing `login`/`register`/`logout`.
- **Why it exists:** Auth state is needed across many otherwise-unrelated components (forms, the route guard, the dashboard) — a shared context avoids prop-drilling it through every layer.
- **Problem it solves:** Without it, each page would need its own logic for reading/writing the stored token and wouldn't share a consistent notion of "who's logged in right now."
- **Who calls it:** `layout.tsx` (wraps the whole app in `AuthProvider`), and every component calling `useAuth()` — the login/register pages, `RequireAuth`, `page.tsx`, the dashboard.
- **Who it calls:** `lib/api.ts` (`api.me`, `api.login`, `api.register`).
- **Lifetime:** One instance for the whole app session, created when the app mounts; the mount-time `/auth/me` revalidation runs once per full page load.
- **Request flow position:** Sits between every UI component and `lib/api.ts` for anything auth-related.
- **Key concepts:** React context, revalidating a stored credential against the server instead of trusting it blindly, `isLoading` as a guard against premature redirects.

### `frontend/src/components/require-auth.tsx`
- **Purpose:** `RequireAuth` — wraps a page's content, redirecting to `/login` if there's no valid token.
- **Why it exists:** Every protected page (currently `/dashboard`) needs the identical check; written once here instead of duplicated per page.
- **Problem it solves:** Without it, an unauthenticated user could load `/dashboard`'s content directly.
- **Who calls it:** `app/dashboard/page.tsx` (and any future protected page).
- **Who it calls:** `contexts/AuthContext.tsx` (`useAuth`), Next.js's `useRouter`.
- **Lifetime:** Re-evaluated on every render of the page it wraps.
- **Request flow position:** Runs client-side, after hydration — see "Why the route guard is a client component" above for why it can't run any earlier.
- **Key concepts:** Client-side route protection, the localStorage-vs-cookie tradeoff.

### `frontend/src/app/login/page.tsx`, `app/register/page.tsx`
- **Purpose:** The actual login and registration forms.
- **Why they exist:** The concrete UI for the auth flow described in Step 2's backend work.
- **Problem they solve:** A user-facing way to actually call `/auth/login` and `/auth/register`.
- **Who calls them:** Next.js's router, when a user navigates to `/login` or `/register`.
- **Who they call:** `useAuth()` (`login`/`register`), which calls `lib/api.ts`, which calls the backend.
- **Lifetime:** Mounted/unmounted per navigation, like any Next.js page.
- **Request flow position:** The very start of the auth flow diagrammed back in Step 2 — steps 1–2 of "password entry → protected endpoint" now have a real UI in front of them.
- **Key concepts:** Controlled form inputs, surfacing `ApiError` messages, `router.push` on success.

### `frontend/src/app/dashboard/page.tsx`
- **Purpose:** A minimal placeholder behind `RequireAuth`, proving the whole auth flow works end-to-end; real content arrives in Step 5.
- **Why it exists:** Something for `login`/`register` to redirect to, and a concrete page to prove the route guard actually blocks unauthenticated access.
- **Problem it solves:** Without *some* protected destination, the auth flow would have nothing to demonstrate it worked.
- **Who calls it:** Next.js's router, after a successful login/register, or direct navigation.
- **Who it calls:** `RequireAuth`, `useAuth()` (for `user`/`logout`).
- **Lifetime:** Mounted/unmounted per navigation.
- **Request flow position:** The destination the whole Step 4 flow was built toward.
- **Key concepts:** Composing a page from a guard component, calling `logout()`.

### `frontend/src/app/page.tsx` (rewritten) and `app/layout.tsx` (edited)
- **Purpose:** `page.tsx` now redirects `/` to `/dashboard` or `/login` based on auth state, replacing the default `create-next-app` welcome content; `layout.tsx` wraps the whole app in `AuthProvider`.
- **Why they exist:** Every page needs access to auth state (`layout.tsx`), and the root URL needs to send visitors somewhere meaningful rather than showing boilerplate (`page.tsx`).
- **Problem they solve:** Without `AuthProvider` in the layout, `useAuth()` would throw in every component that calls it — the context simply wouldn't exist above them in the tree.
- **Who calls them:** Next.js's router (top-level app shell and root route).
- **Who they call:** `AuthProvider` (`layout.tsx`), `useAuth()` (`page.tsx`).
- **Lifetime:** `layout.tsx` mounts once for the whole app session; `page.tsx` runs its redirect check on every visit to `/`.
- **Request flow position:** `layout.tsx` is the outermost wrapper for every single page; `page.tsx` is the very first decision point a visitor hits.
- **Key concepts:** Provider composition at the root of the app tree.

### Frontend files (Step 5 — visual design system)

- **`components/theme-provider.tsx`** — thin wrapper around `next-themes`'s `ThemeProvider`. Exists so the rest of the app imports from `@/components/theme-provider` rather than `next-themes` directly, in case the theming library ever changes.
- **`components/theme-toggle.tsx`** — the sun/moon button. The `mounted` guard prevents a hydration mismatch: the server can't know the user's theme preference, so nothing theme-dependent renders until the client confirms it has mounted.
- **`lib/confetti.ts`** — five named celebration functions wrapping `canvas-confetti`, each a small tasteful burst with `disableForReducedMotion: true`. Called from `habit-card.tsx` (complete/milestone), the dashboard (create, weekly goal), and the auth pages (login/register success).
- **`lib/streak-badge.ts`** — `getStreakBadge(streak)` (tier lookup) and `crossedMilestone(prev, next)` (did completing a habit cross into a new tier, used to decide whether to fire the bigger milestone confetti vs. the small per-completion burst). Pure functions, no component coupling.
- **`components/habits/stat-card.tsx`** — one reusable animated tile (icon, big number, label, sublabel) used four times on the dashboard with different data/colors.
- **`components/habits/weekly-progress.tsx`** — the day-circle row (filled = at least one completion that day, empty = none), replacing the earlier bar-chart version to match the user's reference image.
- **`components/habits/empty-state.tsx`**, **`dashboard-skeleton.tsx`** — the zero-habits message and the loading placeholder shown while the dashboard's initial fetch is in flight.
- **`components/auth/floating-label-input.tsx`** — icon + animated floating label input, shared by login/register for email/password/confirm-password fields.
- **`components/auth/auth-error.tsx`** — rounded alert-card error display, replacing plain error text on the auth pages.
- **`components/auth/auth-layout.tsx`**, **`auth-hero.tsx`** — the two-column shell (floating gradient orbs + hero copy on the left, auth card on the right via `children`), and the hero's headline/feature-card content.
- **`components/auth/welcome-transition.tsx`** — the brief full-screen "Welcome"/"Welcome back" overlay shown for ~700ms after a successful login/register before navigating to `/dashboard`, giving the moment of success a beat instead of an instant redirect.

### Frontend files (Step 1 — lighter treatment, not yet discussed in depth)

- **`frontend/src/app/layout.tsx` / `page.tsx`** — Next.js App Router's root layout and home page. Purpose: the entrypoint UI shell. Will be replaced/extended in Steps 4–5 with real auth pages and the dashboard.
- **`frontend/src/components/ui/button.tsx`** — a shadcn/ui component, installed as a working proof that shadcn/ui initialization succeeded. More components will be added as the dashboard is built.
- **`frontend/src/lib/utils.ts`** — shadcn's helper (`cn()` for conditional Tailwind class merging).
- **`frontend/components.json`** — shadcn/ui's configuration (style, paths, aliases) so future `npx shadcn add <component>` commands know where to put generated files.
- **`frontend/next.config.ts`** — currently sets `outputFileTracingRoot` to fix a false "multiple lockfiles" warning caused by an unrelated, pre-existing `package-lock.json` in the home directory.

### Infra / tracking files

- **`TASKS.md`** — the step-by-step build checklist, checked off as work completes, plus a running log of environment-specific fixes (Node version, Homebrew, Postgres, the `/etc/hosts` issue).
- **`.gitignore`** — excludes `node_modules/`, `.venv/`, `.next/`, `.env`, OS/editor cruft from version control.
- **`LEARNING_GUIDE.md`** (this file) — the living textbook, updated after every milestone.

---

## Request Flow Diagrams (all, consolidated)

**1. Overall three-tier system**
```
┌─────────────────┐        HTTP/JSON         ┌──────────────────┐        SQL          ┌──────────────┐
│   Next.js        │  ──────────────────────▶ │   FastAPI         │ ──────────────────▶ │  PostgreSQL   │
│  (localhost:3000) │ ◀────────────────────── │  (localhost:8000)  │ ◀────────────────── │  (127.0.0.1:  │
│  browser UI       │      JSON responses      │  business logic +  │     rows/results     │   5432)       │
└─────────────────┘                          │  auth + validation │                     └──────────────┘
                                              └──────────────────┘
```

**2. Example future request — marking a habit complete (Step 3, not yet built)**
```
Client ──▶ routers/habits.py ──▶ schemas (validate)
                │
                ├──▶ deps.py::get_current_user (auth check, reused unchanged from Step 2)
                │
                └──▶ deps.py::get_db ──▶ db/base.py (session) ──▶ db/models.py (HabitLog row) ──▶ Postgres
```

**3. Data model**
```
User                          Habit                          HabitLog
─────────                     ─────────                     ─────────
id (PK)                       id (PK)                       id (PK)
email (unique)      ──1:N──▶  user_id (FK → User.id)        habit_id (FK → Habit.id)  ◀──1:N──
hashed_password                name                           completed_date (Date)
created_at                     description                    UNIQUE(habit_id, completed_date)
                                created_at
```

**4. Auth flow overview**
```
Register:  POST /auth/register {email, password}
              → hash password → insert User → issue JWT → return token

Login:     POST /auth/login {email, password}
              → look up User by email → verify password hash → issue JWT → return token

Protected: any route with Depends(get_current_user)
              → extract "Authorization: Bearer <token>" → decode JWT → load User from DB
              → 401 if missing/invalid/expired → else inject User into the endpoint
```

**5. Files & interaction map (Step 2)**
```
Client ──▶ routers/auth.py ──▶ schemas/user.py (validate input)
                │
                ├──▶ core/security.py (hash password / verify / issue JWT)
                │
                └──▶ deps.py::get_db ──▶ db/base.py (session) ──▶ db/models.py (User row) ──▶ Postgres
```

**6. Engine / Session / Base lifecycle**
```
Process startup (import time — happens ONCE)
  engine = create_engine(settings.database_url)     lives for the whole process
  SessionLocal = sessionmaker(bind=engine)           a factory, not a session itself
  Base = declarative_base()                          empty registry, filled in by models.py

Per incoming HTTP request (deps.py::get_db)
  db = SessionLocal()      ← Session borrows a connection from engine's pool
  yield db                 ← router handler runs db.query()/db.add()/db.commit()
  db.close()               ← connection returned to the pool

Design/migration time (not at runtime)
  db/models.py     class User(Base): ...     registers a table into Base.metadata
  alembic/env.py   target_metadata = Base.metadata   diffed against live DB to generate migrations
```

**7. JWT anatomy**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9   .   eyJzdWIiOiI0MiIsImV4cCI6MTc1MzM1MDAwMH0   .   4f8a2e...signature
──────────── Header ────────────           ──────────── Payload ────────────           ── Signature ──
{"alg":"HS256","typ":"JWT"}                {"sub":"42","exp":1753350000}               HMAC-SHA256(header+"."+payload, SECRET_KEY)
```

**8. Full login → protected endpoint flow**
```
 1. User types email+password in the Next.js login form, submits.
 2. Frontend: POST /auth/login  { email, password }
 3. routers/auth.py::login — validates body against schemas/user.py::UserLogin
 4. deps.py::get_db — opens a Session, handler queries User by email
 5. security.py::verify_password(candidate, user.hashed_password) — bcrypt recompute-and-compare
 6. security.py::create_access_token({"sub": str(user.id)}) — builds header+payload, HMAC-signs
 7. Handler returns { access_token, token_type: "bearer" }
 8. Frontend stores the token
 9. Later: GET /habits  with header  Authorization: Bearer <token>
10. deps.py::get_current_user — extracts token, calls security.py::decode_access_token(token)
11. Recomputes signature + checks exp; on failure → 401, stops here
12. On success: extracts sub (user id) → db.query(User) loads the CURRENT row from Postgres
13. That User is injected as current_user into the route handler
```

**9. Register — schema data flow**
```
JSON Request                  {"email": "a@b.com", "password": "secret123"}
     ↓
Pydantic Schema (UserCreate)  validates shape BEFORE any DB/business logic runs
     ↓
SQLAlchemy Model (User)       User(email=..., hashed_password=hash_password(...))
     ↓
PostgreSQL                    INSERT INTO users (...) VALUES (...) RETURNING id, created_at
     ↓
SQLAlchemy Model (User)       fully populated ORM instance after db.commit() + db.refresh()
     ↓
Pydantic Response Schema      UserResponse pulls only id, email, created_at — hashed_password
(UserResponse)                 has no path through
     ↓
JSON Response                  {"id": 7, "email": "a@b.com", "created_at": "..."}
```

**10. Dependency injection graph for a protected route**
```
route handler
   └── current_user: User = Depends(get_current_user)
            ├── token: str = Depends(oauth2_scheme)      [extracts Authorization header]
            └── db: Session = Depends(get_db)             [per-request session]
                     └── SessionLocal() from db/base.py
```

**11. Alembic model discovery and migration generation**
```
db/models.py            defines User/Habit/HabitLog as subclasses of Base
      │  (class definition time — registers each table into Base.metadata)
      ▼
db/base.py::Base.metadata     the in-memory "this is what the schema SHOULD look like" catalog
      │
alembic/env.py            imports settings, Base, AND models (the import is what populates
      │                    Base.metadata — without it, autogenerate would see nothing)
      │  target_metadata = Base.metadata
      ▼
alembic revision --autogenerate
      │  diffs the LIVE database's actual schema against target_metadata
      │  → writes the difference into a new alembic/versions/*.py file
      ▼
alembic upgrade head
      │  checks alembic_version (bookkeeping table) → runs every unapplied migration in order
      ▼
Postgres now has the real users/habits/habit_logs tables
```

---

## Questions & Answers

*Every architectural question asked this session, with the detailed answer given at the time.*

**Q: Explain the architecture. Why do we need this file, what problem does it solve, and how does it fit into the request flow?**
A: (Clarified to mean the overall architecture.) Covered under "Project Architecture" above — the three-tier split, why FastAPI instead of Next.js API routes, why Postgres, and a full example request flow for marking a habit complete.

**Q: Before writing db/base.py — why does SQLAlchemy need an Engine, a Session, and a Base? Why can't we just use psycopg2 directly everywhere? Where is each used in the request flow?**
A: Covered in full under "Engine, Session, and Base" and "Why not just use psycopg2 directly everywhere?" above — Engine = connection pool (once per process), Session = per-request unit of work, Base = design-time metadata registry, plus the full lifecycle diagram.

**Q: Before writing models.py — how does SQLAlchemy convert a Python class into a Postgres table? How do Base, Column, ForeignKey, and relationship() work together? Why define relationships in Python when Postgres only knows foreign keys?**
A: Covered under "How a Python class becomes a Postgres table" and the `Column`/`ForeignKey`/`relationship()` table above — the two-phase mapping process, and the three reasons `relationship()` exists (natural traversal, ORM-level cascades, query optimization) despite Postgres never seeing it.

**Q: Before writing core/security.py — why standalone functions instead of inside auth.py? What is bcrypt and why verify without decrypting? What is a JWT (show its three parts)? Why sign instead of encrypt? Why not store sessions in Postgres? What happens if a JWT is stolen? Show the complete login flow.**
A: Covered in full under "Security" above, including the bcrypt smoothie analogy, the JWT wax-seal analogy, the three-part JWT breakdown, and the 13-step login-to-protected-endpoint flow.

**Q: Before writing schemas/user.py — why do we need Pydantic schemas when we already have SQLAlchemy models? Why can't the API accept/return SQLAlchemy models directly? What security problems would that create? Why separate UserCreate/UserLogin/UserResponse/Token? Show the complete data flow.**
A: Covered under "Schemas" above — the mass-assignment and field-leaking risks, the four-schema comparison table, and the full JSON→Schema→Model→Postgres→Model→Schema→JSON diagram.

**Q: (Implicit, deps.py) — how do get_db and get_current_user fit together, and why does this replace repeating auth logic in every route?**
A: Covered under "deps.py" entries above — generator-based cleanup for `get_db`, and the dependency-graph explanation for `get_current_user` re-fetching live user data rather than trusting the JWT payload alone.

**Q: Before writing routers/auth.py — show me how every file works together during a Register request and a Login request.**
A: Covered under "Request Flow Diagrams" — two full step-by-step diagrams, one per endpoint, naming every file touched at each step.

**Q: Before editing any Alembic files — how does Alembic discover my SQLAlchemy models? How do Base.metadata, env.py, and versions/ work together? What happens on `alembic revision --autogenerate` and `alembic upgrade head`?**
A: Covered under the new "Alembic" subsection in "Database" — the discovery chain (`models.py` import → `Base.metadata` → `env.py`'s `target_metadata` → diff against the live DB → a new file in `versions/`), and what each CLI command actually does.

**Q: Open the generated migration file and explain every section. How does each `op.create_table()` map back to the model? Why version-controlled migrations instead of regenerating from models every time?**
A: Covered under "Alembic" — `revision`/`down_revision` chaining, `op.create_table`/`op.create_index`/`ForeignKeyConstraint` mapping directly to `models.py`, and why `downgrade()` drops tables in reverse order.

**Q: Explain how every constraint in the users table maps back to models.py, line by line.**
A: Covered under "Database → Alembic" and cross-referenced against the live `\d users` output — each column, the primary key, the unique index, and the auto-generated sequence default traced back to specific lines in `models.py`.

**Q: Now that the migration has been applied, how do I verify it worked? How do I inspect the tables in Postgres?**
A: Covered — `\dt` (lists all four tables, including Alembic's own `alembic_version`) and `\d users` (full schema), cross-checked against `models.py`.

**Q: Why was bcrypt 4.0.1 required? What error occurred with the newer version? Could we upgrade Passlib instead? Pros and cons of pinning vs. upgrading?**
A: Covered under "Security → bcrypt" — passlib 1.7.4 (its final release) predates bcrypt 4.1's stricter validation, causing a crash inside passlib's own internal self-test. Passlib has no newer version to upgrade to; pinning `bcrypt==4.0.1` was the smallest fix, with dropping `passlib` entirely for direct `bcrypt` calls named as a valid future alternative.

**Q: Explain why each test exists — what bug or security issue does it prevent? What additional production-grade auth tests are missing?**
A: Covered under the new "Testing" section — a full table mapping each of the 13 tests to the specific regression it guards against, plus an explicit list of what's deliberately deferred (account revocation, rate limiting, refresh-token rotation).

**Q: Why is the login error showing `[object Object]` instead of "Incorrect email or password"?**
A: Covered under "Frontend Architecture → Case study: the `[object Object]` bug" — FastAPI's `detail` field is a string for hand-written errors but an *array* of objects for Pydantic validation failures, and the original `body.detail ?? "Request failed"` only guarded against nullish values, not wrong shapes. Fixed with a shape-checking `extractErrorMessage()` helper, verified against both real response shapes by hand.

**Q: Why is the font still the browser default even after fixing the `--font-sans` variable?**
A: Covered under "Frontend Architecture → Case study: the font that silently never loaded" — a two-part bug: the font variable was defined on `<body>` but read on the ancestor `<html>` (CSS variables don't inherit upward), and separately, Tailwind v4's `@theme inline` substitutes values at compile time rather than emitting a reusable variable, requiring the fix to go through Tailwind's actual `--default-font-family` override hook instead of a second, competing rule.

---

## Learning Journal

### What we built today

**Step 1 (complete):** Full project scaffold — `backend/` (FastAPI skeleton with `/health`), `frontend/` (Next.js 15.5.21 + Tailwind v4 + shadcn/ui), and a working local PostgreSQL 16 instance. Along the way, fixed a Node version mismatch (v16 → v20 via `nvm`), installed Homebrew from scratch, chose native `brew services` Postgres over the originally-planned Docker Compose setup, and diagnosed/fixed a machine-specific `/etc/hosts` issue that blocked "localhost" resolution entirely.

**Step 2 (COMPLETE — first full end-to-end feature):**
- `db/base.py` — Engine, SessionLocal, Base
- `db/models.py` — `User`, `Habit`, `HabitLog` ORM models
- `core/security.py` — bcrypt hashing + JWT create/decode
- `schemas/user.py` — `UserCreate`, `UserLogin`, `UserResponse`, `Token`
- `deps.py` — `get_db`, `get_current_user`
- `routers/auth.py` — `/auth/register`, `/auth/login`, `/auth/me`
- `main.py` wired up (`app.include_router(auth.router)`)
- Alembic initialized, first migration generated and applied — `users`/`habits`/`habit_logs` confirmed live in Postgres
- Fixed a real `passlib`/`bcrypt` version incompatibility (pinned `bcrypt==4.0.1`)
- Full manual end-to-end verification via curl (register, duplicate email, login correct/wrong/nonexistent, protected endpoint with no/valid/garbage token)
- 13-test automated suite (`backend/tests/`), all passing, running against an isolated in-memory SQLite database

This is the project's first genuinely complete slice: a real user can register, log in, and access a protected resource, backed by a real Postgres schema, with automated tests proving the security properties actually hold.

**Step 3 (COMPLETE — the app's core feature):**
- `services/streaks.py` — isolated, testable streak calculation with the "yesterday exception"
- `schemas/habit.py`, `schemas/stats.py` — request/response contracts for habits and weekly stats
- `routers/habits.py` — full CRUD + complete-toggle, with ownership enforcement (404-not-403) reused across all four endpoints
- `routers/stats.py` — weekly stats with gap-filled daily counts and an overall completion rate
- Wired into `main.py`
- Full manual end-to-end verification via curl (create, list, toggle on/off, update, delete, cross-user 404, weekly stats, unauthenticated 401)
- 15 new automated tests (28 total): 5 pure-logic streak edge cases, 7 habit CRUD/ownership tests, 3 stats tests

The backend MVP (Steps 1–3) is now functionally complete: register, login, create/edit/delete habits, mark complete, track streaks, and view weekly stats — all with automated test coverage.

**Step 4 (COMPLETE — the frontend connects to the backend for real):**
- `lib/api.ts` — typed client for every backend endpoint (auth + habits + stats, the latter built ahead of Step 5)
- `contexts/AuthContext.tsx` — token/user state, `localStorage` persistence, revalidates via `/auth/me` on every mount
- `components/require-auth.tsx` — client-side route guard
- `app/login/page.tsx`, `app/register/page.tsx` — real forms wired to the backend
- `app/dashboard/page.tsx` — protected placeholder proving the flow works
- `app/page.tsx` rewritten, `app/layout.tsx` wrapped in `AuthProvider`
- Verified: TypeScript compiles clean, all routes return 200, no dev-server errors, and the user manually confirmed the full register → dashboard → logout → login → dashboard flow in a real browser, including session persistence across a refresh and correct redirect from an unauthenticated incognito window

A user can now actually use this app end to end through a browser: register, land on a protected dashboard, log out, log back in — with a real Postgres-backed account behind it.

**Step 5 (COMPLETE — the real dashboard, then a full visual overhaul):**
- Functional dashboard first: habit list, create/edit/delete, complete-toggle, streak badges, weekly stats — all wired to the real backend, verified end to end
- Then, at the user's direction, a full redesign built on top: violet/pink/purple theme via shadcn variable overrides, 4 animated stat tiles, day-circle weekly progress, tiered streak badges with confetti, dark mode, a two-column glassmorphic auth experience with floating-label inputs and a "Welcome"/"Welcome back" transition
- New dependencies: `framer-motion`, `canvas-confetti`, `next-themes`
- Two real bugs found and fixed: the font-loading CSS scoping bug, and the `[object Object]` error-message bug (both written up as case studies above) — the second one found via a forked `/btw` side-task and independently re-verified rather than trusted at face value

**Step 6 (COMPLETE — full end-to-end verification, no new architecture):** re-ran the full 28-test backend suite clean immediately before any manual testing (to catch any regression from the Step 5 redesign before it could hide behind a UI-level pass); re-verified the complete API journey with a brand-new account rather than reusing polluted test data; confirmed TypeScript/ESLint clean; then had the user walk the full browser journey (register → welcome transition → dashboard → create/complete a habit with confetti → streak and weekly-progress updates → logout → login → welcome-back transition) end to end with no issues. This step is deliberately about *verification*, not new code — the discipline of re-testing everything together after a large round of isolated changes, rather than assuming each piece still fits with the others.

### What I learned today

- The difference between a database-level constraint (`ForeignKey`) and a Python-only convenience (`relationship()`) — they often sit on the same line of code but solve completely different problems.
- Why hashing (bcrypt) and encryption are not the same operation, and why password storage specifically needs the one-way, adaptive kind.
- That a JWT's payload is *readable by anyone* — the signature proves origin and integrity, not secrecy.
- Why Pydantic schemas exist as a deliberate boundary, not bureaucratic duplication of the ORM models.
- That `/etc/hosts` and DNS resolution are foundational enough that a broken "localhost" entry can look, at first, like a Postgres bug.
- How Alembic actually discovers models: it's entirely dependent on `env.py` importing the models module — metadata registration is a side effect of import, not something Alembic magically scans for.
- That pinning a direct dependency (`passlib`) doesn't pin its own transitive dependencies (`bcrypt`) — a fresh install can silently pull in a much newer, incompatible version of something you never directly referenced.
- Writing tests against an in-memory SQLite database via dependency overriding is a standard, fast way to test a FastAPI app's logic without needing a live Postgres instance for every test run — with the explicit tradeoff that it doesn't validate Postgres-specific behavior.
- A "current streak" needs a "yesterday exception" — a habit isn't broken the instant today passes without a completion, only once a full day has elapsed with none. Getting this right (vs. the naive "count consecutive dates ending today") is the difference between a streak tracker that feels correct and one that resets itself every morning before you've had coffee.
- A `GROUP BY` query silently omits days/categories with zero matching rows — reporting a fixed range (like "the last 7 days") requires explicitly walking the full range and defaulting missing entries to zero, not just using whatever the aggregation query returned.
- Testing multi-day behavior (like streaks spanning several days) doesn't require waiting real days — seeding historical rows directly into the test database via a raw session fixture, then verifying the API's read path, is the standard way around that.
- Next.js middleware can't check `localStorage`-based auth at all — middleware runs server-side before any client JS, and `localStorage` is a browser-only API. Route protection for this design has to happen client-side, after hydration.
- Trusting a stored JWT just because it's present in `localStorage` isn't enough — it could be expired or signed with an old secret. Revalidating it against `/auth/me` on every app load is the frontend's version of the backend's "never trust the token payload alone" principle.
- Playwright/browser-automation tooling is a testing convenience, not a build dependency — it's entirely reasonable to defer installing it until there's a stable frontend worth automating against, and rely on TypeScript compilation, dev-server logs, and manual verification in the meantime.
- A theme can be reskinned entirely by overriding a design system's existing CSS variables — no per-component edits needed, as long as every component already consumes those variables (which shadcn's do) rather than hardcoding colors.
- A truthy value can still be the wrong *type* — `?? "fallback"` only guards against `null`/`undefined`, not "this is an array when I expected a string." That gap is exactly where the `[object Object]` bug lived.
- CSS custom properties inherit downward only. Defining a variable on a child and reading it on a parent silently fails — no error, just an invisible fallback — which makes it a genuinely hard bug to spot by reading source code alone.
- A build tool's "inline" theme mode can mean it substitutes values at compile time instead of emitting a reusable variable — so two rules can end up competing for the same property with no reliable way to predict the winner by reading source; using the tool's actual designed override hook removes the ambiguity entirely instead of guessing at cascade order.
- Verifying a fix means inspecting the actual compiled/served output (the real CSS, the real API response), not just re-reading the source code you just changed and asserting it should work.
- After a large round of changes touching many files (the whole Step 5 redesign), re-running the *full* existing test suite before doing any new manual testing catches regressions early and cheaply — a UI-level walkthrough alone could easily miss a backend regression that a fast automated suite catches in seconds.

### Mental models that helped me understand the concepts

- **Engine = the road, Session = one conversation/errand on it, Base = the blueprint catalog.**
- **bcrypt = blending a smoothie** — you can make a new one and compare, never un-blend the original.
- **JWT = a wax-sealed letter written in plain ink** — readable by anyone, but the seal proves authenticity.
- **Pydantic schemas = a hotel check-in form vs. the hotel's internal guest record** — a limited, safe surface vs. the full internal representation.
- **`Depends()` = a coffee shop assistant** who fetches (and later washes) a cup for every order, so the barista never has to.
- **Alembic migrations = a lab notebook, not a whiteboard.** A whiteboard (`create_all()`) only ever shows the current state and gets erased and redrawn; a lab notebook (versioned migrations) keeps every step that led here, in order, and can be read backward.
- **CSS variable inheritance = handing someone a key to a room they haven't entered yet.** A parent element asking for a variable only its child defines is like asking for a room key before walking into the room that has it — the key doesn't exist yet from where you're standing.

### Common misconceptions I had and how they were corrected

- *"Docker is required to run Postgres locally."* Corrected: native `brew services start postgresql@16` is simpler for local dev and was substituted for the original docker-compose plan.
- *"`localhost` always resolves."* Corrected: it depends on `/etc/hosts` and system DNS configuration, both of which can be broken by unrelated tooling (in this case, corporate VPN/IT scripts). The numeric literal `127.0.0.1` sidesteps the whole problem.
- *"`relationship()` in SQLAlchemy creates a database-level constraint, same as `ForeignKey`."* Corrected: only `ForeignKey` is real to Postgres; `relationship()` is a pure Python/ORM convenience with no DDL of its own.
- *"A JWT's contents are hidden/secret, like an encrypted token."* Corrected: only base64url-encoded, trivially readable by anyone holding it — the signature protects integrity and origin, not confidentiality.
- *"It should be safe to just return the SQLAlchemy model from an API endpoint."* Corrected: this risks both mass assignment on input and leaking internal fields like `hashed_password` on output — Pydantic schemas exist specifically to prevent both.
- *"If a token exists in localStorage, the user is logged in."* Corrected: existence isn't validity — the token could be expired or the secret could have rotated. The app only treats someone as logged in after `/auth/me` actually confirms it server-side.
- *"`create-next-app@latest` will give me the version I asked for."* Corrected: it pulled Next.js 16 when Next.js 15 was requested; explicit version pinning (`create-next-app@15`) was needed.
- *"Pinning a library's version in `requirements.txt` pins everything it depends on too."* Corrected: `passlib[bcrypt]==1.7.4` still let `pip` resolve the newest available `bcrypt` (5.0.0) as a transitive dependency, which turned out to be incompatible — pinning is not transitive by default.
- *"If a test suite needs a database, it needs the real one."* Corrected: an isolated in-memory SQLite database via dependency overriding is enough to test application logic (validation, status codes, field filtering); it's a deliberate, named tradeoff, not a shortcut that secretly weakens the tests.
- *"A 'current streak' is just counting how many dates are in the completed set, ending at today."* Corrected: that definition breaks the moment a user hasn't opened the app yet today but completed the habit every day through yesterday — it would report `0` instead of the correct, still-alive streak. The "yesterday exception" is required.
- *"Every Pydantic response schema needs `from_attributes=True` and should map 1:1 to an ORM model."* Corrected: `HabitResponse`'s `current_streak` field has no backing column at all — some response schemas are built explicitly in the router instead, and that's the right call whenever the response includes computed, not stored, data.
- *"If I set a CSS variable somewhere in the file, anything else in the file can read it."* Corrected: it depends entirely on where in the DOM tree each element sits — a variable defined on a child is invisible to its own parent, regardless of source-file proximity.
- *"`?? "fallback"` is a safe general-purpose guard against bad data."* Corrected: it only catches `null`/`undefined` — a value of the wrong *type* (like an array where a string was expected) sails right through it.
- *"A fix looks right in the source, so it's done."* Corrected: the font fix looked right twice before it actually was — only inspecting the real compiled CSS (not the source `globals.css`) confirmed which rule actually won.

### Key takeaways

- Separate concerns into standalone, pure functions wherever possible (`core/security.py`) — it makes testing and reasoning far easier than logic embedded in route handlers.
- Every layer of this stack enforces a boundary the layer below it can't: Postgres enforces referential integrity via `ForeignKey`; Pydantic enforces API-shape integrity; `get_current_user` enforces identity, re-checked fresh on every request rather than trusted from a token's claims.
- Stateless authentication (JWT) trades server-side revocation ability for simplicity — a deliberate, named tradeoff, not an omission.
- Environment debugging (Node versions, DNS resolution, Homebrew) is as much a real skill here as writing the application code — and the same "find the evidence, don't guess" discipline applies to both.
- A migration file is a translation of a translation: Python class → `Base.metadata` → Alembic diff → SQL DDL. Verifying it worked means checking the *last* link in that chain (the live `\d users` output) against the *first* (the model source), not just checking that the command exited without error.
- Tests aren't just "does it work" — the strongest ones in this suite (`test_password_never_stored_in_plaintext`, the tampered/expired-token tests) exist specifically to catch a *future* regression of a security property that currently holds, not to prove today's happy path.
- Reskinning a UI through design-system variables rather than per-component overrides is what let a total visual overhaul (four rounds of redesign requests) touch zero business logic — the separation between "what the app does" and "what it looks like" held up under real pressure.
- The two bugs this round (font, error messages) share one shape: something *looked* correct in isolation (the variable name, the fallback operator) but broke because of a rule elsewhere (inheritance direction, response shape) that wasn't visible from the line being read. Verifying against real output — compiled CSS, live API responses — is what catches that class of bug; re-reading the same source code again does not.

### Interview notes

Talking points this project makes you ready to discuss:

- *"Walk me through what happens when a user logs in."* → The 13-step flow diagram above, cold.
- *"Why JWTs over session cookies here?"* → Statelessness tradeoff: no session table, but no server-side revocation either — and why that's an acceptable tradeoff for this MVP's scope.
- *"What's the difference between `ForeignKey` and `relationship()` in SQLAlchemy?"* → One is a real DB constraint, one is a pure Python convenience with zero DDL footprint.
- *"How do you prevent mass assignment vulnerabilities in a FastAPI app?"* → Pydantic schemas as an explicit allowlist on both input and output, never accepting/returning ORM models directly.
- *"How does bcrypt let you check a password without ever decrypting anything?"* → Recompute-and-compare using the embedded salt, not decrypt-and-compare — hashing is one-way by design.
- *"What would you add to make this production-ready regarding auth?"* → Server-side token revocation (denylist or refresh-token rotation), HTTPS enforcement, shorter-lived access tokens, rate limiting on login.
- *"How does Alembic know what SQL to generate?"* → It diffs a live introspection of the actual database against `Base.metadata` (populated by importing the models) — not by reading model source code directly.
- *"How do you test an authenticated endpoint without a live database?"* → Override the `get_db` dependency to point at an isolated in-memory SQLite database via `app.dependency_overrides`, with `StaticPool` so all connections in the test process share one instance.
- *"Tell me about a real bug you hit and how you diagnosed it."* → The `passlib`/`bcrypt` incompatibility: traced a `500` on the very first register call to a traceback rooted inside a third-party library's own self-test, confirmed the installed versions with `pip show`, identified passlib had no newer release, and pinned the transitive dependency (`bcrypt`) rather than the library that was already pinned.
- *"How would you calculate a 'current streak' for a habit tracker?"* → Walk backward from today (or yesterday, if today has no entry yet) counting consecutive dates present in the completion set; stop at the first gap. The "yesterday exception" is the detail that separates a correct implementation from a naive one.
- *"How do you prevent one user from modifying another user's data through an API?"* → Filter by both the resource id *and* the owning user's id in a single query, and return `404` (never `403`) when that combined lookup finds nothing — so a request for someone else's resource is indistinguishable from a request for an id that was never created.
- *"How do you test time-dependent logic, like a streak spanning several days, without waiting real days?"* → Seed the test database directly with backdated rows via a raw session fixture, bypassing the API's "mark today complete" endpoint (which can only ever write today's date), then verify the read path computes the correct answer from that seeded state.
- *"Why can't Next.js middleware protect a route when auth is stored in localStorage?"* → Middleware runs server-side, before any client JavaScript executes; `localStorage` is a browser-only API with no server-side equivalent. Route protection has to be a client component checking auth post-hydration — a direct, named tradeoff of choosing localStorage over cookies for the JWT.
- *"How do you avoid trusting a stale or invalid token from localStorage?"* → Revalidate it against the server on every app load — call `/auth/me` with the stored token and only treat the session as valid if that succeeds, rather than trusting the token's mere presence.
- *"Describe a subtle CSS bug you've debugged."* → A `next/font` CSS variable defined on `<body>`, read by a `font-family` rule on `<html>` — an ancestor can't see a descendant's custom property, since inheritance only flows downward. No error, just a silent fallback to the default font.
- *"How would you re-theme an app without touching every component?"* → Override the design system's own CSS variables (`--primary`, `--card`, etc.) in one place, provided every component already consumes those variables rather than hardcoding colors — which is exactly how shadcn/ui is built.
- *"Walk me through debugging an error that shows `[object Object]` instead of a message."* → That string is JavaScript's default coercion of a non-Error object into text. Trace backward to find where a value assumed to be a string was actually an object or array — in this case, a REST API returning two different shapes for the same field depending on the error type.

### Cheat sheet

**Start everything locally:**
```
brew services start postgresql@16          # if not already running
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev
```

**Verify:**
| URL | Expect |
|---|---|
| http://localhost:8000/health | `{"status":"ok"}` |
| http://localhost:8000/docs | Swagger UI — now also lists `/habits/*` and `/stats/weekly` |
| http://localhost:3000 | Redirects to `/login` (or `/dashboard` if already logged in) |
| http://localhost:3000/login | Login form |
| http://localhost:3000/register | Registration form |
| http://localhost:3000/dashboard | Protected placeholder — redirects to `/login` without a valid token |

**API surface, end to end (all require `Authorization: Bearer <token>` except register/login):**
| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Create a user, returns a token |
| POST | `/auth/login` | Verify credentials, returns a token |
| GET | `/auth/me` | Current user's info |
| GET | `/habits` | List the current user's habits, each with `current_streak` |
| POST | `/habits` | Create a habit |
| PUT | `/habits/{id}` | Edit a habit's name/description |
| DELETE | `/habits/{id}` | Delete a habit |
| POST | `/habits/{id}/complete` | Toggle today's completion on/off |
| GET | `/stats/weekly` | Last 7 days' completion counts + overall rate |

**Database migrations:**
```
alembic revision --autogenerate -m "description of the change"   # generate a migration from model changes
alembic upgrade head                                               # apply all pending migrations
alembic downgrade -1                                                # roll back the most recent migration
```

**Run the auth test suite:**
```
cd backend && source .venv/bin/activate
pip install -r requirements-dev.txt   # first time only
python3 -m pytest tests/ -v
```

**Inspect the live database:**
```
psql -h 127.0.0.1 -p 5432 -d habit_tracker -c "\dt"      # list tables
psql -h 127.0.0.1 -p 5432 -d habit_tracker -c "\d users"  # describe one table's schema
```

**Glossary:**
| Term | One-line meaning |
|---|---|
| Engine | Owns the DB connection pool; created once |
| Session | One request's unit of work; created/destroyed per request |
| Base | Registry of table definitions; used at model-definition and migration time |
| `ForeignKey` | Real DB constraint enforcing referential integrity |
| `relationship()` | Python-only convenience for object-graph traversal; no DB footprint |
| bcrypt | One-way, adaptive password hash; verified by recompute-and-compare |
| JWT | Signed (not encrypted) claim of identity: header.payload.signature |
| `Depends()` | FastAPI's dependency injection; dependencies can depend on other dependencies, shared per request |
| `response_model` | Enforced output allowlist — filters what an ORM object exposes as JSON |
| CORS | Browser-enforced same-origin policy; backend must explicitly allow the frontend's origin |
