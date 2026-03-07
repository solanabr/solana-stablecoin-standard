# Push para GitHub - Instruções
# Executar: .\PUSH_GITHUB.ps1

Write-Host "=== Push para GitHub ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Repositorio: https://github.com/jvcarnon-rgb/solana-stablecoin-standard" -ForegroundColor Green
Write-Host ""

# Verificar se remote existe
$remote = git remote get-url origin 2>$null
if ($remote) {
    Write-Host "Remote origin configurado: $remote" -ForegroundColor Green
} else {
    Write-Host "Adicionando remote origin..." -ForegroundColor Yellow
    git remote add origin https://github.com/jvcarnon-rgb/solana-stablecoin-standard.git
}

# Tentar push
Write-Host ""
Write-Host "Tentando push..." -ForegroundColor Cyan

# Se falhar, mostrar instrucoes
$pushFailed = $false
git push -u origin main 2>&1 | ForEach-Object {
    if ($_ -match "fatal|error|Authentication") {
        $pushFailed = $true
    }
    Write-Host $_
}

if ($pushFailed) {
    Write-Host ""
    Write-Host "=== AUTENTICACAO NECESSARIA ===" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Opcao 1: Usar GitHub CLI (Recomendado)" -ForegroundColor Cyan
    Write-Host "  1. Instalar: winget install GitHub.cli" -ForegroundColor White
    Write-Host "  2. Autenticar: gh auth login" -ForegroundColor White
    Write-Host "  3. Push: git push -u origin main" -ForegroundColor White
    Write-Host ""
    Write-Host "Opcao 2: Usar Git Credential Manager" -ForegroundColor Cyan
    Write-Host "  1. Execute: git push -u origin main" -ForegroundColor White
    Write-Host "  2. Login aparecera no navegador" -ForegroundColor White
    Write-Host "  3. Autorize o acesso" -ForegroundColor White
    Write-Host ""
    Write-Host "Opcao 3: Upload Manual via Browser" -ForegroundColor Cyan
    Write-Host "  1. Acesse: https://github.com/jvcarnon-rgb/solana-stablecoin-standard/upload/main" -ForegroundColor White
    Write-Host "  2. Arraste todos os arquivos da pasta:" -ForegroundColor White
    Write-Host "     C:\Users\vitor\.openclaw\workspace\solana-stablecoin-standard" -ForegroundColor White
    Write-Host "  3. Commit: 'Initial commit: SSS-1 + SSS-2'" -ForegroundColor White
    Write-Host "  4. Click 'Commit changes'" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "=== PUSH REALIZADO COM SUCESSO! ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "Proximos passos:" -ForegroundColor Cyan
    Write-Host "1. Acesse: https://github.com/jvcarnon-rgb/solana-stablecoin-standard" -ForegroundColor White
    Write-Host "2. Submit PR: https://github.com/solanabr/solana-stablecoin-standard/pulls" -ForegroundColor White
}
