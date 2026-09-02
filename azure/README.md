# Azure MLOps Pipeline Deployment Guide

Complete guide to deploy the MLOps Pipeline to Azure Free Tier.

## Azure Free Tier Resources Used

| Service | Free Tier Limit | Configuration |
|---------|-----------------|---------------|
| Azure Container Registry | 100 GB storage | Basic SKU (Free) |
| Azure Container Instances | 180,000 vCPU-seconds/month | 1 vCPU, 1 GB RAM |
| App Service | 10 Web Apps (Free) | Alternative deployment |
| Azure Pipelines | 10 free parallel jobs | CI/CD |

## Prerequisites Installation

### 1. Install Docker Desktop (Local)
Download from: https://www.docker.com/products/docker-desktop
- Run installer
- Restart computer
- Verify: `docker --version`

### 2. Install Azure CLI
Download from: https://aka.ms/installazurecliwindows
Or use: `winget install Microsoft.AzureCLI`

### 3. Install DVC (for data versioning)
`pip install dvc`

## Quick Deployment Steps

### Step 1: Local Testing
```
# Navigate to project
cd D:\mlopscompletepipeline

# Build Docker image
docker build -t order-prediction-api .

# Test locally
docker run -p 8000:8000 order-prediction-api

# Test API
curl http://localhost:8000/health
```

### Step 2: Run Docker Compose (Full Stack)
```
docker-compose up -d
```

Access:
- API: http://localhost:8000
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000

### Step 3: Deploy to Azure
```
# Login to Azure
az login

# Create resource group
az group create --name mlops-rg-free --location eastus

# Create container registry
az acr create --resource-group mlops-rg-free --name mlopsregistry --sku Basic

# Login to registry
az acr login --name mlopsregistry

# Tag and push image
docker tag order-prediction-api:latest mlopsregistry.azurecr.io/order-prediction-api:latest
docker push mlopsregistry.azurecr.io/order-prediction-api:latest

# Deploy to Container Instances
az container create `
  --resource-group mlops-rg-free `
  --name order-prediction-api `
  --image mlopsregistry.azurecr.io/order-prediction-api:latest `
  --cpu 1 --memory 1 `
  --registry-login-server mlopsregistry.azurecr.io `
  --registry-username mlopsregistry `
  --registry-password $(az acr credential show --name mlopsregistry --query passwords[0].value -o tsv) `
  --ip-address public `
  --ports 8000
```

## Pipeline Architecture

### Local Development
- FastAPI serves predictions on port 8000
- Prometheus collects metrics on port 9090
- Grafana visualizes metrics on port 3000

### Azure Production
- Container Registry stores Docker images
- Container Instances runs the API
- Public IP exposes port 8000

## CI/CD with Azure Pipelines

The `azure-pipelines.yml` provides:
- Automated builds on code changes
- Image versioning with build IDs
- Automatic deployment to Azure Container Instances

## Monitoring

### Prometheus Metrics
- `order_predictions_total` - Total predictions
- `order_predictions_total{result="PASS"}` - Pass predictions
- `order_predictions_total{result="FAIL"}` - Fail predictions
- API request metrics (latency, status codes)

### MLflow Tracking
- `mlflow.db` contains all experiment data
- Run `mlflow ui` to view experiment history

## Free Tier Considerations

1. **Container Instances** - 180,000 vCPU-seconds/month
   - 1 vCPU = 1 second per second running
   - ~51 hours of continuous running per month
   
2. **Container Registry** - 100 GB storage (Free for 12 months)
   - Each image ~500 MB
   - Plenty of room for this pipeline

3. **Always-free Resources**:
   - App Service F1 (10 apps)
   - Container Instances (limited)
   - Functions (1M executions/month)

## Cleanup

To delete all resources and stop charges:
```
az group delete --name mlops-rg-free --yes --no-wait
```

## Troubleshooting

### Common Issues
1. **Docker not running**: Start Docker Desktop
2. **ACR login fails**: Run `az acr login --name mlopsregistry`
3. **Image pull error**: Verify image name and registry credentials
4. **Port conflict**: Stop local services or change port mappings
