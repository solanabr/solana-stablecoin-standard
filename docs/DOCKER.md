# Solana Stablecoin Standard - Development Environment

Docker setup para desenvolvimento e teste local.

---

## 🐳 Docker Compose Setup

### Arquivo: `docker-compose.yml`

```yaml
version: '3.8'

services:
  # Solana Validator (localnet)
  validator:
    image: solanalabs/solana:v2.1.0
    ports:
      - "8899:8899"   # RPC
      - "8900:8900"   # TPU
      - "9900:9900"   # Gossip
    environment:
      - SOLANA_RUN=true
    command:
      - "solana-test-validator"
      - "--reset"
      - "--bpf-program"
      - "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
      - "/usr/lib/solana/deployments/spl_token_2022.so"
      - "--bpf-program"
      - "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
      - "/usr/lib/solana/deployments/spl_associated_token_account.so"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8899/health"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Anchor Build & Test
  anchor:
    build:
      context: .
      dockerfile: Dockerfile.anchor
    volumes:
      - .:/workspace
      - anchor-cache:/root/.cache
    environment:
      - ANCHOR_PROVIDER_URL=http://validator:8899
      - ANCHOR_WALLET=/workspace/.wallet/id.json
    depends_on:
      validator:
        condition: service_healthy
    command: ["tail", "-f", "/dev/null"]

  # SDK Development (TypeScript)
  sdk:
    image: node:20-alpine
    working_dir: /workspace/sdk
    volumes:
      - ./sdk:/workspace/sdk
    ports:
      - "3000:3000"
    command: ["npm", "run", "dev"]

volumes:
  anchor-cache:
```

---

### Arquivo: `Dockerfile.anchor`

```dockerfile
FROM rust:1.75-bookworm

# Install Solana CLI
RUN sh -c "$(curl -sSfL https://release.anza.xyz/v2.1.0/install)"
ENV PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

# Install Anchor CLI
RUN cargo install --git https://github.com/coral-xyz/anchor avm --force
RUN avm install 0.30.1
RUN avm use 0.30.1
ENV PATH="/root/.avm/bin:${PATH}"

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
RUN apt-get install -y nodejs

# Install build dependencies
RUN apt-get install -y \
    pkg-config \
    build-essential \
    libudev-dev \
    libssl-dev

WORKDIR /workspace

CMD ["tail", "-f", "/dev/null"]
```

---

## 🚀 Quick Start

### 1. Start Environment

```bash
docker compose up -d
```

### 2. Enter Anchor Container

```bash
docker compose exec anchor bash
```

### 3. Build Programs

```bash
anchor build
```

### 4. Run Tests

```bash
anchor test
```

### 5. Deploy to Localnet

```bash
anchor deploy
```

---

## 🧪 Testing Commands

### Run All Tests

```bash
docker compose exec anchor anchor test
```

### Run SSS-1 Tests Only

```bash
docker compose exec anchor anchor test -- --grep "SSS-1"
```

### Run SSS-2 Tests Only

```bash
docker compose exec anchor anchor test -- --grep "SSS-2"
```

### Run with Coverage

```bash
docker compose exec anchor cargo-anchor test --coverage
```

---

## 📊 Monitoring

### Check Validator Logs

```bash
docker compose logs -f validator
```

### Check RPC Status

```bash
curl http://localhost:8899/health
```

### Get Balance

```bash
solana balance --url http://localhost:8899
```

---

## 🛠️ Development Workflow

### 1. Make Changes

Edit files in your local workspace (mounted in container).

### 2. Rebuild

```bash
docker compose exec anchor anchor build
```

### 3. Test

```bash
docker compose exec anchor anchor test
```

### 4. Deploy

```bash
docker compose exec anchor anchor deploy
```

---

## 🔧 Troubleshooting

### "Container won't start"

```bash
# Check logs
docker compose logs anchor

# Rebuild
docker compose build --no-cache
```

### "Tests fail on first run"

```bash
# Reset validator
docker compose down -v
docker compose up -d

# Wait for healthcheck
sleep 10

# Run tests again
docker compose exec anchor anchor test
```

### "Out of disk space"

```bash
# Clean Docker
docker system prune -a

# Clean anchor cache
docker compose exec anchor rm -rf /root/.cache
```

---

## 📦 Production Deployment

### Build for Production

```bash
# Build optimized
docker compose exec anchor anchor build -- --features production
```

### Deploy to Devnet

```bash
docker compose exec anchor anchor deploy --provider.cluster devnet
```

### Deploy to Mainnet

```bash
# ⚠️ AUDIT FIRST!
docker compose exec anchor anchor deploy --provider.cluster mainnet
```

---

## 📝 Notes

- **Localnet RPC:** `http://localhost:8899`
- **Localnet WS:** `ws://localhost:8900`
- **Devnet RPC:** `https://api.devnet.solana.com`
- **Mainnet RPC:** `https://api.mainnet-beta.solana.com`

---

**Última Atualização:** 2026-03-07  
**Versão:** 0.1.0
