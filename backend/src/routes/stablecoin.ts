import { Router, Request, Response, NextFunction } from "express";
import { PublicKey, Keypair } from "@solana/web3.js";
import BN from "bn.js";
import {
  SSSClient,
  StablecoinPreset,
  getPresetAnchorEnum,
  PRESET_CONFIGS,
  SSS_TRANSFER_HOOK_PROGRAM_ID,
} from "../../../sdk/src";

/**
 * Creates the stablecoin router.
 * All POST endpoints return { signature, ...additionalData }.
 * All GET endpoints return the account data directly.
 */
export function createStablecoinRouter(client: SSSClient): Router {
  const router = Router();

  // -----------------------------------------------------------------------
  // GET endpoints
  // -----------------------------------------------------------------------

  /**
   * GET /api/stablecoin/:mint
   * Fetch config + roles for a mint.
   */
  router.get("/:mint", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const mint = new PublicKey(req.params.mint);
      const config = await client.fetchConfig(mint);
      const [configPda] = client.getConfigPda(mint);
      const roles = await client.fetchRoleRegistry(configPda);

      res.json({ config, roles });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /api/stablecoin/:mint/minter/:address
   * Fetch minter info for a specific address.
   */
  router.get(
    "/:mint/minter/:address",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const mint = new PublicKey(req.params.mint);
        const address = new PublicKey(req.params.address);
        const [configPda] = client.getConfigPda(mint);
        const minterInfo = await client.fetchMinterInfo(configPda, address);

        res.json(minterInfo);
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /api/stablecoin/:mint/blacklist/:address
   * Check blacklist status for an address.
   */
  router.get(
    "/:mint/blacklist/:address",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const mint = new PublicKey(req.params.mint);
        const address = new PublicKey(req.params.address);
        const [configPda] = client.getConfigPda(mint);
        const entry = await client.fetchBlacklistEntry(configPda, address);

        res.json({
          blacklisted: entry !== null,
          entry,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /api/stablecoin/:mint/attestation/:index
   * Fetch a reserve attestation by index.
   */
  router.get(
    "/:mint/attestation/:index",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const mint = new PublicKey(req.params.mint);
        const index = parseInt(req.params.index as string, 10);
        const [configPda] = client.getConfigPda(mint);
        const attestation = await client.fetchReserveAttestation(configPda, index);

        res.json(attestation);
      } catch (err) {
        next(err);
      }
    }
  );

  // -----------------------------------------------------------------------
  // POST endpoints
  // -----------------------------------------------------------------------

  /**
   * POST /api/stablecoin/initialize
   * Initialize a new stablecoin.
   * Body: { name, symbol, uri, decimals, preset }
   * preset is one of: "sss1", "sss2", "sss3", "custom"
   */
  router.post(
    "/initialize",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { name, symbol, uri, decimals, preset } = req.body;

        const presetEnum = preset as StablecoinPreset;
        const presetConfig = PRESET_CONFIGS[presetEnum];
        if (!presetConfig) {
          res.status(400).json({
            error: {
              code: -1,
              name: "InvalidPreset",
              message: `Invalid preset "${preset}". Must be one of: sss1, sss2, sss3, custom`,
            },
          });
          return;
        }

        const mintKeypair = Keypair.generate();

        const params = {
          name,
          symbol,
          uri,
          decimals: typeof decimals === "number" ? decimals : parseInt(decimals, 10),
          preset: getPresetAnchorEnum(presetEnum),
        };

        // For SSS-2 preset, pass the hook program ID
        const hookProgramId = presetConfig.enableTransferHook
          ? SSS_TRANSFER_HOOK_PROGRAM_ID
          : undefined;

        const { signature } = await client.initialize(params, mintKeypair, hookProgramId);

        // If SSS-2 or hook-enabled, also initialize the extra account meta list
        if (hookProgramId) {
          await client.initializeExtraAccountMetaList(mintKeypair.publicKey);
        }

        res.status(201).json({
          signature,
          mint: mintKeypair.publicKey.toBase58(),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/stablecoin/:mint/mint
   * Mint tokens.
   * Body: { amount, recipient }
   * `recipient` is the recipient's token account address.
   */
  router.post(
    "/:mint/mint",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const mint = new PublicKey(req.params.mint);
        const amount = new BN(req.body.amount);
        const recipient = new PublicKey(req.body.recipient);

        const { signature } = await client.mintTokens(mint, amount, recipient);

        res.json({ signature });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/stablecoin/:mint/burn
   * Burn tokens.
   * Body: { amount, tokenAccount }
   */
  router.post(
    "/:mint/burn",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const mint = new PublicKey(req.params.mint);
        const amount = new BN(req.body.amount);
        const tokenAccount = new PublicKey(req.body.tokenAccount);

        const { signature } = await client.burnTokens(mint, amount, tokenAccount);

        res.json({ signature });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/stablecoin/:mint/pause
   * Pause the stablecoin.
   */
  router.post(
    "/:mint/pause",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const mint = new PublicKey(req.params.mint);
        const { signature } = await client.pause(mint);

        res.json({ signature });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/stablecoin/:mint/unpause
   * Unpause the stablecoin.
   */
  router.post(
    "/:mint/unpause",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const mint = new PublicKey(req.params.mint);
        const { signature } = await client.unpause(mint);

        res.json({ signature });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/stablecoin/:mint/freeze
   * Freeze a token account.
   * Body: { tokenAccount }
   */
  router.post(
    "/:mint/freeze",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const mint = new PublicKey(req.params.mint);
        const tokenAccount = new PublicKey(req.body.tokenAccount);

        const { signature } = await client.freezeAccount(mint, tokenAccount);

        res.json({ signature });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/stablecoin/:mint/thaw
   * Thaw a token account.
   * Body: { tokenAccount }
   */
  router.post(
    "/:mint/thaw",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const mint = new PublicKey(req.params.mint);
        const tokenAccount = new PublicKey(req.body.tokenAccount);

        const { signature } = await client.thawAccount(mint, tokenAccount);

        res.json({ signature });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/stablecoin/:mint/blacklist/add
   * Add an address to the blacklist.
   * Body: { address, tokenAccount, reason }
   */
  router.post(
    "/:mint/blacklist/add",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const mint = new PublicKey(req.params.mint);
        const address = new PublicKey(req.body.address);
        const tokenAccount = new PublicKey(req.body.tokenAccount);
        const reason: string = req.body.reason || "";

        const { signature } = await client.blacklistAdd(
          mint,
          address,
          tokenAccount,
          { reason }
        );

        res.json({ signature });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/stablecoin/:mint/blacklist/remove
   * Remove an address from the blacklist.
   * Body: { address, tokenAccount }
   */
  router.post(
    "/:mint/blacklist/remove",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const mint = new PublicKey(req.params.mint);
        const address = new PublicKey(req.body.address);
        const tokenAccount = new PublicKey(req.body.tokenAccount);

        const { signature } = await client.blacklistRemove(
          mint,
          address,
          tokenAccount
        );

        res.json({ signature });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/stablecoin/:mint/seize
   * Seize tokens from a blacklisted address.
   * Body: { blacklistedAddress, from, to, amount }
   */
  router.post(
    "/:mint/seize",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const mint = new PublicKey(req.params.mint);
        const blacklistedAddress = new PublicKey(req.body.blacklistedAddress);
        const from = new PublicKey(req.body.from);
        const to = new PublicKey(req.body.to);
        const amount = new BN(req.body.amount);

        const { signature } = await client.seize(
          mint,
          blacklistedAddress,
          from,
          to,
          amount
        );

        res.json({ signature });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/stablecoin/:mint/roles
   * Update roles.
   * Body: { role, newHolder }
   * role is one of: "masterAuthority", "pauser", "blacklister", "seizer"
   */
  router.post(
    "/:mint/roles",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const mint = new PublicKey(req.params.mint);
        const roleKey = req.body.role as string;
        const newHolder = new PublicKey(req.body.newHolder);

        const roleEnum: { [key: string]: {} } = { [roleKey]: {} };

        const { signature } = await client.updateRoles(mint, {
          role: roleEnum,
          newHolder,
        });

        res.json({ signature });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/stablecoin/:mint/minter
   * Update minter configuration.
   * Body: { wallet, isActive, quota }
   */
  router.post(
    "/:mint/minter",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const mint = new PublicKey(req.params.mint);
        const minterWallet = new PublicKey(req.body.wallet);
        const isActive: boolean = req.body.isActive;
        const mintQuota = new BN(req.body.quota);

        const { signature } = await client.updateMinter(mint, minterWallet, {
          isActive,
          mintQuota,
        });

        res.json({ signature });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /api/stablecoin/:mint/attest
   * Attest reserves.
   * Body: { reserveHash, totalReservesUsd, totalOutstanding, attestationUri }
   * reserveHash is a 32-element number array.
   */
  router.post(
    "/:mint/attest",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const mint = new PublicKey(req.params.mint);
        const reserveHash: number[] = req.body.reserveHash;
        const totalReservesUsd = new BN(req.body.totalReservesUsd);
        const totalOutstanding = new BN(req.body.totalOutstanding);
        const attestationUri: string = req.body.attestationUri;

        const { signature } = await client.attestReserve(mint, {
          reserveHash,
          totalReservesUsd,
          totalOutstanding,
          attestationUri,
        });

        res.json({ signature });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
