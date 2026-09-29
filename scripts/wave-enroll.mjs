// Enrols GitHub issues into the Drips Wave program and assigns a complexity tier.
//
// Why this exists: doing it by hand does not scale past a few issues, and the
// GitHub bulk-label UI cannot assign complexity per issue -- it applies one label
// to everything selected, which is exactly the "inflated or underpriced points"
// the Drips guidance warns against.
//
//   node scripts/wave-enroll.mjs --milestone "LV0 - Foundation" --dry-run
//   node scripts/wave-enroll.mjs --milestone "LV0 - Foundation"
//   node scripts/wave-enroll.mjs --label lumens-vault --complexity-only --dry-run
//   node scripts/wave-enroll.mjs --issues 316,337,385 --dry-run
//
// Flags:
//   --milestone <t>       select by milestone title
//   --label <l>           select by label
//   --issues <a,b,c>      select explicit issue numbers
//   --wave-only           add Wave labels only (this is the default)
//   --apply-complexity    also apply the suggested complexity label -- see the warning below
//   --complexity-only     suggest complexity, do not touch Wave labels
//   --open-only           skip closed issues (default true; --no-open-only to include)
//   --dry-run             print what would change and exit
//   --repo <o/r>          default TegoLabs/sorokeep
//
// Safe to re-run: it skips issues that already have what it would add.
//
// ── On complexity, read this before using --apply-complexity ────────────────
// Wave membership is deterministic and safe to automate. Complexity is not.
//
// The classifier in wave-complexity.mjs was calibrated against 100 issues this
// repo's maintainer had already tiered by hand. It agrees 47-51% of the time on
// the three-way call, and 76% on the simpler "is this trivial or not". Those
// numbers do not improve with tuning, because the high/medium boundary here
// encodes domain knowledge the issue text does not contain: "build SCVal-to-JSON
// type translator" was tiered high while "build ledger entry key decoder" was
// tiered medium -- same verb, same scope, and nothing in either title explains
// the difference.
//
// Drips' guidance is that inflated or underpriced points damage community trust.
// A classifier that is wrong about half the time cannot satisfy that, so
// complexity is a suggestion for a human to confirm, never an automatic write.
// --apply-complexity exists for when someone has actually reviewed the output.

import { execFileSync } from "node:child_process";
import { classify } from "./wave-complexity.mjs";

const WAVE_LABELS = ["Stellar Wave", "stellar-wave"];
const COMPLEXITY_LABELS = { trivial: "complexity:trivial", medium: "complexity:medium", high: "complexity:high" };

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}
const has = (n) => process.argv.includes(`--${n}`);

const repo = arg("repo", "TegoLabs/sorokeep");
const dryRun = has("dry-run");
const complexityOnly = has("complexity-only");
const applyComplexity = has("apply-complexity") || complexityOnly;
const waveOnly = has("wave-only") || !applyComplexity;
const openOnly = !has("no-open-only");

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

// ── Select ──────────────────────────────────────────────────────────────────
let issues = [];
const byIssues = arg("issues");
const byLabel = arg("label");
const byMilestone = arg("milestone");

if (typeof byIssues === "string") {
  for (const n of byIssues.split(",").map((s) => s.trim()).filter(Boolean)) {
    issues.push(JSON.parse(gh(["issue", "view", n, "--repo", repo, "--json", "number,title,body,labels,state,milestone"])));
  }
} else {
  const a = ["issue", "list", "--repo", repo, "--state", "all", "--limit", "800",
             "--json", "number,title,body,labels,state,milestone"];
  if (typeof byLabel === "string") a.push("--label", byLabel);
  if (typeof byMilestone === "string") a.push("--milestone", byMilestone);
  issues = JSON.parse(gh(a));
}

if (!issues.length) {
  console.error("No issues matched. Pass one of --milestone, --label or --issues.");
  process.exit(1);
}

if (openOnly) {
  const before = issues.length;
  issues = issues.filter((i) => i.state === "OPEN");
  const skipped = before - issues.length;
  // Labelling a closed, already-merged issue does not award anyone points; it
  // just adds noise to the tracker. Opt in with --no-open-only if you want it.
  if (skipped) console.log(`skipping ${skipped} closed issue(s) — use --no-open-only to include them\n`);
}

// ── Plan ────────────────────────────────────────────────────────────────────
const plan = [];
for (const i of issues) {
  const names = i.labels.map((l) => l.name);
  const add = [];

  if (!complexityOnly) for (const w of WAVE_LABELS) if (!names.includes(w)) add.push(w);

  // Always compute the suggestion so a dry run is informative, but only queue
  // the label for writing when a human has opted in.
  let verdict = null;
  if (!names.some((n) => n.startsWith("complexity:"))) {
    verdict = classify({ title: i.title, body: i.body, labels: names });
    if (applyComplexity) add.push(COMPLEXITY_LABELS[verdict.tier]);
  }

  if (add.length || verdict) plan.push({ issue: i, add, verdict });
}

// ── Report ──────────────────────────────────────────────────────────────────
const writes = plan.filter((p) => p.add.length);
const tally = { trivial: 0, medium: 0, high: 0 };
for (const p of plan) if (p.verdict) tally[p.verdict.tier]++;

console.log(`repo: ${repo}`);
console.log(`matched ${issues.length} issue(s); ${writes.length} would be written to\n`);
for (const p of plan) {
  const t = p.verdict ? `${p.verdict.tier}(${p.verdict.points})` : "—";
  console.log(`#${String(p.issue.number).padEnd(5)} ${t.padEnd(14)} ${p.issue.title.slice(0, 68)}`);
  if (p.verdict) console.log(`        score ${p.verdict.score}: ${p.verdict.reasons.join(", ") || "no strong signals"}`);
}
if (tally.trivial + tally.medium + tally.high) {
  console.log(`\nSUGGESTED complexity: trivial ${tally.trivial}, medium ${tally.medium}, high ${tally.high}`);
  const pts = tally.trivial * 100 + tally.medium * 150 + tally.high * 200;
  console.log(`would be ${pts} points`);
  if (!applyComplexity) {
    console.log("(suggestion only — not being applied. Review it, then pass --apply-complexity.)");
  } else {
    console.log("WARNING: this classifier agrees with a human ~50% of the time on the three-way");
    console.log("call. Confirm these before writing them; mis-tiered points mislead contributors.");
  }
}

if (dryRun) { console.log(`\nDRY RUN — ${writes.length} issue(s) would change. Nothing written.`); process.exit(0); }
if (!writes.length) { console.log("\nNothing to write."); process.exit(0); }

// ── Apply ───────────────────────────────────────────────────────────────────
let ok = 0, failed = 0;
for (const p of writes) {
  try {
    gh(["issue", "edit", String(p.issue.number), "--repo", repo, ...p.add.flatMap((l) => ["--add-label", l])]);
    console.log(`  #${p.issue.number} += ${p.add.join(", ")}`);
    ok++;
  } catch (err) {
    console.error(`  #${p.issue.number} FAILED: ${String(err.stderr ?? err.message).trim().slice(0, 140)}`);
    failed++;
  }
}
console.log(`\nupdated ${ok}, failed ${failed}`);
process.exit(failed ? 1 : 0);
