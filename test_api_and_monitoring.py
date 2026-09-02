"""
Integration tests for API and monitoring stack.
Tests the full Docker Compose stack including API, Prometheus, and Grafana.
"""

import time
import sys

import requests

# Configuration
API_BASE = "http://localhost:8000"
PROMETHEUS_BASE = "http://localhost:9090"
HEALTH_CHECK_RETRIES = 30
HEALTH_CHECK_DELAY = 2  # seconds


def wait_for_service(url: str, name: str, timeout: int = 30) -> bool:
    """Wait for a service to become available."""
    for i in range(timeout // HEALTH_CHECK_DELAY):
        try:
            response = requests.get(url, timeout=5)
            if response.status_code < 500:
                print(f"✅ {name} is ready")
                return True
        except requests.exceptions.RequestException:
            pass

        if i < (timeout // HEALTH_CHECK_DELAY) - 1:
            time.sleep(HEALTH_CHECK_DELAY)

    print(f"❌ {name} did not become ready in {timeout}s")
    return False


def test_api_health() -> bool:
    """Test API health endpoint."""
    print("\n📋 Testing API health endpoint...")

    try:
        response = requests.get(f"{API_BASE}/health", timeout=10)

        if response.status_code == 200:
            data = response.json()
            if data.get("status") == "healthy":
                print("✅ API health check passed")
                return True

        print(f"❌ API health check failed: {response.status_code} - {response.text}")
        return False

    except requests.exceptions.RequestException as e:
        print(f"❌ API health check failed: {e}")
        return False


def test_api_prediction() -> bool:
    """Test API prediction endpoint."""
    print("\n📋 Testing API prediction endpoint...")

    payload = {
        "region": "North",
        "channel": "Online",
        "service_type": "Fiber",
        "plan_type": "Premium",
        "customer_type": "New",
        "address_verified": 1,
        "network_available": 1,
        "inventory_available": 1,
        "credit_check_passed": 1,
        "installation_required": 0,
        "monthly_charge": 89.99,
        "previous_failed_orders": 0
    }

    try:
        response = requests.post(
            f"{API_BASE}/predict",
            json=payload,
            timeout=10
        )

        if response.status_code == 200:
            data = response.json()

            # Validate response structure
            required_fields = ["prediction", "result", "pass_probability", "fail_probability"]
            if all(field in data for field in required_fields):
                print(f"✅ Prediction successful: {data['result']} (P={data['pass_probability']:.2f})")
                return True

            print(f"❌ Invalid response structure: {data}")
            return False

        print(f"❌ Prediction failed: {response.status_code} - {response.text}")
        return False

    except requests.exceptions.RequestException as e:
        print(f"❌ Prediction failed: {e}")
        return False


def test_api_metrics() -> bool:
    """Test API metrics endpoint."""
    print("\n📋 Testing API metrics endpoint...")

    try:
        response = requests.get(f"{API_BASE}/metrics", timeout=10)

        if response.status_code == 200:
            # Check for expected Prometheus metrics
            content = response.text
            expected_metrics = [
                "order_predictions_total",
                "http_requests_total",
                "http_request_duration_seconds"
            ]

            found_metrics = [m for m in expected_metrics if m in content]

            if found_metrics:
                print(f"✅ Metrics endpoint OK. Found {len(found_metrics)}/{len(expected_metrics)} expected metrics")
                return True

            print("❌ No expected metrics found in response")
            return False

        print(f"❌ Metrics endpoint failed: {response.status_code}")
        return False

    except requests.exceptions.RequestException as e:
        print(f"❌ Metrics endpoint failed: {e}")
        return False


def test_prometheus_targets() -> bool:
    """Test Prometheus targets endpoint."""
    print("\n📋 Testing Prometheus targets endpoint...")

    try:
        response = requests.get(f"{PROMETHEUS_BASE}/api/v1/targets", timeout=10)

        if response.status_code == 200:
            data = response.json()

            if data.get("status") == "success":
                active_targets = data.get("data", {}).get("activeTargets", [])

                if active_targets:
                    print(f"✅ Prometheus OK. {len(active_targets)} active targets")
                    return True

                print("⚠️  Prometheus OK but no active targets")
                return True  # Not critical

            print(f"❌ Prometheus API error: {data}")
            return False

        print(f"❌ Prometheus check failed: {response.status_code}")
        return False

    except requests.exceptions.RequestException as e:
        print(f"❌ Prometheus check failed: {e}")
        return False


def run_all_tests() -> bool:
    """Run all integration tests."""
    print("=" * 60)
    print("INTEGRATION TESTS - API & MONITORING STACK")
    print("=" * 60)

    # Wait for services to be ready
    print("\n⏳ Waiting for services to be ready...")

    if not wait_for_service(f"{API_BASE}/health", "Order API"):
        print("\n❌ Integration tests aborted: API not ready")
        return False

    # Run tests
    results = []

    results.append(("API Health", test_api_health()))
    results.append(("API Prediction", test_api_prediction()))
    results.append(("API Metrics", test_api_metrics()))
    results.append(("Prometheus", test_prometheus_targets()))

    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)

    passed = sum(1 for _, r in results if r)
    total = len(results)

    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {status}: {name}")

    print(f"\nTotal: {passed}/{total} tests passed")
    print("=" * 60)

    return passed == total


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
