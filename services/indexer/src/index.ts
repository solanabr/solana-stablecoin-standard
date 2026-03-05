import express from 'express';

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

interface EventLog {
  id: number;
  timestamp: number;
  type: string;
  data: any;
}

const events: EventLog[] = [];

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'indexer' });
});

app.get('/events', (req, res) => {
  const { type, limit = '100', offset = '0' } = req.query;
  
  let filtered = events;
  if (type) {
    filtered = events.filter(e => e.type === type);
  }
  
  const limitNum = parseInt(limit as string);
  const offsetNum = parseInt(offset as string);
  
  res.json({
    events: filtered.slice(offsetNum, offsetNum + limitNum),
    total: filtered.length,
  });
});

function addEvent(type: string, data: any) {
  events.push({
    id: events.length + 1,
    timestamp: Date.now(),
    type,
    data,
  });
}

app.listen(PORT, () => {
  console.log(`Indexer service running on port ${PORT}`);
});
