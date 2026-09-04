# CI/CD Setup Guide

> **📖 The authoritative guide is [DEPLOYMENT.md](DEPLOYMENT.md).**
> Read that for the full cost strategy, Azure setup, secrets list, update workflow,
> and a record of every bug we hit. This file summarizes the pipeline stages.

## Overview

The MLOps pipeline runs on **GitHub Actions** (free tier: 2,000 min/month) and
deploys to **Azure Container Instances** (~$24/month total). The complete guide
with cost breakdown is in [DEPLOYMENT.md §1](DEPLOYMENT.md#1-cost-strategy--what-runs-where).

## Pipeline Stages

The pipeline has **9 jobs** that run in sequence:

```
push to main
  │
  ├─ lint                  ~30s      Code quality (flake8, black, isort)
  ├─ validate-data         ~20s      Data schema + class distribution check
  ├─ train-model           ~3-5 min  Trains Model A (RF) + Model B (GB)
  │   └─ quality gate: CV F1 >= 0.68  (FAIL → pipeline stops)
  ├─ test                  ~1-2 min   pytest (no Docker in CI)
  ├─ build-api             ~2-3 min   API Docker image → Azure Container Registry
  ├─ build-dashboard       ~1-2 min   Dashboard Docker image → ACR
  ├─ deploy-api            ~1-2 min   Azure Container Instance + health poll
  ├─ deploy-dashboard      ~1-2 min   Dashboard ACI + prints URL
  └─ generate-report       ~5s        MODEL_VERSION_REPORT.md artifact
```

**Total: ~10–15 min per push.**

## Workflow Triggers

```yaml
on:
  push:
    branches: [main]        # Auto-deploy on push to main
    tags: ['v*']            # Versioned releases
  pull_request:
    branches: [main]        # Test PRs before merge
  workflow_dispatch:         # Manual trigger from GitHub UI
```

## Model Versions

The pipeline trains **two models**:

| Model | Algorithm | File | CV F1 (target) |
|---|---|---|---|
| Model A | RandomForestClassifier | `model_a_random_forest.joblib` | >= 0.68 |
| Model B | GradientBoostingClassifier | `model_b_gradient_boosting.joblib` | >= 0.68 |

Each model gets a `.meta.json` sidecar (algorithm, hyperparameters, CV scores, dataset SHA)
that the dashboard displays in the metadata panel.

## GitHub Secrets (required)

| Secret | Where it comes from | Purpose |
|---|---|---|
| `ACR_USERNAME` | `az acr credential show` | Docker push to ACR |
| `ACR_PASSWORD` | `az acr credential show` | Docker push to ACR |
| `AZURE_CLIENT_ID` | Service principal `mlops-github-actions` app ID | OIDC login |
| `AZURE_TENANT_ID` | `az account show` | OIDC login |
| `AZURE_SUBSCRIPTION_ID` | `az account show` | OIDC login |
| `NEXT_PUBLIC_GITHUB_REPO` | `${owner}/${repo}` | Dashboard reads workflow runs |

Full setup instructions: [DEPLOYMENT.md §3](DEPLOYMENT.md#3-one-time-github-setup-secrets)

## Quality Gate

Before deploying, the model must pass:
- **CV F1 (mean across 5 folds) >= 0.68**

If the gate fails, the pipeline stops at the `train-model` job. No images are built or deployed.

## Artifacts

| Artifact | Contents | Retention |
|---|---|---|
| `trained-models` | `.joblib` + `.meta.json` for both models | 30 days |
| `training-logs` | Full training output log | 30 days |
| `model-version-report` | Markdown report with CV scores, commit, URLs | 90 days |

## Manual Deployment

To deploy without changing code:

1. Go to https://github.com/Anujay-Saraf/Realtime-MLOPs/actions
2. Click **MLOps Pipeline**
3. Click **Run workflow** → select `main` → **Run**

## Rollback

**Preferred:** Revert the bad commit and push:
```bash
git revert <bad-commit-sha>
git push origin main
```

The pipeline will train a new model, deploy it, and the bad version is gone.

**Alternative:** Delete the containers (stops charges) or redeploy a specific
previous image SHA. See [DEPLOYMENT.md §7](DEPLOYMENT.md#7-rollback--teardown).

## Monitoring

- **Pipeline:** https://github.com/Anujay-Saraf/Realtime-MLOPs/actions
- **API health:** `http://<orderapi-fqdn>/health`
- **API docs:** `http://<orderapi-fqdn>/docs`
- **Dashboard:** `http://<mlopsdash-fqdn>` — A/B testing UI, pipeline history, model metadata panel

## Local Development

```powershell
cd d:\mlopscompletepipeline

# First time: train models
python src/generate_dataset.py
python src/train.py

# Start everything
docker compose up -d

# Run tests (no Docker)
pytest tests/ -v

# Run integration tests (requires API running)
python test_api_and_monitoring.py
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `Quality gate failed` | Increase dataset size, tune hyperparameters in `src/train.py` |
| `docker/login-action` failed | Check `ACR_USERNAME` and `ACR_PASSWORD` are in GitHub secrets |
| `azure/login` failed | Check OIDC service principal and federated credential exist in Azure |
| Dashboard shows "No models" | Verify `NEXT_PUBLIC_API_BASE_URL` points to the API FQDN |
| Deploy says "not healthy" | Cold start of 130MB model takes ~30s — check `az container logs` |

Full troubleshooting: [DEPLOYMENT.md §8](DEPLOYMENT.md#8-bugs-we-hit--how-this-guide-prevents-them)
