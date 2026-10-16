#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source "$HOME/.cargo/env"
export CC_riscv64imac_unknown_none_elf=clang
export AR_riscv64imac_unknown_none_elf=ar
rustup run 1.97.1 cargo build --locked --offline --release --target riscv64imac-unknown-none-elf -p streak-protocol-v4 -p streak-guard
