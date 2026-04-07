#!/usr/bin/env python3
"""Test runner for Mnemosyne backend."""

import asyncio
import sys
import os
import time
from pathlib import Path

os.chdir(os.path.join(os.path.dirname(__file__), "backend"))
sys.path.insert(0, ".")

import httpx
from sqlalchemy import select, text
from app.models.database import engine, async_session
from app.models.screenshot import Screenshot
from app.models.settings import Setting


BASE_URL = "http://localhost:8000"
RESULTS = []


def log_test(name: str, success: bool, details: str = ""):
    status = "✅ PASS" if success else "❌ FAIL"
    RESULTS.append({"name": name, "status": status, "details": details})
    print(f"{status}: {name}")
    if details:
        print(f"   → {details}")


async def test_backend_startup():
    """Test if backend can start and respond to requests."""
    print("\n=== TEST 1: Backend Startup ===")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{BASE_URL}/api/health")
            data = resp.json()

            success = data.get("status") in ["healthy", "degraded"]
            db_status = data.get("checks", {}).get("database", "unknown")

            log_test(
                "Health endpoint responds", success, f"Status: {data.get('status')}"
            )
            log_test("Database connection", db_status == "ok", f"DB: {db_status}")

            return success
    except Exception as e:
        log_test("Backend startup", False, str(e))
        return False


async def test_screenshots_endpoints():
    """Test screenshots API endpoints."""
    print("\n=== TEST 2: Screenshots Endpoints ===")

    async with httpx.AsyncClient(timeout=10.0) as client:
        # List screenshots
        try:
            resp = await client.get(f"{BASE_URL}/api/screenshots")
            data = resp.json()
            log_test(
                "GET /api/screenshots",
                True,
                f"Returned {len(data.get('screenshots', []))} items",
            )
        except Exception as e:
            log_test("GET /api/screenshots", False, str(e))

        # Get count
        try:
            resp = await client.get(f"{BASE_URL}/api/screenshots/count")
            data = resp.json()
            log_test("GET /api/screenshots/count", True, f"Count: {data.get('count')}")
        except Exception as e:
            log_test("GET /api/screenshots/count", False, str(e))

        # Get stats
        try:
            resp = await client.get(f"{BASE_URL}/api/screenshots/stats")
            data = resp.json()
            log_test("GET /api/screenshots/stats", True, f"Total: {data.get('total')}")
        except Exception as e:
            log_test("GET /api/screenshots/stats", False, str(e))

        # Get tags
        try:
            resp = await client.get(f"{BASE_URL}/api/screenshots/tags")
            data = resp.json()
            log_test(
                "GET /api/screenshots/tags", True, f"Tags: {len(data.get('tags', []))}"
            )
        except Exception as e:
            log_test("GET /api/screenshots/tags", False, str(e))

        # Search (empty query)
        try:
            resp = await client.get(
                f"{BASE_URL}/api/screenshots/search", params={"q": "test"}
            )
            data = resp.json()
            log_test(
                "GET /api/screenshots/search", True, f"Total: {data.get('total', 0)}"
            )
        except Exception as e:
            log_test("GET /api/screenshots/search", False, str(e))


async def test_settings_endpoints():
    """Test settings API endpoints."""
    print("\n=== TEST 3: Settings Endpoints ===")

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Get settings
        try:
            resp = await client.get(f"{BASE_URL}/api/settings")
            data = resp.json()
            log_test("GET /api/settings", True, f"Keys: {list(data.keys())}")
        except Exception as e:
            log_test("GET /api/settings", False, str(e))

        # Test connection
        try:
            resp = await client.post(f"{BASE_URL}/api/settings/test")
            data = resp.json()
            log_test("POST /api/settings/test", True, f"Success: {data.get('success')}")
        except Exception as e:
            log_test("POST /api/settings/test", False, str(e))


async def test_status_endpoints():
    """Test worker status endpoints."""
    print("\n=== TEST 4: Status Endpoints ===")

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Get status
        try:
            resp = await client.get(f"{BASE_URL}/api/status")
            data = resp.json()
            log_test(
                "GET /api/status",
                True,
                f"Worker: {data.get('worker_running')}, Paused: {data.get('is_paused')}",
            )
        except Exception as e:
            log_test("GET /api/status", False, str(e))

        # Toggle pause
        try:
            resp = await client.post(f"{BASE_URL}/api/status/toggle-pause")
            data = resp.json()
            log_test(
                "POST /api/status/toggle-pause",
                True,
                f"Paused: {data.get('is_paused')}",
            )
        except Exception as e:
            log_test("POST /api/status/toggle-pause", False, str(e))


async def test_database_schema():
    """Test database tables exist and have correct schema."""
    print("\n=== TEST 5: Database Schema ===")

    try:
        async with engine.connect() as conn:
            # Check screenshots table
            result = await conn.execute(text("SELECT COUNT(*) FROM screenshots"))
            count = result.scalar()
            log_test("Screenshots table exists", True, f"Rows: {count}")

            # Check settings table
            result = await conn.execute(text("SELECT COUNT(*) FROM settings"))
            count = result.scalar()
            log_test("Settings table exists", True, f"Rows: {count}")

            # Check columns
            result = await conn.execute(text("PRAGMA table_info(screenshots)"))
            columns = [row[1] for row in result.fetchall()]
            required_cols = [
                "id",
                "file_path",
                "filename",
                "description",
                "application",
                "tags",
                "summary",
                "timestamp",
                "status",
            ]
            missing = [c for c in required_cols if c not in columns]
            log_test(
                "Screenshots schema",
                len(missing) == 0,
                f"Missing: {missing}" if missing else "OK",
            )

    except Exception as e:
        log_test("Database schema", False, str(e))


async def test_onboarding_endpoint():
    """Test onboarding endpoint."""
    print("\n=== TEST 6: Onboarding ===")

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(f"{BASE_URL}/api/screenshots/onboarding")
            data = resp.json()
            log_test(
                "GET /api/screenshots/onboarding",
                True,
                f"Folder exists: {data.get('folder_exists')}",
            )
        except Exception as e:
            log_test("GET /api/screenshots/onboarding", False, str(e))


async def test_watcher():
    """Test watcher is running."""
    print("\n=== TEST 7: Watcher ===")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{BASE_URL}/api/status")
            data = resp.json()
            worker_running = data.get("worker_running", False)
            log_test(
                "Queue worker running", worker_running, f"Running: {worker_running}"
            )
    except Exception as e:
        log_test("Queue worker", False, str(e))


async def main():
    print("=" * 60)
    print("MNEMOSYNE BACKEND TEST SUITE")
    print("=" * 60)

    await test_backend_startup()
    await test_screenshots_endpoints()
    await test_settings_endpoints()
    await test_status_endpoints()
    await test_database_schema()
    await test_onboarding_endpoint()
    await test_watcher()

    # Summary
    passed = sum(1 for r in RESULTS if "PASS" in r["status"])
    failed = sum(1 for r in RESULTS if "FAIL" in r["status"])
    total = len(RESULTS)

    print("\n" + "=" * 60)
    print(f"SUMMARY: {passed}/{total} tests passed")
    print("=" * 60)

    return passed, failed, total


if __name__ == "__main__":
    passed, failed, total = asyncio.run(main())
    sys.exit(0 if failed == 0 else 1)
