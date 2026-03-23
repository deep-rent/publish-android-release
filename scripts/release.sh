#!/bin/bash

set -e

SEMVER_TAG_REGEX='^v[0-9]+\.[0-9]+\.[0-9]+$'
SEMVER_TAG_GLOB='v[0-9]*.[0-9]*.[0-9]*'
GIT_REMOTE='origin'
MAJOR_SEMVER_TAG_REGEX='\(v[0-9]*\)'

OFF='\033[0m'
BOLD_RED='\033[1;31m'
BOLD_GREEN='\033[1;32m'
BOLD_BLUE='\033[1;34m'
BOLD_PURPLE='\033[1;35m'
BOLD_UNDERLINED='\033[1;4m'
BOLD='\033[1m'

if ! latest_tag=$(git describe --abbrev=0 --match="$SEMVER_TAG_GLOB" 2>/dev/null); then
  echo -e "No tags found (yet) - Continue to create and push your first tag"
  latest_tag="[unknown]"
fi

echo -e "The latest release tag is: ${BOLD_BLUE}${latest_tag}${OFF}"

read -r -p 'Enter a new release tag (vX.X.X format): ' new_tag

if ! echo "$new_tag" | grep -q -E "$SEMVER_TAG_REGEX"; then
  echo -e "Tag: ${BOLD_BLUE}$new_tag${OFF} is ${BOLD_RED}not valid${OFF} (must be in ${BOLD}vX.X.X${OFF} format)"
  exit 1
fi

if [[ "$latest_tag" != "[unknown]" ]]; then
  if [[ "$(printf '%s\n%s' "$latest_tag" "$new_tag" | sort -V | head -n1)" == "$new_tag" ]]; then
    echo -e "${BOLD_RED}Error:${OFF} New version (${BOLD_BLUE}$new_tag${OFF}) must be greater than the latest version (${BOLD_BLUE}$latest_tag${OFF})."
    exit 1
  fi
fi

if [ -f "package.json" ]; then
  echo -e "Updating package.json to ${BOLD_PURPLE}${new_tag#v}${OFF}..."
  npm version "${new_tag#v}" --no-git-tag-version > /dev/null
  git add package.json
  if [ -f "package-lock.json" ]; then
    git add package-lock.json
  fi
  git commit -m "chore: set project version to $new_tag"
else
  echo -e "${BOLD_RED}Warning:${OFF} package.json not found. Skipping auto-update."
fi

git tag "$new_tag" --annotate --message "$new_tag Release"
echo -e "Tagged: ${BOLD_GREEN}$new_tag${OFF}"

new_major_release_tag=$(expr "$new_tag" : "$MAJOR_SEMVER_TAG_REGEX")

if [[ "$latest_tag" = "[unknown]" ]]; then
  is_major_release='yes'
else
  latest_major_release_tag=$(expr "$latest_tag" : "$MAJOR_SEMVER_TAG_REGEX")

  if ! [[ "$new_major_release_tag" = "$latest_major_release_tag" ]]; then
    is_major_release='yes'
  else
    is_major_release='no'
  fi
fi

if [ "$is_major_release" = 'yes' ]; then
  git tag "$new_major_release_tag" --annotate --message "$new_major_release_tag Release"
  echo -e "New major version tag: ${BOLD_GREEN}$new_major_release_tag${OFF}"
else
  git tag "$latest_major_release_tag" --force --annotate --message "Sync $latest_major_release_tag tag with $new_tag"
  echo -e "Synced ${BOLD_GREEN}$latest_major_release_tag${OFF} with ${BOLD_GREEN}$new_tag${OFF}"
fi

git push --follow-tags

if [ "$is_major_release" = 'yes' ]; then
  echo -e "Tags: ${BOLD_GREEN}$new_major_release_tag${OFF} and ${BOLD_GREEN}$new_tag${OFF} pushed to remote"
else
  git push $GIT_REMOTE "$latest_major_release_tag" --force
  echo -e "Tags: ${BOLD_GREEN}$latest_major_release_tag${OFF} and ${BOLD_GREEN}$new_tag${OFF} pushed to remote"
fi

echo -e "${BOLD_GREEN}Done!${OFF}"
