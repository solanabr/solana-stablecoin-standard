import { spawn } from "child_process";
import { Connection } from "@solana/web3.js";
import { parseArgs, loadRuntimeContext } from "./config";
import { shortPk, toBigIntValue } from "./format";
import { EventStream } from "./event-stream";
import { SdkService } from "./sdk-service";
import { LogLink, OperationId, OperationItem } from "./types";
import { DashboardUi } from "./ui";

async function withSpinner<T>(label: string, task: () => Promise<T>): Promise<T> {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frame = 0;

  process.stdout.write(`${frames[frame]} ${label}`);
  const timer = setInterval(() => {
    frame = (frame + 1) % frames.length;
    process.stdout.write(`\r${frames[frame]} ${label}`);
  }, 90);

  try {
    const result = await task();
    clearInterval(timer);
    process.stdout.write(`\r✔ ${label}\n`);
    return result;
  } catch (error) {
    clearInterval(timer);
    process.stdout.write(`\r✖ ${label}\n`);
    throw error;
  }
}

function clusterQuery(cluster: string): string {
  if (cluster === "mainnet") return "";
  if (cluster === "devnet") return "?cluster=devnet";
  if (cluster === "localnet") return "?cluster=custom";
  return "?cluster=devnet"; // default to devnet for unknown cluster
}

function txUrl(signature: string, cluster: string): string {
  return `https://explorer.solana.com/tx/${signature}${clusterQuery(cluster)}`;
}

function addressUrl(address: string, cluster: string): string {
  return `https://explorer.solana.com/address/${address}${clusterQuery(cluster)}`;
}

function openUrl(url: string): void {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
}

function describeRoles(caps: Awaited<ReturnType<SdkService["detectCapabilities"]>>): string {
  const roles = [
    caps.roles.isMaster ? "master" : null,
    caps.roles.isMinter ? "minter" : null,
    caps.roles.isBurner ? "burner" : null,
    caps.roles.isPauser ? "pauser" : null,
    caps.roles.isFreezer ? "freezer" : null,
    caps.roles.isBlacklister ? "blacklister" : null,
    caps.roles.isSeizer ? "seizer" : null,
  ].filter(Boolean);
  return roles.length > 0 ? roles.join(", ") : "none";
}

export async function runApp(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const runtime = loadRuntimeContext(config);
  const connection = new Connection(config.rpcUrl, "confirmed");
  const sdk = new SdkService(connection, config.mint, runtime.wallet);

  const preload = await withSpinner("Loading data and validating roles...", async () => {
    await sdk.init();
    const capabilities = await sdk.detectCapabilities();
    const [stats, holders] = await Promise.all([sdk.fetchStats(), sdk.fetchTopHolders(8)]);
    return { capabilities, stats, holders };
  });

  const ui = new DashboardUi(
    config.cluster,
    config.mint,
    runtime.wallet ? shortPk(runtime.wallet.publicKey.toBase58()) : "read-only",
  );

  ui.setOperations(preload.capabilities.operations);
  ui.updateStats(preload.stats);
  ui.updateHolders(preload.holders);

  let latestPaused = preload.stats.paused;
  let refreshInFlight = false;
  let refreshTimer: NodeJS.Timeout | null = null;

  const scheduleRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      await refresh("interval");
      scheduleRefresh();
    }, config.refreshMs);
  };

  const refresh = async (reason: string): Promise<void> => {
    if (refreshInFlight) return;
    refreshInFlight = true;
    try {
      const [stats, holders] = await Promise.all([sdk.fetchStats(), sdk.fetchTopHolders(8)]);
      latestPaused = stats.paused;
      ui.updateStats(stats);
      ui.updateHolders(holders);

      const caps = await sdk.detectCapabilities();
      ui.setOperations(caps.operations);

      if (reason !== "event") ui.pushLog(`Refreshed (${reason})`, "success");
    } catch (error) {
      ui.pushLog((error as Error).message, "error");
    } finally {
      refreshInFlight = false;
    }
  };

  const eventStream = config.mint
    ? new EventStream(
        connection,
        config.mint,
        (evt) => {
          const link: LogLink = {
            signatureUrl: txUrl(evt.signature, config.cluster),
            addressUrl: evt.primaryAddress ? addressUrl(evt.primaryAddress, config.cluster) : undefined,
          };
          ui.pushLog(`${evt.name}: ${evt.summary} • ${shortPk(evt.signature, 5)}`, "event", link);
          void refresh("event");
        },
        (error) => ui.pushLog(`Event parser error: ${error.message}`, "error"),
      )
    : null;

  ui.onQuit(async () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    if (eventStream) await eventStream.stop();
    process.exit(0);
  });

  ui.onRefresh(() => {
    if (refreshTimer) clearTimeout(refreshTimer);
    void refresh("manual").then(() => {
      ui.pushLog(`Auto-refresh reset to ${config.refreshMs / 1000}s`, "info");
      scheduleRefresh();
    });
  });

  ui.onOpenLogLink((link) => {
    const target = link.signatureUrl ?? link.addressUrl;
    if (!target) return;
    openUrl(target);
    ui.pushLog(`Opened ${target}`, "info");
  });

  ui.onOperation((item: OperationItem) => {
    void handleOperation(item);
  });

  async function handleOperation(item: OperationItem): Promise<void> {
    if (!item.enabled) {
      ui.pushLog(`${item.label} disabled: ${item.reason ?? "not authorized"}`, "warn");
      return;
    }

    if (item.id === OperationId.Refresh) {
      await refresh("operation");
      return;
    }

    try {
      let sig = "";
      switch (item.id) {
        case OperationId.Mint: {
          const recipient = await ui.prompt("Recipient wallet address");
          if (!recipient) return;
          const amount = await ui.prompt("Mint amount (base units)");
          if (!amount) return;
          sig = await sdk.mint(recipient, toBigIntValue(amount));
          break;
        }
        case OperationId.Burn: {
          const defaultFrom = runtime.wallet?.publicKey.toBase58();
          const from = await ui.prompt(`Wallet to burn from${defaultFrom ? ` [default: ${shortPk(defaultFrom)}]` : ""}`);
          const resolved = from && from.trim().length > 0 ? from : defaultFrom;
          if (!resolved) return;
          const amount = await ui.prompt("Burn amount (base units)");
          if (!amount) return;
          sig = await sdk.burn(resolved, toBigIntValue(amount));
          break;
        }
        case OperationId.Transfer: {
          const to = await ui.prompt("Recipient wallet address");
          if (!to) return;
          const amount = await ui.prompt("Transfer amount (base units)");
          if (!amount) return;
          sig = await sdk.transfer(to, toBigIntValue(amount));
          break;
        }
        case OperationId.PauseToggle:
          sig = await sdk.togglePause(latestPaused);
          break;
        case OperationId.AddMinter: {
          const minter = await ui.prompt("Minter wallet address");
          if (!minter) return;
          const quota = await ui.prompt("Quota (base units, 0 for unlimited)");
          if (!quota) return;
          sig = await sdk.addMinter(minter, toBigIntValue(quota));
          break;
        }
        case OperationId.RemoveMinter: {
          const minter = await ui.prompt("Minter wallet address to remove");
          if (!minter) return;
          sig = await sdk.removeMinter(minter);
          break;
        }
        case OperationId.Freeze: {
          const account = await ui.prompt("Wallet to freeze");
          if (!account) return;
          sig = await sdk.freeze(account);
          break;
        }
        case OperationId.Thaw: {
          const account = await ui.prompt("Wallet to thaw");
          if (!account) return;
          sig = await sdk.thaw(account);
          break;
        }
        case OperationId.BlacklistAdd: {
          const address = await ui.prompt("Address to blacklist");
          if (!address) return;
          const reason = await ui.prompt("Reason");
          if (!reason) return;
          sig = await sdk.blacklistAdd(address, reason);
          break;
        }
        case OperationId.BlacklistRemove: {
          const address = await ui.prompt("Address to unblacklist");
          if (!address) return;
          const reason = await ui.prompt("Reason");
          if (!reason) return;
          sig = await sdk.blacklistRemove(address, reason);
          break;
        }
        case OperationId.Seize: {
          const target = await ui.prompt("Blacklisted wallet to seize from");
          if (!target) return;
          const treasury = await ui.prompt("Treasury wallet to receive seized funds");
          if (!treasury) return;
          sig = await sdk.seize(target, treasury);
          break;
        }
      }

      if (sig) {
        ui.pushLog(`${item.label} submitted: ${shortPk(sig, 8)}`, "success", {
          signatureUrl: txUrl(sig, config.cluster),
        });
        await refresh("post-tx");
      }
    } catch (error) {
      ui.pushLog(`${item.label} failed: ${(error as Error).message}`, "error");
    }
  }

  ui.pushLog("SSS Admin TUI ready", "success");
  ui.pushLog(`RPC ${config.rpcUrl}`, "info");
  ui.pushLog(`Mint ${sdk.getMintAddress() ?? "(none)"}`, "info");
  ui.pushLog(`Preset ${preload.capabilities.preset}`, "info");
  ui.pushLog(`Detected roles: ${describeRoles(preload.capabilities)}`, "info");
  ui.pushLog(`Auto-refresh every ${config.refreshMs / 1000}s`, "info");
  ui.pushLog(runtime.wallet ? `Wallet ${runtime.wallet.publicKey.toBase58()}` : "Read-only mode", "warn");

  if (eventStream) {
    eventStream.start();
    ui.pushLog("Subscribed to sss_token program events", "success");
  } else {
    ui.pushLog("No --mint provided, real-time event filter disabled", "warn");
  }

  ui.focusMenu();
  ui.render();
  scheduleRefresh();
}
