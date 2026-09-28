# Port interfaces — staging

These four files are the hexagonal port interfaces the backend is built around. They were
written and type-checked (`tsc --strict --noEmit`, NodeNext, ES2022, zero errors) before
`backend/` existed, and were sitting in `contracts/` — a Rust crate folder — which is why
they were moved here.

They move to `lumens-vault/backend/src/ports/` in **E07-04**, unchanged. Their import
specifiers already use `.js` extensions, which NodeNext resolution requires; E07-02 must
configure the backend accordingly or they will not resolve.

Do not edit them here. If a change is genuinely needed, raise it as its own issue — every
adapter in E07 through E12 implements against these, so a change here ripples widely.
