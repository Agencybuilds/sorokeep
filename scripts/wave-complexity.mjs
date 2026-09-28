// Derives a Drips Wave complexity tier for a GitHub issue from observable signals.
//
// Drips defines the tiers as:
//   trivial (100 pts) - small, clearly bounded changes with obvious acceptance criteria
//   medium  (150 pts) - standard features or logic touching multiple parts of the codebase
//   high    (200 pts) - complex engineering work such as integrations or architectural changes
//
// Tagging has to be honest: the Drips guidance says inflated or underpriced points
// damage community trust, and a contributor picks work partly on the points.
//
// Design note, learned the hard way. A first version matched keywords against the
// whole issue body and was badly biased: a docs issue about publishing a
// disclosure changelog scored "schema change" and "concurrency" because those
// words appear in its acceptance criteria, and a "text-only change" rule fired on
// 22 of 23 issues because nearly every body mentions a README somewhere. The body
// describes what to *verify*, not what to *build*, so matching prose there infers
// the wrong thing.
//
// So: structural signals first (they are authored facts, not prose), and keyword
// matching only against the title, which is short and deliberate.

export const TIERS = { trivial: 100, medium: 150, high: 200 };

// Conventional-commit type in the title. Authored metadata, the single most
// reliable signal available, so it sets the starting point.
const TYPE_BASE = {
  docs: -4,
  test: -2,
  chore: -3,
  ci: -1,
  style: -4,
  refactor: 2,
  perf: 2,
  fix: 0,
  feat: 1,
  security: 2,
  build: 0,
};

// The scope in feat(scope): is the strongest predictor of difficulty in this
// repo, and it is not interchangeable with the type. Calibrated against 100
// hand-labelled issues: work in `core` is the engine -- transaction building,
// key resolution, SCVal translation, budget enforcement -- and was called high
// far more often than anything else. cli/devops/db work is mostly wiring.
const SCOPE_WEIGHT = {
  core: 5,
  daemon: 3,
  alerts: 2,
  mcp: 1,
  rpc: 3,
  db: 0,
  observability: 1,
  cli: -1,
  devops: -2,
  integrations: 0,
  e2e: 2,
};

// Building something new is harder than extending something that exists. This
// separates "implement a schema migration engine" from "add two tables", which
// share a scope but were labelled two tiers apart.
const VERB_BUILD = /\b(implement|build|create|design|architect)\b/i;
const VERB_EXTEND = /\b(add|write|expose|register|document|translate|update)\b/i;

// Title-only. Short and deliberate, so a match here means the author chose the word.
const TITLE_SIGNALS = [
  [5, /\b(architect\w*|re-?design|re-?write)\b/i, "architectural work"],
  [4, /\b(integrat\w+)\b/i, "integration"],
  [3, /\b(implement)\b/i, "implementation, not extension"],
  [3, /\b(migrat\w+|schema)\b/i, "schema or migration"],
  [2, /\b(refactor)\b/i, "refactor"],
  [-3, /\b(typo|wording|rename|comment)\b/i, "cosmetic"],
  [-2, /\b(document|guide|translate)\b/i, "writing, not code"],
];

/**
 * @param {{title:string, body?:string, labels?:string[], files?:string[], acceptance?:string[]}} issue
 */
export function classify(issue) {
  const title = issue.title ?? "";
  const body = issue.body ?? "";
  const labels = issue.labels ?? [];
  const reasons = [];
  let score = 0;

  // 1. Conventional-commit type and scope.
  const m = title.match(/^([a-z]+)\s*(?:\(([^)]*)\))?\s*:/i);
  const type = m?.[1]?.toLowerCase();
  const scope = m?.[2]?.toLowerCase();
  if (type && type in TYPE_BASE) {
    score += TYPE_BASE[type];
    reasons.push(`type "${type}"`);
  }
  if (scope && scope in SCOPE_WEIGHT && SCOPE_WEIGHT[scope] !== 0) {
    score += SCOPE_WEIGHT[scope];
    reasons.push(`scope "${scope}"`);
  }

  // 2. Build vs extend. Only meaningful for code work, so skip it on docs.
  if (type !== "docs") {
    if (VERB_BUILD.test(title))       { score += 3; reasons.push("builds something new"); }
    else if (VERB_EXTEND.test(title)) { score -= 1; reasons.push("extends something existing"); }
  }

  // 3. File count — Drips' own wording for medium is "touching multiple parts of
  //    the codebase", so this is the closest thing to a direct measurement.
  const fileCount = issue.files?.length ?? countFilesInBody(body);
  if (fileCount >= 5)      { score += 5; reasons.push(`${fileCount} files`); }
  else if (fileCount >= 3) { score += 3; reasons.push(`${fileCount} files`); }
  else if (fileCount === 2){ score += 1; reasons.push("2 files"); }
  else if (fileCount === 1){ score -= 2; reasons.push("1 file"); }

  // 4. Acceptance-criteria count — how much has to be true before it is done.
  const acCount = issue.acceptance?.length ?? (body.match(/^\s*-\s*\[ \]/gm)?.length ?? 0);
  if (acCount >= 8)        { score += 3; reasons.push(`${acCount} criteria`); }
  else if (acCount >= 6)   { score += 1; reasons.push(`${acCount} criteria`); }
  else if (acCount > 0 && acCount <= 3) { score -= 2; reasons.push(`${acCount} criteria`); }

  // 5. Title keywords only.
  for (const [w, re, why] of TITLE_SIGNALS) if (re.test(title)) { score += w; reasons.push(why); }

  // 6. Maintainer labels outrank inference.
  if (labels.includes("good first issue")) { score -= 5; reasons.push("good first issue"); }
  if (labels.includes("breaking-change"))  { score += 3; reasons.push("breaking-change"); }
  if (labels.includes("security"))         { score += 2; reasons.push("security"); }
  if (labels.includes("blocked-external")) { score += 2; reasons.push("external dependency"); }
  // A docs label with no code label means it really is writing.
  if (labels.includes("docs") && !labels.some((l) => ["contract", "backend", "frontend"].includes(l))) {
    score -= 3; reasons.push("docs-only");
  }

  const tier = score >= 7 ? "high" : score >= 2 ? "medium" : "trivial";
  return { tier, points: TIERS[tier], score, reasons };
}

// Counts backtick-quoted paths in a "Files" section, the shape both the
// lumens-vault backlog and sorokeep's issue template use.
function countFilesInBody(body) {
  const section = body.match(/##+\s*Files[\s\S]*?(?=\n##|\n---|\s*$)/i)?.[0] ?? "";
  return (section.match(/`[^`]+\.[a-z0-9]+[^`]*`/gi) ?? []).length;
}
