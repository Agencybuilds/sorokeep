# Superseded artifacts

Kept for reference only. Nothing here should be run or treated as current.

- `create_issues.11-issue-backlog.ps1` — generator for the original 11-issue backlog.
  Superseded by `docs/backlog/create_issues.ps1`, which is generated from the epic JSON
  and creates 285 issues. The old script was never executed or syntax-checked; the
  handoff addendum says so explicitly. Running it now would create a backlog that
  contradicts the current one.

The 11 issues it created were not wrong so much as radically under-decomposed: five of
them (scaffold, events-reader, Reflector, wireframes, frontend) were whole subsystems
rather than issues, and the set was a strictly linear chain that could occupy exactly one
contributor. It also had no coverage for CI, testnet deployment, backend configuration,
end-to-end testing, the FR-8 medium-threshold security requirement, or the fact that
authorization is never actually exercised by any test.
