import axios from "axios";

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const MAX_RETRIES = 3;

interface DecodedEvent {
  name: string;
  data: unknown;
}

export async function dispatch(event: DecodedEvent): Promise<void> {
  if (!WEBHOOK_URL) return;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await axios.post(WEBHOOK_URL, {
        event: event.name,
        data: event.data,
        timestamp: new Date().toISOString(),
      });
      return;
    } catch (err) {
      if (attempt === MAX_RETRIES - 1) {
        console.error(`Webhook delivery failed after ${MAX_RETRIES} attempts:`, err);
      } else {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
}
