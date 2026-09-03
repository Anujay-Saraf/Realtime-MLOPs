FROM python:3.11-slim

WORKDIR /app

COPY requirements-docker.txt .

# Bump pip + use very generous timeout/retries so large wheels (scipy ~35MB,
# scikit-learn ~30MB) don't fail on the slow GitHub Actions network.
# 600s timeout + 5 retries handles intermittent pip.ReadTimeoutError.
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --default-timeout=600 --retries 5 -r requirements-docker.txt

COPY api ./api

# Ensure models dir exists in the image; the model is downloaded as a
# CI artifact by the train job and placed here before this build runs.
COPY models ./models

EXPOSE 8000

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
