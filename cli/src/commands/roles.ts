import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { PublicKey } from "@solana/web3.js";
import { table } from "table";
import { SolanaStablecoin } from "solana-stablecoin-sdk";
import { getStablecoinContext } from "../lib/context";
import { failSpinner } from "../lib/output";

type RoleName = "burner" | "pauser" | "freezer" | "blacklister" | "seizer";

export function registerRoleCommands(program: Command): void {
  const rolesCmd = program
    .command("roles")
    .description("Manage operational roles (burner, pauser, freezer, blacklister, seizer)");

  rolesCmd
    .command("list")
    .description("List all current role assignments")
    .action(async (_opts, cmd) => {
      const { stable } = await getStablecoinContext(cmd);
      const roles = await stable.getRoles();
      console.log(table([
        ["master", roles.master.toBase58()],
        ["pauser", roles.pauser?.toBase58() || "(none)"],
        ["burner", roles.burner?.toBase58() || "(none)"],
        ["freezer", roles.freezer?.toBase58() || "(none)"],
        ["blacklister", roles.blacklister?.toBase58() || "(none)"],
        ["seizer", roles.seizer?.toBase58() || "(none)"],
      ]));
    });

  attachSingleRoleCommands(rolesCmd, "burner", (stable, address) => stable.setBurner(address), (stable) => stable.clearBurner());
  attachSingleRoleCommands(rolesCmd, "pauser", (stable, address) => stable.setPauser(address), (stable) => stable.clearPauser());
  attachSingleRoleCommands(rolesCmd, "freezer", (stable, address) => stable.setFreezer(address), (stable) => stable.clearFreezer());
  attachSingleRoleCommands(rolesCmd, "blacklister", (stable, address) => stable.setBlacklister(address), (stable) => stable.clearBlacklister());
  attachSingleRoleCommands(rolesCmd, "seizer", (stable, address) => stable.setSeizer(address), (stable) => stable.clearSeizer());
}

function attachSingleRoleCommands(
  parent: Command,
  name: RoleName,
  setRole: (stable: SolanaStablecoin, address: PublicKey) => Promise<string>,
  clearRole: (stable: SolanaStablecoin) => Promise<string>,
): void {
  const cmd = parent.command(name).description(`Manage ${name} role`);

  cmd
    .command("add <address>")
    .description(`Assign ${name} role`)
    .action(async (address, _opts, subCmd) => {
      const { stable } = await getStablecoinContext(subCmd);
      const spinner = ora(`Assigning ${name} role to ${address}...`).start();
      try {
        const sig = await setRole(stable, new PublicKey(address));
        spinner.succeed(chalk.green(`✓ ${name} assigned\n`) + `  Tx: ${chalk.cyan(sig)}`);
      } catch (error) {
        failSpinner(spinner, error);
      }
    });

  cmd
    .command("remove")
    .description(`Clear ${name} role`)
    .action(async (_opts, subCmd) => {
      const { stable } = await getStablecoinContext(subCmd);
      const spinner = ora(`Clearing ${name} role...`).start();
      try {
        const sig = await clearRole(stable);
        spinner.succeed(chalk.green(`✓ ${name} cleared\n`) + `  Tx: ${chalk.cyan(sig)}`);
      } catch (error) {
        failSpinner(spinner, error);
      }
    });

  cmd
    .command("list")
    .description(`Show current ${name} role assignment`)
    .action(async (_opts, subCmd) => {
      const { stable } = await getStablecoinContext(subCmd);
      const roles = await stable.getRoles();
      const value =
        name === "burner" ? roles.burner :
        name === "pauser" ? roles.pauser :
        name === "freezer" ? roles.freezer :
        name === "blacklister" ? roles.blacklister :
        roles.seizer;

      console.log(table([
        ["Role", name],
        ["Assigned To", value?.toBase58() || "(none)"],
      ]));
    });
}
