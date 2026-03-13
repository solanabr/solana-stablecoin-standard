# API

## Mint Service

- `POST /mint/request`
- `POST /mint/execute/:requestId`
- `GET /mint/status/:requestId`
- `GET /mint/history`
- `GET /health`

Default port: `3001`

## Event Indexer

- `GET /events`
- `POST /webhooks/subscribe`
- `GET /registry`
- `POST /registry` (`400 InvalidRegistryEntry` when required registry fields are missing or malformed)

Default port: `3002`

## Compliance Service

- `GET /blacklist`
- `POST /blacklist`
- `DELETE /blacklist/:address`
- `GET /audit-log`
- `POST /sanctions-screen`

Default port: `3003`

## Webhook Service

- `POST /webhooks/subscribe`
- `GET /webhooks`
- `DELETE /webhooks/:id`

Default port: `3004`

## Docker Compose

Run all four services from the repository root with:

```bash
docker compose up --build
```

## Auth And Limits

All endpoints except `GET /health` require one of:

- `x-api-key: <SERVICE_API_KEY>`
- `Authorization: Bearer <SERVICE_API_KEY>`

Default service protections:

- body limit: `65536` bytes
- rate limit: `120` authenticated requests per minute per client/IP key pair
