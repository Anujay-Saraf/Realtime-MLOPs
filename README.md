# Real-Time MLOps Pipeline — Order Prediction API

[![MLOps Pipeline](https://github.com/Anujay-Saraf/Realtime-MLOPs/actions/workflows/mlops-pipeline.yml/badge.svg)](https://github.com/Anujay-Saraf/Realtime-MLOPs/actions)

Complete MLOps pipeline with automated CI/CD, Azure deployment, model/data versioning, and a live Next.js dashboard.

## What's in this Repo

| Path | What it is |
|---|---|
| [`api/`](api/) | FastAPI Order Prediction service |
| [`src/`](src/) | Training scripts (Random Forest, 5-fold CV, MLflow) |
| [`dashboard/`](dashboard/) | **Next.js dashboard** — live pipeline + version status |
| [`.github/workflows/`](.github/workflows/mlops-pipeline.yml) | CI/CD pipeline (lint → train → test → build → deploy) |
| [`scripts/setup-azure.ps1`](scripts/setup-azure.ps1) | One-click Azure resource creation |
| [`AZURE_SETUP.md`](AZURE_SETUP.md) | Detailed Azure setup guide |
| [`CICD_SETUP_GUIDE.md`](CICD_SETUP_GUIDE.md) | CI/CD architecture & troubleshooting |
| [`docker-compose.yml`](docker-compose.yml) | Full local stack (API + Dashboard + Prometheus + Grafana) |

## Live Endpoints (After First Successful Pipeline Run)

- **Dashboard:** `https://mlops-dashboard-<run-id>.<region>.azurecontainer.io:3000`
- **API:** `https://order-prediction-api-<run-id>.<region>.azurecontainer.io:8000`
- **API Docs:** `<api-url>/docs`
- **GitHub Actions:** https://github.com/Anujay-Saraf/Realtime-MLOPs/actions

## Quick Start

### 1. Set up Azure (one time)

```powershell
az login
.\scripts\setup-azure.ps1
```

This creates:
- Resource Group `mlops-rg`
- Azure Container Registry `sarafanujayacr`

Copy the three secrets printed at the end.

### 2. Add GitHub Secrets

Go to https://github.com/Anujay-Saraf/Realtime-MLOPs/settings/secrets/actions and add:

| Secret | Value |
|---|---|
| `ACR_USERNAME` | from setup script |
| `ACR_PASSWORD` | from setup script |
| `ACR_LOGIN_SERVER` | from setup script |
| `AZURE_CREDENTIALS` | output of `az ad sp create-for-rbac --role contributor` |

### 3. Push to GitHub

```powershell
git add .
git commit -m "Deploy pipeline + dashboard"
git push origin main
```

### 4. Watch it run

Open https://github.com/Anujay-Saraf/Realtime-MLOPs/actions — the 9 jobs will run:

1. Code Quality
2. Validate Data
3. Train Model (with F1 ≥ 0.70 quality gate)
4. Test Suite
5. Build & Push API Image → ACR
6. Build & Push Dashboard Image → ACR
7. Deploy API → Azure Container Instance
8. Deploy Dashboard → Azure Container Instance
9. Generate Version Report (artifact)

## What the Dashboard Shows

- **Model Version** — current Git commit SHA (also the Docker image tag)
- **Data Version** — DVC-tracked `orders.csv` hash
- **MLflow Run** — run ID for the latest training
- **Pipeline Stats** — total / successful / failed runs, average duration
- **Pipeline History** — last 10 runs, click to expand jobs
- **Live auto-refresh** every 60 seconds

## Architecture

```
GitHub Push
   ↓
GitHub Actions
   ├── Lint → Validate Data → Train (CV F1 ≥ 0.70) → Test
   ├── Build API image → push to ACR
   ├── Build Dashboard image → push to ACR
   ├── Deploy API to Azure Container Instances
   ├── Deploy Dashboard to Azure Container Instances
   └── Generate version report
            ↓
   Azure Container Registry (sarafanujayacr.azurecr.io)
            ↓
   Dashboard (Next.js) fetches:
   ├── GitHub Actions API → live pipeline status
   ├── Azure container FQDN → live API health
   └── MLflow run ID → version metadata
```

## Local Development

### Run the full stack
```powershell
docker compose up -d
# API → http://localhost:8000
# Dashboard → http://localhost:3000
# Prometheus → http://localhost:9090
# Grafana → http://localhost:3001
```

### Run only the dashboard
```powershell
cd dashboard
npm install
npm run dev
# http://localhost:3000
```

### Run only the API
```powershell
pip install -r requirements-docker.txt
python src/generate_dataset.py
python src/train.py
uvicorn api.main:app --reload
# http://localhost:8000
```

## Testing

### Local API integration test
```powershell
docker compose up -d
python test_api_and_monitoring.py
```

### Test the dashboard
```powershell
cd dashboard
npm run dev
# open http://localhost:3000
# check the Network tab for /api/workflows responses
```

### Test the pipeline
```powershell
git commit --allow-empty -m "Trigger pipeline"
git push origin main
# Check: https://github.com/Anujay-Saraf/Realtime-MLOPs/actions
```

## See Also

- [`AZURE_SETUP.md`](AZURE_SETUP.md) — full Azure setup
- [`CICD_SETUP_GUIDE.md`](CICD_SETUP_GUIDE.md) — pipeline architecture & troubleshooting
- [`dashboard/README.md`](dashboard/README.md) — dashboard architecture
