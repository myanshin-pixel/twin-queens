#!/usr/bin/env bash
# Fetch a pinned Fairy-Stockfish WASM runtime into the generated website bundle.
set -euo pipefail
TMP="${RUNNER_TEMP:-/tmp}/tq-fairy-stockfish"
rm -rf "$TMP"
mkdir -p "$TMP"
npm install --prefix "$TMP" --no-save --ignore-scripts --package-lock=false fairy-stockfish-nnue.wasm@1.1.12
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/site/assets/engine"
mkdir -p "$DEST"
cp "$TMP/node_modules/fairy-stockfish-nnue.wasm/stockfish.js" "$DEST/"
cp "$TMP/node_modules/fairy-stockfish-nnue.wasm/stockfish.wasm" "$DEST/"
cp "$TMP/node_modules/fairy-stockfish-nnue.wasm/stockfish.worker.js" "$DEST/"
