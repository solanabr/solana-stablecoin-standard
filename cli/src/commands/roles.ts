import { PublicKey } from "@solana/web3.js";
import { Role } from "@solana-stablecoin/sdk";
import { getProvider, loadStablecoin } from "./utils";

const ROLE_MAP: Record<string, Role> = {
  minter: Role.Minter,
  burner: Role.Burner,
  pauser: Role.Pauser,
  blacklister: Role.Blacklister,
  seizer: Role.Seizer,
  compliance: Role.Blacklister,
};

export async function rolesCommand(opts: any) {
  const parent = opts.parent?.parent || opts;
  const cluster = parent.cluster || opts.cluster || "http://localhost:8899";
  const keypair = parent.keypair || opts.keypair || "~/.config/solana/id.json";

  try {
    const provider = await getProvider(cluster, keypair);
    const stablecoin = await loadStablecoin(provider, opts.mint);

    switch (opts.action) {
      case "grant": {
        const role = ROLE_MAP[opts.role.toLowerCase()];
        if (!role) {
          console.error(`❌ Unknown role: ${opts.role}. Options: minter, burner, pauser, blacklister, seizer`);
          process.exit(1);
        }
        const address = new PublicKey(opts.address);
        const quota = opts.quota ? BigInt(opts.quota) : undefined;

        console.log(`\n✨ Granting ${role} role to ${address.toBase58()}...`);
        if (quota) console.log(`   Mint quota: ${quota}`);

        const sig = await stablecoin.roles.grant(address, role, quota);
        console.log(`✅ Role granted`);
        console.log(`   Signature: ${sig}`);
        break;
      }

      case "revoke": {
        const role = ROLE_MAP[opts.role.toLowerCase()];
        if (!role) {
          console.error(`❌ Unknown role: ${opts.role}`);
          process.exit(1);
        }
        const address = new PublicKey(opts.address);

        console.log(`\n🔒 Revoking ${role} role from ${address.toBase58()}...`);
        const sig = await stablecoin.roles.revoke(address, role);
        console.log(`✅ Role revoked`);
        console.log(`   Signature: ${sig}`);
        break;
      }

      case "list": {
        const address = new PublicKey(opts.address);
        console.log(`\n📋 Roles for ${address.toBase58()}:`);

        const roles = await stablecoin.roles.getRoles(address);
        if (!roles) {
          console.log("   No roles assigned");
          return;
        }

        console.log(`   Minter:      ${roles.isMinter ? "✅" : "❌"}`);
        console.log(`   Burner:      ${roles.isBurner ? "✅" : "❌"}`);
        console.log(`   Pauser:      ${roles.isPauser ? "✅" : "❌"}`);
        console.log(`   Blacklister: ${roles.isBlacklister ? "✅" : "❌"}`);
        console.log(`   Seizer:      ${roles.isSeizer ? "✅" : "❌"}`);
        if (roles.isMinter) {
          console.log(`   Mint quota:  ${roles.mintQuota === 0n ? "unlimited" : roles.mintQuota.toString()}`);
          console.log(`   Minted:      ${roles.mintedAmount.toString()}`);
        }
        break;
      }

      default:
        console.error(`Unknown action: ${opts.action}`);
        process.exit(1);
    }
  } catch (err: any) {
    console.error(`\n❌ Role operation failed: ${err.message}`);
    process.exit(1);
  }
}
