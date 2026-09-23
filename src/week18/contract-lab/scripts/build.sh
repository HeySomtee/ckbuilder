#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source "$HOME/.cargo/env"
rustup target add riscv64imac-unknown-none-elf
export CC_riscv64imac_unknown_none_elf=clang
export AR_riscv64imac_unknown_none_elf=ar
cargo build --locked --release --target riscv64imac-unknown-none-elf -p streak-protocol -p streak-guard
