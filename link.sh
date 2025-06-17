#!/usr/bin/env sh
# link.sh – create symlinks from this repo to the app’s mocks/schema.
# Usage:  APP_MOCK_ROOT=/absolute/path/to/app/mock/root ./link.sh

set -eu  # exit on error or unset var

: "${APP_MOCK_ROOT:?Environment variable APP_MOCK_ROOT is not set}"

# Resolve to an absolute path (so links keep working if you cd later)
APP_MOCK_ROOT="$(cd "$APP_MOCK_ROOT" 2>/dev/null && pwd -P)"

for dir in mocks schema; do
  target="$APP_MOCK_ROOT/$dir"   # where the real files live
  link="./$dir"                  # link to create in this repo

  # Basic sanity checks
  [ -d "$target" ] \
    || { printf '❌  Expected directory not found: %s\n' "$target" >&2; exit 1; }

  # Remove any pre-existing file/dir/link with the same name
  [ -e "$link" ] && rm -rf "$link"

  ln -s "$target" "$link"
  printf '🔗  %s → %s\n' "$link" "$target"
 done

printf '✅  Symlinks created successfully.\n'
