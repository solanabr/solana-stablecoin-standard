import { Router, Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getStablecoin } from "./provider";
import { isValidPublicKey, isValidAmount } from "../utils";

export const complianceRouter = Router();

complianceRouter.post("/blacklist", async (req: Request, res: Response) => {
  try {
    const { mint, wallet } = req.body;
    if (!mint || !wallet) {
      return res.status(400).json({ error: "Missing required fields: mint, wallet" });
    }
    if (!isValidPublicKey(mint)) {
      return res.status(400).json({ error: "Invalid public key: mint" });
    }
    if (!isValidPublicKey(wallet)) {
      return res.status(400).json({ error: "Invalid public key: wallet" });
    }
    const stablecoin = getStablecoin();
    const sig = await stablecoin.blacklist({
      mint: new PublicKey(mint),
      wallet: new PublicKey(wallet),
    });
    res.json({ success: true, signature: sig });
  } catch (error: any) {
    console.error("blacklist error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

complianceRouter.post("/unblacklist", async (req: Request, res: Response) => {
  try {
    const { mint, wallet } = req.body;
    if (!mint || !wallet) {
      return res.status(400).json({ error: "Missing required fields: mint, wallet" });
    }
    if (!isValidPublicKey(mint)) {
      return res.status(400).json({ error: "Invalid public key: mint" });
    }
    if (!isValidPublicKey(wallet)) {
      return res.status(400).json({ error: "Invalid public key: wallet" });
    }
    const stablecoin = getStablecoin();
    const sig = await stablecoin.unblacklist({
      mint: new PublicKey(mint),
      wallet: new PublicKey(wallet),
    });
    res.json({ success: true, signature: sig });
  } catch (error: any) {
    console.error("unblacklist error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

complianceRouter.post("/seize", async (req: Request, res: Response) => {
  try {
    const { mint, from, treasuryAta, amount } = req.body;
    if (!mint || !from || !treasuryAta || !amount) {
      return res.status(400).json({ error: "Missing required fields: mint, from, treasuryAta, amount" });
    }
    if (!isValidPublicKey(mint)) {
      return res.status(400).json({ error: "Invalid public key: mint" });
    }
    if (!isValidPublicKey(from)) {
      return res.status(400).json({ error: "Invalid public key: from" });
    }
    if (!isValidPublicKey(treasuryAta)) {
      return res.status(400).json({ error: "Invalid public key: treasuryAta" });
    }
    if (!isValidAmount(amount)) {
      return res.status(400).json({ error: "Invalid amount: must be a positive integer string" });
    }
    const stablecoin = getStablecoin();
    const sig = await stablecoin.seize({
      mint: new PublicKey(mint),
      from: new PublicKey(from),
      treasuryAta: new PublicKey(treasuryAta),
      amount: new BN(amount),
    });
    res.json({ success: true, signature: sig });
  } catch (error: any) {
    console.error("seize error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

complianceRouter.post("/freeze", async (req: Request, res: Response) => {
  try {
    const { mint, account } = req.body;
    if (!mint || !account) {
      return res.status(400).json({ error: "Missing required fields: mint, account" });
    }
    if (!isValidPublicKey(mint)) {
      return res.status(400).json({ error: "Invalid public key: mint" });
    }
    if (!isValidPublicKey(account)) {
      return res.status(400).json({ error: "Invalid public key: account" });
    }
    const stablecoin = getStablecoin();
    const sig = await stablecoin.freezeAccount(
      new PublicKey(mint),
      new PublicKey(account)
    );
    res.json({ success: true, signature: sig });
  } catch (error: any) {
    console.error("freeze error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

complianceRouter.post("/thaw", async (req: Request, res: Response) => {
  try {
    const { mint, account } = req.body;
    if (!mint || !account) {
      return res.status(400).json({ error: "Missing required fields: mint, account" });
    }
    if (!isValidPublicKey(mint)) {
      return res.status(400).json({ error: "Invalid public key: mint" });
    }
    if (!isValidPublicKey(account)) {
      return res.status(400).json({ error: "Invalid public key: account" });
    }
    const stablecoin = getStablecoin();
    const sig = await stablecoin.thawAccount(
      new PublicKey(mint),
      new PublicKey(account)
    );
    res.json({ success: true, signature: sig });
  } catch (error: any) {
    console.error("thaw error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

complianceRouter.get("/status/:mint/:wallet", async (req: Request, res: Response) => {
  try {
    const { mint, wallet } = req.params;
    if (!isValidPublicKey(mint)) {
      return res.status(400).json({ error: "Invalid public key: mint" });
    }
    if (!isValidPublicKey(wallet)) {
      return res.status(400).json({ error: "Invalid public key: wallet" });
    }
    const stablecoin = getStablecoin();
    const info = await stablecoin.getStablecoinInfo(new PublicKey(mint));
    const isBlacklisted = await stablecoin.isBlacklisted(
      new PublicKey(mint),
      new PublicKey(wallet)
    );
    res.json({
      mint,
      wallet,
      paused: info.paused,
      blacklisted: isBlacklisted,
      transferHookProgram: info.transferHookProgram?.toBase58() ?? null,
    });
  } catch (error: any) {
    console.error("compliance status error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
