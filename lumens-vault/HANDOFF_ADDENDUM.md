# Handoff Addendum: supersedes parts of PROJECT HANDOFF CONTEXT

Read this together with the handoff document. Where they differ, **this addendum wins**.

## Superseded sections

| Handoff section | Replaced by | Why |
|---|---|---|
| §6.7 "suggested port shapes" (prose) | `ports/event-source.ts`, `price-oracle.ts`, `alert-sink.ts`, `persistence.ts` | Real interfaces. Verified with `tsc --strict --noEmit`, 0 errors (NodeNext, ES2022). Use them as the four files under `lumens-vault/backend/src/ports/` during Issue 5. Shared types live inside these four files, so no extra files are needed and the scaffold brief's tree is unchanged. |
| §6.9 `create_issues.ps1` skeleton | `create_issues.ps1` (complete) | The skeleton omitted every issue body. |
| Phase 0, step 6 ("patch the backlog and script with the gaps") | Already done | The new script and backlog include: `get_lock_bounds` view and `ConfigUpdatedEvent` (Issue 2), constructor-flag verification (Issue 3), event topic-count test (Issue 4), whitelist derivation from events (Issue 6), Sorokeep assumption check and Operations data-source decision (Issue 7), stale/unavailable/archived UI states (Issue 10). |
| `ISSUE_BACKLOG.md` (earlier versions) | `ISSUE_BACKLOG.md` (v3) | Generated from the same data as the script, so they cannot disagree. |

## Bugs fixed in the script versus the earlier one

1. **Labels did not exist.** `gh issue create` fails on a missing label. The old script used `good-first-issue` (GitHub's default is `good first issue`, with spaces), plus `contract`, `backend`, `devops` and others that don't exist by default. The new script creates every label first.
2. **`blocked` label removed.** It went stale immediately and Issue 10 was never actually blocked. Dependencies are stated in each body instead.
3. **No `$` or backtick escaping hazards.** All bodies are single-quoted here-strings with `{{DEPn}}` tokens substituted at runtime.

## What has and has not been verified

- VERIFIED: the four ports type-check.
- NOT EXECUTED: `create_issues.ps1`. There was no PowerShell or `gh` in the authoring environment. Only structure was checked (11 balanced here-strings, 11 calls, every `{{DEPn}}` resolves to an earlier issue). First run it once and read the output. Do not treat it as tested.
- NOT VERIFIED: `stellar contract deploy ... -- --help` flag spelling, live `sorokeep guard --help`, Reflector contract IDs, provider retention windows. Those are acceptance criteria in Issues 3, 7, 9 and 6 respectively and must be checked against live sources.

## Still open, needs the user

- Confirm Lumens Vault issues may live in `TegoLabs/sorokeep`'s tracker (label `lumens-vault`).
- Confirm nothing has been deployed anywhere (Issue 2 edits `VaultConfigV1` in place on that assumption).
