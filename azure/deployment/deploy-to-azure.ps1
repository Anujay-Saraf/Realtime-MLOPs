# Azure Container Instances Deployment for Free Tier
# Resource Group: FREE_TIER_USAGE
# This YAML defines the deployment to Azure Container Instances

$resourceGroup = "mlops-rg-free"
$location = "eastus"  # Free tier available region
$containerGroupName = "order-prediction-api"
$imageName = "order-prediction-api:latest"
$acrServer = "mlopsregistry.azurecr.io"

# Login to Azure
Write-Host "=== Azure MLOps Pipeline Deployment ===" -ForegroundColor Cyan
Write-Host "Logging into Azure..."
az login

# Create Resource Group
Write-Host "Creating Resource Group..."
az group create --name $resourceGroup --location $location

# Create Azure Container Registry
Write-Host "Creating Azure Container Registry..."
az acr create --resource-group $resourceGroup --name mlopsregistry --sku Basic

# Login to ACR
Write-Host "Logging into ACR..."
az acr login --name mlopsregistry

# Tag the image
docker tag $imageName mlopsregistry.azurecr.io/$imageName

# Push to ACR
Write-Host "Pushing image to Azure Container Registry..."
docker push mlopsregistry.azurecr.io/$imageName

# Deploy to Container Instances
Write-Host "Deploying to Azure Container Instances..."
az container create --resource-group $resourceGroup --name $containerGroupName --image mlopsregistry.azurecr.io/$imageName --cpu 1 --memory 1 --registry-login-server mlopsregistry.azurecr.io --registry-username mlopsregistry --registry-password $(az acr credential show --name mlopsregistry --query passwords[0].value -o tsv) --ip-address public --ports 8000

Write-Host "=== Deployment Complete ===" -ForegroundColor Green
Write-Host "API available at: http://$(az container show --resource-group $resourceGroup --name $containerGroupName --query ipAddress.ip -o tsv):8000"
