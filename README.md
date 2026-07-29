# AssetDesk — Asset & Inventory Management System

Tracks hardware purchases, warranties, employee assignments, and repair workflows.
FastAPI + SQLAlchemy + SQLite backend, single-page Tailwind frontend. Mobile-first:
bottom tab bar and card views on phones, sidebar dashboard on desktop.

## Run it

Requires Python 3.11+ and internet access on first page load (Tailwind + fonts via CDN).

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

Open http://127.0.0.1:8000 — the database (`asset_management.db`) is created and
seeded automatically on first start.

To try it from your phone on the same network:
`uvicorn main:app --host 0.0.0.0` then open `http://<your-computer-ip>:8000`.

## Seeded accounts

| Role     | Email                | Password     |
|----------|----------------------|--------------|
| Admin    | admin@company.com    | Admin@123    |
| Employee | employee@company.com | Employee@123 |

Change these after first login (Settings → People → add your real accounts, then
deactivate the seeds). Set a real JWT secret in production:

```bash
JWT_SECRET="a-long-random-string" uvicorn main:app
```

## What's where

```
main.py              # app wiring, static serving, first-run seed
database.py          # engine + session
models.py            # ORM models (FK map documented at the top)
schemas.py           # Pydantic request/response schemas
routers/
  auth.py            # login, JWT issuance, bcrypt, role dependencies
  admin.py           # theme, categories, custom fields, users, audit log
  assets.py          # asset CRUD, warranty summary, assign/return flow
  employee.py        # my assets, repair requests + photo upload, maintenance;
                     # also the admin repair-lifecycle endpoints (/api/repairs)
static/
  index.html         # SPA shell, Tailwind config, theme variables
  app.js             # the whole frontend (state, router, views)
uploads/             # damage photos land here (served at /uploads/...)
```

## Feature map

- **Auth**: stateless JWT (8 h expiry), bcrypt hashes, roles `admin` / `employee`.
  Missing/expired token → 401; employee hitting admin routes → 403; both handled
  in the UI (auto sign-out, friendly errors).
- **Admin → Settings**: add/remove custom asset fields (text, number, date,
  dropdown with editable options), toggle categories on/off, switch theme
  (Slate / Indigo / Emerald — applies for everyone), manage user accounts.
- **Admin → Assets**: sortable table on desktop, tap-friendly cards on mobile;
  Asset ID, name, category, purchase date, price, vendor, live warranty badge
  (green active / red expired), custom fields on every asset form.
- **Admin → Overview**: live warranty counters (active / expiring ≤30 d /
  expired / none) and repair queue.
- **Admin → Assignments**: assign available assets to employees; record returns
  with date, condition, and reason.
- **Admin → Repairs**: advance requests Submitted → Acknowledged → In repair,
  then resolve with action taken, cost, and next service date (writes the
  maintenance log and frees the asset).
- **Admin → Audit log**: append-only timeline of every admin change (who, what,
  when). No update/delete endpoints exist for it.
- **Employee portal**: card grid of own assets (1 col mobile → 4 col desktop),
  repair form with urgency picker and camera/file photo upload, 4-step visual
  progress bar per request, and maintenance history with costs and next
  service dates.

## Notes

- SQLite keeps deployment to one file; swap `SQLALCHEMY_DATABASE_URL` in
  `database.py` for Postgres/MySQL if the team outgrows it.
- Photo uploads accept JPEG/PNG/WebP up to 8 MB and are stored under
  server-generated names (no user-controlled paths).
- Deleting an asset retires it (soft delete) so repair and maintenance history
  survives.
