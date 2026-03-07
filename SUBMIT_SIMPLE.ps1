# Solana Stablecoin Standard - Submission Script
# Run: powershell -ExecutionPolicy Bypass -File SUBMIT_SIMPLE.ps1

Write-Host "=== Solana Stablecoin Standard - Submission ===" -ForegroundColor Cyan
Write-Host ""

# Check files
$files = @(
    "README.md",
    "Anchor.toml",
    "Cargo.toml",
    "programs/stablecoin/src/lib.rs",
    "sdk/src/index.ts",
    "tests/sss-1.ts",
    "tests/sss-2.ts",
    "docs/ARCHITECTURE.md",
    "docs/OPERATIONS.md",
    "docs/SSS-1.md",
    "docs/SSS-2.md",
    "docs/COMPLIANCE.md",
    "docs/SETUP.md",
    "docker-compose.yml",
    "Dockerfile.anchor",
    "package.json",
    "tsconfig.json"
)

Write-Host "Checking files..."
$missing = @()
foreach ($file in $files) {
    if (-not (Test-Path $file)) {
        $missing += $file
        Write-Host "  MISSING: $file" -ForegroundColor Red
    }
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "ERROR: Missing files!" -ForegroundColor Red
    exit 1
} else {
    Write-Host "  All files present!" -ForegroundColor Green
}

Write-Host ""
Write-Host "Counting code lines..." -ForegroundColor Cyan

# Count lines
$rsFiles = Get-ChildItem -Recurse -Filter "*.rs" -Exclude "node_modules","target"
$tsFiles = Get-ChildItem -Recurse -Filter "*.ts" -Exclude "node_modules","target"

$rsLines = 0
$tsLines = 0

foreach ($f in $rsFiles) {
    $rsLines += (Get-Content $f.FullName | Measure-Object -Line).Lines
}

foreach ($f in $tsFiles) {
    $tsLines += (Get-Content $f.FullName | Measure-Object -Line).Lines
}

Write-Host "  Rust: $rsLines lines" -ForegroundColor Green
Write-Host "  TypeScript: $tsLines lines" -ForegroundColor Green
Write-Host "  Total: $($rsLines + $tsLines) lines" -ForegroundColor Green

Write-Host ""
Write-Host "Checking Git..." -ForegroundColor Cyan

# Check Git
if (-not (Test-Path ".git")) {
    Write-Host "  Initializing Git..."
    git init
    git branch -M main
    Write-Host "  Git initialized!" -ForegroundColor Green
} else {
    Write-Host "  Git already initialized" -ForegroundColor Green
}

Write-Host ""
Write-Host "Adding files to Git..."
git add .
Write-Host "  Files added!" -ForegroundColor Green

Write-Host ""
Write-Host "=== READY FOR COMMIT ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Run: git commit -m 'Initial commit: SSS-1 + SSS-2'"
Write-Host "2. Create GitHub repo: https://github.com/new"
Write-Host "3. Run: git remote add origin YOUR_REPO_URL"
Write-Host "4. Run: git push -u origin main"
Write-Host "5. Submit PR: https://github.com/solanabr/solana-stablecoin-standard/pulls"
Write-Host ""
