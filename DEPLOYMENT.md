# Deployment Guide — MLOps Pipeline (Cost-Optimized)

This is the **authoritative deployment guide** for the MLOps pipeline. It covers the
exact setup you need for the **GitHub Actions + Azure free tier** combination, the
known deployment blockers we hit, and the full update workflow.

> The pipeline deploys two models (RandomForest + GradientBoosting) plus a Next.js
> dashboard that runs them through an A/B testing UI.

---

## Table of Contents

1. [Cost strategy — what runs where](#1-cost-strategy--what-runs-where)
2. [One-time Azure setup](#2-one-time-azure-setup)
3. [One-time GitHub setup (secrets)](#3-one-time-github-setup-secrets)
4. [Deploy — push to trigger the pipeline](#4-deploy--push-to-trigger-the-pipeline)
5. [Daily / per-change update workflow](#5-daily--per-change-update-workflow)
6. [How to monitor what's running](#6-how-to-monitor-whats-running)
7. [Rollback / teardown](#7-rollback--teardown)
8. [Bugs we hit + how this guide prevents them](#8-bugs-we-hit--how-this-guide-prevents-them)

---

## 1. Cost strategy — what runs where

You have:
- **GitHub Actions:** 2,000 minutes/month free for private repos
- **Azure for Students / Free Trial:** $200 credit, 12 months

| Service | Where it runs | Cost (free tier) |
|---|---|---|
| Lint, validate, train, test | GitHub Actions ubuntu-latest | 2,000 min/mo free |
| Build & push Docker images | GitHub Actions ubuntu-latest | (same as above) |
| **API** (FastAPI) | **Azure Container Instance** | **~$0.012/hour** (1 vCPU, 1.5 GB) — ≈$9/mo 24×7 |
| **Dashboard** (Next.js) | **Azure Container Instance** | **~$0.012/hour** (1 vCPU, 1.5 GB) — ≈$9/mo 24×7 |
| **ACR** (container registry) | Azure Container Registry Basic | **$0.167/day** (~$5/mo) |
| **Container Group egress** | Bandwidth | First 100 GB/mo free |

### Why this stack is optimal for $200 credit

- **No VM, no AKS, no App Service Plan.** ACI charges by the second; you can stop
  it when not in use and pay nothing.
- **1 ACR Basic tier** is enough for two private images and is cheaper than
  Standard (no geo-replication, no webhooks).
- **GitHub Actions free tier** is plenty: each pipeline run is ~10–15 min, so you
  can run the pipeline ~130 times/month before exhausting free minutes.
- **No MLflow server, no Prometheus/Grafana** in the cloud — those are local-only.
  MLflow runs into a SQLite file in the CI artifact, Prometheus/Grafana run with
  `docker compose` on your laptop.

### Expected monthly cost (running 24×7)

| Resource | Cost |
|---|---|
| API ACI (1 vCPU, 1.5 GB) | ~$9 |
| Dashboard ACI (1 vCPU, 1.5 GB) | ~$9 |
| ACR Basic | ~$5 |
| Bandwidth | ~$1–3 |
| **Total** | **~$24/month** → lasts **8+ months** on $200 credit |

> 💡 **Tip:** When you're not using the API/dashboard, run
> `az container delete -n order-prediction-api -g mlops-rg --yes` and
> `az container delete -n mlops-dashboard -g mlops-rg --yes` to stop charges.

---

## 2. One-time Azure setup

Run this **once** in PowerShell. It creates the resource group, ACR, and an OIDC
service principal that GitHub Actions uses to log in without a password.

```powershell
# ============================================================
# MLOps — Azure one-time setup
# Run in PowerShell after `az login`
# ============================================================

$RESOURCE_GROUP = "mlops-rg"
$LOCATION       = "eastus"
$ACR_NAME       = "sarafanujayacr"   # MUST be globally unique; lowercase
$SP_NAME        = "mlops-github-actions"

# 1. Resource Group
az group create --name $RESOURCE_GROUP --location $LOCATION

# 2. Azure Container Registry (Basic tier — cheapest)
az acr create --resource-group $RESOURCE_GROUP --name $ACR_NAME --sku Basic
az acr update --name $ACR_NAME --admin-enabled true

# 3. ACR credentials (you'll paste these into GitHub Secrets)
$ACR_USERNAME = az acr credential show --name $ACR_NAME --query username -o tsv
$ACR_PASSWORD = az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv
$ACR_LOGIN    = "$ACR_NAME.azurecr.io"

# 4. Service Principal for OIDC (no password — uses Azure AD federation)
$APP_ID = az ad app create --display-name $SP_NAME --query appId -o tsv
az ad sp create --id $APP_ID
$TENANT_ID = az account show --query tenantId -o tsv
$SUB_ID    = az account show --query id -o tsv
$ACR_ID    = (az acr show --name $ACR_NAME --query id -o tsv)

# 5. Federated credential — restricts the SP to YOUR repo's main branch
$GH_USER = "Anujay-Saraf"
$GH_REPO = "Realtime-MLOPs"
az ad app federated-credential create `
  --id $APP_ID `
  --parameters "{\"name\":\"github-main\",\"issuer\":\"https://token.actions.githubusercontent.com\",\"subject\":\"repo:${GH_USER}/${GH_REPO}:ref:refs/heads/main\",\"audiences\":[\"api://AzureADTokenExchange\"]}"

# 6. Grant the SP permission to push/pull images + create ACI
az role assignment create --assignee $APP_ID --role "AcrPush"   --scope $ACR_ID
az role assignment create --assignee $APP_ID --role "AcrPull"   --scope $ACR_ID
az role assignment create --assignee $APP_ID --role "Contributor" --scope "/subscriptions/$SUB_ID/resourceGroups/$RESOURCE_GROUP"

Write-Host ""
Write-Host "═══════════════════════════════════════════════════"
Write-Host "  AZURE SETUP COMPLETE — copy the values below"
Write-Host "═══════════════════════════════════════════════════"
Write-Host "ACR_LOGIN_SERVER : $ACR_LOGIN"
Write-Host "ACR_USERNAME     : $ACR_USERNAME"
Write-Host "ACR_PASSWORD     : $ACR_PASSWORD"
Write-Host "AZURE_CLIENT_ID  : $APP_ID"
Write-Host "AZURE_TENANT_ID  : $TENANT_ID"
Write-Host "AZURE_SUBSCRIPTION_ID : $SUB_ID"
Write-Host "═══════════════════════════════════════════════════"
```

### What this creates

| Resource | Name | Purpose |
|---|---|---|
| Resource Group | `mlops-rg` | Holds all Azure resources |
| Container Registry | `sarafanujayacr.azurecr.io` | Stores Docker images |
| App Registration | `mlops-github-actions` | Service principal for CI/CD (OIDC) |
| Federated Credential | `github-main` | Allows only your `main` branch to assume the SP |

### Teardown (cleanup)

```powershell
az group delete --name mlops-rg --yes --no-wait
az ad app delete --id $APP_ID
```

---

## 3. One-time GitHub setup (secrets)

Go to **https://github.com/Anujay-Saraf/Realtime-MLOPs/settings/secrets/actions** and
add each of these via **"New repository secret"**:

| Secret | What it is | Example |
|---|---|---|
| `ACR_LOGIN_SERVER` | Registry hostname (hardcoded in workflow) | `sarafanujayacr.azurecr.io` |
| `ACR_USERNAME` | ACR admin username | `sarafanujayacr` |
| `ACR_PASSWORD` | ACR admin password | (the long string from the script) |
| `AZURE_CLIENT_ID` | Service principal app ID | (the GUID from the script) |
| `AZURE_TENANT_ID` | Your Azure AD tenant | (the GUID) |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription | (the GUID) |
| `NEXT_PUBLIC_GITHUB_REPO` | `${owner}/${repo}` — used by dashboard | `Anujay-Saraf/Realtime-MLOPs` |
| `AZURE_STORAGE_CONNECTION_STRING` | Connection string for storage account `testml3410875630` — used by DVC | `DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net` |

> ⚠️ **Do NOT** add `NEXT_PUBLIC_GITHUB_TOKEN` — the dashboard doesn't make
> authenticated GitHub API calls; the public Actions API works for read-only
> pipeline status with 60 req/hr.

### Verify secrets

```powershell
# From your laptop, after pushing a test commit
gh secret list --repo Anujay-Saraf/Realtime-MLOPs
```

You should see all 8 secrets listed.

---

## 4. Deploy — push to trigger the pipeline

Once secrets are set, deployment is **automatic** on every push to `main`:

```powershell
cd d:\mlopscompletepipeline
git add .
git commit -m "Deploy MLOps pipeline"
git push origin main
```

### Pipeline stages (in order)

```
push → main
  │
  ├─ lint                ~30s
  ├─ validate-data       ~20s
  ├─ train-model         ~3-5 min   (depends on hardware)
  │   └─ produces model_a_random_forest.joblib
  │      + model_b_gradient_boosting.joblib
  │      + .meta.json sidecars
  │
  ├─ test                ~1-2 min   (pytest only — no Docker)
  ├─ build-api           ~2-3 min   (image includes both models)
  ├─ build-dashboard     ~1-2 min
  ├─ deploy-api          ~1-2 min   (ACI spin-up + health check)
  ├─ deploy-dashboard    ~1-2 min
  └─ generate-report     ~5s
```

Total: **~10–15 min per push**.

### What to watch for in GitHub Actions

Watch the run at `https://github.com/Anujay-Saraf/Realtime-MLOPs/actions`.
At the end of the `deploy-dashboard` job, the URL is printed:

```
════════════════════════════════════════════
  ✅ DASHBOARD DEPLOYED
  🌐 https://mlopsdash<short-sha>.<region>.azurecontainer.io
  📡 API:     https://orderapi<short-sha>.<region>.azurecontainer.io
════════════════════════════════════════════
```

Click those links — they should be reachable from anywhere.

---

## 5. Daily / per-change update workflow

This is what you do every time you change **anything** in the pipeline and want
to deploy it. The CI/CD handles everything.

### A. Changed the model or training code (`src/train.py`, etc.)

```powershell
cd d:\mlopscompletepipeline

# 1. Edit the training code (e.g. change hyperparameters in src/train.py)

# 2. Test locally first
python src/train.py            # trains new model + writes sidecar
uvicorn api.main:app --port 8000  # in another terminal
curl http://localhost:8000/health

# 3. If local is good, push
git add src/train.py
git commit -m "Increase GradientBoosting n_estimators to 400"
git push origin main
# → CI retrains both models, runs tests, deploys
```

### B. Changed the API code (`api/*.py`)

```powershell
git add api/
git commit -m "Add /predict/batch endpoint"
git push origin main
# → CI builds new API image, deploys
```

### C. Changed the dashboard (`dashboard/app/**`)

```powershell
git add dashboard/
git commit -m "Add bulk test UI"
git push origin main
# → CI builds new dashboard image, deploys
```

### D. Changed data (`data/orders.csv`)

```powershell
git add data/orders.csv
git commit -m "Update dataset with 2026 orders"
git push origin main
# → CI regenerates dataset, retrains, redeploys
```

### E. Want to deploy without changing code? (manual trigger)

Go to **GitHub → Actions → MLOps Pipeline → Run workflow → Run** on the
`main` branch. Same outcome as a push.

### F. Update only the dashboard URL reference (no rebuild)

If you just want to point the dashboard at a new API URL without rebuilding,
update the env var on the running container:

```powershell
az container create --name mlops-dashboard -g mlops-rg --image sarafanujayacr.azurecr.io/mlops-dashboard:latest `
   --environment-variables NEXT_PUBLIC_API_BASE_URL="https://new-api-fqdn"
```

> (ACI doesn't support updating env vars in-place, so this deletes + recreates.)

---

## 6. How to monitor what's running

### Live pipeline status

- GitHub Actions: `https://github.com/Anujay-Saraf/Realtime-MLOPs/actions`
- Dashboard: `https://mlopsdash<short-sha>.<region>.azurecontainer.io`
  - Shows the latest run, success/failure, individual job status

### Live Azure resources

```powershell
# All containers in the resource group
az container list -g mlops-rg --output table

# Current API FQDN
az container show -n order-prediction-api -g mlops-rg --query ipAddress.fqdn -o tsv

# Current dashboard FQDN
az container show -n mlops-dashboard -g mlops-rg --query ipAddress.fqdn -o tsv

# API logs
az container logs -n order-prediction-api -g mlops-rg --follow

# Dashboard logs
az container logs -n mlops-dashboard -g mlops-rg --follow

# Restart a container (e.g. after a config change)
az container restart -n order-prediction-api -g mlops-rg
```

### Container states

| State | Means |
|---|---|
| `Running` | Healthy and serving requests |
| `Waiting` | Cold-starting (model loading, ~30s for the 130MB RF model) |
| `Stopped` | Manually stopped or out of credit — check `az container show` |
| `Failed` | Container exited — check `az container logs` |

### Cost guard

```powershell
# Check how much credit you've burned
az consumption usage list --output table
```

If you're getting close to $0, delete the containers (and the registry) but
keep the resource group so you can re-deploy with `git push`.

---

## 7. Rollback / teardown

### Roll back to the previous model/image

The workflow tags every image with the Git commit SHA. To roll back:

```powershell
# 1. Find a previous good SHA
git log --oneline

# 2. Either:
#    a) revert + push (preferred — keeps history clean)
git revert <bad-sha>
git push origin main
#    b) force-push to a specific SHA (rewrites history — DANGEROUS)
#    git reset --hard <good-sha> && git push --force-with-lease
```

### Stop everything temporarily (to save credit)

```powershell
az container delete -n order-prediction-api -g mlops-rg --yes
az container delete -n mlops-dashboard -g mlops-rg --yes
# ACR still costs $5/mo — to stop that too:
az acr delete -n sarafanujayacr --yes
```

### Permanent teardown

```powershell
# Deletes the resource group + everything inside (ACR, ACI, etc.)
az group delete --name mlops-rg --yes --no-wait
# Also remove the SP (separate IAM):
az ad app delete --id <APP_ID>
```

---

## 8. Bugs we hit + how this guide prevents them

These were the **real deployment failures** during initial setup. The fixed
workflow at [.github/workflows/mlops-pipeline.yml](.github/workflows/mlops-pipeline.yml)
and the setup in `AZURE_SETUP.md` now account for all of them.

### ❌ Bug 1: `order_prediction_model.joblib` not found in CI
**Symptom:** `build-api` job failed with `ERROR: models/order_prediction_model.joblib NOT FOUND`.

**Cause:** The training script was rewritten to produce `model_a_random_forest.joblib`
and `model_b_gradient_boosting.joblib`, but the workflow still checked for the old
filename.

**Fix:** Updated `train-model` job to verify BOTH new model files, and `build-api`
verifies them again before building the image.

### ❌ Bug 2: `secrets.ACR_USERNAME/PASSWORD` not in `.env.example`
**Symptom:** `docker login` failed inside the workflow.

**Cause:** `.env.example` documented `AZURE_ACR` but the workflow used
`secrets.ACR_USERNAME` / `secrets.ACR_PASSWORD` (which had never been added to
the GitHub secrets list).

**Fix:** This guide now lists `ACR_USERNAME` and `ACR_PASSWORD` as **required
secrets** in [Section 3](#3-one-time-github-setup-secrets).

### ❌ Bug 3: `secrets.GITHUB_TOKEN` not exposed to browser
**Symptom:** Dashboard's pipeline status page showed
"Failed to fetch pipeline data".

**Cause:** The dashboard calls the GitHub Actions API directly from the browser.
`secrets.GITHUB_TOKEN` is **only available inside the GitHub Action runner**, not
in the deployed container. The correct env var is `NEXT_PUBLIC_GITHUB_REPO`
(owner/repo slug), and the public API works without a token (60 req/hr).

**Fix:** Removed `NEXT_PUBLIC_GITHUB_TOKEN` from the workflow. The dashboard now
reads `NEXT_PUBLIC_GITHUB_REPO` from a secret at deploy time.

### ❌ Bug 4: `test` job tried to `docker compose up` — needed a .env
**Symptom:** `test` job failed because the API container couldn't start without
a populated `.env` file.

**Cause:** The original workflow tried to bring up the full stack (API +
Prometheus + Grafana) inside CI, which requires Grafana credentials and
.compose secrets that don't exist in CI.

**Fix:** The `test` job now runs `pytest` only (it downloads the model artifact
and exercises the API in-process). The full Docker stack is local-only.

### ❌ Bug 5: `sleep 40` for ACI startup
**Symptom:** Deploy jobs sometimes failed because 40s wasn't enough on slow days
and wasted time when it was.

**Fix:** Replaced with **polling loops** — checks for FQDN every 5s for up to
90s, then polls `/health` every 5s for up to 60s. Fast on good days, robust on
slow days.

### ❌ Bug 6: Lint/format checks masked by `|| true`
**Symptom:** Even with broken formatting, the lint step would say "passing"
because the runner had `|| true` on every command.

**Fix:** Removed all `|| true` from the lint job — failures now properly fail
the pipeline.

### ❌ Bug 7: OIDC config restricted to `develop` branch
**Symptom:** Login failed when merging to `main`.

**Fix:** Federated credential is now scoped to `refs/heads/main` (the only
branch we deploy from).

---

## 9. DVC — Data & Model Version Control

Everything stays inside Azure. No GitHub LFS, no S3, no external services.

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Azure Blob Storage (testml3410875630 / dvcremote)           │
│                                                              │
│  mlops/                                                      │
│  ├── .gitkeep                                                │
│  ├── data/                                                   │
│  │   └── orders.csv.<hash>   ←  data/orders.csv (12k rows)   │
│  └── models/                                                 │
│      ├── model_a_random_forest.joblib.<hash>                  │
│      └── model_b_gradient_boosting.joblib.<hash>             │
└──────────────────────────────────────────────────────────────┘
      ▲ dvc pull                          dvc push ▲
      │                                        │
┌─────────────────────┐              ┌──────────────────────┐
│  GitHub Actions CI  │              │  Local dev machine   │
│  (train-model job)  │              │  (dvc repro, push)  │
└─────────────────────┘              └──────────────────────┘
```

### Key files

| File | Purpose |
|---|---|
| `dvc.yaml` | Pipeline definition: `data` stage → `train` stage |
| `params.yaml` | Hyperparameters, sample count, quality gate threshold |
| `data/orders.csv.dvc` | DVC pointer for the dataset |
| `models/*.dvc` | DVC pointers for model files |
| `.dvc/config` | Remote URL (git-tracked, no credentials) |
| `.dvc/config.local` | Connection string (gitignored, never committed) |

### One-time local setup

```powershell
# Run once after cloning
cd d:\mlopscompletepipeline
az login
.\scripts\dvc_setup.ps1
```

`dvc_setup.ps1` creates the storage container if it doesn't exist and writes
connection string to `.dvc/config.local`.

### Daily development workflow

```powershell
# 1. Pull latest data/models from Azure Blob
dvc pull

# 2. Make changes (params, training code, data gen)
#    ...

# 3. Regenerate pipeline (data → train)
dvc repro

# 4. Inspect metrics
cat models/model_a_random_forest.joblib.meta.json
cat models/model_b_gradient_boosting.joblib.meta.json

# 5. Push updated data + models to Azure Blob
dvc push
```

### How CI uses DVC

The `train-model` job in the GitHub Actions pipeline:

1. **Pulls** latest data/models from Azure Blob at job start
   (injects `AZURE_STORAGE_CONNECTION_STRING` from secret into `.dvc/config.local`)
2. **Regenerates** data + trains both models via `dvc repro`
3. **Pushes** updated artifacts back to Azure Blob **only if quality gate passed**

This means the Azure Blob remote always holds the last good, quality-gated
version of data and models — never a regressed one.

### Compare metrics across runs

```powershell
# Show F1 score changes
dvc metrics diff

# Show hyperparameter changes
dvc params diff
```

### Free-tier limits

| Resource | Limit | Our usage |
|---|---|---|
| Azure Blob (hot) | 5 GB | ~2 MB (negligible) |
| GitHub Actions | 2,000 min/mo | ~8 min/run (≈250 runs/mo) |
| ACR Basic | $0.10/GB/day | 2 images × ~150 MB ≈ $0.03/day |

### Reset local DVC state

```powershell
# Blow away local cache and regenerate from scratch
dvc destroy   # removes .dvc/, dvc.lock — use carefully!
dvc repro
```

### CI-only DVC (no local setup needed)

If a collaborator only wants to run CI without a local DVC setup:

```powershell
# No dvc_setup.ps1 needed — CI injects the connection string from the secret
# and does dvc pull automatically.
```

---

## Update this guide when…

| Change | Section to update |
|---|---|
| New model (Model C, Model D, …) | [§5A](#a-changed-the-model-or-training-code-srctrainpy-etc) — name the file in the train job verification step |
| New GitHub secret | [§3](#3-one-time-github-setup-secrets) — add a row + the new env var in the workflow |
| New Azure service (e.g. Key Vault) | [§1](#1-cost-strategy--what-runs-where) cost table, [§2](#2-one-time-azure-setup) creation script |
| Pipeline restructuring | [§4 pipeline diagram](#4-deploy--push-to-trigger-the-pipeline) |
| ACI SKU upgrade/downgrade | [§1 cost table](#1-cost-strategy--what-runs-where) + [§5F](#f-update-only-the-dashboard-url-reference-no-rebuild) container commands |
| New failure mode | [§8](#8-bugs-we-hit--how-this-guide-prevents-them) — add a Bug N block |
| New DVC pipeline stage | [§9](#9-dvc--data--model-version-control) — add to `dvc.yaml` + `params.yaml` + update `dvc repro` commands |
| New Azure Blob path | [§9](#9-dvc--data--model-version-control) — update `AZURE_STORAGE_PATH_PREFIX` env var in workflow + `dvc_setup.ps1` |
