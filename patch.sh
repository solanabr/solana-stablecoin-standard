#!/bin/bash
set -x
# 1. Update everything to latest
cargo update

# 2. Downgrade blake3/constant_time_eq
cargo update -p blake3@1.8.3 --precise 1.5.5 || cargo update -p blake3 --precise 1.5.5 || true
cargo update -p constant_time_eq@0.4.2 --precise 0.3.1 || cargo update -p constant_time_eq --precise 0.3.1 || true

# 3. Downgrade borsh suite
cargo update -p borsh@1.6.0 --precise 1.5.1 || cargo update -p borsh --precise 1.5.1 || true
cargo update -p borsh-derive@1.6.0 --precise 1.5.1 || cargo update -p borsh-derive --precise 1.5.1 || true
cargo update -p proc-macro-crate@3.5.0 --precise 1.3.0 || cargo update -p proc-macro-crate --precise 1.3.0 || true

# 4. Downgrade toml suite with full specs
cargo update -p toml_edit@0.25.4+spec-1.1.0 --precise 0.22.6 || cargo update -p toml_edit@0.25.4 --precise 0.22.6 || cargo update -p toml_edit --precise 0.22.6 || true
cargo update -p toml_edit@0.22.27 --precise 0.22.6 || true
cargo update -p toml_datetime@1.0.0+spec-1.1.0 --precise 0.1.2 || cargo update -p toml_datetime --precise 0.1.2 || true
cargo update -p toml@0.8.23 --precise 0.8.19 || true

# 5. Downgrade indexmap
cargo update -p indexmap@2.13.0 --precise 2.2.6 || cargo update -p indexmap --precise 2.2.6 || true

# 6. Sanitize and Build
sed -i '' 's/version = 4/version = 3/g' Cargo.lock || true
export PATH="$(pwd)/.bin:$PATH"
anchor build
