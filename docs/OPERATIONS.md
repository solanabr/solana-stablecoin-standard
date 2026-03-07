# Solana Stablecoin Standard - Operator Runbook

Guia prático para operadores de stablecoins SSS-1 e SSS-2.

---

## 🚀 Quick Start

### 1. Instalação

```bash
# Instalar dependências
npm install

# Instalar CLI globalmente
npm install -g @stbr/sss-token

# Configurar Solana CLI
solana config set --url devnet
solana-keygen new -o ~/.config/solana/id.json
```

### 2. Initialize Config

```bash
sss-token config init
```

Isso cria `~/.sss-token/config.json`:

```json
{
  "rpcUrl": "https://api.devnet.solana.com",
  "keypairPath": "/home/user/.config/solana/id.json",
  "stablecoins": []
}
```

### 3. Adicionar Stablecoin

```bash
sss-token config add my-stable <MINT_ADDRESS> --preset sss-2
```

---

## 📋 Operações Diárias

### Mint de Tokens

```bash
# Mint para recipient
sss-token mint my-stable <RECIPIENT_ADDRESS> <AMOUNT>

# Exemplo: Mint 1000 tokens
sss-token mint my-stable 7xKX... 1000000000
```

### Burn de Tokens

```bash
# Burn dos seus tokens
sss-token burn my-stable <AMOUNT>

# Exemplo: Burn 500 tokens
sss-token burn my-stable 500000000
```

### Freeze/Thaw

```bash
# Freeze de conta
sss-token freeze my-stable <ACCOUNT_ADDRESS>

# Thaw de conta congelada
sss-token thaw my-stable <ACCOUNT_ADDRESS>
```

### Pause/Unpause (Emergency)

```bash
# Emergency pause
sss-token pause my-stable

# Retomar operações
sss-token unpause my-stable
```

---

## 🔒 SSS-2: Compliance Operations

### Blacklist Management

```bash
# Adicionar à blacklist
sss-token blacklist add my-stable <ADDRESS> --reason "OFAC match"

# Remover da blacklist
sss-token blacklist remove my-stable <ADDRESS>

# Listar blacklist
sss-token blacklist list my-stable
```

### Seize Tokens

```bash
# Seize tokens de conta congelada
sss-token seize my-stable <FROM_ACCOUNT> <AMOUNT> --to <TREASURY_ADDRESS>
```

**Use cases:**
- Sanctions enforcement
- Court orders
- Fraud recovery

---

## 📊 Monitoring

### Check Supply

```bash
sss-token supply my-stable
```

### Check Holders

```bash
# Listar holders
sss-token holders my-stable

# Filtro por balance mínimo
sss-token holders my-stable --min-balance 1000
```

### Audit Log

```bash
# Export audit log
sss-token audit-log my-stable --action mint

# Export para CSV
sss-token audit-log my-stable --format csv --output audit.csv
```

### Real-time Dashboard

```bash
sss-token dashboard my-stable
```

Mostra:
- Total supply
- Number of holders
- Recent transactions
- Paused status
- Blacklist count

---

## 🔐 Security Best Practices

### 1. Multi-Sig para Authority

**NUNCA** use uma única chave para a authority. Configure um multisig:

```bash
# Criar multisig (ex: 3-of-5)
spl-token create-multisig 3 <PUBKEY1> <PUBKEY2> <PUBKEY3> <PUBKEY4> <PUBKEY5>

# Transferir authority para multisig
sss-token transfer-authority my-stable <MULTISIG_ADDRESS>
```

### 2. Separação de Roles

| Role | Chave | Permissões |
|------|-------|------------|
| **Master** | Multisig cold wallet | Transfer authority |
| **Minter** | Hot wallet (API) | Mint apenas |
| **Pauser** | Monitoring system | Pause apenas |
| **Blacklister** | Compliance team | Blacklist apenas |

### 3. Rate Limiting

Implemente rate limits no backend:

```typescript
// Exemplo: Max 1M tokens/hora
const RATE_LIMIT = 1_000_000 * 1e6;
const windowStart = Date.now() - 3600000;
const mintedInWindow = await getMintedAmount(lastHour);

if (mintedInWindow + amount > RATE_LIMIT) {
  throw new Error("Rate limit exceeded");
}
```

### 4. Monitoring Alerts

Configure alerts para:
- ⚠️ Mint > $100k em única transação
- ⚠️ Freeze de conta
- ⚠️ Seize de tokens
- ⚠️ Pause/unpause
- ⚠️ Transfer de authority

---

## 🆘 Emergency Procedures

### Cenário 1: Attack Detected

```bash
# 1. PAUSE IMEDIATO
sss-token pause my-stable

# 2. Freeze contas comprometidas
sss-token freeze my-stable <ATTACKER_ADDRESS>

# 3. Notificar team

# 4. Investigar

# 5. Seize tokens se aplicável
sss-token seize my-stable <ATTACKER> <AMOUNT> --to <TREASURY>

# 6. Unpause após resolução
sss-token unpause my-stable
```

### Cenário 2: Private Key Compromised

```bash
# 1. Pause
sss-token pause my-stable

# 2. Transferir authority para backup
sss-token transfer-authority my-stable <BACKUP_AUTHORITY>

# 3. Unpause
sss-token unpause my-stable

# 4. Rotacionar todas as chaves
```

### Cenário 3: Regulatory Order (SSS-2)

```bash
# 1. Receber ordem judicial

# 2. Adicionar à blacklist
sss-token blacklist add my-stable <SANCTIONED_ADDRESS> --reason "Court order #12345"

# 3. Freeze
sss-token freeze my-stable <SANCTIONED_ADDRESS>

# 4. Seize se ordenado
sss-token seize my-stable <SANCTIONED_ADDRESS> <AMOUNT> --to <GOVERNMENT_ADDRESS>

# 5. Documentar no audit log
```

---

## 📈 Scaling Operations

### High-Volume Minting

Para stablecoins de alto volume:

1. **Use dedicated RPC** (Helius, QuickNode)
2. **Batch transactions** (up to 12 per block)
3. **Priority fees** para inclusão rápida
4. **Pre-fund ATAs** para evitar criação on-the-fly

### Multi-Minter Setup

```bash
# Adicionar múltiplos minters
sss-token minters add my-stable <MINTER1>
sss-token minters add my-stable <MINTER2>
sss-token minters add my-stable <MINTER3>

# Cada minter pode operar independentemente
```

### Geographic Distribution

Para compliance global:

- **US:** KYC/AML required
- **EU:** MiCA compliance
- **Asia:** Varies by country

Use blacklists region-specificas se necessário.

---

## 🔧 Troubleshooting

### "Transaction failed: VaultPaused"

```bash
# Verificar status
sss-token status my-stable

# Unpause se necessário
sss-token unpause my-stable
```

### "Insufficient funds"

```bash
# Check supply
sss-token supply my-stable

# Mint mais se necessário
sss-token mint my-stable <TREASURY> <AMOUNT>
```

### "Account is frozen"

```bash
# Verificar se está frozen
spl-token account-info <ACCOUNT_ADDRESS>

# Thaw se autorizado
sss-token thaw my-stable <ACCOUNT_ADDRESS>
```

---

## 📞 Support

- **GitHub Issues:** https://github.com/solanabr/solana-stablecoin-standard/issues
- **Discord:** https://discord.gg/superteambrasil
- **Emergency Contact:** security@superteam.br

---

**Última Atualização:** 2026-03-07  
**Versão:** 0.1.0
