import express from 'express';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

interface MintRequest {
  recipient: string;
  amount: number;
  minter: string;
}

interface BurnRequest {
  amount: number;
  burner: string;
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mint-burn' });
});

app.post('/mint', async (req, res) => {
  try {
    const { recipient, amount, minter } = req.body as MintRequest;
    console.log(`Minting ${amount} to ${recipient}`);
    res.json({ success: true, tx: 'mock-tx-signature' });
  } catch (error) {
    res.status(500).json({ error: 'Mint failed' });
  }
});

app.post('/burn', async (req, res) => {
  try {
    const { amount, burner } = req.body as BurnRequest;
    console.log(`Burning ${amount}`);
    res.json({ success: true, tx: 'mock-tx-signature' });
  } catch (error) {
    res.status(500).json({ error: 'Burn failed' });
  }
});

app.get('/supply', async (req, res) => {
  res.json({ totalSupply: 0, totalMinted: 0, totalBurned: 0 });
});

app.listen(PORT, () => {
  console.log(`Mint/Burn service running on port ${PORT}`);
});
