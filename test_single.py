import asyncio
import os
import sys
from pathlib import Path

# Setup paths
root_dir = Path(__file__).parent.absolute()
backend_dir = root_dir / "backend"
sys.path.append(str(backend_dir))
os.chdir(str(backend_dir))

from sqlalchemy import delete
from app.models.database import async_session, init_db
from app.models.screenshot import Screenshot
from app.services.storage import process_screenshot, get_active_provider
from app.config import settings

async def test_single():
    print("--- Mnemosyne Single Image Test ---")
    await init_db()
    
    # 1. Pick one image
    sdir = Path(settings.screenshots_dir)
    imgs = [f for f in sdir.iterdir() if f.suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp'} and f.is_file()]
    
    if not imgs:
        print("No images found in screenshots directory!")
        return

    test_img = imgs[0]
    print(f"Testing with: {test_img.name}")

    async with async_session() as db:
        # 2. Clear previous records of this file to ensure fresh start
        await db.execute(delete(Screenshot).where(Screenshot.file_path == str(test_img)))
        await db.commit()
        
        # 3. Create new record
        from datetime import datetime
        screenshot = Screenshot(
            file_path=str(test_img),
            filename=test_img.name,
            timestamp=datetime.fromtimestamp(test_img.stat().st_mtime),
            status="pending"
        )
        db.add(screenshot)
        await db.commit()
        await db.refresh(screenshot)
        
        print("Record created in DB. Starting AI analysis (this may take 10-30s)...")
        
        # 4. Process
        try:
            ai_provider = await get_active_provider(db)
            # We bypass the queue worker and call directly for testing
            updated_ss = await process_screenshot(db, screenshot, ai_provider)
            
            if updated_ss.status == "processed":
                print("\n✅ SUCCESS!")
                print(f"Application: {updated_ss.application}")
                print(f"Summary: {updated_ss.summary}")
                print(f"Tags: {updated_ss.tags}")
                print(f"Description: {updated_ss.description[:200]}...")
            else:
                print(f"\n❌ FAILED: {updated_ss.error_message}")
        except Exception as e:
            print(f"\n❌ CRITICAL ERROR: {str(e)}")

if __name__ == "__main__":
    asyncio.run(test_single())
