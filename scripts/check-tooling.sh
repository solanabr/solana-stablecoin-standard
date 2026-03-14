#!/usr/bin/env bash
set -euo pipefail

check_bin() {
  local bin="$1"
  local install_hint="$2"
  if command -v "$bin" >/dev/null 2>&1; then
    echo "[ok] $bin -> $(command -v "$bin")"
  else
    echo "[missing] $bin"
    echo "  install: $install_hint"
  fi
}

check_bin rustc "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
check_bin cargo "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
check_bin solana "sh -c \"\$(curl -sSfL https://release.anza.xyz/stable/install)\""
check_bin anchor "cargo install --git https://github.com/coral-xyz/anchor --tag v0.32.1 anchor-cli --force"
check_bin node "brew install node"
check_bin pnpm "npm install -g pnpm@10"
check_bin docker "brew install --cask docker"
