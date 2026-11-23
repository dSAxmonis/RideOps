# RideOps Pre-Escalation Check

An internal tool that helps L1 support agents clear tickets that already have an engineering verdict, then decide whether new tickets really need engineering.

**Live demo:** https://rideops-precheck.vercel.app (no login; the first load can take about a minute while the free server wakes)

## The result

- 34 of the 48 tickets open at the 30 Sep snapshot (71%) already have an engineering verdict, and 19 of those are still labelled with Engineering. This is a one-time cleanup opportunity that must be validated. If clients confirm the 12 marked Fixed, open tickets would move from 48 to 36.
- 52.1% of escalations (253 of 486) came back without an engineering fix.
- The 7-day average of open tickets rose from 29.0 (25-31 Jul) to 49.9 (24-30 Sep). Intake rose about 40%, so this tool alone cannot restore July levels.
- Scenario estimate for the check: 10-19% fewer open tickets. It has not been measured live.
- September replay of 189 escalations: 25 held, 15 of them avoidable, 10 of 78 true bugs delayed, 0 of 9 P1s held. It is **not a clean holdout**, and the needs-info verdict could not be replayed.

## Features

- **Burn-down:** the 48 snapshot tickets in next-action lanes, with status mismatches flagged.
- **Pre-escalation check:** written proof for each required step, an advisory verdict, and a logged override. P1 tickets are never held.
- **Known issues and draft playbooks:** issues derived from repeated duplicates, plus category steps that still need team review.
- **Impact:** live activity, weekly measures, guardrails and the replay.

## Architecture

```text
Browser -> Next.js web app -> FastAPI -> tickets CSV (read-only)
           (server proxy)            -> SQLite or Postgres (decisions, backlog actions)
```

- `backend/`: check, burn-down, known issues, replay, metrics and name masking.
- `web/`: Burn-down, Queue, ticket workspace and Impact. Its server proxy holds the API code and allows only listed routes.
- Verdicts use only fields known at triage and outcomes closed before the ticket was created.
- Backlog actions are recorded in the tool and never change the source data.

## Run locally

Requires Python 3.12, Node 20.19 or later, and the case study CSV. Keep the CSV outside the repository.

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
cp .env.example .env   # set ACCESS_CODE and RIDEOPS_DATA_PATH
.venv/bin/uvicorn app.main:app --port 8000
```

In a second terminal:

```bash
cd web
npm ci
cp .env.example .env.local   # set the same ACCESS_CODE
npm run dev
```

Open <http://localhost:3000>.

## Environment variables

| Service | Variable | Purpose |
| --- | --- | --- |
| API | `ACCESS_CODE` | Shared code required on API requests |
| API | `RIDEOPS_DATA_PATH` | Absolute path to the tickets CSV |
| API | `DATABASE_URL` | SQLite by default, or a `postgresql://` URL |
| API | `MASK_NAMES` | `true` replaces names with `Client NNN` and `Agent A`-`H` |
| API | `WARM_REPORTS` | `true` starts computing the backtest at startup |
| Web | `API_BASE_URL` | API base URL, without `/api/v1` |
| Web | `ACCESS_CODE` | Same value as the API; used only by the server proxy |

## Tests

```bash
cd backend && .venv/bin/pytest && .venv/bin/ruff check .
cd web && npm test && npm run lint && npm run typecheck
```

## Deploy notes

- API: `render.yaml` defines a Docker service. Add the CSV as a Render secret file and set `ACCESS_CODE`, `MASK_NAMES` and a Postgres `DATABASE_URL`.
- Web: deploy `web/` to a Next.js host and set `API_BASE_URL` and `ACCESS_CODE` as server-side variables.

## Known limits

- **The demo has no login.** Anyone with the link can record actions, and the "Acting as" name is not verified.
- **The demo database is temporary.** Render's free Postgres expires on 2026-12-23, after which recorded actions are lost unless migrated.
- The verdict field has no timestamp and ticket status may lag it, so each of the 34 needs validation.
- Clearing a ticket is recorded activity, not proof the client's issue is resolved.
- Proof is checked for length only, so it can be gamed and needs sampling.
- Masking is pseudonymous, not anonymous: labels follow sorted names and can be reversed with the source data.
- The data is one 13-week snapshot. Engineering effort and queue time are not in it, so any hours saved are assumptions.
