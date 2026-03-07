# Setup Guide - Solana Stablecoin Standard

Guia completo para configurar ambiente de desenvolvimento.

---

## 🎯 Escolha Seu Caminho

### Caminho 1: Docker (⭐ Recomendado - 5min)

**Prós:**
- ✅ Sem instalação de dependências
- ✅ Ambiente isolado e reproduzível
- ✅ Funciona em Windows, Linux, macOS
- ✅ Já inclui Solana + Anchor

**Contras:**
- ⚠️ Requer Docker Desktop instalado
- ⚠️ Um pouco mais lento que native

**Comando:**
```bash
docker compose up -d
docker compose exec anchor bash
anchor build
anchor test
```

---

### Caminho 2: WSL2 + Ubuntu (Windows - 15min)

**Prós:**
- ✅ Performance nativa
- ✅ Melhor experiência de desenvolvimento
- ✅ Compatível com maioria dos tutoriais

**Contras:**
- ⚠️ Requer WSL2 habilitado
- ⚠️ Mais passos de instalação

**Passos:**

1. **Habilitar WSL2:**
```powershell
wsl --install -d Ubuntu
wsl --set-default ubuntu
```

2. **Instalar dentro do WSL:**
```bash
# Atualizar pacotes
sudo apt update && sudo apt upgrade -y

# Instalar dependências
sudo apt install -y pkg-config build-essential libudev-dev curl git

# Instalar Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.bashrc

# Instalar Solana
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
source ~/.bashrc

# Instalar Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.30.1
avm use 0.30.1

# Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

3. **Verificar:**
```bash
solana --version    # v2.1.x
anchor --version    # v0.30.1
node --version      # v20.x
```

---

### Caminho 3: Native Windows (PowerShell - 20min)

**Prós:**
- ✅ Sem WSL
- ✅ Familiar para usuários Windows

**Contras:**
- ⚠️ Mais problemas de compatibilidade
- ⚠️ Alguns tutoriais não funcionam

**Passos:**

1. **Instalar Chocolatey:**
```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
[iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))]
```

2. **Instalar ferramentas:**
```powershell
choco install rust -y
choco install solana-cli -y
choco install nodejs-lts -y
choco install openssl -y
```

3. **Instalar Anchor:**
```powershell
# Adicionar OpenSSL ao PATH
$env:OPENSSL_DIR = "C:\Program Files\OpenSSL-Win64"
$env:PATH = "$env:OPENSSL_DIR\bin;$env:PATH"

# Instalar AVM
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.30.1
avm use 0.30.1
```

4. **Configurar PATH permanentemente:**
```powershell
# Adicionar ao PATH do usuário
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
[Environment]::SetEnvironmentVariable("Path", "$userPath;C:\Users\$env:USERNAME\.avm\bin", "User")
```

---

### Caminho 4: macOS (15min)

**Passos:**

1. **Instalar Homebrew:**
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

2. **Instalar ferramentas:**
```bash
brew install rust
brew install solana-cli
brew install node
brew install openssl
```

3. **Instalar Anchor:**
```bash
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.30.1
avm use 0.30.1
```

4. **Configurar OpenSSL:**
```bash
export OPENSSL_INCLUDE_DIR="$(brew --prefix openssl)/include"
export OPENSSL_LIB_DIR="$(brew --prefix openssl)/lib"
```

---

### Caminho 5: Linux Ubuntu/Debian (15min)

**Passos:**

1. **Instalar dependências:**
```bash
sudo apt update
sudo apt install -y pkg-config build-essential libudev-dev libssl-dev curl git
```

2. **Instalar Rust:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.bashrc
```

3. **Instalar Solana:**
```bash
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
source ~/.bashrc
```

4. **Instalar Anchor:**
```bash
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.30.1
avm use 0.30.1
```

5. **Instalar Node.js:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

---

## 🧪 Verificação

Após instalar, rode:

```bash
# Verificar versões
solana --version    # Deve mostrar v2.1.x
anchor --version    # Deve mostrar v0.30.1
node --version      # Deve mostrar v18+
npm --version       # Deve mostrar v9+

# Build do projeto
cd solana-stablecoin-standard
anchor build

# Tests
anchor test
```

---

## 🐛 Troubleshooting

### "anchor: command not found"

```bash
# Verificar se AVM está no PATH
echo $PATH | grep avm

# Adicionar manualmente
export PATH="$HOME/.avm/bin:$PATH"
echo 'export PATH="$HOME/.avm/bin:$PATH"' >> ~/.bashrc
```

### "OpenSSL not found"

**Windows:**
```powershell
$env:OPENSSL_DIR = "C:\Program Files\OpenSSL-Win64"
$env:PATH = "$env:OPENSSL_DIR\bin;$env:PATH"
```

**macOS:**
```bash
export OPENSSL_INCLUDE_DIR="$(brew --prefix openssl)/include"
export OPENSSL_LIB_DIR="$(brew --prefix openssl)/lib"
```

**Linux:**
```bash
sudo apt install -y libssl-dev
```

### "rustc: command not found"

```bash
# Reinstalar Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.bashrc
```

### "No such file or directory: 'solana-test-validator'"

```bash
# Reinstalar Solana
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
source ~/.bashrc
```

### "npm install fails on Windows"

```powershell
# Rodar PowerShell como Admin
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
npm install --force
```

---

## 📦 Instalação de Dependências do Projeto

Após ter as ferramentas instaladas:

```bash
cd solana-stablecoin-standard

# Instalar Node dependencies
npm install

# Instalar SDK dependencies
cd sdk && npm install
cd ..

# Build Anchor programs
anchor build

# Run tests
anchor test
```

---

## 🚀 Next Steps

1. ✅ Setup completo
2. ✅ Build successful
3. ✅ Tests passing
4. ➡️ Deploy to devnet

```bash
# Configurar para devnet
solana config set --url devnet

# Deploy
anchor deploy --provider.cluster devnet
```

---

## 📞 Suporte

- **GitHub Issues:** https://github.com/solanabr/solana-stablecoin-standard/issues
- **Discord:** https://discord.gg/superteambrasil
- **Solana Docs:** https://docs.solana.com
- **Anchor Docs:** https://www.anchor-lang.com

---

**Última Atualização:** 2026-03-07  
**Versão:** 0.1.0  
**License:** MIT
