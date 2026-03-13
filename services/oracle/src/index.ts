import express from "express";

const app = express();
const PORT = process.env.PORT || 3004;

app.get("/price/:feedId", async (req, res) => {
  try {
    const feedId = req.params.feedId;
    const url = `https://hermes.pyth.network/v2/price_feeds?ids[]=${feedId}`;
    const resp = await fetch(url);
    const data = await resp.json();
    res.json({ feedId, data });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`Oracle service on port ${PORT}`));
