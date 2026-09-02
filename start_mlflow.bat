@echo off
REM MLflow Tracking Server Starter
REM This starts the MLflow UI in a separate terminal

echo.
echo ========================================
echo Starting MLflow Tracking Server...
echo ========================================
echo.
echo MLflow UI will be available at:
echo   http://127.0.0.1:5000
echo.
echo Press Ctrl+C to stop the server
echo.
echo ========================================
echo.

cd /d D:\mlopscompletepipeline

REM Start MLflow server with SQLite backend
mlflow ui --backend-store-uri sqlite:///mlflow.db --port 5000

pause
