# Superteam Brazil Bounty - Submission Guide

Guia passo-a-passo para submeter o projeto.

---

## ✅ Checklist Pré-Submission

### Código
- [ ] `anchor build` roda sem erros
- [ ] `anchor test` passa todos os tests
- [ ] Código está no GitHub (repo público)
- [ ] README.md está completo
- [ ] LICENSE está presente (MIT)

### Documentação
- [ ] ARCHITECTURE.md explica o design
- [ ] OPERATIONS.md tem instruções de uso
- [ ] SETUP.md tem guia de instalação
- [ ] SSS-1.md e SSS-2.md especificam os padrões
- [ ] COMPLIANCE.md cobre aspectos regulatórios

### Devnet (Opcional mas recomendado)
- [ ] Deploy realizado em devnet
- [ ] Program ID salvo
- [ ] Transactions de teste verificáveis
- [ ] Demo funcional

### Video (Opcional mas recomendado)
- [ ] Vídeo 2-5 minutos gravado
- [ ] Postado no X/Twitter
- [ ] Tag @SuperteamBR incluída
- [ ] Link no PR

---

## 📝 Passo 1: Push para GitHub

### Criar Repositório

```bash
# Inicializar git (se não existe)
cd solana-stablecoin-standard
git init

# Adicionar arquivos
git add .

# Commit inicial
git commit -m "Initial commit: Solana Stablecoin Standard (SSS-1 + SSS-2)

- Anchor program com Token-2022 extensions
- SDK TypeScript completo
- 36 test cases (SSS-1 + SSS-2)
- Documentação completa (7 docs)
- Docker setup para desenvolvimento
- Compliance guide para emissores

Superteam Brazil Bounty submission"

# Criar branch main
git branch -M main

# Adicionar remote (substitua SEU_GITHUB_USER)
git remote add origin https://github.com/SEU_GITHUB_USER/solana-stablecoin-standard.git

# Push
git push -u origin main
```

### GitHub UI

1. Acesse: https://github.com/new
2. Nome: `solana-stablecoin-standard`
3. Descrição: "Modular SDK e padrões para stablecoins em Solana - Superteam Brazil Bounty"
4. Visibility: **Public**
5. **NÃO** inicializar com README (já temos)
6. Click "Create repository"
7. Siga instruções para push

---

## 📝 Passo 2: Criar PR

### Acessar Repo Oficial

1. https://github.com/solanabr/solana-stablecoin-standard
2. Click "Pull requests" → "New pull request"
3. Click "compare across forks"
4. Base: `solanabr/solana-stablecoin-standard:main`
5. Head: `SEU_USER/solana-stablecoin-standard:main`
6. Click "Create pull request"

---

## 📝 Passo 3: Preencher Template

### Título do PR

```
[SSS] Solana Stablecoin Standard - SSS-1 + SSS-2 Implementation
```

### Descrição do PR

```markdown
## Summary

Implementação completa do Solana Stablecoin Standard (SSS) com:

- **SSS-1 (Minimal Stablecoin):** Mint/burn/freeze/pause básico
- **SSS-2 (Compliant Stablecoin):** SSS-1 + blacklist + seize via permanent delegate

## Features

### Core (100% Complete)
- ✅ Token-2022 extensions (mint_authority, freeze_authority, metadata)
- ✅ SSS-2 extensions (permanent_delegate, transfer_hook ready)
- ✅ Role-based access control
- ✅ Emergency controls (pause, freeze, seize)
- ✅ Blacklist management (SSS-2)

### SDK (100% Complete)
- ✅ TypeScript SDK com classe SolanaStablecoin
- ✅ Presets: SSS_1, SSS_2
- ✅ Custom configuration support
- ✅ Compliance module (blacklist, seize)

### Tests (100% Complete)
- ✅ 18 test cases SSS-1
- ✅ 18 test cases SSS-2
- ✅ 36 tests total
- ✅ Coverage: initialize, mint, burn, freeze, thaw, pause, unpause, blacklist, seize

### Documentation (100% Complete)
- ✅ README.md (installation, quick start)
- ✅ ARCHITECTURE.md (3-layer design)
- ✅ OPERATIONS.md (operator runbook)
- ✅ SETUP.md (environment setup)
- ✅ SSS-1.md (minimal spec)
- ✅ SSS-2.md (compliant spec)
- ✅ COMPLIANCE.md (regulatory guide)
- ✅ DOCKER.md (docker setup)

### Devnet Deployment (Pending)
- ⏳ Program ID: [A PREENCHER]
- ⏳ Demo transactions: [A PREENCHER]

### Video Demo (Pending)
- ⏳ Video URL: [A PREENCHER]
- ⏳ Twitter post: [A PREENCHER]

## Architecture

3-layer design inspirado em OpenZeppelin:

1. **Layer 1 - Base SDK:** Token creation, role management
2. **Layer 2 - Modules:** Compliance, privacy (optional)
3. **Layer 3 - Standards:** SSS-1 (minimal), SSS-2 (compliant)

## Security

- Role-based access control (Master, Minter, Pauser, Blacklister, Seizer)
- Emergency pause mechanism
- Account freeze/thaw
- Blacklist for sanctioned addresses (SSS-2)
- Seize via permanent delegate (SSS-2)

## Testing

```bash
# Install dependencies
npm install

# Build
anchor build

# Run all tests
anchor test

# Run specific tests
anchor test -- --grep "SSS-1"
anchor test -- --grep "SSS-2"
```

## Docker Setup

```bash
# Start local environment
docker compose up -d

# Enter container
docker compose exec anchor bash

# Build & test
anchor build
anchor test
```

## Files Structure

```
solana-stablecoin-standard/
├── programs/stablecoin/src/lib.rs    (12.5KB - Anchor program)
├── sdk/src/index.ts                  (8.6KB - TypeScript SDK)
├── tests/
│   ├── sss-1.ts                      (18 tests)
│   └── sss-2.ts                      (18 tests)
├── docs/
│   ├── ARCHITECTURE.md
│   ├── OPERATIONS.md
│   ├── SETUP.md
│   ├── SSS-1.md
│   ├── SSS-2.md
│   ├── COMPLIANCE.md
│   └── DOCKER.md
├── docker-compose.yml
├── Dockerfile.anchor
├── README.md
└── BOUNTY_STATUS.md
```

## Bounty Criteria Alignment

| Criteria | Weight | Implementation |
|----------|--------|----------------|
| SDK Design & Modularity | 20% | ✅ 3-layer architecture, modular design |
| Completeness | 20% | ✅ SSS-1 + SSS-2 fully implemented |
| Code Quality | 20% | ✅ Clean code, well-structured, documented |
| Security | 15% | ✅ RBAC, pause, freeze, seize, blacklist |
| Authority | 20% | ⏳ Devnet deployment pending |
| Usability & Docs | 5% | ✅ 8 comprehensive docs |

**Bonus Features:**
- ✅ Docker development environment
- ✅ Comprehensive compliance guide
- ✅ Operator runbook
- ✅ Regulatory considerations (OFAC, MiCA)

## Contact

- **GitHub:** @SEU_GITHUB_USER
- **Twitter:** @VitorCarnon
- **Discord:** [SEU_DISCORD]
- **Email:** jvcarnon@gmail.com

## Acknowledgments

- Inspired by: [Solana Vault Standard](https://github.com/solanabr/solana-vault-standard)
- Built for: [Superteam Brazil](https://superteam.fun)
- Network: Solana
```

---

## 📝 Passo 4: Devnet Deployment (Opcional)

### Configurar Devnet

```bash
# Configurar Solana CLI para devnet
solana config set --url devnet

# Gerar novo keypair (se não tem)
solana-keygen new -o ~/.config/solana/id.json

# Pedir airdrop (2 SOL grátis)
solana airdrop 2
```

### Deploy

```bash
# Deploy do programa
anchor deploy --provider.cluster devnet

# Salvar Program ID
# (aparece no output do deploy)
```

### Testar no Devnet

```typescript
// Criar script de teste
const stable = await SolanaStablecoin.create(connection, {
  preset: Presets.SSS_2,
  name: "Devnet Stable",
  symbol: "DUSD",
  decimals: 6,
});

// Mint
await stable.mint({ recipient, amount: new BN(1000 * 1e6) });

// Log transaction
console.log("Mint TX:", txSignature);
```

### Salvar Proof

```bash
# Salvar Program ID
echo "Program ID: <SALVAR_AQUI>" > DEVNET_PROOF.md

# Salvar transaction links
echo "Mint TX: https://solscan.io/tx/<TX_HASH>" >> DEVNET_PROOF.md
```

---

## 📝 Passo 5: Video Demo (Opcional)

### Roteiro Sugerido (2-5 min)

**0:00-0:30** - Introdução
- "Olá, sou [nome], desenvolvedor Solana"
- "Estou submetendo o Solana Stablecoin Standard"

**0:30-1:00** - Arquitetura
- Mostrar ARCHITECTURE.md
- Explicar 3 camadas
- SSS-1 vs SSS-2

**1:00-2:00** - Código
- Mostrar lib.rs (instruções principais)
- Mostrar SDK (index.ts)
- Mostrar tests

**2:00-3:00** - Demo (se devnet pronto)
- Mint de tokens
- Blacklist + freeze
- Seize de tokens

**3:00-3:30** - Documentação
- Mostrar docs criadas
- Docker setup

**3:30-4:00** - Conclusão
- "Obrigado Superteam Brazil"
- "Disponível para perguntas"

### Gravar

**Ferramentas:**
- OBS Studio (grátis)
- Loom (fácil)
- QuickTime (macOS)

### Postar no X

```
🌌 Acabei de submeter o Solana Stablecoin Standard (SSS) para o @SuperteamBR!

SSS-1: Minimal stablecoin
SSS-2: Compliant stablecoin com blacklist + seize

3-layer architecture inspirada em OpenZeppelin
36 test cases + 8 docs completas

Demo: [LINK_VIDEO]
Repo: [LINK_GITHUB]

#Solana #Stablecoin #SuperteamBrazil
```

---

## 📝 Passo 6: Submit Final

### PR Checklist

- [ ] PR criado no GitHub
- [ ] Template preenchido
- [ ] Código linkado
- [ ] Docs linkadas
- [ ] Devnet proof (se tiver)
- [ ] Video link (se tiver)
- [ ] Twitter post linkado

### Notificar Superteam

**Discord:**
- https://discord.gg/superteambrasil
- Canal: #bounties
- Mensagem:
```
@kauenet @SuperteamBR 

Acabei de submeter o Solana Stablecoin Standard (SSS) para o bounty de $5k!

✅ SSS-1 + SSS-2 implementados
✅ 36 test cases
✅ 8 docs completas
✅ Docker setup
✅ TypeScript SDK

PR: https://github.com/solanabr/solana-stablecoin-standard/pull/[NUM]

Obrigado! 🚀
```

---

## 📊 Timeline

| Data | Ação |
|------|------|
| **07/03 19:00** | Código + docs completos (93%) |
| **07/03 20:00** | Build + tests (100%) |
| **07/03 20:30** | Devnet deployment |
| **07/03 21:00** | Video gravado |
| **07/03 21:30** | PR submetido |
| **14/03 02:59** | **DEADLINE** |

---

## 🏆 Pós-Submission

### Aguardar Julgamento

- Judges vão revisar código
- Podem fazer perguntas no PR
- Esteja disponível para responder

### Possíveis Outcomes

1. **1º Lugar ($2,500):** Excelente código + devnet + video
2. **2º Lugar ($1,500):** Bom código, sem devnet
3. **3º Lugar ($1,000):** Código básico
4. **Menção Honrosa:** Destaque em alguma categoria

### Próximos Passos (após resultado)

- KYC required para winners
- Pagamento em USDG
- Possibilidade de manter/maintain o repo

---

## 📞 Links Úteis

- **Bounty:** https://superteam.win/earn/listing/build-the-solana-stablecoin-standard-bounty
- **Repo Oficial:** https://github.com/solanabr/solana-stablecoin-standard
- **Discord:** https://discord.gg/superteambrasil
- **Twitter:** @SuperteamBR

---

**Última Atualização:** 2026-03-07 19:15 BRT  
**Status:** 93% completo - Pronto para submission
