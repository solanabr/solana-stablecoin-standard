# 🚀 SSS Deployment & Running Guide

Complete guide for deploying and running all components of the Solana Stablecoin Standard.

## 📋 Table of Contents

1. [Quick Start (Local Development)](#quick-start)
2. [Running Individual Services](#running-services)
3. [Deployment Options](#deployment)
4. [Environment Configuration](#environment)

---

## 🏃 Quick Start (Local Development) {#quick-start}

### Prerequisites

```bash
# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.18.4/install)"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.31.1
avm use 0.31.1

# Install Node.js dependencies
npm install
```

### One-Command Start

```bash
# Start everything with Docker Compose
docker-compose up

# OR start manually:
npm run dev:all
```

---

## 🔧 Running Individual Services {#running-services}

### 1. Solana Validator (Local)

```bash
# Start local validator with Token-2022
solana-test-validator \
  --reset \
  --bpf-program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb token-2022.so

# In a new terminal, set cluster
solana config set --url localhost
```

### 2. Anchor Programs

```bash
# Build programs
anchor build

# Deploy to localnet
anchor deploy

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Run tests
anchor test
```

### 3. CLI Tool

```bash
# Navigate to CLI
cd cli

# Install dependencies
npm install

# Build
npm run build

# Run CLI
npm run start -- --help

# Or globally install
npm link
sss --help

# AI Commands
sss ask "mint 1000 tokens"
sss chat  # Interactive mode
```

### 4. Backend API

```bash
cd backend

# Install
npm install

# Development (with hot reload)
npm run dev

# Production
npm run build
npm start

# API available at http://localhost:3001
# Swagger docs at http://localhost:3001/api/docs
```

### 5. Frontend Dashboard

```bash
cd frontend

# Install
npm install

# Development
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Available at http://localhost:3000
```

### 6. TUI Dashboard

```bash
cd tui

# Install
npm install

# Run
npm run start

# Or with options
npm run start -- --mint <MINT_ADDRESS> --cluster devnet
```

### 7. Documentation Website

```bash
cd website

# Install
npm install

# Development (with hot reload)
npm run start

# Build static site
npm run build

# Serve built site
npm run serve

# Available at http://localhost:3000
```

### 8. Run CT E2E Test

```bash
# Make sure validator is running first
solana-test-validator --reset

# Run the E2E confidential transfer test
npx ts-node scripts/ct-e2e-test.ts

# Or on devnet
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com npx ts-node scripts/ct-e2e-test.ts
```

---

## 🌐 Deployment Options {#deployment}

### Programs (Solana)

#### Devnet Deployment

```bash
# Configure for devnet
solana config set --url devnet

# Airdrop SOL for deployment (need ~5 SOL)
solana airdrop 5

# Build and deploy
anchor build
anchor deploy --provider.cluster devnet

# Verify deployment
solana program show <PROGRAM_ID>
```

#### Mainnet Deployment

```bash
# Configure for mainnet
solana config set --url mainnet-beta

# Deploy (requires mainnet SOL)
anchor deploy --provider.cluster mainnet-beta
```

### Frontend → Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# From frontend directory
cd frontend

# Deploy
vercel

# Production deployment
vercel --prod
```

**Or via GitHub Integration:**
1. Push to GitHub
2. Import project at [vercel.com/new](https://vercel.com/new)
3. Set root directory to `frontend`
4. Deploy automatically on push

**Environment Variables (Vercel Dashboard):**
```
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SSS_PROGRAM_ID=<YOUR_PROGRAM_ID>
```

### Backend → Railway

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# From backend directory
cd backend

# Initialize project
railway init

# Deploy
railway up

# Set environment variables
railway variables set PORT=3001
railway variables set RPC_URL=https://api.devnet.solana.com
```

**Or via GitHub Integration:**
1. Connect repo at [railway.app](https://railway.app)
2. Set root directory to `backend`
3. Configure env vars in dashboard
4. Auto-deploys on push

### Backend → Render

1. Create account at [render.com](https://render.com)
2. New → Web Service
3. Connect GitHub repo
4. Settings:
   - Root Directory: `backend`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Environment: `Node`

**Environment Variables:**
```
PORT=3001
NODE_ENV=production
RPC_URL=https://api.devnet.solana.com
```

### Documentation → Netlify

```bash
# Build docs
cd website
npm run build

# Deploy to Netlify
npx netlify-cli deploy --prod --dir=build
```

**Or via GitHub Integration:**
1. Connect at [netlify.com](https://netlify.com)
2. Set build command: `cd website && npm install && npm run build`
3. Set publish directory: `website/build`

### Documentation → GitHub Pages

```bash
cd website

# Configure for GitHub Pages
npm run deploy
```

Add to `website/docusaurus.config.js`:
```js
module.exports = {
  url: 'https://yourusername.github.io',
  baseUrl: '/solana-stablecoin-standard/',
  organizationName: 'yourusername',
  projectName: 'solana-stablecoin-standard',
  deploymentBranch: 'gh-pages',
  trailingSlash: false,
};
```

### Full Stack → Docker

```bash
# Build all images
docker-compose build

# Run all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

---

## ⚙️ Environment Configuration {#environment}

### Root `.env` File

```env
# Solana
CLUSTER=devnet
RPC_URL=https://api.devnet.solana.com
SSS_PROGRAM_ID=2L6rZHyqhJ9VJqXhbgW7vyP3uerrw7Vzpp3qtqAq1FZj
TRANSFER_HOOK_PROGRAM_ID=E3pPcPAU4Un7WMaHyMnG6L3SJ8dNu4gjZGU6ExqvhRzS

# Backend
BACKEND_PORT=3001
CORS_ORIGIN=*

# Frontend
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SSS_PROGRAM_ID=2L6rZHyqhJ9VJqXhbgW7vyP3uerrw7Vzpp3qtqAq1FZj
```

### Wallet Setup

```bash
# Create new keypair
solana-keygen new -o ~/.config/solana/id.json

# Or import existing
solana-keygen recover -o ~/.config/solana/id.json

# Get address
solana address

# Get devnet SOL
solana airdrop 5 --url devnet
```

---

## 📊 Service Ports

| Service | Port | URL |
|---------|------|-----|
| Frontend | 3000 | http://localhost:3000 |
| Backend API | 3001 | http://localhost:3001 |
| API Docs | 3001 | http://localhost:3001/api/docs |
| Website | 3000 | http://localhost:3000 |
| Solana Validator | 8899 | http://localhost:8899 |

---

## 🧪 Running All Tests

```bash
# All tests
npm test

# Anchor tests only
anchor test

# SDK tests
cd sdk && npm test

# Backend tests
cd backend && npm test

# E2E CT test
npx ts-node scripts/ct-e2e-test.ts
```

---

## 🔄 CI/CD Pipeline

The project includes GitHub Actions for:
- Building and testing on every push
- Deploying to devnet on `main` branch
- Building Docker images
- Deploying docs to GitHub Pages

See `.github/workflows/` for configuration.
