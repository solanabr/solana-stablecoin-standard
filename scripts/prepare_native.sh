#!/bin/bash
set -e

# Configuration
SOLANA_VERSION="v1.18.15"
ANCHOR_VERSION="0.29.0"
PROJECT_ROOT=$(pwd)
BIN_DIR="$PROJECT_ROOT/.bin"

echo "🚀 Starting Native Build Preparation (Mac ARM64 workaround)..."

# 1. Ensure .bin directory exists
mkdir -p "$BIN_DIR"

# 2. Detect Solana Build Tools
if command -v cargo-build-sbf &> /dev/null; then
    echo "✅ Solana Build Tools found at $(which cargo-build-sbf)"
    SOLANA_CLI=$(command -v solana)
else
    echo "⚠️  cargo-build-sbf not found globally. Ensuring local Solana $SOLANA_VERSION is installed..."
    if [[ ! -f "$BIN_DIR/cargo-build-sbf" ]]; then
        echo "📥 Downloading Solana $SOLANA_VERSION for Mac ARM64 from GitHub..."
        curl -L -o solana-mac.tar.bz2 "https://github.com/solana-labs/solana/releases/download/$SOLANA_VERSION/solana-release-aarch64-apple-darwin.tar.bz2"
        tar jxf solana-mac.tar.bz2
        cp -r solana-release/bin/* "$BIN_DIR/"
        if [[ -d "solana-release/bin/sdk" ]]; then
            cp -r solana-release/bin/sdk "$BIN_DIR/"
        elif [[ -d "solana-release/sdk" ]]; then
            cp -r solana-release/sdk "$BIN_DIR/"
        fi
        rm -rf solana-release solana-mac.tar.bz2
        echo "✅ Solana binaries (including cargo-build-sbf) installed in .bin/"
    fi
    SOLANA_CLI="$BIN_DIR/solana"
fi


# 3. Detect Anchor
if command -v anchor &> /dev/null; then
    echo "✅ Anchor found at $(which anchor) ($(anchor --version))"
    ANCHOR_CLI=$(command -v anchor)
else
    if [[ ! -f "$BIN_DIR/anchor" ]]; then
        echo "🦀 Installing Anchor CLI $ANCHOR_VERSION via Cargo (this may take a few minutes)..."
        cargo install anchor-cli --version "$ANCHOR_VERSION" --root "$PROJECT_ROOT/.anchor-install"
        cp "$PROJECT_ROOT/.anchor-install/bin/anchor" "$BIN_DIR/"
        rm -rf "$PROJECT_ROOT/.anchor-install"
        echo "✅ Anchor CLI installed in .bin/"
    fi
    ANCHOR_CLI="$BIN_DIR/anchor"
fi

# 4. Handle Cargo.lock versioning issues
# Pinning the toolchain to 1.75.0 in rust-toolchain.toml forces V3 format.
# We also delete any existing V4 lockfile to allow regeneration.
if [[ -f "Cargo.lock" ]]; then
    echo "🛡️  Preserving Cargo.lock for compatibility..."
    sed -i.bak 's/version = 4/version = 3/g' Cargo.lock || true
fi

# 5. Build the programs
export PATH="$BIN_DIR:$PATH"
echo "🛠️  Building Solana programs natively on host using $ANCHOR_CLI..."
"$ANCHOR_CLI" build

echo "✨ Native build complete! Programs are ready for Docker deployment."
