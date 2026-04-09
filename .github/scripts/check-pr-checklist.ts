/**
 * Parses the PR description and verifies that every checklist item
 * between <!-- PR_CHECK_LIST_START --> and <!-- PR_CHECK_LIST_END -->
 * is checked (i.e. `- [x]`).
 *
 * Exit code 0 = all items checked.
 * Exit code 1 = one or more items unchecked, or markers missing.
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

// ── Main ───────────────────────────────────────────────────────────────

function main(): void {
  const body = process.env.PR_BODY ?? "";

  if (!body.includes(START_MARKER) || !body.includes(END_MARKER)) {
    console.log(
      `::error::PR description is missing the checklist markers (${START_MARKER} / ${END_MARKER}).`
    );
    process.exit(1);
  }

  const items = extractChecklist(body);

  if (items.length === 0) {
    console.log("::error::No checklist items found between the markers.");
    process.exit(1);
  }

  console.log(`Found ${items.length} checklist item(s):\n`);

  const unchecked: ChecklistItem[] = [];

  for (const item of items) {
    const icon = item.checked ? "✅" : "❌";
    console.log(`  ${icon} ${item.text}`);
    if (!item.checked) unchecked.push(item);
  }

  console.log(); // blank line

  if (unchecked.length > 0) {
    console.log(
      `::error::${unchecked.length} of ${items.length} checklist item(s) still unchecked. Please complete all items before merging.`
    );
    process.exit(1);
  }

  console.log("✅ All checklist items are completed!");
}

main();
