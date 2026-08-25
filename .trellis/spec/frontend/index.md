# Frontend Development Guidelines

> Best practices for frontend development in this project.

---

## Overview

This directory contains guidelines for frontend development. Every file listed below is filled from
real code in `app/`, `src/` and `modules/`.

`hook-guidelines.md` was untouched bootstrap scaffolding — placeholder markers only — and was
**deleted on 2026-08-21**. The client's entire custom-hook surface is two providers —
`src/stores/workspace/WorkspaceProvider.tsx` (`useWorkspace()`) and
`src/stores/secure-workspace/SecureWorkspaceProvider.tsx` — and both are already specified in
[State Management](./state-management.md) together with the `useSyncExternalStore` commit rule. A
separate hook file would only duplicate it. Add one back when hooks exist that are not provider
accessors.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Expo Router root and layer boundaries | Active |
| [Component Guidelines](./component-guidelines.md) | Component boundaries, cross-platform icons, testing | Active |
| [State Management](./state-management.md) | Committed workspace session, provider hooks, local UI-state contracts | Active |
| [Quality Guidelines](./quality-guidelines.md) | SDK 56, config, native build, and quality contracts | Active |
| [Production Identity](./production-identity.md) | Android identity persistence, Keystore, DTO, and reset contracts | Active |
| [Type Safety](./type-safety.md) | Readonly data types, derived unions, port interfaces, strict-flag rules | Active |

---

## How to Fill These Guidelines

For each guideline file:

1. Document your project's **actual conventions** (not ideals)
2. Include **code examples** from your codebase
3. List **forbidden patterns** and why
4. Add **common mistakes** your team has made

The goal is to help AI assistants and new team members understand how YOUR project works.

---

**Language**: All documentation should be written in **English**.
