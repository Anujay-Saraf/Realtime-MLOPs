
# -*- coding: utf-8 -*-
import requests
import time
import sys
from datetime import datetime


def print_header(text):
    print(chr(10) + '='*70)
    print(' ' + text)
    print('='*70)


def print_section(text):
    print(chr(10) + '-'*70)
    print(' ' + text)
    print('-'*70)


def test_health():
    print_section('Testing Health Endpoint')
    try:
        r = requests.get('http://localhost:8000/health', timeout=5)
        print('  Status:', r.status_code)
        print('  Response:', r.json())
        if r.status_code == 200 and r.json()['status'] == 'healthy':
            print('  [OK] Health endpoint working')
            return True
    except Exception as e:
        print('  [ERROR]', e)
    return False


def test_predictions():
    print_section('Testing Predictions')
    cases = [
        ('Low Risk', {'region':'North','channel':'Online','service_type':'Fiber','plan_type':'Premium','customer_type':'New','address_verified':1,'network_available':1,'inventory_available':1,'credit_check_passed':1,'installation_required':0,'monthly_charge':89.99,'previous_failed_orders':0}),
        ('High Risk', {'region':'South','channel':'Phone','service_type':'DSL','plan_type':'Basic','customer_type':'New','address_verified':0,'network_available':0,'inventory_available':0,'credit_check_passed':0,'installation_required':1,'monthly_charge':49.99,'previous_failed_orders':3})
    ]
    ok = True
    for name, data in cases:
        try:
            r = requests.post('http://localhost:8000/predict', json=data, timeout=10)
            print('  ' + name + ': ' + str(r.json()))
            if r.status_code != 200: ok = False
        except Exception as e:
            print('  [ERROR]', e)
            ok = False
    return ok


def generate_predictions(n=20):
    import random
    print_section('Generating ' + str(n) + ' Predictions')
    regions = ['North','South','East','West']
    channels = ['Online','Store','Phone']
    services = ['Fiber','5G','DSL']
    plans = ['Basic','Standard','Premium']
    customers = ['New','Existing']
    success = 0
    for i in range(n):
        data = {'region':random.choice(regions),'channel':random.choice(channels),'service_type':random.choice(services),'plan_type':random.choice(plans),'customer_type':random.choice(customers),'address_verified':random.randint(0,1),'network_available':random.randint(0,1),'inventory_available':random.randint(0,1),'credit_check_passed':random.randint(0,1),'installation_required':random.randint(0,1),'monthly_charge':round(random.uniform(40,200),2),'previous_failed_orders':random.randint(0,3)}
        try:
            r = requests.post('http://localhost:8000/predict', json=data, timeout=10)
            if r.status_code == 200:
                result = r.json()
                print('  [' + str(i+1) + '/' + str(n) + '] ' + result['result'] + ' (P:' + str(round(result['pass_probability'],2)) + ' F:' + str(round(result['fail_probability'],2)) + ')')
                success += 1
            time.sleep(0.1)
        except Exception as e:
            print('  [ERROR]', e)
    print('  Generated: ' + str(success) + '/' + str(n))
    return success >= n * 0.8


def test_metrics():
    print_section('Testing Prometheus Metrics')
    try:
        r = requests.get('http://localhost:8000/metrics', timeout=5)
        print('  Status:', r.status_code)
        text = r.text
        for m in ['order_predictions_total', 'http_requests_total']:
            if m in text:
                print('  [OK] Found:', m)
            else:
                print('  [MISSING]:', m)
        return True
    except Exception as e:
        print('  [ERROR]', e)
    return False


def test_prom_server():
    print_section('Testing Prometheus Server')
    try:
        r = requests.get('http://localhost:9090/-/healthy', timeout=5)
        print('  Health:', r.status_code)
        if r.status_code == 200:
            print('  [OK] Prometheus healthy')
            return True
    except Exception as e:
        print('  [ERROR]', e)
    return False


def test_prom_targets():
    print_section('Testing Prometheus Targets')
    try:
        r = requests.get('http://localhost:9090/api/v1/targets', timeout=5)
        data = r.json()
        targets = data['data']['activeTargets']
        print('  Targets:', len(targets))
        for t in targets:
            print('    - ' + t['labels']['job'] + ': ' + t['health'])
        return len(targets) > 0
    except Exception as e:
        print('  [ERROR]', e)
    return False


def test_grafana():
    print_section('Testing Grafana')
    try:
        r = requests.get('http://localhost:3000/api/health', timeout=5)
        if r.status_code == 200:
            print('  [OK] Grafana accessible')
            print('  Version:', r.json().get('version'))
            return True
    except Exception as e:
        print('  [ERROR]', e)
    return False


def main():
    print_header('API AND MONITORING TEST SUITE')
    print('Started:', datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    
    results = {}
    results['API Health'] = test_health()
    results['API Predictions'] = test_predictions()
    results['Metrics Endpoint'] = test_metrics()
    results['Generate Predictions'] = generate_predictions(20)
    
    print(chr(10) + 'Waiting 5s for metrics scrape...')
    time.sleep(5)
    
    results['Prometheus'] = test_prom_server()
    results['Prom Targets'] = test_prom_targets()
    results['Grafana'] = test_grafana()
    
    print_header('TEST SUMMARY')
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    print(chr(10) + '  Total: ' + str(total) + ' | Passed: ' + str(passed) + ' | Failed: ' + str(total - passed))
    print(chr(10) + '  Service URLs:')
    print('    API:        http://localhost:8000')
    print('    API Docs:   http://localhost:8000/docs')
    print('    Prometheus: http://localhost:9090')
    print('    Grafana:    http://localhost:3000 (admin/admin)')
    print('='*70)
    sys.exit(0 if passed == total else 1)

main()
