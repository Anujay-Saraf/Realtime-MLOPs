# Azure Setup Guide — MLOps Pipeline

This script creates all Azure resources needed to deploy the API and Next.js dashboard.

## Prerequisites

1. **Azure CLI** — already installed (`az` available)
2. **Login to Azure**:
   ```powershell
   az login
   ```

## Run the Setup Script

Execute the script below in PowerShell to create all resources at once:

```powershell
cd D:\mlopscompletepipeline

# ============================================================
# 1. Configuration
# ============================================================
$RESOURCE_GROUP = "mlops-rg"
$LOCATION       = "eastus"
$ACR_NAME       = "sarafanujayacr"   # must be globally unique (lowercase)
$API_NAME       = "order-prediction-api"
$DASHBOARD_NAME = "mlops-dashboard"
$RG_EXISTS      = $(az group show -g $RESOURCE_GROUP --query "name" -o tsv 2>$null)

# ============================================================
# 2. Create Resource Group
# ============================================================
if (-not $RG_EXISTS) {
    Write-Host "Creating resource group: $RESOURCE_GROUP"
    az group create `
        --name $RESOURCE_GROUP `
        --location $LOCATION `
        --output json
} else {
    Write-Host "Resource group already exists: $RESOURCE_GROUP"
}

# ============================================================
# 3. Create Azure Container Registry
# ============================================================
Write-Host "Creating container registry: $ACR_NAME"
az acr create `
    --resource-group $RESOURCE_GROUP `
    --name $ACR_NAME `
    --sku Basic `
    --output json

# Enable admin user (needed for GitHub Actions push)
az acr update `
    --name $ACR_NAME `
    --admin-enabled true `
    --output json

# Get ACR login server
$ACR_LOGIN_SERVER = az acr show `
    --name $ACR_NAME `
    --query "loginServer" `
    --output tsv

Write-Host "ACR Login Server: $ACR_LOGIN_SERVER"

# ============================================================
# 4. Get ACR Credentials (for GitHub Secrets)
# ============================================================
$ACR_USERNAME = az acr credential show `
    --name $ACR_NAME `
    --query "username" `
    --output tsv

$ACR_PASSWORD = az acr credential show `
    --name $ACR_NAME `
    --query "passwords[0].value" `
    --output tsv

Write-Host ""
Write-Host "========================================"
Write-Host "ADD THESE TO GITHUB SECRETS"
Write-Host "========================================"
Write-Host "ACR_LOGIN_SERVER : $ACR_LOGIN_SERVER"
Write-Host "ACR_USERNAME     : $ACR_USERNAME"
Write-Host "ACR_PASSWORD     : $ACR_PASSWORD"
Write-Host "========================================"
Write-Host ""

# ============================================================
# 5. Allow ACR to pull images (Azure role assignment)
# ============================================================
Write-Host "Assigning AcrPull role..."
az role assignment create `
    --assignee $(az ad signed-in-user show --query "id" -o tsv) `
    --role AcrPull `
    --scope "/subscriptions/$(az account show --query 'id' -o tsv)/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.ContainerRegistry/registries/$ACR_NAME" `
    --output json 2>$null

Write-Host "Azure setup complete!"
Write-Host "Next: Add GitHub Secrets and push to GitHub"
```

## What Gets Created

| Resource | Name | Purpose |
|---|---|---|
| Resource Group | `mlops-rg` | Container for all resources |
| Container Registry | `sarafanujayacr` | Stores Docker images |
| Container Instances | `order-prediction-api` | Runs the FastAPI model |
| Container Instances | `mlops-dashboard` | Runs the Next.js dashboard |

## After Running This Script

1. Copy the **three values** printed at the end
2. Go to: https://github.com/Anujay-Saraf/Realtime-MLOPs/settings/secrets/actions
3. Click **New repository secret** for each:
   - `ACR_LOGIN_SERVER` = value printed above
   - `ACR_USERNAME` = value printed above
   - `ACR_PASSWORD` = value printed above

## Teardown (Cleanup)

```powershell
az group delete --name mlops-rg --yes --no-wait
```
