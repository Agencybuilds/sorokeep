# Lumens Vault — Epic Index

The backlog is two layers: **17 epics** (tracking containers, one GitHub milestone group each)
and the issues beneath them. Dependencies are declared **per issue**, never as a global chain,
so work parallelises across contributors — the single biggest defect in the previous
11-issue backlog (G-25).

Every issue cites requirement IDs from `REQUIREMENTS.md`. `COVERAGE.md` proves every ID is hit.

## Milestones

| Milestone | Epics | Theme |
|-----------|-------|-------|
| **LV0 — Foundation** | E01 | Unblock the repo, make the docs true |
| **LV1 — Contract** | E02, E03, E04, E05 | Lock periods, storage lifecycle, auth, test coverage |
| **LV2 — Deploy & Backend Core** | E06, E07, E08, E09 | CI, testnet deploy, ingestion, state |
| **LV3 — Integrations** | E10, E11, E12 | Sorokeep, Reflector, read API |
| **LV4 — Design & Frontend Base** | E13, E14 | Wireframes (FR-24 gate), wallet |
| **LV5 — Frontend & Release** | E15, E16, E17 | Flows, ops page, E2E, handover |

## Epics

| ID | Epic | Milestone | Issues | Primary requirements |
|----|------|-----------|-------:|----------------------|
| E01 | Repo Hygiene & Project Foundation | LV0 | 14 | G-1…G-6, G-15, G-18, G-19, G-21, NFR-7 |
| E02 | Contract: Lock Periods & Configuration | LV1 | 16 | FR-2, FR-13, G-13, D-6 |
| E03 | Contract: Storage Lifecycle & Correctness | LV1 | 12 | FR-3, FR-4, FR-11, NFR-5, NFR-6, G-11, G-12 |
| E04 | Contract: Authorization & Security Hardening | LV1 | 14 | FR-8, FR-9, FR-10, FR-12, FR-14, NFR-1, G-9, G-10, D-2, D-9 |
| E05 | Contract: Test Coverage & Verification | LV1 | 22 | NFR-2, NFR-3, G-8, G-22, G-23 |
| E06 | Deployment, CI & Release Engineering | LV2 | 20 | FR-9, G-14, G-15, D-6, D-7 |
| E07 | Backend: Foundation, Config & Persistence | LV2 | 22 | NFR-4, G-4, G-7, G-16, G-17, D-10 |
| E08 | Backend: Event Ingestion | LV2 | 22 | FR-17, D-3, NFR-4 |
| E09 | Backend: State Reconstruction & Admin Actions | LV2 | 18 | FR-17, FR-18, FR-11 |
| E10 | Backend: Sorokeep Integration | LV3 | 14 | FR-15, FR-16, G-7, D-1, D-4 |
| E11 | Backend: Reflector Valuation | LV3 | 16 | FR-19 |
| E12 | Backend: Read API & Observability | LV3 | 16 | FR-17, FR-18, FR-22, G-24, NFR-4 |
| E13 | Design: Wireframes & Design System | LV4 | 12 | FR-24, FR-21, FR-23, D-8 |
| E14 | Frontend: Foundation & Wallet | LV4 | 14 | FR-20, G-17 |
| E15 | Frontend: Core Flows | LV5 | 24 | FR-21, FR-22, FR-3, FR-5 |
| E16 | Frontend: Operations & Polish | LV5 | 14 | FR-23, FR-19 |
| E17 | Integration, E2E & Handover | LV5 | 14 | G-20, G-21, NFR-1, D-5 |
| | **Total** | | **284** | |

## Epic scope notes

**E01 — Repo Hygiene & Project Foundation.** Everything blocking the first commit, plus making
the existing documents true. The nested `.git` (G-1) gates literally all other work, so it is
the only issue in the backlog with no dependencies and everything else transitively behind it.
Also lands the missing README, CI skeleton, LICENSE, and the TECH_SPEC corrections.

**E02 — Lock Periods & Configuration.** The old Issue 2, decomposed. Config struct shape,
constructor validation, `deposit` signature, `update_config`, the `get_lock_bounds` view, the
`ConfigUpdatedEvent`, checked arithmetic on both `unlock_ledger` and the vault-id counter, and
keeping the v2 fixture byte-compatible.

**E03 — Storage Lifecycle & Correctness.** The entry-lifecycle work the old backlog missed
entirely: zero-balance vault cleanup (G-11), `remove_asset` actually deleting (G-12), and
explicit verification that TTL extension touches only what it should (NFR-5).

**E04 — Authorization & Security Hardening.** Built around the largest test gap in the project:
`mock_all_auths()` means no test has ever proven an unauthorized caller is rejected (G-9). Also
closes the FR-8 medium-threshold requirement, which had no issue at all.

**E05 — Test Coverage & Verification.** Every `Error` variant (NFR-2), event topic counts
(NFR-3), partial withdrawal (G-22), multiple vaults (G-23), and a real root-cause investigation
of the flaky upgrade test rather than the prescribed one-line pin (G-8).

**E06 — Deployment, CI & Release Engineering.** CI is new (G-15). Deploying to testnet is new
(G-14) — the old backlog wrote a deploy script and then assumed a deployed contract existed.

**E07 — Backend: Foundation, Config & Persistence.** Scaffold, configuration (G-16), the SQLite
schema, and the `sorokeep` dependency problem (G-7/D-10), which blocks E10 and must be resolved
before the webhook work can compile.

**E08 / E09 — Ingestion and State.** The old Issue 6 split along its real seams: transport and
cursoring in E08, domain reconstruction and admin-action detection in E09.

**E10 — Sorokeep Integration.** Registration, guard policy, per-entry storage keys (D-1), the
webhook receiver, and the Operations-page data-source decision (D-4).

**E13 — Design.** FR-24 is a hard gate: no E15/E16 issue may start until the E13 approval issue
is closed. That dependency is declared on each frontend issue, not assumed.

**E17 — Integration, E2E & Handover.** End-to-end coverage across all three deployables (G-20),
the pre-mainnet security checklist (NFR-1), and the post-Wave-9 repo migration (G-21).

## Conventions every issue follows

- **Title**: `E<nn>-<nn> <imperative summary>` — e.g. `E02-03 Validate lock bounds in __constructor`.
- **Body sections**, in order: Requirements, Depends on, Scope, Files, Acceptance criteria, Non-goals.
- **Depends on** lists specific issue IDs, or `nothing`. Never "the previous issue".
- **Every path** is repo-relative and begins `lumens-vault/`. Nothing outside it is ever touched.
- **Acceptance criteria** are checkboxes and are the definition of done. Anything asking for
  verification names the command whose real output must appear in the PR.
- **Non-goals** are binding. Scope creep is rejected at review, not negotiated.
