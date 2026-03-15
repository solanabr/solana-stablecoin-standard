import { PublicKey } from "@solana/web3.js";
import { loadStablecoin, success, fail } from "./utils";

export async function mintCommand(opts: any): Promise<void> {
  try {
    const stable = await loadStablecoin(opts);
    const destination = new PublicKey(opts.to);
    const amount = BigInt(opts.amount);

    const sig = await stable.mintTo(destination, amount);
    success(`Minted ${opts.amount} tokens to ${opts.to}`, sig);
  } catch (err) {
    fail("Failed to mint tokens", err);
  }
}
