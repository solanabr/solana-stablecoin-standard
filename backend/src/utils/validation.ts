import { z } from "zod";
import { PublicKey } from "@solana/web3.js";

export const publicKeySchema = z.string().refine(
  (val) => {
    try {
      new PublicKey(val);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid Solana public key" },
);
