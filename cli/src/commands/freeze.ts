import { PublicKey } from "@solana/web3.js";
import { loadStablecoin, success, fail } from "./utils";

export async function freezeCommand(opts: any): Promise<void> {
  try {
    const stable = await loadStablecoin(opts);
    const tokenAccount = new PublicKey(opts.account);

    if (opts.thaw) {
      const sig = await stable.tokens.thawAccount(tokenAccount);
      success(`Thawed account ${opts.account}`, sig);
    } else {
      const sig = await stable.tokens.freezeAccount(tokenAccount);
      success(`Froze account ${opts.account}`, sig);
    }
  } catch (err) {
    fail(`Failed to ${opts.thaw ? "thaw" : "freeze"} account`, err);
  }
}
