import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Character classes keep this file from matching its own patterns.
const PATTERNS = [
  // Co-author trailers only count when they credit an AI tool; GitHub adds one for Dependabot.
  /co-authored[-]by:.*\b([c]laude|[a]nthropic|[c]hatgpt|[o]penai|[c]opilot|[c]ursor|[c]odex|[g]emini)\b/i,
  /generated (with|by) ([c]laude|[c]hatgpt|[c]opilot|an? ai\b)/i,
  /\b[c]laude\b/i,
  /\b[c]hatgpt\b/i,
  /\b[c]opilot\b/i,
  /[c]laude\.(ai|com)/i,
  /\bai (coding )?assistant\b/i,
  /written by (an? )?ai\b/i,
];

const SKIPPED_FILES = new Set(["package-lock.json"]);

const git = (...args) =>
  execFileSync("git", args, { encoding: "buffer", maxBuffer: 256 * 1024 * 1024 });

const matches = (line) => PATTERNS.some((pattern) => pattern.test(line));

const hits = [];

for (const file of git("ls-files", "-z").toString("utf8").split("\0").filter(Boolean)) {
  if (SKIPPED_FILES.has(file) || file.endsWith("/package-lock.json")) continue;
  let content;
  try {
    content = readFileSync(file);
  } catch {
    continue; // listed but deleted from the working tree
  }
  if (content.includes(0)) continue; // binary
  content
    .toString("utf8")
    .split("\n")
    .forEach((line, index) => {
      if (matches(line)) hits.push(`${file}:${String(index + 1)}`);
    });
}

let commits = [];
try {
  commits = git("rev-list", "HEAD").toString("utf8").split("\n").filter(Boolean);
} catch {
  // no commits yet
}
for (const commit of commits) {
  const message = git("log", "-1", "--format=%B", commit).toString("utf8");
  if (message.split("\n").some(matches)) hits.push(`commit ${commit.slice(0, 7)}`);
}

if (hits.length > 0) {
  console.error("Attribution patterns found:");
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}
console.log("No attribution patterns found.");
