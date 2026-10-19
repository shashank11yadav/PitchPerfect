#!/usr/bin/env bash
set -euo pipefail

# Staged, non-deleted files; NUL-delimited so names with spaces are safe.
files=()
while IFS= read -r -d '' file; do
  files+=("$file")
done < <(git diff --cached --name-only --diff-filter=ACM -z)

if [ "${#files[@]}" -gt 0 ]; then
  npx prettier --check --ignore-unknown "${files[@]}"
fi

node scripts/check-attribution.mjs

# Skip only when gitleaks is not installed; a finding fails the commit.
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --config .gitleaks.toml
fi
