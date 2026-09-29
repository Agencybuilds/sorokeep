# Lumens Vault — Scaffold Brief

**Audience:** whoever/whatever is about to generate the initial `backend/`
and `frontend/` folder structure (currently: Gemini, in Antigravity).
**This document's job:** make that task bounded and checkable, not
open-ended. Read it fully before creating anything.

## Ground truth, in this order of authority

1. `lumens-vault/docs/TECH_SPEC.md` — what the system must do
2. `lumens-vault/docs/SYSTEM_DESIGN.md` — how the pieces are arranged
3. This document — the specific, bounded scaffolding task

If anything here conflicts with those two, they win. Stop and flag the
conflict instead of guessing which is right.

## What this task is, precisely

Create the folder/file skeleton for `lumens-vault/backend/` and
`lumens-vault/frontend/`. Nothing else. This corresponds exactly to the
"Scaffold backend and frontend folder structure" issue in the project's
issue backlog — that issue's acceptance criteria is the actual definition
of done; this document is the detailed brief for satisfying it.

## Hard rules

These exist because of specific, real things that happened earlier on this
project — not generic caution:

- **No business logic.** Every non-trivial function is a stub: a clear
  `// TODO: implemented in issue "<name>"` comment and a thrown
  `not implemented` error. Nothing here should look like it works yet,
  because it doesn't.
- **No extra features, dependencies, files, or folders beyond what's
  listed below.** If something seems obviously missing, flag it — don't
  add it.
- **Touch nothing outside `lumens-vault/`.** Not `sorokeep`'s own `src/`,
  `docs/`, `README.md`, or anything else at the repo root above
  `lumens-vault/`.
- **Do not modify `lumens-vault/contracts/`.** Both crates in there are
  complete, tested, and out of scope for this task entirely.
- **No real frontend UI.** Route files exist as placeholders only.
  Frontend implementation is explicitly blocked on wireframe approval
  (`TECH_SPEC.md` FR-24) — that gate applies here too, not just to later
  implementation work.
- **If genuinely unsure whether something is in scope, stop and ask.**
  Guessing and building past the boundary is exactly what went wrong here
  before.

## Backend: `lumens-vault/backend/`

Language: TypeScript, Node. (Reason, stated once so it isn't re-litigated:
the backend installs `sorokeep` as an npm dependency to call
`verifyWebhookSignature` natively — any other language means shelling out
or reimplementing HMAC verification, which is the exact "reinvent what
Sorokeep already does" mistake this project made once already.)

```
backend/
├── src/
│   ├── domain/
│   │   ├── vault-state.ts         # function signatures only, throw not-implemented
│   │   ├── alert-correlation.ts   # function signatures only
│   │   └── valuation.ts           # function signatures only
│   ├── ports/
│   │   ├── event-source.ts        # interface IEventSource — real, complete interface
│   │   ├── price-oracle.ts        # interface IPriceOracle
│   │   ├── alert-sink.ts          # interface IAlertSink
│   │   └── persistence.ts         # interface IVaultRepository
│   ├── adapters/
│   │   ├── soroban-rpc/index.ts   # class implementing IEventSource, stubbed
│   │   ├── reflector/index.ts     # class implementing IPriceOracle, stubbed
│   │   ├── sorokeep-webhook/index.ts  # stubbed
│   │   └── sqlite/index.ts        # class implementing IVaultRepository, stubbed
│   └── api/
│       └── index.ts               # HTTP server bootstrap, no real routes yet
├── test/
│   └── (one placeholder/pending test file per module above)
├── package.json
├── tsconfig.json
└── .gitignore
```

`package.json` dependencies: `sorokeep`, `@stellar/stellar-sdk`,
`better-sqlite3`, `express` (matches the convention already observed
across comparable real Soroban dapp backends), `vitest` as the test
framework (matches Sorokeep's own choice — no reason to introduce a second
test framework into this ecosystem).

**Ports are the one place real content matters in this task.** Each
interface in `ports/` should be a genuine, complete TypeScript interface
derived from what `SYSTEM_DESIGN.md` §1.3 describes each adapter needs to
do — not a stub. Everything else (domain, adapters, api) is a stub that
compiles and satisfies its interface, nothing more.

No root-level monorepo/workspace tool (Turborepo, Nx, etc.). `backend/`
and `frontend/` don't share code — they talk over HTTP through `api/` —
so there's no shared-package problem to solve yet. Don't introduce one
speculatively.

## Frontend: `lumens-vault/frontend/`

Standard `create-next-app` defaults, TypeScript, app router. Four route
stubs, each just a heading and a one-line comment saying what it will
eventually be, per `TECH_SPEC.md` FR-21 through FR-23:

```
frontend/
├── app/
│   ├── page.tsx              # dashboard — placeholder only
│   ├── deposit/page.tsx      # deposit flow — placeholder only
│   ├── vaults/page.tsx       # my vaults — placeholder only
│   └── operations/page.tsx   # ops/health page — placeholder only
├── package.json
├── tsconfig.json
└── next.config.ts
```

No wallet integration code. No API calls. No styling decisions — all of
that is downstream of wireframe approval.

## Definition of done

- [ ] Folder tree matches exactly what's specified above — nothing extra
- [ ] `npm install && npm run build` succeeds in `backend/` with zero errors
- [ ] `npm install && npm run dev` starts the Next.js app in `frontend/`
      with zero errors
- [ ] Zero business logic anywhere — confirm by grep: no function body
      longer than a `throw` or a `TODO` comment
- [ ] Nothing outside `lumens-vault/` was touched — confirm with
      `git status` before committing
- [ ] The PR description lists every file created, so review is a
      checklist match against this document, not a re-read of every file
