# CI/CD Setup Guide - GitHub Actions

## Overview

This guide explains how to set up the MLOps pipeline with GitHub Actions for automatic testing and deployment of new models.

## GitHub Repository

**Repository:** https://github.com/Anujay-Saraf/Realtime-MLOPs

## Pipeline Stages

The CI/CD pipeline automatically runs through 6 stages:

### 1. **Lint** - Code Quality Checks
- Runs Python linting (flake8)
- Checks code formatting (black)
- Verifies import sorting (isort)

### 2. **Validate Data** - Data Schema Validation
- Checks training data schema
- Generates sample data if missing
- Validates data quality

### 3. **Train Model** - Model Training with K-Fold CV
- Trains model with 5-fold cross-validation
- Checks quality gate (F1 Score >= 0.70)
- Uploads trained model as artifact

### 4. **Test** - Comprehensive Testing
- Runs unit tests (pytest)
- Runs integration tests
- Tests full Docker stack (API + Prometheus + Grafana)

### 5. **Build & Push** - Docker Image Build
- Builds Docker image with new model
- Pushes to GitHub Container Registry (ghcr.io)
- Tags with commit SHA and version

### 6. **Deploy** - Automatic Deployment
- **Staging**: Deploys on develop branch
- **Production**: Deploys on main branch

## How It Works

### When you push code:
1. Code goes to GitHub
2. GitHub Actions automatically triggers
3. Pipeline runs all stages
4. Model is trained and tested
5. If successful, Docker image is built
6. Image is deployed to environment

### Workflow Triggers:

\\\yaml
on:
  push:
    branches: [main, develop]    # Auto-deploy on push
  pull_request:
    branches: [main]              # Test PRs
  workflow_dispatch:              # Manual trigger
\\\

## Setup Steps

### Step 1: Push Code to New Repository

\\\powershell
cd D:\mlopscompletepipeline

# Verify remote is set
git remote -v

# Add and commit new files
git add .github/workflows/
git add .gitignore 2>/dev/null
git commit -m "Add GitHub Actions CI/CD pipeline"

# Push to new repository
git push origin main
\\\

### Step 2: Configure GitHub Secrets

Go to: https://github.com/Anujay-Saraf/Realtime-MLOPs/settings/secrets/actions

Add these secrets:

| Secret Name | Description | Example |
|------------|-------------|---------|
| \GITHUB_TOKEN\ | Auto-provided | (automatic) |
| \AZURE_CREDENTIALS\ | Azure service principal JSON | \{...}\ |
| \ACR_USERNAME\ | Container registry username | \yourusername\ |
| \ACR_PASSWORD\ | Container registry password | \yourpassword\ |

### Step 3: Enable GitHub Container Registry

1. Go to: https://github.com/Anujay-Saraf/Realtime-MLOPs/settings/packages
2. Enable "Container registry"
3. Make package public (optional)

### Step 4: Create Azure Resources (For Deployment)

\\\powershell
# Login to Azure
az login

# Create resource group
az group create --name mlops-rg-prod --location eastus

# Create container registry
az acr create --resource-group mlops-rg-prod --name mlopsregistry --sku Basic
az acr update -n mlopsregistry --admin-enabled true

# Get credentials
az acr credential show --name mlopsregistry
\\\

## Testing New Model Deployment

### Method 1: Automatic (Recommended)

1. **Update model code** in \src/train.py\
2. **Commit and push**:
   \\\powershell
   git add .
   git commit -m "Improve model with new features"
   git push origin main
   \\\
3. **Check pipeline**: https://github.com/Anujay-Saraf/Realtime-MLOPs/actions
4. **Wait for completion** (~5-10 minutes)
5. **Model is auto-deployed** to production

### Method 2: Manual Trigger

1. Go to: https://github.com/Anujay-Saraf/Realtime-MLOPs/actions
2. Click "MLOps Pipeline"
3. Click "Run workflow"
4. Select branch and click "Run"
5. Pipeline runs with manual trigger

## Monitoring the Pipeline

### View Pipeline Status
- URL: https://github.com/Anujay-Saraf/Realtime-MLOPs/actions
- Shows all runs, logs, and artifacts

### Download Artifacts
- Trained model: Available for 30 days
- Test results: Available for 30 days
- Model card: Available for 90 days

### Check Deployment
- **API Health**: http://your-azure-url:8000/health
- **API Docs**: http://your-azure-url:8000/docs
- **Prometheus**: http://your-azure-url:9090
- **Grafana**: http://your-azure-url:3000

## Pipeline Flow Diagram

\\\
Code Push → Lint → Validate Data → Train Model → Test → Build → Deploy
                                    ↓
                              Quality Gate Check
                                    ↓
                            F1 Score >= 0.70?
                            /              \\
                          Yes              No
                          /                  \\
                    Build Image          Pipeline Fails
                          ↓
                    Push to Registry
                          ↓
                  Deploy to Environment
\\\

## Quality Gates

The pipeline enforces these quality standards:

| Metric | Minimum | Purpose |
|--------|---------|---------|
| F1 Score | >= 0.70 | Model performance |
| Test Coverage | >= 70% | Code quality |
| Linting | Pass | Code style |
| Data Validation | Pass | Data quality |

## Rollback Strategy

If a new model performs poorly in production:

\\\powershell
# Option 1: Revert to previous commit
git revert <commit-sha>
git push origin main

# Option 2: Deploy specific version
docker pull ghcr.io/anujay-saraf/order-prediction-api:<previous-tag>
# Deploy this specific version

# Option 3: Manual rollback via Azure
az container delete --name order-api --resource-group mlops-rg-prod
az container create --image <previous-image> ...
\\\

## Best Practices

1. **Never commit large model files** - Use DVC or cloud storage
2. **Test locally first** - Run tests before pushing
3. **Use feature branches** - Develop in \develop\, merge to \main\
4. **Monitor metrics** - Check Grafana after deployment
5. **Document changes** - Update model card
6. **Version models** - Use semantic versioning for releases

## Troubleshooting

### Pipeline fails at training stage:
- Check training data exists
- Verify Python dependencies in requirements.txt
- Check MLflow server accessibility

### Docker build fails:
- Verify Dockerfile syntax
- Check model file is included
- Verify base image accessibility

### Deployment fails:
- Check Azure credentials
- Verify resource group exists
- Check container registry access

## Next Steps

1. Set up Azure account and resources
2. Configure GitHub secrets
3. Push code to new repository
4. Trigger first pipeline run
5. Monitor and iterate
