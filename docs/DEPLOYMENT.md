# Deployment Guide

This guide covers production-style deployment for:

- Frontend Admin (Vercel)
- Backend services (Docker Compose)
- RPC configuration recommendations

---

## Frontend on Vercel

### 1) Deploy from CLI

```bash
cd frontend
npm i -g vercel
vercel
```

Use:
- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`

Deploy production:

```bash
vercel --prod
```

### 2) Deploy from Vercel Dashboard

1. Import GitHub repository.
2. Set root directory to `frontend`.
3. Build command: `npm run build`.
4. Output: `dist`.
5. Deploy.

### 3) Optional frontend env vars

- `VITE_DEFAULT_NETWORK` (example: `devnet`)
- `VITE_DEFAULT_RPC_URL` (example: Helius devnet URL)

Users can still override RPC in the app via network/RPC selector.

### 4) Frontend post-deploy checks

- Wallet connect works
- Dashboard mint load works
- Background refresh updates without blocking spinner after first load
- Freeze/Thaw page is reachable and functional
- Compliance page only shows SSS-2 actions

---

## Backend Services via Docker Compose

From repository root:

```bash
cp .env.example .env
# edit .env (RPC_URL, SSS_MINT, KEYPAIR_PATH, API keys)
docker compose up -d
```

Health checks:

```bash
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
curl http://localhost:3004/health
```

---

## RPC Recommendations

- Use dedicated paid RPC for production.
- Keep WS endpoint stable for indexer/webhook flow.
- For devnet validation, Helius endpoint format:

```bash
https://devnet.helius-rpc.com/?api-key=<HELIUS_API_KEY>
```

---

## Devnet Deployment Notes

The repository includes deployed program IDs in README and proof signatures in [PROOF.md](./PROOF.md).
