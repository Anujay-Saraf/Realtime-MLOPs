.PHONY: help train data up down logs test clean rebuild api-shell dashboard-shell

# ============================================================
# MLOps Pipeline — Local Development Makefile
# ============================================================
# Usage: make <target>
#   make help      - show this message
#   make data      - generate synthetic training data
#   make train     - train the model (saves to models/)
#   make up        - build + start full Docker stack
#   make down      - stop the stack
#   make logs      - tail logs from all services
#   make test      - run API integration tests
#   make clean     - remove built images and volumes
#   make rebuild   - clean rebuild from scratch
# ============================================================

help:
	@echo "MLOps Pipeline - Make targets:"
	@echo "  make data     - generate synthetic training data"
	@echo "  make train    - train the model (saves to models/)"
	@echo "  make up       - build + start full Docker stack"
	@echo "  make down     - stop the stack"
	@echo "  make logs     - tail logs from all services"
	@echo "  make test     - run API integration tests"
	@echo "  make clean    - remove built images and volumes"
	@echo "  make rebuild  - clean rebuild from scratch"

# 1. Generate training data
data:
	python src/generate_dataset.py

# 2. Train the model (requires data to exist)
train: data
	pip install -q -r requirements.txt
	python src/train.py

# 3. Start everything (assumes model exists in models/)
up:
	@if [ ! -f models/model_a_random_forest.joblib ]; then \
		echo "ERROR: No model found. Run 'make train' first."; \
		exit 1; \
	fi
	docker compose up -d --build

# 4. Stop everything
down:
	docker compose down

# 5. Tail logs
logs:
	docker compose logs -f

# 6. Run integration tests
test:
	@echo "Waiting for API to be ready..."
	@for i in $$(seq 1 30); do \
		curl -sf http://localhost:8000/health > /dev/null && break; \
		sleep 2; \
	done
	PYTHONIOENCODING=utf-8 python test_api_and_monitoring.py

# 7. Clean up
clean:
	docker compose down -v
	rm -rf models/*.joblib
	rm -rf data/orders.csv

# 8. Full rebuild from scratch
rebuild: clean train up
