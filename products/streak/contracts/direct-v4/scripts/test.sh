#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source "$HOME/.cargo/env"
mkdir -p artifacts
bash scripts/build.sh
rustup run 1.97.1 cargo fmt --all -- --check
rustup run 1.97.1 cargo test --locked --offline -- --nocapture --test-threads=1 2>&1 | tee artifacts/vm-tests.txt
