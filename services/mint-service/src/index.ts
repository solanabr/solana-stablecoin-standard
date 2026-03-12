import express from "express";
import { logger } from "./logger";
import { mintRouter } from "./routes/mint";
import { burnRouter } from "./routes/burn";
import { healthRouter } from "./routes/health";

const app = express();
app.use(express.json());

app.use("/health", healthRouter);
app.use("/api/mint", mintRouter);
app.use("/api/burn", burnRouter);

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error("Unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Internal server error" });
});

const PORT = parseInt(process.env.PORT ?? "3001", 10);
app.listen(PORT, () => {
  logger.info("Mint service started", { port: PORT });
});

export default app;
