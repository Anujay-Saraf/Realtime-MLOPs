# ============================================================
# MLOps Pipeline - System Health & Model Verification
# ============================================================
# Tests:
#   1. All services are running
#   2. Model loads correctly
#   3. Predictions work (PASS and FAIL cases)
#   4. System is using the latest code
# ============================================================

param(
    [switch]$Quick      # Skip Docker check, just test local API
)

$ErrorActionPreference = "Continue"

function Test-Service($name, $url, $expected_status) {
    try {
        $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 5 -UseBasicParsing
        if ($response.StatusCode -eq $expected_status) {
            Write-Host "  [OK] $name - HTTP $($response.StatusCode)" -ForegroundColor Green
            return $true
        } else {
            Write-Host "  [FAIL] $name - Expected $expected_status, got $($response.StatusCode)" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "  [FAIL] $name - $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "MLOps Pipeline - System Verification" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

$allPassed = $true

# =============================================
# SECTION 1: Service Health Checks
# =============================================
Write-Host "`n[1/6] Checking Services..." -ForegroundColor Yellow

if ($Quick) {
    $base = "http://localhost:8000"
} else {
    $base = "http://localhost:8000"
}

$allPassed = (Test-Service "API Health" "$base/health" 200) -and $allPassed
$allPassed = (Test-Service "API Root" "$base/" 200) -and $allPassed
$allPassed = (Test-Service "Dashboard" "http://localhost:3002" 200) -and $allPassed

if (-not $Quick) {
    $allPassed = (Test-Service "Prometheus" "http://localhost:9090" 200) -and $allPassed
    $allPassed = (Test-Service "Grafana" "http://localhost:3003" 200) -and $allPassed
}

# =============================================
# SECTION 2: Model Verification
# =============================================
Write-Host "`n[2/6] Verifying Model..." -ForegroundColor Yellow

try {
    $models = Invoke-RestMethod -Uri "$base/models" -TimeoutSec 5
    if ($models.models.Count -gt 0) {
        $model = $models.models[0]
        Write-Host "  [OK] Model found: $($model.name)" -ForegroundColor Green
        Write-Host "       Size: $($model.size_mb) MB" -ForegroundColor Gray
        Write-Host "       SHA:  $($model.sha)" -ForegroundColor Gray
        Write-Host "       Modified: $($model.modified)" -ForegroundColor Gray
    } else {
        Write-Host "  [FAIL] No models found in models/ directory" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "  [FAIL] Could not fetch model info: $($_.Exception.Message)" -ForegroundColor Red
    $allPassed = $false
}

# =============================================
# SECTION 3: Prediction Tests
# =============================================
Write-Host "`n[3/6] Testing Predictions..." -ForegroundColor Yellow

# Test PASS case (good order)
$passPayload = @{
    region = "North"
    channel = "Online"
    service_type = "Fiber"
    plan_type = "Premium"
    customer_type = "New"
    address_verified = 1
    network_available = 1
    inventory_available = 1
    credit_check_passed = 1
    installation_required = 0
    monthly_charge = 89.99
    previous_failed_orders = 0
}

try {
    $passResult = Invoke-RestMethod -Uri "$base/predict" -Method POST `
        -Body ($passPayload | ConvertTo-Json) `
        -ContentType "application/json" `
        -TimeoutSec 5

    if ($passResult.result -eq "PASS") {
        Write-Host "  [OK] PASS prediction: P($($passResult.pass_probability))" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] Expected PASS but got $($passResult.result)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [FAIL] PASS prediction failed: $($_.Exception.Message)" -ForegroundColor Red
    $allPassed = $false
}

# Test FAIL case (risky order)
$failPayload = @{
    region = "South"
    channel = "Store"
    service_type = "DSL"
    plan_type = "Basic"
    customer_type = "Existing"
    address_verified = 0
    network_available = 0
    inventory_available = 0
    credit_check_passed = 0
    installation_required = 1
    monthly_charge = 49.99
    previous_failed_orders = 3
}

try {
    $failResult = Invoke-RestMethod -Uri "$base/predict" -Method POST `
        -Body ($failPayload | ConvertTo-Json) `
        -ContentType "application/json" `
        -TimeoutSec 5

    if ($failResult.result -eq "FAIL") {
        Write-Host "  [OK] FAIL prediction: P($($failResult.fail_probability))" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] Expected FAIL but got $($failResult.result)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [FAIL] FAIL prediction failed: $($_.Exception.Message)" -ForegroundColor Red
    $allPassed = $false
}

# =============================================
# SECTION 4: A/B Testing Endpoint
# =============================================
Write-Host "`n[4/6] Testing A/B Model Endpoint..." -ForegroundColor Yellow

try {
    $abPayload = @{
        model = "order_prediction_model.joblib"
        order = $passPayload
    }

    $abResult = Invoke-RestMethod -Uri "$base/predict/model" -Method POST `
        -Body ($abPayload | ConvertTo-Json) `
        -ContentType "application/json" `
        -TimeoutSec 5

    if ($abResult.model -eq "order_prediction_model.joblib") {
        Write-Host "  [OK] A/B endpoint: model='$($abResult.model)', result='$($abResult.result)'" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] A/B returned wrong model: $($abResult.model)" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "  [FAIL] A/B endpoint failed: $($_.Exception.Message)" -ForegroundColor Red
    $allPassed = $false
}

# =============================================
# SECTION 5: Prometheus Metrics
# =============================================
Write-Host "`n[5/6] Checking Prometheus Metrics..." -ForegroundColor Yellow

try {
    $metrics = Invoke-WebRequest -Uri "$base/metrics" -TimeoutSec 5 -UseBasicParsing

    $checks = @("order_predictions_total", "http_requests_total", "model_loads_total")
    foreach ($check in $checks) {
        if ($metrics.Content -match $check) {
            Write-Host "  [OK] Metric found: $check" -ForegroundColor Green
        } else {
            Write-Host "  [FAIL] Metric missing: $check" -ForegroundColor Red
            $allPassed = $false
        }
    }
} catch {
    Write-Host "  [FAIL] Could not fetch metrics: $($_.Exception.Message)" -ForegroundColor Red
    $allPassed = $false
}

# =============================================
# SECTION 6: Verify Latest Code
# =============================================
Write-Host "`n[6/6] Checking Latest Code..." -ForegroundColor Yellow

# Check git for latest commit
try {
    $gitStatus = git log -1 --oneline 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [OK] Git commit: $gitStatus" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] Not a git repo or git not available" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [WARN] Could not run git" -ForegroundColor Yellow
}

# Check API version header
try {
    $health = Invoke-RestMethod -Uri "$base/health" -TimeoutSec 5
    Write-Host "  [OK] API health: $($health | ConvertTo-Json)" -ForegroundColor Green
} catch {
    Write-Host "  [WARN] Could not get API health" -ForegroundColor Yellow
}

# Check model SHA matches local model
if ($models) {
    $localModel = Get-FileHash "models/order_prediction_model.joblib" -Algorithm SHA256 -ErrorAction SilentlyContinue
    if ($localModel) {
        $localShort = $localModel.Hash.Substring(0, 12).ToLower()
        if ($models.models[0].sha -eq $localShort) {
            Write-Host "  [OK] Model SHA matches local file ($localShort)" -ForegroundColor Green
        } else {
            Write-Host "  [WARN] Model SHA mismatch!" -ForegroundColor Yellow
            Write-Host "       Local:  $localShort" -ForegroundColor Gray
            Write-Host "       API:    $($models.models[0].sha)" -ForegroundColor Gray
            Write-Host "       Run 'python src/train.py' to retrain if needed." -ForegroundColor Gray
        }
    }
}

# =============================================
# SUMMARY
# =============================================
Write-Host "`n======================================" -ForegroundColor Cyan
if ($allPassed) {
    Write-Host "ALL TESTS PASSED" -ForegroundColor Green
} else {
    Write-Host "SOME TESTS FAILED" -ForegroundColor Red
    Write-Host "Check the errors above for details." -ForegroundColor Yellow
}
Write-Host "======================================" -ForegroundColor Cyan

if ($allPassed) { exit 0 } else { exit 1 }
