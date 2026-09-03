# API package
#
# Exposes two sub-routers (registered in api/main.py):
#   dataset  - POST /upload-dataset, GET /dataset/info
#   models   - GET  /models, GET /models/{name}, POST /predict/model
#
# The routers are intentionally NOT imported here to avoid eager loading.
# They are imported directly in api/main.py:
#     from . import dataset, models
#
# To use a router programmatically:
#     from api.dataset import router as dataset_router
#
