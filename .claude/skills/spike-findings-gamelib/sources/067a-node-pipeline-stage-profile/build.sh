#!/bin/sh
# Builds the 067a harness next to the same dev decode worker the app uses
# (build/main/decompressWorker.js), so DecompressPool finds it via __dirname.
set -e
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
OUT="$ROOT/.planning/spikes/067a-node-pipeline-stage-profile/state/build"
mkdir -p "$OUT"
cd "$ROOT"
pnpm -s build:decompress-worker-dev
cp build/main/decompressWorker.js "$OUT/decompressWorker.js"
./node_modules/.bin/esbuild --bundle --platform=node --target=node22 --format=cjs \
  --packages=external --log-level=warning \
  --outfile="$OUT/harness.js" .planning/spikes/067a-node-pipeline-stage-profile/harness.ts
echo "built $OUT/harness.js"
