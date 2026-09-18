import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { rescueRunDir } from "./store.js";
import type { RescueManifest, RescueSummary } from "./types.js";

function summaryTable(before: RescueSummary, after?: RescueSummary): string {
  const rows = [
    ["Total", before.total, after?.total],
    ["Critical", before.critical, after?.critical],
    ["Warning", before.warning, after?.warning],
    ["Info", before.info, after?.info],
  ];
  return [
    "| Finding | Before | After | Change |",
    "| --- | ---: | ---: | ---: |",
    ...rows.map(([label, start, end]) => {
      const afterValue = typeof end === "number" ? end : "—";
      const delta = typeof end === "number" ? end - Number(start) : "—";
      return `| ${label} | ${start} | ${afterValue} | ${typeof delta === "number" && delta > 0 ? "+" : ""}${delta} |`;
    }),
  ].join("\n");
}

export function renderRescueMarkdown(manifest: RescueManifest): string {
  const reviewRequired = manifest.findings.filter(
    (finding) => finding.classification === "review-required",
  ).length;
  const acceptedLegacy = manifest.findings.filter(
    (finding) => finding.classification === "accepted-legacy",
  ).length;
  const verification = manifest.verification;
  const checks = verification?.commands.length
    ? verification.commands
        .map(
          (command) =>
            `- ${command.passed ? "Passed" : "Failed"}: \`${command.command} ${command.args.join(" ")}\``,
        )
        .join("\n")
    : "- No project test or typecheck scripts were detected; manual verification is required.";

  return `# Buoy Rescue report

Run: \`${manifest.id}\`  
Status: **${manifest.status}**  
Generated: ${manifest.updatedAt}

## Outcome

${summaryTable(manifest.before.summary, manifest.after?.summary)}

- High-confidence fixes proposed: ${manifest.safeFixes.length}
- Fixes applied: ${manifest.appliedFixIds.length}
- Findings requiring review: ${reviewRequired}
- Findings already accepted as legacy: ${acceptedLegacy}

## Verification

${checks}

${
  manifest.status === "verification_failed"
    ? "Rescue restored every edited source file after the failed check. The branch and evidence remain for inspection."
    : ""
}

## Guardrail

${
  manifest.baseline
    ? `Remaining legacy drift was recorded at \`${manifest.baseline.path}\` with reason: ${manifest.baseline.reason}`
    : 'No legacy baseline was created by this run. Use `buoy rescue guard --reason "…"` after reviewing the remaining findings.'
}

## Safety and privacy

Buoy Rescue runs against local files. This run did not commit, push, merge, or upload source code. Ambiguous findings remain review-required, and backups are retained locally for rollback.
`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderRescueHtml(manifest: RescueManifest): string {
  const markdown = renderRescueMarkdown(manifest);
  const before = manifest.before.summary;
  const after = manifest.after?.summary;
  const cards = [
    ["Before", before.total],
    ["After", after?.total ?? "—"],
    ["Applied", manifest.appliedFixIds.length],
    [
      "Needs review",
      manifest.findings.filter(
        (item) => item.classification === "review-required",
      ).length,
    ],
  ];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Buoy Rescue · ${escapeHtml(manifest.id)}</title>
<style>body{margin:0;background:#071827;color:#eaf6f8;font:16px/1.55 ui-sans-serif,system-ui,sans-serif}main{max-width:960px;margin:auto;padding:64px 24px}.eyebrow{color:#53d6df;font-weight:700}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;margin:32px 0}.card,pre{background:#0c2335;border:1px solid #244052;border-radius:14px;padding:20px}.value{font-size:32px;font-weight:800}pre{white-space:pre-wrap;color:#bfd0d8;overflow:auto}a{color:#53d6df}</style></head>
<body><main><p class="eyebrow">BUOY RESCUE</p><h1>Before-and-after implementation report</h1><p>Run ${escapeHtml(manifest.id)} · ${escapeHtml(manifest.status)}</p>
<section class="cards">${cards.map(([label, value]) => `<div class="card"><div>${escapeHtml(String(label))}</div><div class="value">${escapeHtml(String(value))}</div></div>`).join("")}</section>
<pre>${escapeHtml(markdown)}</pre></main></body></html>`;
}

export async function writeRescueReports(manifest: RescueManifest): Promise<{
  json: string;
  markdown: string;
  html: string;
}> {
  const dir = rescueRunDir(manifest.projectRoot, manifest.id);
  const paths = {
    json: join(dir, "report.json"),
    markdown: join(dir, "report.md"),
    html: join(dir, "report.html"),
  };
  await Promise.all([
    writeFile(paths.json, JSON.stringify(manifest, null, 2), "utf8"),
    writeFile(paths.markdown, renderRescueMarkdown(manifest), "utf8"),
    writeFile(paths.html, renderRescueHtml(manifest), "utf8"),
  ]);
  return paths;
}
