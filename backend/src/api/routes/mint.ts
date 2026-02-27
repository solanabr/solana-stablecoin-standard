import { Router } from "express";
import { body, validationResult } from "express-validator";
import { MintService } from "../services/mintService";
import { logger } from "../../shared/logger";

const router = Router();
const mintService = new MintService();

router.post(
  "/",
  [
    body("recipient")
      .isString()
      .matches(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
    body("amount").isString().matches(/^\d+$/),
    body("authority").optional().isString(),
  ],
  async (req: any, res: any, next: any) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: "Validation failed",
          details: errors.array(),
        });
      }

      const { recipient, amount, authority } = req.body;

      logger.info(`Mint request: ${amount} tokens to ${recipient}`);

      const result = await mintService.mint({
        recipient,
        amount,
        authority,
      });

      if (result.success) {
        return res.status(200).json({
          success: true,
          data: {
            signature: result.signature,
            recipient,
            amount,
          },
        });
      } else {
        return res.status(400).json({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

router.get("/queue", async (req, res) => {
  try {
    const queue = await mintService.getPendingMints();
    res.json({ success: true, data: queue });
  } catch (error) {
    res.status(500).json({ success: false, error: "Failed to get queue" });
  }
});

export { router as mintRouter };
