# Azure Setup Script for MLOps Pipeline — OIDC / Workload Identity (no secrets!)
# Run: .\scripts\setup-azure.ps1

param(
    [string]$ResourceGroup = "mlops-rg",
    [string]$Location = "eastus",
    [string]$AcrName = "sarafanujayacr",
    [string]$AppName = "mlops-github-actions"
)

$ErrorActionPreference = "Continue"

function Get-AzOutput {
    param([string]$Command)
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = "cmd.exe"
        $psi.Arguments = "/c $Command"
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $proc = [System.Diagnostics.Process]::Start($psi)
        $stdout = $proc.StandardOutput.ReadToEnd()
        $proc.WaitForExit()
        return $stdout.Trim()
    } catch {
        return ""
    }
}

# ============================================================
# 1. Login check
# ============================================================
Write-Host "Checking Azure login..." -ForegroundColor Cyan
$account = Get-AzOutput "az account show --query name -o tsv"
if (-not $account -or $account -eq "") {
    Write-Host "Not logged in. Run: az login" -ForegroundColor Red
    exit 1
}
Write-Host "Logged in as: $account" -ForegroundColor Green

# Get subscription ID
$subId = Get-AzOutput "az account show --query id -o tsv"
Write-Host "Subscription ID: $subId" -ForegroundColor Gray

# ============================================================
# 2. Create Resource Group
# ============================================================
Write-Host "`nCreating resource group: $ResourceGroup" -ForegroundColor Cyan
$rgExists = Get-AzOutput "az group show -g $ResourceGroup --query name -o tsv"
if ($rgExists -and $rgExists -ne "" -and $rgExists -ne "null") {
    Write-Host "Resource group already exists: $rgExists" -ForegroundColor Yellow
} else {
    Get-AzOutput "az group create --name $ResourceGroup --location $Location --output none" | Out-Null
    Write-Host "Resource group created." -ForegroundColor Green
}

# ============================================================
# 3. Create Azure Container Registry
# ============================================================
Write-Host "`nCreating container registry: $AcrName" -ForegroundColor Cyan
$acrExists = Get-AzOutput "az acr show -n $AcrName --query name -o tsv"
if ($acrExists -and $acrExists -ne "" -and $acrExists -ne "null") {
    Write-Host "Container registry already exists: $acrExists" -ForegroundColor Yellow
} else {
    Get-AzOutput "az acr create --resource-group $ResourceGroup --name $AcrName --sku Basic --output none" | Out-Null
    Write-Host "Container registry created." -ForegroundColor Green
}

# Enable admin user (needed for ACR pulls from CI)
Write-Host "  -> enabling admin user..." -ForegroundColor Gray
Get-AzOutput "az acr update -n $AcrName --admin-enabled true --output none" | Out-Null

$AcrLoginServer = Get-AzOutput "az acr show -n $AcrName --query loginServer -o tsv"
Write-Host "ACR Login Server: $AcrLoginServer" -ForegroundColor Green

# Get ACR credentials for docker login in workflow
$credsJson = Get-AzOutput "az acr credential show -n $AcrName -o json"
$creds = $credsJson | ConvertFrom-Json
$AcrUsername = $creds.username
$AcrPassword = $creds.passwords[0].value

# ============================================================
# 4. Create App Registration (Workload Identity / OIDC)
# ============================================================
Write-Host "`nSetting up Workload Identity (OIDC)..." -ForegroundColor Cyan

# Check if app already exists
$appId = Get-AzOutput "az ad app list --display-name `"$AppName`" --query [0].appId -o tsv"
$spId = ""

if ($appId -and $appId -ne "" -and $appId -ne "null") {
    Write-Host "App registration already exists: $appId" -ForegroundColor Yellow
    # Get existing SP
    $spId = Get-AzOutput "az ad sp list --filter `"appId eq '$appId'`" --query [0].id -o tsv"
} else {
    Write-Host "  -> creating app registration..." -ForegroundColor Gray
    $appId = Get-AzOutput "az ad app create --display-name `"$AppName`" --query appId -o tsv"
    Write-Host "App registration created: $appId" -ForegroundColor Green

    Write-Host "  -> creating service principal..." -ForegroundColor Gray
    $spId = Get-AzOutput "az ad sp create --id $appId --query id -o tsv"
    Write-Host "Service principal created: $spId" -ForegroundColor Green
}

# ============================================================
# 5. Assign Contributor role
# ============================================================
Write-Host "`nAssigning Contributor role to resource group..." -ForegroundColor Cyan
$roleExists = Get-AzOutput "az role assignment list --assignee $appId --role Contributor --scope /subscriptions/$subId/resourceGroups/$ResourceGroup --query [0].id -o tsv"
if ($roleExists -and $roleExists -ne "" -and $roleExists -ne "null") {
    Write-Host "Role assignment already exists." -ForegroundColor Yellow
} else {
    Get-AzOutput "az role assignment create --assignee $appId --role Contributor --scope /subscriptions/$subId/resourceGroups/$ResourceGroup --output none" | Out-Null
    Write-Host "Contributor role assigned." -ForegroundColor Green
}

# ============================================================
# 6. Create Federated Credential (OIDC)
# ============================================================
Write-Host "`nCreating federated OIDC credential..." -ForegroundColor Cyan

# Check existing federated credentials
$federatedCount = Get-AzOutput "az ad app federated-credential list --id $appId --query length(@) -o tsv"

if ([int]$federatedCount -gt 0) {
    Write-Host "Federated credential already exists." -ForegroundColor Yellow
} else {
    Write-Host "  -> creating federated credential for GitHub Actions..." -ForegroundColor Gray
    $federatedJson = @"
{
  "name": "github-actions-oidc",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:Anujay-Saraf/Realtime-MLOPs:environment:production",
  "audiences": ["api://AzureADTokenExchange"]
}
"@
    Get-AzOutput "az ad app federated-credential create --id $appId --parameters `"$federatedJson`"" | Out-Null
    Write-Host "Federated credential created." -ForegroundColor Green
}

# ============================================================
# 7. Print Results
# ============================================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  ADD THESE TO GITHUB SECRETS" -ForegroundColor Magenta
Write-Host "  https://github.com/Anujay-Saraf/Realtime-MLOPs/settings/secrets/actions" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "Only 3 secrets needed (no AZURE_CREDENTIALS needed!):" -ForegroundColor White
Write-Host ""
Write-Host "  ACR_LOGIN_SERVER : $AcrLoginServer"
Write-Host "  ACR_USERNAME     : $AcrUsername"
Write-Host "  ACR_PASSWORD     : $AcrPassword"
Write-Host ""
Write-Host "  AZURE_CLIENT_ID  : $appId"
Write-Host "  AZURE_TENANT_ID  : (check output of: az account show --query tenantId -o tsv)"
Write-Host "  AZURE_SUBSCRIPTION_ID : $subId"
Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

Write-Host "Azure setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "NEXT STEPS:" -ForegroundColor Yellow
Write-Host "1. Get your tenant ID:" -ForegroundColor White
Write-Host "   az account show --query tenantId -o tsv" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Add these GitHub Secrets:" -ForegroundColor White
Write-Host "   - ACR_LOGIN_SERVER  = $AcrLoginServer" -ForegroundColor Gray
Write-Host "   - ACR_USERNAME      = $AcrUsername" -ForegroundColor Gray
Write-Host "   - ACR_PASSWORD      = $AcrPassword" -ForegroundColor Gray
Write-Host "   - AZURE_CLIENT_ID   = $appId" -ForegroundColor Gray
Write-Host "   - AZURE_TENANT_ID   = (from az account show)" -ForegroundColor Gray
Write-Host "   - AZURE_SUBSCRIPTION_ID = $subId" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Push to GitHub:" -ForegroundColor White
Write-Host "   git add . && git commit -m 'Deploy' && git push" -ForegroundColor Gray
