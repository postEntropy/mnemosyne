import asyncio
import os
import sys
from pathlib import Path

# Setup paths
root_dir = Path(__file__).parent.absolute()
backend_dir = root_dir / "backend"
sys.path.append(str(backend_dir))
os.chdir(str(backend_dir))

from sqlalchemy import update
from app.models.database import async_session, init_db
from app.models.screenshot import Screenshot

async def reset_incomplete():
    print("--- Mnemosyne Database Maintenance ---")
    await init_db()
    async with async_session() as db:
        # Reset everything that isn't 'processed'
        result = await db.execute(
            update(Screenshot)
            .where(Screenshot.status != 'processed')
            .values(status='pending', error_message=None)
        )
        await db.commit()
        print(f"Cleanup complete. {result.rowcount} records reset to 'pending'.")

if __name__ == "__main__":
    asyncio.run(reset_incomplete())
