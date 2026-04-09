/**
 * Parses the PR description and verifies that every checklist item
 * between <!-- PR_CHECK_LIST_START --> and <!-- PR_CHECK_LIST_END -->
 * is checked (i.e. `- [x]`).
 *
 * Creates a check run via the GitHub Checks API with rich markdown
 * output. The workflow itself always exits 0.
 */

const START_MARKER = "PR_CHECK_LIST_START";
const END_MARKER = "PR_CHECK_LIST_END";

// Matches markdown checklist lines: `- [ ] text` or `- [x] text`
const CHECKLIST_RE = /^\s*-\s+\[([ xX])]\s+(.+)/;

interface ChecklistItem {
  text: string;
  checked: boolean;
}

function extractChecklist(body: string): ChecklistItem[] {
  const lines = body.split(/\r?\n/);

  let inside = false;
  const items: ChecklistItem[] = [];

  for (const line of lines) {
    if (line.includes(START_MARKER)) {
      inside = true;
      continue;
    }
    if (line.includes(END_MARKER)) {
      break;
    }
    if (!inside) continue;

    const match = line.match(CHECKLIST_RE);
    if (match) {
      items.push({
        text: match[2].trim(),
        checked: match[1].toLowerCase() === "x",
      });
    }
  }

  return items;
}

// ── GitHub Checks API ──────────────────────────────────────────────────

const CHECK_NAME = "PR Checklist";

async function createCheckRun(
  conclusion: "success" | "failure" | "action_required",
  title: string,
  summary: string
): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY; // owner/repo
  const sha = process.env.PR_HEAD_SHA;

  if (!token || !repo || !sha) {
    console.log(
      "::warning::Missing GITHUB_TOKEN, GITHUB_REPOSITORY, or PR_HEAD_SHA – skipping check run creation."
    );
    return;
  }

  const url = `https://api.github.com/repos/${repo}/check-runs`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      name: CHECK_NAME,
      head_sha: sha,
      status: "completed",
      conclusion,
      output: {
        title,
        summary,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.log(
      `::warning::Failed to create check run (${response.status}): ${body}`
    );
  }
}

// ── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const body = process.env.PR_BODY ?? "";

  if (!body.includes(START_MARKER) || !body.includes(END_MARKER)) {
    const msg = `PR description is missing the checklist markers (\`${START_MARKER}\` / \`${END_MARKER}\`).`;
    console.log(`::warning::${msg}`);
    await createCheckRun("action_required", "Checklist markers missing", msg);
    return;
  }

  const items = extractChecklist(body);

  if (items.length === 0) {
    const msg = "No checklist items found between the markers.";
    console.log(`::warning::${msg}`);
    await createCheckRun("action_required", "No checklist items", msg);
    return;
  }

  console.log(`Found ${items.length} checklist item(s):\n`);

  const unchecked: ChecklistItem[] = [];

  for (const item of items) {
    const icon = item.checked ? "✅" : "❌";
    console.log(`  ${icon} ${item.text}`);
    if (!item.checked) unchecked.push(item);
  }

  console.log(); // blank line

  // Build a markdown summary for the check run output
  const lines = items.map(
    (item) => `- [${item.checked ? "x" : " "}] ${item.text}`
  );
  const summaryMd = lines.join("\n");

  if (unchecked.length > 0) {
    const title = `${unchecked.length} of ${items.length} item(s) unchecked`;
    console.log(`::warning::${title}`);
    await createCheckRun(
      "action_required",
      title,
      `### Checklist\n\n${summaryMd}\n\nPlease complete all items before merging.`
    );
    return;
  }

  console.log("✅ All checklist items are completed!");
  await createCheckRun(
    "success",
    "All checklist items completed",
    `### Checklist\n\n${summaryMd}`
  );
}

main().catch((err) => {
  console.log(`::warning::Unexpected error: ${err}`);
});
