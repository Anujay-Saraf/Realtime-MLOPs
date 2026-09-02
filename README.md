# Real-Time MLOps Pipeline - Order Prediction API

[![MLOps Pipeline](https://github.com/Anujay-Saraf/Realtime-MLOPs/actions/workflows/mlops-pipeline.yml/badge.svg)](https://github.com/Anujay-Saraf/Realtime-MLOPs/actions)

Complete MLOps pipeline for predicting order success/failure using Machine Learning with automated CI/CD, monitoring, and deployment.

## Features

- **Machine Learning Model**: Random Forest with 5-Fold Cross-Validation
- **REST API**: FastAPI with automatic documentation
- **CI/CD Pipeline**: GitHub Actions for automated testing and deployment
- **Monitoring**: Prometheus metrics + Grafana dashboards
- **Containerization**: Docker + Docker Compose
- **Model Versioning**: MLflow integration
- **Data Versioning**: DVC integration
- **Quality Gates**: Automated F1 score validation (>= 0.70)

## Architecture

\\\
Data → Training (K-Fold CV) → Model → API → Predictions
                                  ↓
                            MLflow Tracking
                                  ↓
                            Docker Image
                                  ↓
                        GitHub Container Registry
                                  ↓
                    Azure Container Instances
                                  ↓
                    Prometheus + Grafana Monitoring
\\\

## Quick Start

### Local Development

\\\powershell
# Clone repository
git clone https://github.com/Anujay-Saraf/Realtime-MLOPs.git
cd Realtime-MLOPs

# Generate sample data
python src/generate_dataset.py

# Train model
python src/train.py

# Run with Docker Compose
docker-compose up -d

# Test API
curl http://localhost:8000/health
\\\

### Access Services

- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (admin/admin)
- **MLflow**: Run \python start_mlflow.py\ and visit http://127.0.0.1:5000

## Model Performance

- **Algorithm**: Random Forest (500 estimators)
- **Cross-Validation**: 5-Fold Stratified
- **Quality Gate**: F1 Score >= 0.70
- **Metrics Tracked**: Accuracy, Precision, Recall, F1, ROC-AUC

## CI/CD Pipeline

Automated pipeline runs on every push:

1. **Lint** - Code quality checks
2. **Validate Data** - Data schema validation
3. **Train Model** - K-Fold CV with quality gate
4. **Test** - Unit + integration tests
5. **Build** - Docker image build
6. **Deploy** - Auto-deploy to staging/production

See [CICD_SETUP_GUIDE.md](CICD_SETUP_GUIDE.md) for detailed setup instructions.

## API Usage

### Health Check
\\\ash
curl http://localhost:8000/health
\\\

### Make Prediction
\\\ash
curl -X POST http://localhost:8000/predict \\
  -H \"Content-Type: application/json\" \\
  -d '{
    \"region\": \"North\",
    \"channel\": \"Online\",
    \"service_type\": \"Fiber\",
    \"plan_type\": \"Premium\",
    \"customer_type\": \"New\",
    \"address_verified\": 1,
    \"network_available\": 1,
    \"inventory_available\": 1,
    \"credit_check_passed\": 1,
    \"installation_required\": 0,
    \"monthly_charge\": 89.99,
    \"previous_failed_orders\": 0
  }'
\\\

### Response
\\\json
{
  \"prediction\": 0,
  \"result\": \"PASS\",
  \"pass_probability\": 0.99,
  \"fail_probability\": 0.01
}
\\\

## Project Structure

\\\
.
├── api/                    # FastAPI application
│   └── main.py
├── src/                    # Training scripts
│   ├── train.py           # Model training with K-Fold CV
│   ├── generate_dataset.py # Data generation
│   └── validate_data.py   # Data validation
├── tests/                  # Unit tests
├── models/                 # Trained models (DVC tracked)
├── data/                   # Training data (DVC tracked)
├── monitoring/             # Prometheus config
├── .github/workflows/      # CI/CD pipelines
├── docker-compose.yml      # Full stack deployment
├── Dockerfile              # API container
└── requirements*.txt       # Python dependencies
\\\

## Monitoring

### Prometheus Metrics
- \order_predictions_total\ - Total predictions by result
- \http_requests_total\ - API request count
- \http_request_duration_seconds\ - API latency

### Grafana Dashboards
1. **API Performance**: Request rate, latency, errors
2. **Model Predictions**: PASS/FAIL distribution
3. **System Health**: Resource utilization

## Deployment

### Deploy New Model

\\\powershell
# Update model code
# Edit src/train.py or data

# Commit and push
git add .
git commit -m \"Deploy new model version\"
git push origin main

# Pipeline automatically:
# 1. Trains new model
# 2. Validates quality
# 3. Builds Docker image
# 4. Deploys to environment
\\\

## Contributing

1. Fork the repository
2. Create feature branch (\git checkout -b feature/improvement\)
3. Commit changes (\git commit -m 'Add improvement'\)
4. Push to branch (\git push origin feature/improvement\)
5. Open Pull Request

## License

MIT License

## Contact

**Repository**: anujay.ds@gmail.com
