# Backend Development Guidelines

> Best practices for backend development in this project.

---

## Overview

`server-foundation.md` owns workspace, bootstrap, durable SQLite and redacted logging conventions.
`pairing-api.md` owns the implemented signed identity and pairing HTTP contract. The split is backed
by production code: the server now exposes identity registration/prekey management plus invitation,
request relay, verification and event routes over schema v5.

The five split files (`directory-structure`, `database-guidelines`, `error-handling`,
`logging-guidelines`, `quality-guidelines`) existed as untouched bootstrap scaffolding — every section
still carried its "to be filled" placeholder — and were **deleted on 2026-08-21** rather than left to
read as filled. Their subjects are already covered by `server-foundation.md`:

| Deleted file | Where its subject now lives |
|---|---|
| `directory-structure.md` | §2 Signatures — the `server/src/**` layout table |
| `database-guidelines.md` | §3 Contracts (better-sqlite3, prepared statements, typed projections, per-migration transaction, WAL / foreign keys / busy timeout), §6 Tests Required |
| `error-handling.md` | §4 Validation & Error Matrix — stable config/schema error codes, rollback-and-abort |
| `logging-guidelines.md` | §3 Contracts — the `RedactedLogger` contract and the forbidden-field list |
| `quality-guidelines.md` | §2 quality commands, §4 "warnings mean the gate is unclean", §6 Tests Required |

The deleted bootstrap scaffolds stay deleted. Add a new backend spec only after its corresponding
runtime boundary and tests exist; never recreate placeholder-only files.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Pairing Service Foundation](./server-foundation.md) | Nest workspace, SQLite, logs, native dependency gates | Active |
| [Signed Pairing API](./pairing-api.md) | Canonical signatures, identity/prekey contracts, pairing state and stable failures | Active |

---

## How to Fill These Guidelines

For each guideline file:

1. Document your project's **actual conventions** (not ideals)
2. Include **code examples** from your codebase
3. List **forbidden patterns** and why
4. Add **common mistakes** your team has made

The goal is to help AI assistants and new team members understand how YOUR project works.
Add a file only when there is code to document; an empty template is worse than a missing file
because a manifest can inject it and a reader cannot tell the difference.

---

**Language**: All documentation should be written in **English**.
