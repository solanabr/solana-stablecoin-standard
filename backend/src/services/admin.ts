import { Router, Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getStablecoin } from "./provider";
import { isValidPublicKey, isValidAmount } from "../utils";

export const adminRouter = Router();

adminRouter.post("/transfer-admin", async (req: Request, res: Response) => {
  try {
    const { mint, newAdmin } = req.body;
    if (!mint || !newAdmin) {
      return res.status(400).json({ error: "Missing required fields: mint, newAdmin" });
    }
    if (!isValidPublicKey(mint)) {
      return res.status(400).json({ error: "Invalid public key: mint" });
    }
    if (!isValidPublicKey(newAdmin)) {
      return res.status(400).json({ error: "Invalid public key: newAdmin" });
    }
    const stablecoin = getStablecoin();
    const sig = await stablecoin.transferAdmin(
      new PublicKey(mint),
      new PublicKey(newAdmin)
    );
    res.json({ success: true, signature: sig });
  } catch (error: any) {
    console.error("transfer-admin error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.post("/accept-admin", async (req: Request, res: Response) => {
  try {
    const { mint } = req.body;
    if (!mint) {
      return res.status(400).json({ error: "Missing required field: mint" });
    }
    if (!isValidPublicKey(mint)) {
      return res.status(400).json({ error: "Invalid public key: mint" });
    }
    const stablecoin = getStablecoin();
    const sig = await stablecoin.acceptAdmin(new PublicKey(mint));
    res.json({ success: true, signature: sig });
  } catch (error: any) {
    console.error("accept-admin error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.post("/increment-allowance", async (req: Request, res: Response) => {
  try {
    const { mint, minter, amount } = req.body;
    if (!mint || !minter || !amount) {
      return res.status(400).json({ error: "Missing required fields: mint, minter, amount" });
    }
    if (!isValidPublicKey(mint)) {
      return res.status(400).json({ error: "Invalid public key: mint" });
    }
    if (!isValidPublicKey(minter)) {
      return res.status(400).json({ error: "Invalid public key: minter" });
    }
    if (!isValidAmount(amount)) {
      return res.status(400).json({ error: "Invalid amount: must be a positive integer string" });
    }
    const stablecoin = getStablecoin();
    const sig = await stablecoin.incrementAllowance(
      new PublicKey(mint),
      new PublicKey(minter),
      new BN(amount)
    );
    res.json({ success: true, signature: sig });
  } catch (error: any) {
    console.error("increment-allowance error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
