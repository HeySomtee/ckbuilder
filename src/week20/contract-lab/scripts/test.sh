#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source "$HOME/.cargo/env"
mkdir -p artifacts
bash scripts/build.sh
cargo fmt --all -- --check
cargo test --locked -- --nocapture --test-threads=1 2>&1 | tee artifacts/vm-tests.txt
