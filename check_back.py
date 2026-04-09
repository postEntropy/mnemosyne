import asyncio
import os
import sys
from pathlib import Path

# Fix path before any app imports
root_dir = Path(__file__).parent.absolute()
backend_dir = root_dir / "backend"
sys.path.append(str(backend_dir))
os.chdir(str(backend_dir))

from sqlalchemy import select, func
from app.models.database import async_session, init_db
from app.models.screenshot import Screenshot
from app.services.analyzer import get_provider
from app.config import settings

async def diagnose():
    print("--- Mnemosyne Diagnostic ---")
    
    # 1. Check Database
    try:
        await init_db()
        async with async_session() as db:
            count = (await db.execute(select(func.count(Screenshot.id)))).scalar_one()
            print(f"[DB] Total screenshots in database: {count}")
            
            pending = (await db.execute(select(func.count(Screenshot.id)).where(Screenshot.status == "pending"))).scalar_one()
            processing = (await db.execute(select(func.count(Screenshot.id)).where(Screenshot.status == "processing"))).scalar_one()
            processed = (await db.execute(select(func.count(Screenshot.id)).where(Screenshot.status == "processed"))).scalar_one()
            error = (await db.execute(select(func.count(Screenshot.id)).where(Screenshot.status == "error"))).scalar_one()
            
            print(f"     Status: {processed} processed, {pending} pending, {processing} processing, {error} error")

            last = await db.execute(select(Screenshot).order_by(Screenshot.id.desc()).limit(1))
            last_item = last.scalar_one_or_none()
            if last_item:
                print(f"[DB] Last record: {last_item.filename} (Status: {last_item.status})")
    except Exception as e:
        print(f"[DB] ERROR: {str(e)}")

    # 2. Check Screenshot Directory
    try:
        sdir = Path(settings.screenshots_dir)
        print(f"[FS] Monitoring directory: {sdir}")
        if not sdir.exists():
            print(f"[!] ERROR: Directory does not exist!")
        else:
            files = list(sdir.iterdir())
            imgs = [f for f in files if f.suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp'} and f.is_file()]
            print(f"[FS] Found {len(imgs)} images in folder.")
    except Exception as e:
        print(f"[FS] ERROR: {str(e)}")

    # 3. Check AI Provider
    print(f"[AI] Active Provider: {settings.ai_provider}")
    try:
        # get_provider is synchronous
        provider = get_provider()
        print(f"[AI] Testing connection to {settings.ai_provider}...")
        success, message = await provider.test_connection()
        if success:
            print(f"[AI] Connection SUCCESSFUL.")
        else:
            print(f"[AI] Connection FAILED: {message}")
    except Exception as e:
        print(f"[AI] ERROR: {str(e)}")

if __name__ == "__main__":
    asyncio.run(diagnose())
