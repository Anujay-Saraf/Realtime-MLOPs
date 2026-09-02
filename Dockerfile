FROM python:3.11-slim

WORKDIR /app

COPY requirements-docker.txt .

RUN pip install --no-cache-dir -r requirements-docker.txt

COPY api ./api

# Ensure models dir exists in the image; the model is downloaded as a
# CI artifact by the train job and placed here before this build runs.
COPY models ./models

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
