import { PublicKey } from "@solana/web3.js";
import { loadStablecoin, success, fail } from "./utils";

export async function burnCommand(opts: any): Promise<void> {
  try {
    const stable = await loadStablecoin(opts);
    const source = new PublicKey(opts.from);
    const amount = BigInt(opts.amount);

    const sig = await stable.burn(source, amount);
    success(`Burned ${opts.amount} tokens from ${opts.from}`, sig);
  } catch (err) {
    fail("Failed to burn tokens", err);
  }
}
