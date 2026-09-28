// Validates the epic JSON files and generates ISSUE_BACKLOG.md, COVERAGE.md and
// create_issues.ps1 from them, so the three can never disagree.
//
// Run from lumens-vault/:  node docs/backlog/build.mjs

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname);
const EPIC_DIR = path.join(ROOT, "epics");
const PROJECT_DIR = path.resolve(ROOT, "..", "..");

const VALID_LABELS = new Set([
  "contract", "backend", "frontend", "devops", "testing", "docs", "design",
  "security", "sorokeep-integration", "scaffolding", "good first issue", "bug",
  "breaking-change", "blocked-external",
]);

// ── Load ────────────────────────────────────────────────────────────────────

const epics = fs.readdirSync(EPIC_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(EPIC_DIR, f), "utf8"));
    } catch (err) {
      console.error(`FATAL: ${f} is not valid JSON — ${err.message}`);
      process.exit(1);
    }
  });

const allIssues = epics.flatMap((e) =>
  e.issues.map((i) => ({ ...i, epic: e.epic, epicTitle: e.title, milestone: e.milestone })),
);
const byId = new Map(allIssues.map((i) => [i.id, i]));

// ── Validate ────────────────────────────────────────────────────────────────

const errors = [];
const warnings = [];

for (const i of allIssues) {
  const where = `${i.id}`;
  for (const field of ["title", "scope", "labels", "requirements", "dependsOn", "files", "acceptance", "nonGoals"]) {
    if (i[field] === undefined) errors.push(`${where}: missing field "${field}"`);
  }
  if (!/^E\d{2}-\d{2}$/.test(i.id)) errors.push(`${where}: malformed id`);
  if (i.id && !i.id.startsWith(i.epic)) errors.push(`${where}: id does not match epic ${i.epic}`);
  for (const l of i.labels ?? []) {
    if (!VALID_LABELS.has(l)) errors.push(`${where}: unknown label "${l}"`);
  }
  if ((i.acceptance ?? []).length < 3) warnings.push(`${where}: only ${(i.acceptance ?? []).length} acceptance criteria`);
  if (!(i.requirements ?? []).length) errors.push(`${where}: cites no requirement`);
  for (const d of i.dependsOn ?? []) {
    if (!byId.has(d)) errors.push(`${where}: depends on "${d}" which does not exist`);
  }
  // Paths must stay inside the project folder.
  for (const f of i.files ?? []) {
    const p = f.split(" ")[0];
    if (!p.startsWith("lumens-vault/") && !p.startsWith(".github/")) {
      errors.push(`${where}: file path escapes the project folder — "${p}"`);
    }
  }
}

// Duplicate ids
const seen = new Set();
for (const i of allIssues) {
  if (seen.has(i.id)) errors.push(`duplicate id: ${i.id}`);
  seen.add(i.id);
}

// Dependency cycles
function findCycle() {
  const state = new Map(); // 0 unvisited, 1 in-stack, 2 done
  const stack = [];
  let cycle = null;
  function visit(id) {
    if (cycle) return;
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      cycle = [...stack.slice(stack.indexOf(id)), id];
      return;
    }
    state.set(id, 1);
    stack.push(id);
    for (const d of byId.get(id)?.dependsOn ?? []) visit(d);
    stack.pop();
    state.set(id, 2);
  }
  for (const id of byId.keys()) visit(id);
  return cycle;
}
const cycle = findCycle();
if (cycle) errors.push(`dependency cycle: ${cycle.join(" -> ")}`);

// ── Requirement coverage ────────────────────────────────────────────────────

const reqText = fs.readFileSync(path.join(ROOT, "REQUIREMENTS.md"), "utf8");
const declared = [...reqText.matchAll(/^\| (FR-\d+|NFR-\d+|G-\d+|D-\d+) \|/gm)].map((m) => m[1]);
const declaredSet = new Set(declared);

const coverage = new Map(declared.map((r) => [r, []]));
for (const i of allIssues) {
  for (const r of i.requirements ?? []) {
    if (!declaredSet.has(r)) {
      errors.push(`${i.id}: cites "${r}" which is not in REQUIREMENTS.md`);
      continue;
    }
    coverage.get(r).push(i.id);
  }
}
const uncovered = [...coverage.entries()].filter(([, v]) => v.length === 0).map(([k]) => k);
for (const r of uncovered) errors.push(`REQUIREMENT NOT COVERED BY ANY ISSUE: ${r}`);

// ── Report ──────────────────────────────────────────────────────────────────

// Depth = longest dependency chain to this issue. Width at depth d is how many
// issues become workable once everything shallower is merged, which is the real
// measure of how many contributors the backlog can absorb.
const depthOf = new Map();
function depth(id) {
  if (depthOf.has(id)) return depthOf.get(id);
  const deps = byId.get(id).dependsOn ?? [];
  const d = deps.length ? 1 + Math.max(...deps.map(depth)) : 0;
  depthOf.set(id, d);
  return d;
}
for (const id of byId.keys()) depth(id);
const maxDepth = Math.max(...depthOf.values());
const widths = Array.from({ length: maxDepth + 1 }, (_, d) =>
  [...depthOf.values()].filter((v) => v === d).length);
const avgWidth = (allIssues.length / (maxDepth + 1)).toFixed(1);

console.log(`epics:        ${epics.length}`);
console.log(`issues:       ${allIssues.length}`);
console.log(`requirements: ${declared.length} (${declared.length - uncovered.length} covered)`);
console.log(`critical path depth: ${maxDepth} (the old backlog's linear chain was 11)`);
console.log(`avg issues workable in parallel per level: ${avgWidth}`);
console.log(`issues per level: ${widths.join(", ")}`);
console.log(`warnings:     ${warnings.length}`);
console.log(`errors:       ${errors.length}`);
if (warnings.length) {
  console.log("\n--- warnings ---");
  warnings.forEach((w) => console.log("  " + w));
}
if (errors.length) {
  console.log("\n--- errors ---");
  errors.forEach((e) => console.log("  " + e));
  process.exit(1);
}

// ── Generate ISSUE_BACKLOG.md ───────────────────────────────────────────────

const esc = (s) => String(s).replace(/\|/g, "\\|");
let backlog = `# Lumens Vault — Issue Backlog

Generated by \`docs/backlog/build.mjs\` from \`docs/backlog/epics/*.json\`. Do not edit by hand;
edit the epic JSON and regenerate, so this file, \`COVERAGE.md\` and \`create_issues.ps1\` can
never disagree.

**${allIssues.length} issues** across **${epics.length} epics**. Every issue cites requirement IDs from
\`REQUIREMENTS.md\`; \`COVERAGE.md\` proves all ${declared.length} are covered.

Dependencies are declared per issue, not as a global chain. The longest dependency path is
**${maxDepth} issues deep**, with an average of **${avgWidth} issues workable in parallel** at each
level — so the backlog absorbs many contributors at once. The previous 11-issue backlog was a
strictly linear chain and could occupy exactly one person.

`;

for (const e of epics) {
  backlog += `\n---\n\n## ${e.epic} — ${e.title}\n\n**Milestone:** ${e.milestone} · **${e.issues.length} issues**\n`;
  for (const i of e.issues) {
    backlog += `\n### ${i.id} ${i.title}\n\n`;
    backlog += `**Labels:** ${i.labels.join(", ")}  \n`;
    backlog += `**Requirements:** ${i.requirements.join(", ")}  \n`;
    backlog += `**Depends on:** ${i.dependsOn.length ? i.dependsOn.join(", ") : "nothing"}\n\n`;
    backlog += `${i.scope}\n\n`;
    if (i.files.length) {
      backlog += `**Files:**\n${i.files.map((f) => `- \`${f}\``).join("\n")}\n\n`;
    }
    backlog += `**Acceptance criteria:**\n${i.acceptance.map((a) => `- [ ] ${a}`).join("\n")}\n\n`;
    backlog += `**Non-goals:** ${i.nonGoals.join(" ")}\n`;
  }
}
fs.writeFileSync(path.join(PROJECT_DIR, "ISSUE_BACKLOG.md"), backlog);

// ── Generate COVERAGE.md ────────────────────────────────────────────────────

const section = (prefix, heading) => {
  const rows = declared.filter((r) => r.startsWith(prefix));
  let out = `\n## ${heading}\n\n| ID | Issues | Count |\n|----|--------|------:|\n`;
  for (const r of rows) {
    const ids = coverage.get(r);
    out += `| ${r} | ${ids.join(", ")} | ${ids.length} |\n`;
  }
  return out;
};

let cov = `# Requirements Coverage

Generated by \`docs/backlog/build.mjs\`. Every requirement in \`REQUIREMENTS.md\` is listed with
the issues that deliver it. The build fails if any row would be empty, which is what makes
coverage provable rather than asserted.

- Requirements declared: **${declared.length}**
- Requirements covered: **${declared.length - uncovered.length}**
- Uncovered: **${uncovered.length}**
- Issues: **${allIssues.length}**
`;
cov += section("FR-", "Functional requirements");
cov += section("NFR-", "Non-functional requirements");
cov += section("G-", "Audit gaps");
cov += section("D-", "Open decisions");
fs.writeFileSync(path.join(ROOT, "COVERAGE.md"), cov);

// ── Generate create_issues.ps1 ──────────────────────────────────────────────

const psEscape = (s) => String(s).replace(/'/g, "''");
const milestones = [...new Set(epics.map((e) => e.milestone))];
const labels = [...new Set(allIssues.flatMap((i) => i.labels))].sort();

let ps = `# Generated by docs/backlog/build.mjs — do not edit by hand.
# Creates ${allIssues.length} issues across ${milestones.length} milestones.
#
# Run only after confirming the target repository and that issues should live there.
#   gh auth login
#   .\\docs\\backlog\\create_issues.ps1 -DryRun     # prints what it would do
#   .\\docs\\backlog\\create_issues.ps1

param(
    [string]$Repo = "TegoLabs/sorokeep",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$Label = "lumens-vault"

gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "Run 'gh auth login' first." -ForegroundColor Red; exit 1 }

Write-Host "Target repo: $Repo" -ForegroundColor Cyan
if ($DryRun) { Write-Host "DRY RUN - nothing will be created" -ForegroundColor Yellow }

# --- Labels -----------------------------------------------------------------
$AllLabels = @(
${labels.map((l) => `    '${psEscape(l)}'`).join(",\n")},
    '$Label'
)
if (-not $DryRun) {
    foreach ($l in $AllLabels) {
        gh label create $l --repo $Repo --force 2>&1 | Out-Null
    }
}

# --- Milestones -------------------------------------------------------------
$Milestones = @(
${milestones.map((m) => `    '${psEscape(m)}'`).join(",\n")}
)
if (-not $DryRun) {
    foreach ($m in $Milestones) {
        gh api "repos/$Repo/milestones" -f title="$m" 2>&1 | Out-Null
    }
}

# --- Issue creation ---------------------------------------------------------
# Issues are created in dependency order. $Created maps our internal id to the
# real GitHub number, so "Depends on" lines reference actual issue numbers.
$Created = @{}

function New-LumensIssue {
    param(
        [string]$Id, [string]$Title, [string]$Body,
        [string]$Milestone, [string[]]$Labels
    )
    if ($DryRun) { Write-Host "  would create: $Title"; return $null }
    $tmp = New-TemporaryFile
    Set-Content -Path $tmp -Value $Body -Encoding utf8
    $labelArg = ($Labels + @($Label)) -join ","
    $result = gh issue create --repo $Repo --title $Title --body-file $tmp --label $labelArg --milestone $Milestone
    Remove-Item $tmp -Force
    if ($result -match '/issues/(\\d+)\\s*$') {
        $num = $Matches[1]
        Write-Host "  #$num  $Id $Title" -ForegroundColor Green
        return $num
    }
    Write-Host "  FAILED: $Id $Title" -ForegroundColor Red
    return $null
}

`;

// Topological order so dependencies exist before dependents.
const ordered = [];
const done = new Set();
function emit(id) {
  if (done.has(id)) return;
  done.add(id);
  for (const d of byId.get(id).dependsOn) emit(d);
  ordered.push(byId.get(id));
}
for (const i of allIssues) emit(i.id);

for (const i of ordered) {
  const depLine = i.dependsOn.length
    ? i.dependsOn.map((d) => `$(if ($Created['${d}']) { '#' + $Created['${d}'] } else { '${d}' })`).join(", ")
    : "nothing";
  const body = [
    `**Requirements:** ${i.requirements.join(", ")}`,
    ``,
    `**Depends on:** ${i.dependsOn.length ? "{{DEPS}}" : "nothing"}`,
    ``,
    `## Scope`,
    ``,
    i.scope,
    ``,
    ...(i.files.length ? [`## Files`, ``, ...i.files.map((f) => `- \`${f}\``), ``] : []),
    `## Acceptance criteria`,
    ``,
    ...i.acceptance.map((a) => `- [ ] ${a}`),
    ``,
    `## Non-goals`,
    ``,
    i.nonGoals.join(" "),
    ``,
    `---`,
    `<sub>${i.epic} — ${i.epicTitle} · generated from \`docs/backlog/epics/${i.epic}.json\`</sub>`,
  ].join("\n");

  ps += `\n$body = @'\n${body.replace(/'/g, "''").replace("{{DEPS}}", "{{DEPS}}")}\n'@\n`;
  if (i.dependsOn.length) {
    ps += `$body = $body -replace '\\{\\{DEPS\\}\\}', "${depLine}"\n`;
  }
  ps += `$Created['${i.id}'] = New-LumensIssue -Id '${i.id}' -Title '${psEscape(i.id + " " + i.title)}' -Body $body -Milestone '${psEscape(i.milestone)}' -Labels @(${i.labels.map((l) => `'${psEscape(l)}'`).join(",")})\n`;
}

ps += `
Write-Host ""
Write-Host "Done. Created $($Created.Values | Where-Object { $_ } | Measure-Object | Select-Object -ExpandProperty Count) of ${allIssues.length} issues." -ForegroundColor Cyan
`;

fs.writeFileSync(path.join(ROOT, "create_issues.ps1"), ps);

console.log("\nwrote:");
console.log("  lumens-vault/ISSUE_BACKLOG.md");
console.log("  lumens-vault/docs/backlog/COVERAGE.md");
console.log("  lumens-vault/docs/backlog/create_issues.ps1");
