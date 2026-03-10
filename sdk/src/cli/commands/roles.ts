import { Command } from "commander";
import { Connection, PublicKey } from "@solana/web3.js";
import { StablecoinClient } from "../../client";
import { RoleType } from "../../types";
import {
  getProvider,
  formatOutput,
  confirmAction,
  logSuccess,
  logError,
  logWarning,
  parsePublicKey,
} from "../utils";

/** Valid role name strings accepted by the CLI. */
const VALID_ROLES: string[] = [
  RoleType.MasterMinter,
  RoleType.Pauser,
  RoleType.Blacklister,
];

function parseRoleType(value: string): RoleType {
  const match = VALID_ROLES.find(
    (r) => r.toLowerCase() === value.toLowerCase()
  );
  if (!match) {
    throw new Error(
      `Invalid --role "${value}". Must be one of: ${VALID_ROLES.join(", ")}`
    );
  }
  return match as RoleType;
}

/**
 * Register the `roles` sub-command group onto the given commander program.
 *
 * Sub-commands:
 *   sss-token roles update             --mint <pubkey> --role <role> --address <pubkey>
 *   sss-token roles transfer-authority --mint <pubkey> --new-authority <pubkey>
 *   sss-token roles accept-authority   --mint <pubkey>
 */
export function registerRolesCommands(program: Command): void {
  const roles = program
    .command("roles")
    .description("Manage authority and role assignments for a stablecoin");

  // ----- update -----
  roles
    .command("update")
    .description(
      `Update a role assignment. Roles: ${VALID_ROLES.join(", ")}. Only callable by the authority.`
    )
    .requiredOption("--mint <pubkey>", "Stablecoin mint address")
    .requiredOption(
      "--role <role>",
      `Role to update (${VALID_ROLES.join(" | ")})`
    )
    .requiredOption("--address <pubkey>", "New public key to assign to the role")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.parent?.opts() ?? {};
      const keypairPath: string = globalOpts.keypair ?? "~/.config/solana/id.json";
      const url: string = globalOpts.url ?? "http://localhost:8899";
      const outputFormat: string = globalOpts.output ?? "table";
      const skipConfirm: boolean = globalOpts.yes ?? false;
      const dryRun: boolean = globalOpts.dryRun ?? false;

      let mintPubkey: PublicKey;
      let newAddressPubkey: PublicKey;
      let role: RoleType;
      try {
        mintPubkey = parsePublicKey(opts.mint, "--mint");
        newAddressPubkey = parsePublicKey(opts.address, "--address");
        role = parseRoleType(opts.role);
      } catch (err) {
        logError((err as Error).message);
        process.exit(1);
      }

      if (dryRun) {
        const dryData = {
          action: "roles update",
          mint: mintPubkey.toBase58(),
          role,
          newAddress: newAddressPubkey.toBase58(),
          keypair: keypairPath,
          cluster: url,
        };
        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(dryData, null, 2) + "\n");
        } else {
          logWarning("DRY RUN — no transaction will be sent");
          process.stdout.write(formatOutput(dryData, outputFormat) + "\n");
        }
        return;
      }

      const confirmed = await confirmAction(
        `Update ${role} to ${newAddressPubkey.toBase58()} for mint ${mintPubkey.toBase58()}?`,
        skipConfirm
      );
      if (!confirmed) {
        process.stdout.write("Aborted.\n");
        return;
      }

      try {
        const { wallet } = getProvider(url, keypairPath);
        const connection = new Connection(url, "confirmed");
        const client = new StablecoinClient(connection, wallet);

        const txSig = await client.updateRole(mintPubkey, role, newAddressPubkey);

        const output = {
          action: "roles update",
          mint: mintPubkey.toBase58(),
          role,
          newAddress: newAddressPubkey.toBase58(),
          txSignature: txSig,
        };

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        } else {
          logSuccess(`Role ${role} updated to ${newAddressPubkey.toBase58()}`);
          process.stdout.write(formatOutput(output, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to update role: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // ----- transfer-authority -----
  roles
    .command("transfer-authority")
    .description(
      "Initiate a two-step authority transfer. The new authority must call accept-authority to complete."
    )
    .requiredOption("--mint <pubkey>", "Stablecoin mint address")
    .requiredOption(
      "--new-authority <pubkey>",
      "Public key of the proposed new authority"
    )
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.parent?.opts() ?? {};
      const keypairPath: string = globalOpts.keypair ?? "~/.config/solana/id.json";
      const url: string = globalOpts.url ?? "http://localhost:8899";
      const outputFormat: string = globalOpts.output ?? "table";
      const skipConfirm: boolean = globalOpts.yes ?? false;
      const dryRun: boolean = globalOpts.dryRun ?? false;

      let mintPubkey: PublicKey;
      let newAuthorityPubkey: PublicKey;
      try {
        mintPubkey = parsePublicKey(opts.mint, "--mint");
        newAuthorityPubkey = parsePublicKey(opts.newAuthority, "--new-authority");
      } catch (err) {
        logError((err as Error).message);
        process.exit(1);
      }

      if (dryRun) {
        const dryData = {
          action: "roles transfer-authority",
          mint: mintPubkey.toBase58(),
          newAuthority: newAuthorityPubkey.toBase58(),
          keypair: keypairPath,
          cluster: url,
        };
        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(dryData, null, 2) + "\n");
        } else {
          logWarning("DRY RUN — no transaction will be sent");
          process.stdout.write(formatOutput(dryData, outputFormat) + "\n");
        }
        return;
      }

      const confirmed = await confirmAction(
        `Initiate authority transfer to ${newAuthorityPubkey.toBase58()} for mint ${mintPubkey.toBase58()}?`,
        skipConfirm
      );
      if (!confirmed) {
        process.stdout.write("Aborted.\n");
        return;
      }

      try {
        const { wallet } = getProvider(url, keypairPath);
        const connection = new Connection(url, "confirmed");
        const client = new StablecoinClient(connection, wallet);

        const txSig = await client.transferAuthority(mintPubkey, newAuthorityPubkey);

        const output = {
          action: "roles transfer-authority",
          mint: mintPubkey.toBase58(),
          newAuthority: newAuthorityPubkey.toBase58(),
          txSignature: txSig,
        };

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        } else {
          logSuccess(
            `Authority transfer initiated. New authority ${newAuthorityPubkey.toBase58()} must call accept-authority to complete.`
          );
          process.stdout.write(formatOutput(output, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to initiate authority transfer: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  // ----- accept-authority -----
  roles
    .command("accept-authority")
    .description(
      "Accept a pending authority transfer. Must be called by the pending authority."
    )
    .requiredOption("--mint <pubkey>", "Stablecoin mint address")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.parent?.parent?.opts() ?? {};
      const keypairPath: string = globalOpts.keypair ?? "~/.config/solana/id.json";
      const url: string = globalOpts.url ?? "http://localhost:8899";
      const outputFormat: string = globalOpts.output ?? "table";
      const skipConfirm: boolean = globalOpts.yes ?? false;
      const dryRun: boolean = globalOpts.dryRun ?? false;

      let mintPubkey: PublicKey;
      try {
        mintPubkey = parsePublicKey(opts.mint, "--mint");
      } catch (err) {
        logError((err as Error).message);
        process.exit(1);
      }

      if (dryRun) {
        const dryData = {
          action: "roles accept-authority",
          mint: mintPubkey.toBase58(),
          keypair: keypairPath,
          cluster: url,
        };
        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(dryData, null, 2) + "\n");
        } else {
          logWarning("DRY RUN — no transaction will be sent");
          process.stdout.write(formatOutput(dryData, outputFormat) + "\n");
        }
        return;
      }

      const confirmed = await confirmAction(
        `Accept authority transfer for mint ${mintPubkey.toBase58()}?`,
        skipConfirm
      );
      if (!confirmed) {
        process.stdout.write("Aborted.\n");
        return;
      }

      try {
        const { wallet } = getProvider(url, keypairPath);
        const connection = new Connection(url, "confirmed");
        const client = new StablecoinClient(connection, wallet);

        const txSig = await client.acceptAuthority(mintPubkey);

        const output = {
          action: "roles accept-authority",
          mint: mintPubkey.toBase58(),
          txSignature: txSig,
        };

        if (outputFormat === "json") {
          process.stdout.write(JSON.stringify(output, null, 2) + "\n");
        } else {
          logSuccess(`Authority transfer accepted. You are now the authority.`);
          process.stdout.write(formatOutput(output, outputFormat) + "\n");
        }
      } catch (err) {
        logError(`Failed to accept authority: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
