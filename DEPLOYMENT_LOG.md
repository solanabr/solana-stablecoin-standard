(base) ice@node:~/autonom/solana-stablecoin-standard$ # Generate new keypairs
solana-keygen new -o target/deploy/solana_stablecoin-keypair.json --force --no-bip39-passphrase
solana-keygen new -o target/deploy/sss_transfer_hook-keypair.json --force --no-bip39-passphrase

# Get the new addresses
NEW_STABLE=$(solana-keygen pubkey target/deploy/solana_stablecoin-keypair.json)
NEW_HOOK=$(solana-keygen pubkey target/deploy/sss_transfer_hook-keypair.json)
echo "New Stablecoin: $NEW_STABLE"
echo "New Hook: $NEW_HOOK"

# Update declare_id! in both programs
sed -i "s/declare_id!(\"[^\"]*\")/declare_id!(\"$NEW_STABLE\")/" programs/stablecoin/src/lib.rs
sed -i "s/declare_id!(\"[^\"]*\")/declare_id!(\"$NEW_HOOK\")/" programs/transfer-hook/src/lib.rs

# Update the test script constants
sed -i "s/const STABLECOIN_PROGRAM_ID = new PublicKey(\"[^\"]*\")/const STABLECOIN_PROGRAM_ID = new PublicKey(\"$NEW_STABLE\")/" testnet-test.ts
sed -i "s/const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(\"[^\"]*\")/const TRANSFER_HOOK_PROGRAM_ID = new PublicKey(\"$NEW_HOOK\")/" testnet-test.ts

# Update IDL address
python3 -c "
import json
with open('sdk/src/idl/solana_stablecoin.json') as f: idl = json.load(f)
idl['address'] = '$NEW_STABLE'
with open('sdk/src/idl/solana_stablecoin.json','w') as f: json.dump(idl, f, indent=2)
print('IDL address updated')
"

# Rebuild (declare_id changed), deploy, test
cargo build-sbf --manifest-path programs/transfer-hook/Cargo.toml
cargo build-sbf --manifest-path programs/stablecoin/Cargo.toml
solana program deploy target/deploy/sss_transfer_hook.so
solana program deploy target/deploy/solana_stablecoin.so
npx ts-node --compiler-options '{"module":"commonjs","esModuleInterop":true}' testnet-test.ts
Generating a new keypair
Wrote new keypair to target/deploy/solana_stablecoin-keypair.json
=============================================================================
pubkey: GPXDvDTpDnCxWrkKXYkfFedKWhsvbmLj2FpXNQM3EV7y
=============================================================================
Save this seed phrase to recover your new keypair:
ginger hair merge cricket behave glad ancient humor screen hand gesture brand
=============================================================================
Generating a new keypair
Wrote new keypair to target/deploy/sss_transfer_hook-keypair.json
==============================================================================
pubkey: C76nk4L27JJbXiVHR72mWdcq9jX8NETHekECAxw72ZpM
==============================================================================
Save this seed phrase to recover your new keypair:
melody praise power volume cereal brand famous hurt divide claw language roast
==============================================================================
New Stablecoin: GPXDvDTpDnCxWrkKXYkfFedKWhsvbmLj2FpXNQM3EV7y
New Hook: C76nk4L27JJbXiVHR72mWdcq9jX8NETHekECAxw72ZpM
IDL address updated
   Compiling solana-stablecoin v0.1.0 (/home/ice/autonom/solana-stablecoin-standard/programs/stablecoin)
warning: unexpected `cfg` condition value: `anchor-debug`
  --> programs/stablecoin/src/instructions/initialize.rs:30:10
   |
30 | #[derive(Accounts)]
   |          ^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: `#[warn(unexpected_cfgs)]` on by default
   = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
 --> programs/stablecoin/src/instructions/mint.rs:8:10
  |
8 | #[derive(Accounts)]
  |          ^^^^^^^^
  |
  = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
  = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
  = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
  = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
 --> programs/stablecoin/src/instructions/burn.rs:8:10
  |
8 | #[derive(Accounts)]
  |          ^^^^^^^^
  |
  = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
  = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
  = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
  = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
 --> programs/stablecoin/src/instructions/freeze.rs:8:10
  |
8 | #[derive(Accounts)]
  |          ^^^^^^^^
  |
  = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
  = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
  = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
  = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
 --> programs/stablecoin/src/instructions/thaw.rs:8:10
  |
8 | #[derive(Accounts)]
  |          ^^^^^^^^
  |
  = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
  = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
  = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
  = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
 --> programs/stablecoin/src/instructions/pause.rs:6:10
  |
6 | #[derive(Accounts)]
  |          ^^^^^^^^
  |
  = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
  = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
  = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
  = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
 --> programs/stablecoin/src/instructions/unpause.rs:6:10
  |
6 | #[derive(Accounts)]
  |          ^^^^^^^^
  |
  = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
  = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
  = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
  = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
  --> programs/stablecoin/src/instructions/roles.rs:13:10
   |
13 | #[derive(Accounts)]
   |          ^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
  --> programs/stablecoin/src/instructions/roles.rs:91:10
   |
91 | #[derive(Accounts)]
   |          ^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
 --> programs/stablecoin/src/instructions/blacklist.rs:8:10
  |
8 | #[derive(Accounts)]
  |          ^^^^^^^^
  |
  = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
  = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
  = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
  = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
  --> programs/stablecoin/src/instructions/blacklist.rs:67:10
   |
67 | #[derive(Accounts)]
   |          ^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
  --> programs/stablecoin/src/instructions/seize.rs:13:10
   |
13 | #[derive(Accounts)]
   |          ^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: ambiguous glob re-exports
  --> programs/stablecoin/src/instructions/mod.rs:12:9
   |
12 | pub use initialize::*;
   |         ^^^^^^^^^^^^^ the name `handler` in the value namespace is first re-exported here
...
21 | pub use seize::*;
   |         -------- but the name `handler` in the value namespace is also re-exported here
   |
   = note: `#[warn(ambiguous_glob_reexports)]` on by default

warning: unused import: `anchor_lang::prelude::*`
 --> programs/stablecoin/src/state/mod.rs:1:5
  |
1 | use anchor_lang::prelude::*;
  |     ^^^^^^^^^^^^^^^^^^^^^^^
  |
  = note: `#[warn(unused_imports)]` on by default

warning: unexpected `cfg` condition value: `anchor-debug`
  --> programs/stablecoin/src/lib.rs:11:1
   |
11 | #[program]
   | ^^^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: this warning originates in the attribute macro `program` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
  --> programs/stablecoin/src/lib.rs:11:1
   |
11 | #[program]
   | ^^^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: `solana-stablecoin` (lib) generated 21 warnings (5 duplicates) (run `cargo fix --lib -p solana-stablecoin` to apply 1 suggestion)
   Compiling sss-transfer-hook v0.1.0 (/home/ice/autonom/solana-stablecoin-standard/programs/transfer-hook)
warning: unexpected `cfg` condition value: `custom-heap`
  --> programs/transfer-hook/src/lib.rs:47:1
   |
47 | #[program]
   | ^^^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `custom-heap` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: `#[warn(unexpected_cfgs)]` on by default
   = note: this warning originates in the macro `$crate::custom_heap_default` which comes from the expansion of the attribute macro `program` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `custom-panic`
  --> programs/transfer-hook/src/lib.rs:47:1
   |
47 | #[program]
   | ^^^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `custom-panic` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: this warning originates in the macro `$crate::custom_panic_default` which comes from the expansion of the attribute macro `program` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
  --> programs/transfer-hook/src/lib.rs:27:10
   |
27 | #[derive(Accounts)]
   |          ^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
  --> programs/transfer-hook/src/lib.rs:47:1
   |
47 | #[program]
   | ^^^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: this warning originates in the attribute macro `program` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
  --> programs/transfer-hook/src/lib.rs:47:1
   |
47 | #[program]
   | ^^^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: `sss-transfer-hook` (lib) generated 10 warnings (5 duplicates)
    Finished `release` profile [optimized] target(s) in 6.20s
   Compiling solana-stablecoin v0.1.0 (/home/ice/autonom/solana-stablecoin-standard/programs/stablecoin)
warning: unexpected `cfg` condition value: `custom-heap`
  --> programs/stablecoin/src/lib.rs:11:1
   |
11 | #[program]
   | ^^^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `custom-heap` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: `#[warn(unexpected_cfgs)]` on by default
   = note: this warning originates in the macro `$crate::custom_heap_default` which comes from the expansion of the attribute macro `program` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `custom-panic`
  --> programs/stablecoin/src/lib.rs:11:1
   |
11 | #[program]
   | ^^^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `custom-panic` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: this warning originates in the macro `$crate::custom_panic_default` which comes from the expansion of the attribute macro `program` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
  --> programs/stablecoin/src/instructions/initialize.rs:30:10
   |
30 | #[derive(Accounts)]
   |          ^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
 --> programs/stablecoin/src/instructions/mint.rs:8:10
  |
8 | #[derive(Accounts)]
  |          ^^^^^^^^
  |
  = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
  = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
  = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
  = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
 --> programs/stablecoin/src/instructions/burn.rs:8:10
  |
8 | #[derive(Accounts)]
  |          ^^^^^^^^
  |
  = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
  = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
  = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
  = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
 --> programs/stablecoin/src/instructions/freeze.rs:8:10
  |
8 | #[derive(Accounts)]
  |          ^^^^^^^^
  |
  = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
  = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
  = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
  = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
 --> programs/stablecoin/src/instructions/thaw.rs:8:10
  |
8 | #[derive(Accounts)]
  |          ^^^^^^^^
  |
  = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
  = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
  = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
  = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
 --> programs/stablecoin/src/instructions/pause.rs:6:10
  |
6 | #[derive(Accounts)]
  |          ^^^^^^^^
  |
  = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
  = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
  = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
  = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
 --> programs/stablecoin/src/instructions/unpause.rs:6:10
  |
6 | #[derive(Accounts)]
  |          ^^^^^^^^
  |
  = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
  = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
  = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
  = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
  --> programs/stablecoin/src/instructions/roles.rs:13:10
   |
13 | #[derive(Accounts)]
   |          ^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
  --> programs/stablecoin/src/instructions/roles.rs:91:10
   |
91 | #[derive(Accounts)]
   |          ^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
 --> programs/stablecoin/src/instructions/blacklist.rs:8:10
  |
8 | #[derive(Accounts)]
  |          ^^^^^^^^
  |
  = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
  = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
  = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
  = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
  --> programs/stablecoin/src/instructions/blacklist.rs:67:10
   |
67 | #[derive(Accounts)]
   |          ^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
  --> programs/stablecoin/src/instructions/seize.rs:13:10
   |
13 | #[derive(Accounts)]
   |          ^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: ambiguous glob re-exports
  --> programs/stablecoin/src/instructions/mod.rs:12:9
   |
12 | pub use initialize::*;
   |         ^^^^^^^^^^^^^ the name `handler` in the value namespace is first re-exported here
...
21 | pub use seize::*;
   |         -------- but the name `handler` in the value namespace is also re-exported here
   |
   = note: `#[warn(ambiguous_glob_reexports)]` on by default

warning: unused import: `anchor_lang::prelude::*`
 --> programs/stablecoin/src/state/mod.rs:1:5
  |
1 | use anchor_lang::prelude::*;
  |     ^^^^^^^^^^^^^^^^^^^^^^^
  |
  = note: `#[warn(unused_imports)]` on by default

warning: unexpected `cfg` condition value: `anchor-debug`
  --> programs/stablecoin/src/lib.rs:11:1
   |
11 | #[program]
   | ^^^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: this warning originates in the attribute macro `program` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: unexpected `cfg` condition value: `anchor-debug`
  --> programs/stablecoin/src/lib.rs:11:1
   |
11 | #[program]
   | ^^^^^^^^^^
   |
   = note: expected values for `feature` are: `cpi`, `default`, `idl-build`, `no-entrypoint`, `no-idl`, and `no-log-ix-name`
   = help: consider adding `anchor-debug` as a feature in `Cargo.toml`
   = note: see <https://doc.rust-lang.org/nightly/rustc/check-cfg/cargo-specifics.html> for more information about checking conditional configuration
   = note: this warning originates in the derive macro `Accounts` (in Nightly builds, run with -Z macro-backtrace for more info)

warning: `solana-stablecoin` (lib) generated 23 warnings (5 duplicates) (run `cargo fix --lib -p solana-stablecoin` to apply 1 suggestion)
    Finished `release` profile [optimized] target(s) in 4.21s
Program Id: C76nk4L27JJbXiVHR72mWdcq9jX8NETHekECAxw72ZpM

Signature: fTYb5TR9XMEm2qn84MjAfraknSJSvB31roukfJDdoag5bBcPe6GsaeC4tsBYvH5V4yyMv1VFSKsexiMUaRbUeWo

Program Id: GPXDvDTpDnCxWrkKXYkfFedKWhsvbmLj2FpXNQM3EV7y

Signature: AoTtFnFUYSuj52VRNXs3A3Evfz7NVnqyDgqUiqChaHFSF2A2ghFL5YH8DQeHoSm4NFtfzxSaDQgVaCkYqoWqG2i


╔══════════════════════════════════════════════════════╗
║  Solana Stablecoin Standard — Testnet Verification  ║
╚══════════════════════════════════════════════════════╝

Authority: Ek73zmhXDLiKi6dca91RDUrmj8TdobZYunmUrCJecuti
Balance:   312.52 SOL
Stablecoin Program: GPXDvDTpDnCxWrkKXYkfFedKWhsvbmLj2FpXNQM3EV7y
Transfer Hook:      C76nk4L27JJbXiVHR72mWdcq9jX8NETHekECAxw72ZpM

━━━ SSS-1: Minimal Stablecoin ━━━━━━━━━━━━━━━━━━━━━━━
  ✅ Initialize SSS-1 stablecoin
     tx: 5GYVcrFhom3EczcRe3rj4XdnBcwbaEfey6h2Wmgs8GDHa3zFmNmiwrE6E14WteCkakb5GbpqhNq1JGhVZfJ8rcT1
  ✅ Config matches SSS-1 preset (freeze=true, delegate=false, hook=false)
  ✅ Mint 10 tokens to ATA
     tx: afUE3rbo4CPJ4xaG49DkvDFcv6SwHpk6UAPAQW2oMdTnAedkSZcHaEkvJ8ZpDrY276V8xBeaYWWvNXRVdQccg3M
  ✅ Burn 1 token (9 remaining)
     tx: 2c6fxjzGf1osPTKdcjr7JBsKPEmwuowsfkgTBw3znzPg9L1bWti7z9nzGHAPED5yRdQPvwTBwaWSzqZhsyHDXBQ2
  ✅ Freeze account
     tx: 2uCeWVGGPZfV9jnGVwbduUvvWZvtTTeicrvRM6cFRJb5N56isxjHmm95SQbDPz6d576xKq9L3CA6eNHfdyhPEEk7
  ✅ Thaw account
     tx: hhQpSbqdYY3KTZ7Ekkr32jmtYCinZppJnowsVVBgSL859ktkrj18HxZJxUvMYJuKGiHLH5KJCW5ZFfTFfCSGvrt
  ✅ Pause stablecoin
     tx: 4GNtunHDNffzWhUsKrkCiPWL7UaXgnG4PTvfd3o4uH8H9U7GwKoquUyREwcJ2bm6QJ9zNvgWTS8sHpQyxJQ5rUrK
  ✅ Mint rejected while paused
  ✅ Unpause stablecoin
     tx: 5zCA7ZZhdC6cu1sZdU1mHPXsMHrY2XxtrzEaXoEcRBMotgX7QXqYDvZCToFXpsERMG45vPif6yRGCUSpbUh4crjy
  ✅ Grant Minter role to new keypair
     tx: VgexbiqbYP4pc9aXzfKhRQ6bDvXZ7jze2QZ2ajRGpBwbRXzivyi1jbNg5ZY8q6Vs2UPyYpBLRT19Ug1GVxueMBE
  ✅ Revoke Minter role
     tx: 5BVAAEUan6vVB3Fjd2abnEzEiFnXR8kQgdCkcygoTaQJ1th6R6veYh1tMHifgy1pAJdhvVHdzqJBdtpfczDLRqYD
  ✅ Token-2022 transfer (SSS-1, no hook)
     tx: 4hNPFudXxK68VuxJzoKrbX5N6yBLuK83TZxSaqMUsd33xQM4gY6izQcAKm1tPS1kdnZtNvsWHvC5MGDNMVhAaLxs

━━━ SSS-2: Compliant Stablecoin ━━━━━━━━━━━━━━━━━━━━━
  ✅ Initialize SSS-2 stablecoin
     tx: 3JBSBgHkHMk8LuSD9KD7cp4Rnskn6BaKZD8z8SWaFNSuE6Qe1UAz1jum8AhaBFrZEYbSajzyxMuht4DgNaw7p8bZ
  ✅ Initialize transfer hook extra-account-metas
     tx: 5Bpn26jYGk5wVKLaV7W8CAz6Cj6DHgzGkQ4amSBj4msWabZgmBU67tSfDoe4sCYyM6WRPB71bP6F64mbPe231LQi
  ✅ SSS-2 config: freeze=true, delegate=true, hook=true
  ✅ Mint 50 SSS-2 tokens
     tx: 3hwAGbjZTqXxYGLrg8hTZ5XqXmPrgic8NjPoDvn8zDrKdwXNcncUNKUqnfpuUNPUzHGLvX1NLjuM1VMR9TZhSaVj
  ✅ Add address to blacklist
     tx: 35U7pv4H6yB2NET9n72JpMb31niGTPSpYZdWc8wdoNEvi9qhqgUW2zBn5eKsySnyssijGwLxSVs39XkRrKgU28uC
  ✅ Duplicate blacklist correctly rejected
  ✅ Seize tokens from blacklisted account (5 tokens)
     tx: 48AKmDvJ9RmxG84TobKQp7d64c5yGZ27cAFZRAoGuPsJBUZ8avnuCARQsL65hWoiMfBKXoPW1SzBx7H1zeZrXnvs
  ✅ Seize correctly rejected without Seizer role
  ✅ Remove from blacklist (PDA closed)
     tx: 3EwhtwVTLJKtho67tARtrdHXs1JkWY2Xw6k7qdVD1gV9Cc1QSZNKMFE5z85wgkyrrfnnTG9LHRXwSV29bPbMrHzr
  ✅ Blacklist correctly rejected on SSS-1 mint

━━━ Role Separation ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ Grant Blacklister role
  ✅ Grant Seizer role
  ✅ Seizer role correctly rejected on SSS-1
  ✅ Blacklister role correctly rejected on SSS-1

━━━ Transfer Authority ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ Transfer authority to new keypair
     tx: 4d6QbYWQzDmYYUVzg5HPA8Jkor5b1Djs5srCmKwrZg7aCxgJxKZZRKt84yZ5fo3LGVuHgyiuhNijrkYzTh2isTsD
  ✅ Old authority correctly rejected after transfer

╔══════════════════════════════════════════════════════╗
║  Results: 28 passed, 0 failed                         ║
╠══════════════════════════════════════════════════════╣
║  SSS-1 Mint:  Ae9QmgsGcNSicNE5Z6wFYrvTqkKoASkr2Wnc...  ║
║  SSS-2 Mint:  CfiCZV2WjqWTDEdrcLQbFCro3k1q9cToDiJM...  ║
╚══════════════════════════════════════════════════════╝

🎉 All spec requirements verified on testnet!

(base) ice@node:~/autonom/solana-stablecoin-standard$ 