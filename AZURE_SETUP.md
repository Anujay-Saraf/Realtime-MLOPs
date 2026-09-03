# Azure Setup — Quick Reference

> **📖 The authoritative, up-to-date guide is [DEPLOYMENT.md](DEPLOYMENT.md).**
> Read that first. This file is kept for historical context and shows the
> *legacy* setup flow that doesn't include OIDC.

## What you actually need today

The full setup (resource group + ACR + **OIDC service principal**) is in
[DEPLOYMENT.md §2](DEPLOYMENT.md#2-one-time-azure-setup). The script there
takes ~5 minutes and creates everything in one pass.

The single most important reason we use OIDC (vs. a password-based service
principal): GitHub Actions can log in to Azure **without storing any
credentials in secrets** — the federated credential restricts the SP to your
repo's `main` branch only.

## Quick command reference (if you just need to look something up)

```powershell
# Login
az login

# Set defaults so you don't repeat them
az configure --defaults group=mlops-rg location=eastus

# List what's running
az container list -g mlops-rg --output table

# Get the API URL
az container show -n order-prediction-api -g mlops-rg --query ipAddress.fqdn -o tsv

# Tail API logs
az container logs -n order-prediction-api -g mlops-rg --follow

# Tear it all down
az group delete -n mlops-rg --yes --no-wait
```

## Legacy setup (kept for reference)

The original setup used ACR admin credentials directly. The new
[DEPLOYMENT.md](DEPLOYMENT.md) does the same thing but also adds an OIDC
service principal so the workflow can `azure/login@v2` without a password.

```powershell
$RESOURCE_GROUP = "mlops-rg"
$LOCATION       = "eastus"
$ACR_NAME       = "sarafanujayacr"

# Resource Group
az group create --name $RESOURCE_GROUP --location $LOCATION

# ACR
az acr create --resource-group $RESOURCE_GROUP --name $ACR_NAME --sku Basic
az acr update --name $ACR_NAME --admin-enabled true

# Get credentials (paste into GitHub secrets)
az acr credential show --name $ACR_NAME
```

## What Gets Created

| Resource | Name | Purpose |
|---|---|---|
| Resource Group | `mlops-rg` | Container for all resources |
| Container Registry | `sarafanujayacr.azurecr.io` | Stores Docker images |
| Container Instances | `order-prediction-api` | Runs the FastAPI model |
| Container Instances | `mlops-dashboard` | Runs the Next.js dashboard |
| App Registration | `mlops-github-actions` | OIDC login (no password) |
| Federated Credential | `github-main` | Restricts SP to `main` branch |

## Next: Add GitHub Secrets and push to GitHub

See [DEPLOYMENT.md §3](DEPLOYMENT.md#3-one-time-github-setup-secrets).
