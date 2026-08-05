#!/usr/bin/env bash

# Publish a tested, architecture-specific macOS release of Mdown.
# Usage: ./scripts/release.sh 1.0.1
set -euo pipefail

version="${1:-}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: $0 <version, e.g. 1.0.1>" >&2
  exit 1
fi

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Release from main only." >&2
  exit 1
fi

# Do not accidentally release or commit application changes. Untracked files are
# intentionally ignored so private planning notes can remain local.
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Commit or stash tracked changes before releasing." >&2
  exit 1
fi

if git rev-parse "v$version" >/dev/null 2>&1; then
  echo "Tag v$version already exists." >&2
  exit 1
fi

command -v gh >/dev/null || { echo "GitHub CLI (gh) is required." >&2; exit 1; }
gh auth status >/dev/null

npm version "$version" --no-git-tag-version
npm test
npm run package:mac

intel_dmg="dist/Mdown-$version-x64.dmg"
silicon_dmg="dist/Mdown-$version-arm64.dmg"
[[ -f "$intel_dmg" && -f "$silicon_dmg" ]] || { echo "Expected DMG files were not created." >&2; exit 1; }

git add package.json package-lock.json
git commit -m "Release v$version"
git tag -a "v$version" -m "Mdown $version"
git push origin main --follow-tags

gh release create "v$version" "$intel_dmg" "$silicon_dmg" \
  --title "Mdown $version" \
  --notes "Mdown $version for macOS. Includes separate installers for Intel Macs and Apple Silicon Macs.\n\nSupport the project: https://buymeacoffee.com/jakebown"

echo "Released: $(gh release view "v$version" --json url --jq .url)"
