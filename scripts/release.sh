#!/bin/bash

set -e

cd "$(git rev-parse --show-toplevel)"

OFF='\033[0m'
BOLD_RED='\033[1;31m'
BOLD_GREEN='\033[1;32m'
BOLD_BLUE='\033[1;34m'
BOLD_PURPLE='\033[1;35m'
BOLD='\033[1m'

if ! latest_tag=$(git describe --abbrev=0 --match="v[0-9]*.[0-9]*.[0-9]*" 2>/dev/null); then
  echo -e "No tags found (yet) - Continue to create and push your first tag"
  latest_tag="[unknown]"
fi

echo -e "The latest release tag is: ${BOLD_BLUE}${latest_tag}${OFF}"

read -r -p 'Enter a new release version (X.Y.Z format): ' new_version

if ! echo "$new_version" | grep -q -E "^[0-9]+\.[0-9]+\.[0-9]+$"; then
  echo -e "Version: ${BOLD_BLUE}$new_version${OFF} is ${BOLD_RED}not valid${OFF} (must be strictly in ${BOLD}X.Y.Z${OFF} format)"
  exit 1
fi

new_tag="v$new_version"

if [[ "$latest_tag" != "[unknown]" ]]; then
  if [[ "$(printf '%s\n%s' "$latest_tag" "$new_tag" | sort -V | head -n1)" == "$new_tag" ]]; then
    echo -e "${BOLD_RED}Error:${OFF} New version (${BOLD_BLUE}$new_tag${OFF}) must be greater than the latest version (${BOLD_BLUE}$latest_tag${OFF})."
    exit 1
  fi
fi

echo -e "\nReady to release ${BOLD_GREEN}$new_tag${OFF} (Current: ${BOLD_BLUE}$latest_tag${OFF})"
read -r -p "Proceed with the release? [y/N]: " confirm

if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo -e "${BOLD_RED}Release aborted.${OFF}"
  exit 0
fi

if [ -f "package.json" ]; then
  echo -e "\nUpdating package.json to ${BOLD_PURPLE}${new_version}${OFF}..."
  npm version "$new_version" --no-git-tag-version > /dev/null
  git add package.json
  if [ -f "package-lock.json" ]; then
    git add package-lock.json
  fi
  git commit -m "chore: set project version to $new_tag"
else
  echo -e "${BOLD_RED}Warning:${OFF} package.json not found. Skipping auto-update."
fi

git tag "$new_tag" --annotate --message "Release $new_tag"
echo -e "Tagged: ${BOLD_GREEN}$new_tag${OFF}"

git push --follow-tags
echo -e "Tag ${BOLD_GREEN}$new_tag${OFF} pushed to remote"

echo -e "${BOLD_GREEN}Done!${OFF}"
