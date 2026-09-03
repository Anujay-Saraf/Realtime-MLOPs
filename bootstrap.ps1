# ============================================================
# MLOps Pipeline - Local Bootstrap Script
# ============================================================
# Use this when you don't have a model yet.
# It generates data, trains the model, then starts Docker.
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "MLOps Pipeline - Local Bootstrap" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

# 1. Check Python
Write-Host "`n[1/4] Checking Python..." -ForegroundColor Yellow
$python = python --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Python not found. Install Python 3.11+ and retry." -ForegroundColor Red
    exit 1
}
Write-Host "  Found: $python" -ForegroundColor Green

# 2. Install dependencies
Write-Host "`n[2/4] Installing Python dependencies..." -ForegroundColor Yellow
pip install -q -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to install dependencies." -ForegroundColor Red
    exit 1
}
Write-Host "  Dependencies installed." -ForegroundColor Green

# 3. Generate data
Write-Host "`n[3/4] Generating training data..." -ForegroundColor Yellow
python src/generate_dataset.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Data generation failed." -ForegroundColor Red
    exit 1
}

# 4. Train model
Write-Host "`n[4/4] Training model (this takes ~2 minutes)..." -ForegroundColor Yellow
python src/train.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Training failed. Check training_output.log." -ForegroundColor Red
    exit 1
}

# 5. Verify
if (-not (Test-Path "models/model_a_random_forest.joblib")) {
    Write-Host "ERROR: Model A file was not created." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path "models/model_b_gradient_boosting.joblib")) {
    Write-Host "ERROR: Model B file was not created." -ForegroundColor Red
    exit 1
}
$sizeA = (Get-Item "models/model_a_random_forest.joblib").Length / 1MB
$sizeB = (Get-Item "models/model_b_gradient_boosting.joblib").Length / 1MB
Write-Host "  Model A saved: $([math]::Round($sizeA, 1)) MB" -ForegroundColor Green
Write-Host "  Model B saved: $([math]::Round($sizeB, 1)) MB" -ForegroundColor Green

Write-Host "`n==================================" -ForegroundColor Cyan
Write-Host "Bootstrap complete! Now run:" -ForegroundColor Green
Write-Host "  docker compose up -d --build" -ForegroundColor White
Write-Host "==================================" -ForegroundColor Cyan
