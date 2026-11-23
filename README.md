# RideOps Pre-Escalation Check

An internal tool that helps an L1 support agent decide whether a ticket really needs engineering, before escalating it.

**Live demo: TBD**

## Who it is for

L1 support agents at RideOps, a fictional employee transport company. The support lead and head of operations use its Impact page to follow the weekly measures.

## The result

- 52.1% of escalations (253 of 486) came back without an engineering fix: missing information, configuration, how-to or a known duplicate.
- The 7-day average of end-of-day open tickets rose from 29.0 (25-31 Jul) to 49.9 (24-30 Sep). Intake rose about 40% over a similar period, so this tool alone cannot restore July levels.
- Scenario estimate: 10-19% fewer open tickets. This depends on agent adoption and has not been measured live.
- September replay of 189 escalations: 25 held, 15 of them avoidable, 10 of 78 true bugs delayed, 0 of 9 P1s held.
- The replay is **not a clean holdout**: one rule was demoted after its September precision was seen. The missing-information check could not be replayed because past checklist evidence does not exist.

## Architecture

```text
Browser -> Next.js web app -> FastAPI -> tickets CSV (read-only)
           (session, proxy)          -> SQLite or Postgres (agent decisions)
```

- `backend/`: FastAPI service with the check, replay and weekly metrics.
- `web/`: Next.js queue, ticket workspace and Impact page. The access code stays server-side in an encrypted session cookie.
- Verdicts use only fields known at triage and outcomes closed before the ticket was created.
- The check is advisory. P1 tickets are never held, and agents can override any hold by giving a reason.

## Run locally

Requires Python 3.12, Node 20.19 or later, and the case study CSV. Keep the CSV outside the repository.

API:

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env   # then set ACCESS_CODE and RIDEOPS_DATA_PATH
.venv/bin/uvicorn app.main:app --port 8000
```

Web, in a second terminal:

```bash
cd web
npm ci
cp .env.example .env.local   # then set SESSION_SECRET
npm run dev
```

Open <http://localhost:3000> and sign in with your `ACCESS_CODE`.

## Environment variables

| Service | Variable | Purpose |
| --- | --- | --- |
| API | `ACCESS_CODE` | Shared code required on API requests |
| API | `RIDEOPS_DATA_PATH` | Absolute path to the tickets CSV |
| API | `DATABASE_URL` | SQLite by default, or a `postgresql://` URL |
| Web | `API_BASE_URL` | API base URL, without `/api/v1` |
| Web | `SESSION_SECRET` | At least 32 characters; encrypts the session cookie |

## Tests

```bash
cd backend && .venv/bin/pytest && .venv/bin/ruff check .
cd web && npm test && npm run lint && npm run typecheck
```

## Deploy notes

- API: `render.yaml` defines a Docker service. Add the CSV as a Render secret file and set `ACCESS_CODE` in the dashboard.
- Web: deploy `web/` to a Next.js host and set `API_BASE_URL` and `SESSION_SECRET` as server-side variables.
- The default free-tier SQLite path is temporary. Set a Postgres `DATABASE_URL` to keep decisions across restarts.

## Known limits

- The data is one 13-week snapshot, and the earliest July days understate the backlog because the file starts empty.
- Engineering effort and queue time are not in the data, so any hours saved are assumptions.
- The missing-information verdict has not been backtested.
- Ticket descriptions are short templates, so similar-ticket matches are thin evidence.
- One shared access code is enough for a demo but not for production. Production would need per-user sign-in.
