import { Router, Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getStablecoin } from "./provider";
import { isValidPublicKey, isValidAmount, circulatingSupply } from "../utils";

export const mintBurnRouter = Router();

mintBurnRouter.post("/mint", async (req: Request, res: Response) => {
  try {
    const { mint, to, amount } = req.body;
    if (!mint || !to || !amount) {
      return res
        .status(400)
        .json({ error: "Missing required fields: mint, to, amount" });
    }
    if (!isValidPublicKey(mint)) {
      return res.status(400).json({ error: "Invalid public key: mint" });
    }
    if (!isValidPublicKey(to)) {
      return res.status(400).json({ error: "Invalid public key: to" });
    }
    if (!isValidAmount(amount)) {
      return res.status(400).json({ error: "Invalid amount: must be a positive integer string" });
    }
    const stablecoin = getStablecoin();
    const sig = await stablecoin.mintTo({
      mint: new PublicKey(mint),
      to: new PublicKey(to),
      amount: new BN(amount),
    });
    res.json({ success: true, signature: sig });
  } catch (error: any) {
    console.error("mint error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

mintBurnRouter.post("/burn", async (req: Request, res: Response) => {
  try {
    const { mint, from, amount } = req.body;
    if (!mint || !from || !amount) {
      return res
        .status(400)
        .json({ error: "Missing required fields: mint, from, amount" });
    }
    if (!isValidPublicKey(mint)) {
      return res.status(400).json({ error: "Invalid public key: mint" });
    }
    if (!isValidPublicKey(from)) {
      return res.status(400).json({ error: "Invalid public key: from" });
    }
    if (!isValidAmount(amount)) {
      return res.status(400).json({ error: "Invalid amount: must be a positive integer string" });
    }
    const stablecoin = getStablecoin();
    const sig = await stablecoin.burnFrom({
      mint: new PublicKey(mint),
      from: new PublicKey(from),
      amount: new BN(amount),
    });
    res.json({ success: true, signature: sig });
  } catch (error: any) {
    console.error("burn error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

mintBurnRouter.get("/supply/:mint", async (req: Request, res: Response) => {
  try {
    if (!isValidPublicKey(req.params.mint)) {
      return res.status(400).json({ error: "Invalid public key: mint" });
    }
    const stablecoin = getStablecoin();
    const info = await stablecoin.getStablecoinInfo(
      new PublicKey(req.params.mint)
    );
    res.json({
      mint: req.params.mint,
      totalMinted: info.totalMinted.toString(),
      totalBurned: info.totalBurned.toString(),
      circulatingSupply: circulatingSupply(info.totalMinted, info.totalBurned).toString(),
    });
  } catch (error: any) {
    console.error("supply error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
