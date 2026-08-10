# AmFile server

Backend for multi-user editing, check-out locking, and the 21 CFR Part 11 technical controls.

## Infrastructure

| | |
|---|---|
| Host | Databricks Apps (workspace `aip-amn-dev`) |
| Database | Lakebase Postgres 16.14, instance `amfile-dev` |
| Region | `us-east-1` (AWS) |
| Capacity | `CU_1`, 1 node, 7-day retention |

**`aip-amn-dev` is a development workspace.** Regulated ANDA records must not live here. A
production instance is required before real use.

**This is AWS-hosted, not on-prem.** For QA that makes it a cloud vendor-qualification
question (Annex 11 §3.1 formal agreement, MHRA §6.20 cloud and restore provisions), not a
closed-network one. Amneal already runs other apps on this platform, so that qualification
may already exist — confirm with QA rather than assuming.

## Connecting

```bash
databricks psql amfile-dev
```

Auth is the Databricks identity of whoever runs the command; there is no separate Postgres
password. `pg_native_login` is deliberately disabled so every connection is attributable to
a Databricks principal — which is what makes the audit trail's user attribution meaningful.

## Migrations

Applied in order, by hand for now:

```bash
databricks psql amfile-dev -- -v ON_ERROR_STOP=1 -f server/migrations/001_init.sql
```

| Migration | What it does |
|---|---|
| `001_init.sql` | users, roles, documents, append-only `document_revisions`, locks, comments, signatures, hash-chained `audit_log` |
| `002_truncate_guard.sql` | Blocks `TRUNCATE` on the append-only tables — row triggers don't fire on it |

## Append-only guarantees

`document_revisions`, `signatures` and `audit_log` reject `UPDATE`, `DELETE` and `TRUNCATE`
via triggers. All four attack paths were tested against the live database and confirmed
blocked, with the underlying rows surviving intact.

Be honest about the limit: **a superuser can always disable a trigger.** Prevention inside
the database is not absolute. That is precisely why `audit_log` is hash-chained — so
tampering is *detectable* even when it cannot be prevented, which is what can actually be
demonstrated to an inspector.

## Why not git for versioning

Considered and rejected. Git history is rewritable by design (rebase, force-push, `gc`),
which is a liability under §11.10(e) — "record changes shall not obscure previously recorded
information." Git's real strengths here (branching, delta compression) buy nothing for this
use case. Append-only revision rows give full history, are genuinely immutable, and are
simpler to operate and to validate.
