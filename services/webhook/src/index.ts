import express from 'express';

const app = express();
const PORT = process.env.PORT || 3004;

app.use(express.json());

interface Webhook {
  id: string;
  url: string;
  eventTypes: string[];
  createdAt: number;
}

interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: any;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
}

const webhooks = new Map<string, Webhook>();
const deliveries = new Map<string, WebhookDelivery>();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'webhook' });
});

app.post('/webhooks', (req, res) => {
  const { url, eventTypes } = req.body;
  const id = Math.random().toString(36).substring(7);
  
  webhooks.set(id, {
    id,
    url,
    eventTypes,
    createdAt: Date.now(),
  });
  
  res.json({ id, success: true });
});

app.delete('/webhooks/:id', (req, res) => {
  const { id } = req.params;
  webhooks.delete(id);
  res.json({ success: true });
});

app.get('/webhooks', (req, res) => {
  res.json({ webhooks: Array.from(webhooks.values()) });
});

async function sendWebhook(webhook: Webhook, event: any) {
  const deliveryId = Math.random().toString(36).substring(7);
  
  deliveries.set(deliveryId, {
    id: deliveryId,
    webhookId: webhook.id,
    event,
    status: 'pending',
    attempts: 0,
  });
  
  // Simple retry logic (would use exponential backoff in production)
  for (let i = 0; i < 3; i++) {
    try {
      console.log(`Sending webhook to ${webhook.url}`, event);
      const delivery = deliveries.get(deliveryId)!;
      delivery.status = 'delivered';
      delivery.attempts = i + 1;
      return;
    } catch (error) {
      console.log(`Retry ${i + 1} failed`);
    }
  }
  
  const delivery = deliveries.get(deliveryId)!;
  delivery.status = 'failed';
  delivery.attempts = 3;
}

app.listen(PORT, () => {
  console.log(`Webhook service running on port ${PORT}`);
});
