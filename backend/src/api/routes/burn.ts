import { Router } from "express";
import { body, validationResult } from "express-validator";
import { BurnService } from "../services/burnService";
import { logger } from "../../shared/logger";

const router = Router();
const burnService = new BurnService();

router.post(
  "/",
  [
    body("amount").isString().matches(/^\d+$/),
    body("authority").optional().isString(),
    body("account").optional().isString(),
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

      const { amount, authority, account } = req.body;

      logger.info(`Burn request: ${amount} tokens`);

      const result = await burnService.burn({
        amount,
        authority,
        account,
      });

      if (result.success) {
        return res.status(200).json({
          success: true,
          data: {
            signature: result.signature,
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

export { router as burnRouter };
