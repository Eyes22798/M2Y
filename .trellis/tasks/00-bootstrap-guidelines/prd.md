# Bootstrap Task: Fill Project Development Guidelines

**You (the AI) are running this task. The developer does not read this file.**

The developer just ran `trellis init` on this project for the first time.
`.trellis/` now exists with empty spec scaffolding, and this bootstrap task
exists under `.trellis/tasks/`. When they want to work on it, they should start
this task from a session that provides Trellis session identity.

**Your job**: help them populate `.trellis/spec/` with the team's real
coding conventions. Every future AI session — this project's
`trellis-implement` and `trellis-check` sub-agents — auto-loads spec files
listed in per-task jsonl manifests. Empty spec = sub-agents write generic
code. Real spec = sub-agents match the team's actual patterns.

Don't dump instructions. Open with a short greeting, figure out if the repo
has any existing convention docs (CLAUDE.md, .cursorrules, etc.), and drive
the rest conversationally.

---

## Status (update the checkboxes as you complete each item)

- [x] Fill backend guidelines — as one `server-foundation.md`, per the decision below
- [x] Fill frontend guidelines — 5 real files; `hook-guidelines.md` deleted as duplicative
- [x] Add code examples — every remaining spec file carries code blocks and real repo paths

> **Resolved — 2026-08-21 (developer chose option b).** The 7 unfilled templates are gone. Final
> state of `.trellis/spec/`: **12 md files, 0 placeholders.**
>
> | Action | Files |
> |---|---|
> | Deleted (untouched `(To be filled by the team)` scaffolding) | `backend/{directory-structure,database-guidelines,error-handling,logging-guidelines,quality-guidelines}.md`, `frontend/hook-guidelines.md` |
> | Filled from real code this round | `frontend/type-safety.md` |
> | Already real | `backend/{index,server-foundation}.md`, `frontend/{index,directory-structure,component-guidelines,state-management,quality-guidelines,production-identity}.md`, `guides/*` |
>
> **Why the 5 backend files were deleted rather than written.** `server/src/` is 12 files exposing
> only `GET /health`; five separate convention files over that surface would be aspirational spec,
> which Step 3 below explicitly forbids and which sub-agents then imitate. `server-foundation.md`
> (116 lines) already covers all five subjects — the mapping is tabulated in `backend/index.md`,
> along with the trigger to split it back out: once `08-20-ciphertext-sync-foundation` lands envelope
> routes, outbox/inbox, cursors and device auth, the file will be carrying genuinely separate
> concerns and should be re-split **from real code**.
>
> **Why `frontend/hook-guidelines.md` was deleted.** The client's whole custom-hook surface is two
> providers (`WorkspaceProvider` → `useWorkspace()`, `SecureWorkspaceProvider`), both already
> specified in `state-management.md` with the `useSyncExternalStore` commit rule. A separate file
> could only duplicate it.
>
> **Why `frontend/type-safety.md` was filled instead.** It had real, uncovered surface:
> `src/domain/<area>/types.ts` and `src/application/<area>/contracts.ts`, the `as const` +
> `(typeof x)[number]` derived-union pattern, `Readonly<{}>` for data vs `interface` for the 6
> method-bearing ports, result unions instead of thrown errors, and the four strict compiler flags.
> Verified against the code while writing it: **0 `enum`, 0 `any`, 6 `interface` declarations (all
> ports in `src/application/*/contracts.ts`), and `!` only in the dev harness `src/testing/e2ee/`.**
>
> **One wiring defect fixed along the way.**
> `.trellis/tasks/08-20-m2y-product-progress-roadmap/check.jsonl` line 2 was injecting the *empty*
> `backend/quality-guidelines.md` into every `trellis-check` run — the one live manifest reference to
> a template. Repointed to `backend/server-foundation.md`. All jsonl targets and all intra-spec
> markdown links were then verified to resolve.
>
> This corrects finding **Low #15** in
> `.trellis/tasks/08-20-m2y-product-progress-roadmap/research/2026-08-21-full-audit.md`, which read
> "18 md files exist" as "spec is filled, only the checklist was never written back" and recommended
> an immediate `finish` + `archive`. The file count was right; the conclusion was not — 7 of those 18
> were empty. Lesson: a file count is not evidence of fill state.
>
> This task is now finishable. See Completion below.

---

## Spec files to populate

> The tables below are the **original bootstrap scaffolding list**, kept for provenance. The columns
> record what each file was supposed to document and what actually happened on 2026-08-21. The live
> index is `.trellis/spec/{backend,frontend}/index.md`, not this list.


### Backend guidelines

| File | What to document | Outcome |
|------|------------------|---------|
| `.trellis/spec/backend/directory-structure.md` | Where different file types go (routes, services, utils) | deleted → `server-foundation.md` §2 |
| `.trellis/spec/backend/database-guidelines.md` | ORM, migrations, query patterns, naming conventions | deleted → `server-foundation.md` §3, §6 |
| `.trellis/spec/backend/error-handling.md` | How errors are caught, logged, and returned | deleted → `server-foundation.md` §4 |
| `.trellis/spec/backend/logging-guidelines.md` | Log levels, format, what to log | deleted → `server-foundation.md` §3 |
| `.trellis/spec/backend/quality-guidelines.md` | Code review standards, testing requirements | deleted → `server-foundation.md` §2, §4, §6 |


### Frontend guidelines

| File | What to document | Outcome |
|------|------------------|---------|
| `.trellis/spec/frontend/directory-structure.md` | Component/page/hook organization | filled |
| `.trellis/spec/frontend/component-guidelines.md` | Component patterns, props conventions | filled |
| `.trellis/spec/frontend/hook-guidelines.md` | Custom hook naming, patterns | deleted → `state-management.md` (only 2 provider hooks exist) |
| `.trellis/spec/frontend/state-management.md` | State library, patterns, what goes where | filled |
| `.trellis/spec/frontend/type-safety.md` | TypeScript conventions, type organization | filled 2026-08-21 |
| `.trellis/spec/frontend/quality-guidelines.md` | Linting, testing, accessibility | filled |

Added by later tasks, outside the original list: `backend/server-foundation.md`,
`frontend/production-identity.md`.


### Thinking guides (already populated)

`.trellis/spec/guides/` contains general thinking guides pre-filled with
best practices. Customize only if something clearly doesn't fit this project.

---

## How to fill the spec

### Step 1: Import from existing convention files first (preferred)

Search the repo for existing convention docs. If any exist, read them and
extract the relevant rules into the matching `.trellis/spec/` files —
usually much faster than documenting from scratch.

| File / Directory | Tool |
|------|------|
| `CLAUDE.md` / `CLAUDE.local.md` | Claude Code |
| `AGENTS.md` | Codex / Claude Code / agent-compatible tools |
| `.cursorrules` | Cursor |
| `.cursor/rules/*.mdc` | Cursor (rules directory) |
| `.windsurfrules` | Windsurf |
| `.clinerules` | Cline |
| `.roomodes` | Roo Code |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.vscode/settings.json` → `github.copilot.chat.codeGeneration.instructions` | VS Code Copilot |
| `CONVENTIONS.md` / `.aider.conf.yml` | aider |
| `CONTRIBUTING.md` | General project conventions |
| `.editorconfig` | Editor formatting rules |

### Step 2: Analyze the codebase for anything not covered by existing docs

Scan real code to discover patterns. Before writing each spec file:
- Find 2-3 real examples of each pattern in the codebase.
- Reference real file paths (not hypothetical ones).
- Document anti-patterns the team clearly avoids.

### Step 3: Document reality, not ideals

**Critical**: write what the code *actually does*, not what it should do.
Sub-agents match the spec, so aspirational patterns that don't exist in the
codebase will cause sub-agents to write code that looks out of place.

If the team has known tech debt, document the current state — improvement
is a separate conversation, not a bootstrap concern.

---

## Quick explainer of the runtime (share when they ask "why do we need spec at all")

- Every AI coding task spawns two sub-agents: `trellis-implement` (writes
  code) and `trellis-check` (verifies quality).
- Each task has `implement.jsonl` / `check.jsonl` manifests listing which
  spec files to load.
- The platform hook auto-injects those spec files + the task's `prd.md`
  into every sub-agent prompt, so the sub-agent codes/reviews per team
  conventions without anyone pasting them manually.
- Source of truth: `.trellis/spec/`. That's why filling it well now pays
  off forever.

---

## Completion

When the developer confirms the checklist items above are done with real
examples (not placeholders), guide them to run:

```bash
python3 ./.trellis/scripts/task.py finish
python3 ./.trellis/scripts/task.py archive 00-bootstrap-guidelines
```

After archive, every new developer who joins this project will get a
`00-join-<slug>` onboarding task instead of this bootstrap task.

---

## Suggested opening line

"Welcome to Trellis! Your init just set me up to help you fill the project
spec — a one-time setup so every future AI session follows the team's
conventions instead of writing generic code. Before we start, do you have
any existing convention docs (CLAUDE.md, .cursorrules, CONTRIBUTING.md,
etc.) I can pull from, or should I scan the codebase from scratch?"
