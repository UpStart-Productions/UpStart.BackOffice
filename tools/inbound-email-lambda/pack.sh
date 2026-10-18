#!/usr/bin/env bash
# Zips the Lambda. It has no dependencies, so the zip is just index.mjs.
set -euo pipefail
cd "$(dirname "$0")"
rm -f function.zip
zip -q -j function.zip index.mjs
echo "Wrote $(pwd)/function.zip"
