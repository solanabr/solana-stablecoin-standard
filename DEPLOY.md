# Generate new keypairs
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