import express from 'express';

const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());

interface BlacklistEntry {
  address: string;
  reason: string;
  blacklistedAt: number;
  blacklistedBy: string;
}

const blacklist = new Map<string, BlacklistEntry>();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'compliance' });
});

app.post('/blacklist/add', async (req, res) => {
  try {
    const { address, reason, blacklister } = req.body;
    blacklist.set(address, {
      address,
      reason,
      blacklistedAt: Date.now(),
      blacklistedBy: blacklister,
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add to blacklist' });
  }
});

app.post('/blacklist/remove', async (req, res) => {
  try {
    const { address } = req.body;
    blacklist.delete(address);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove from blacklist' });
  }
});

app.get('/blacklist/check/:address', (req, res) => {
  const { address } = req.params;
  const entry = blacklist.get(address);
  res.json({ blacklisted: !!entry, entry: entry || null });
});

app.get('/audit-trail', (req, res) => {
  const { from, to, address } = req.query;
  res.json({ entries: [] });
});

app.listen(PORT, () => {
  console.log(`Compliance service running on port ${PORT}`);
});
