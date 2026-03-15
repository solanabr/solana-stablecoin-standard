import { loadStablecoin, success, fail } from "./utils";

export async function pauseCommand(opts: any): Promise<void> {
  try {
    const stable = await loadStablecoin(opts);

    if (opts.unpause) {
      const sig = await stable.unpause();
      success("Stablecoin unpaused", sig);
    } else {
      const sig = await stable.pause();
      success("Stablecoin paused", sig);
    }
  } catch (err) {
    fail(`Failed to ${opts.unpause ? "unpause" : "pause"}`, err);
  }
}
