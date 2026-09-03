# ============================================================
# DVC Setup — configure Azure Blob Storage as remote
# ============================================================
# Run ONCE after cloning the repo:
#   1. Get connection string from Azure Portal
#   2. Paste into .env (gitignored)
#   3. Run this script
#
# What it does:
#   - Configures .dvc/config with the remote URL
#   - Writes connection string ONLY to .dvc/config.local (gitignored)
#   - Tests the connection by listing the remote
#
# For CI: the same connection string is stored as a GitHub Secret
# and injected as AZURE_STORAGE_CONNECTION_STRING env var.
# ============================================================

$ErrorActionPreference = "Stop"

$STORAGE_ACCOUNT = "testml3410875630"
$CONTAINER       = "dvcremote"

# Check .env for the connection string
$envFile = ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "ERROR: .env file not found. Copy .env.example to .env and add AZURE_STORAGE_CONNECTION_STRING." -ForegroundColor Red
    exit 1
}

# Load connection string from .env
$connStr = $null
foreach ($line in Get-Content $envFile) {
    if ($line -match '^AZURE_STORAGE_CONNECTION_STRING=(.*)$') {
        $connStr = $Matches[1].Trim()
        break
    }
}

if ([string]::IsNullOrEmpty($connStr)) {
    Write-Host "ERROR: AZURE_STORAGE_CONNECTION_STRING not found in .env." -ForegroundColor Red
    Write-Host ""
    Write-Host "To get the connection string:" -ForegroundColor Yellow
    Write-Host "  az storage account show-connection-string --name $STORAGE_ACCOUNT"
    exit 1
}

Write-Host "=== DVC Azure Remote Setup ===" -ForegroundColor Cyan
Write-Host "Storage account: $STORAGE_ACCOUNT" -ForegroundColor Gray
Write-Host "Container:        $CONTAINER" -ForegroundColor Gray
Write-Host ""

# 1. Ensure container exists
Write-Host "Checking container..." -ForegroundColor Yellow
$exists = az storage container exists `
    --name $CONTAINER `
    --account-name $STORAGE_ACCOUNT `
    --connection-string $connStr `
    -o tsv 2>$null

if ($exists -ne "True") {
    Write-Host "Creating container..." -ForegroundColor Yellow
    az storage container create `
        --name $CONTAINER `
        --account-name $STORAGE_ACCOUNT `
        --connection-string $connStr `
        --public-access off 2>$null
    Write-Host "  Container created." -ForegroundColor Green
} else {
    Write-Host "  Container already exists." -ForegroundColor Green
}

# 2. Configure DVC remote URL (stored in .dvc/config, committed to git)
Write-Host "Configuring DVC remote URL..." -ForegroundColor Yellow
$remoteUrl = "azure://$CONTAINER"
dvc remote add -d origin $remoteUrl
Write-Host "  Remote URL: $remoteUrl" -ForegroundColor Green

# 3. Store connection string in .dvc/config.local (gitignored — NEVER commit this)
Write-Host "Storing credentials in .dvc/config.local..." -ForegroundColor Yellow
dvc remote modify origin connection_string $connStr --local
Write-Host "  Credentials stored (gitignored)." -ForegroundColor Green

# 4. Test: list remote contents
Write-Host "Testing connection..." -ForegroundColor Yellow
$env:AZURE_STORAGE_CONNECTION_STRING = $connStr
dvc list . 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Connection OK!" -ForegroundColor Green
} else {
    Write-Host "  WARNING: Connection test failed. Check .env credentials." -ForegroundColor Red
}

# 5. Verify final config
Write-Host ""
Write-Host "=== DVC Config Summary ===" -ForegroundColor Cyan
Write-Host ".dvc/config (git-tracked):" -ForegroundColor Gray
Get-Content .dvc/config
Write-Host ""
Write-Host ".dvc/config.local (gitignored, contains secrets):" -ForegroundColor Gray
Get-Content .dvc/config.local 2>$null

Write-Host ""
Write-Host "=== DVC is ready! ===" -ForegroundColor Green
Write-Host "Try these commands:" -ForegroundColor Yellow
Write-Host "  dvc status         - check if anything changed"
Write-Host "  dvc push            - push data/models to Azure Blob"
Write-Host "  dvc pull            - pull latest data/models from Azure Blob"
Write-Host "  dvc repro           - re-run pipeline (data → training)"
