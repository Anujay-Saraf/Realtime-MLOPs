# -*- coding: utf-8 -*-
"""
Start MLflow Tracking Server
Run this in a separate terminal: python start_mlflow.py
"""

import subprocess
import sys
import os

print('='*70)
print(' STARTING MLFLOW TRACKING SERVER')
print('='*70)
print(' MLflow UI will be available at: http://127.0.0.1:5000')
print(' Press Ctrl+C to stop the server')
print('='*70)
print()

# Change to project directory
os.chdir(r'D:\\mlopscompletepipeline')

# Start MLflow server
try:
    subprocess.run([
        'mlflow', 'ui',
        '--backend-store-uri', 'sqlite:///mlflow.db',
        '--port', '5000',
        '--host', '127.0.0.1'
    ])
except KeyboardInterrupt:
    print('\nMLflow server stopped.')
except FileNotFoundError:
    print('ERROR: mlflow command not found.')
    print('Install with: pip install mlflow')
    sys.exit(1)
