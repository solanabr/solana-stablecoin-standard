# Solana Stablecoin Standard - Architecture

## Visão Geral

O Solana Stablecoin Standard (SSS) é um SDK modular para criação e gerenciamento de stablecoins em Solana, seguindo os padrões SSS-1 e SSS-2.

## Arquitetura em 3 Camadas

```
┌─────────────────────────────────────────────────────────────┐
│                    Layer 3: Standards                        │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │     SSS-1       │  │     SSS-2       │                   │
│  │  Minimal        │  │  Compliant      │                   │
│  │  Stablecoin     │  │  Stablecoin     │                   │
│  └─────────────────┘  └─────────────────┘                   │
├─────────────────────────────────────────────────────────────┤
│                    Layer 2: Modules                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Compliance  │  │   Privacy    │  │   Custom     │       │
│  │   Module     │  │   Module     │  │   Modules    │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
├─────────────────────────────────────────────────────────────┤
│                    Layer 1: Base SDK                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Token-2022 + Anchor Program + TypeScript SDK + CLI  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Base SDK

### Componentes

1. **On-Chain Program (Anchor)**
   - Instruções: `initialize`, `mint`, `burn`, `freeze`, `thaw`, `pause`, `unpause`
   - PDAs: `Stablecoin`, `Blacklist`
   - Events: `Mint`, `Burn`, `Freeze`, `Thaw`, `Pause`, `AuthorityTransfer`

2. **Token-2022 Extensions**
   - `MintAuthority`: Controle de quem pode mintar
   - `FreezeAuthority`: Controle de quem pode congelar contas
   - `PermanentDelegate`: Permite seizure de tokens (SSS-2)
   - `TransferHook`: Hook para compliance checks (SSS-2)
   - `TokenMetadata`: Nome, símbolo, URI, decimals

3. **TypeScript SDK**
   - Classe `SolanaStablecoin` com métodos high-level
   - Suporte a presets (SSS-1, SSS-2)
   - Configuração customizável via TOML/JSON

4. **CLI (`sss-token`)**
   - Comandos: `init`, `mint`, `burn`, `freeze`, `blacklist`, `seize`
   - Configuração local em `~/.sss-token/config.json`

---

## Layer 2: Modules

### Compliance Module (SSS-2)

```rust
pub struct ComplianceModule {
    pub blacklist: Vec<Pubkey>,
    pub transfer_hook_program: Pubkey,
    pub permanent_delegate: bool,
}
```

**Funcionalidades:**
- Blacklist de endereços (OFAC, sanctions)
- Transfer hook checa cada transação
- Permanent delegate permite seizure
- Audit trail exportável

### Privacy Module (Futuro - SSS-3)

```rust
pub struct PrivacyModule {
    pub confidential_transfers: bool,
    pub allowlist: Vec<Pubkey>,
}
```

**Funcionalidades:**
- Confidential transfers (Token-2022 CT extension)
- Allowlist de endereços autorizados
- Saldo criptografado com ElGamal

---

## Layer 3: Standard Presets

### SSS-1: Minimal Stablecoin

**Use case:** Stablecoins simples, tokens internos, DAO treasuries

**Configuração:**
```toml
[stablecoin]
name = "My Stable"
symbol = "MUSD"
decimals = 6
preset = "sss-1"

[extensions]
permanent_delegate = false
transfer_hook = false
```

**Instruções disponíveis:**
- `initialize` - Criar stablecoin
- `mint` - Mint tokens
- `burn` - Burn tokens
- `freeze_account` - Congelar conta
- `thaw_account` - Descongelar conta
- `pause` / `unpause` - Emergency controls
- `transfer_authority` - Transferir controle

---

### SSS-2: Compliant Stablecoin

**Use case:** Stablecoins reguladas (USDC, USDT-class)

**Configuração:**
```toml
[stablecoin]
name = "Regulated Stable"
symbol = "RUSD"
decimals = 6
preset = "sss-2"

[extensions]
permanent_delegate = true
transfer_hook = true

[compliance]
blacklist_enabled = true
audit_trail = true
```

**Instruções adicionais:**
- `add_to_blacklist` - Adicionar à blacklist
- `remove_from_blacklist` - Remover da blacklist
- `seize` - Seize tokens de conta congelada

---

## PDA Derivation

### Stablecoin PDA

```typescript
const [stablecoinPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("stablecoin"), mint.toBuffer()],
  program.programId
);
```

### Blacklist PDA (SSS-2)

```typescript
const [blacklistPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("blacklist"), stablecoinPda.toBuffer()],
  program.programId
);
```

---

## Role-Based Access Control

| Role | Permissões | Chave |
|------|------------|-------|
| **Master Authority** | Transfer authorities, update roles | `authority` |
| **Minter** | Mint tokens (com quota) | `minter` |
| **Burner** | Burn tokens | `authority` |
| **Blacklister** (SSS-2) | Add/remove blacklist | `authority` |
| **Pauser** | Pause/unpause | `authority` |
| **Seizer** (SSS-2) | Seize tokens | `authority` |

**Princípio de Segurança:** Nenhuma chave controla tudo sozinha.

---

## Security Model

### Inflation Attack Protection

- Virtual offset mechanism previne donation attacks
- Rounding favorece o vault (não o usuário)

### Slippage Protection

- Min/max parameters em todas as operações
- Previne sandwich attacks

### Emergency Controls

- `pause()` para todas as operações
- `freeze_account()` para contas específicas
- `seize()` para tokens de contas congeladas (SSS-2)

### Audit Trail

- Todos os eventos emitidos on-chain
- Exportável para compliance reporting

---

## Data Flow

### Mint Flow (SSS-1)

```
User → SDK.mint() → Anchor Program → Token-2022 Mint → User ATA
                      ↓
                  Mint Event
```

### Mint Flow (SSS-2 com Compliance)

```
User → SDK.mint() → Check Blacklist → Transfer Hook → Token-2022 Mint → User ATA
                      ↓                       ↓
                  Audit Log            Compliance Check
```

### Seize Flow (SSS-2)

```
Authority → SDK.seize() → Check Permanent Delegate → Freeze Check → Transfer
                              ↓                            ↓
                        Compliance OK              Account Frozen
```

---

## Testing Strategy

### Unit Tests

- Todas as instruções do Anchor program
- SDK TypeScript methods
- CLI commands

### Integration Tests

- Full lifecycle: create → mint → transfer → burn
- Multi-user scenarios
- Compliance flows (SSS-2)

### Fuzz Tests (Trident)

- Random inputs para encontrar edge cases
- Stress tests com grandes volumes

---

## Deployment

### Devnet

```bash
# Build
anchor build

# Deploy
anchor deploy --provider.cluster devnet

# Initialize
sss-token init --preset sss-2 --name "My Stable" --symbol "MUSD"
```

### Mainnet (Production)

```bash
# Audit primeiro!
# Deploy com multisig
# Monitor com dashboard
```

---

## Futuro Roadmap

- [ ] SSS-3: Private Stablecoin (confidential transfers)
- [ ] Oracle Integration Module (Switchboard para non-USD pegs)
- [ ] Interactive Admin TUI
- [ ] Example Frontend (React + SDK)

---

## Referências

- [Solana Vault Standard](https://github.com/solanabr/solana-vault-standard)
- [Token-2022 Extensions](https://solana.com/solutions/token-extensions)
- [Anchor Documentation](https://www.anchor-lang.com/)
