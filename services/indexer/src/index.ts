import express from "express";
import { startListener } from "./listener";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3000", 10);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "sss-indexer" });
});

app.get("/events", (_req, res) => {
  // Return recent events from the local DB
  res.json({ events: [] });
});

app.listen(PORT, () => {
  console.log(`SSS Indexer listening on port ${PORT}`);
  startListener().catch(console.error);
});
