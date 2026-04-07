import asyncio
import os
import shutil
import sys
from pathlib import Path

# Setup paths
root_dir = Path(__file__).parent.absolute()
backend_dir = root_dir / "backend"
sys.path.append(str(backend_dir))
os.chdir(str(backend_dir))

from app.models.database import run_migrations
from app.config import settings

async def reset_database():
    print("--- Mnemosyne Total Reset ---")
    
    # 1. Delete DB file
    db_file = Path("mnemosyne.db")
    if db_file.exists():
        os.remove(db_file)
        print(f"🗑️ Database file '{db_file}' deleted.")
    
    # 2. Clear thumbnails
    thumb_dir = Path(settings.thumbnails_dir)
    if thumb_dir.exists():
        shutil.rmtree(thumb_dir)
        thumb_dir.mkdir()
        print(f"🖼️ Thumbnails directory '{thumb_dir}' cleared.")

    # 3. Re-init database (creates tables)
    await run_migrations()
    print("✨ Database tables recreated successfully via migrations/fallback.")
    print("\nSystem is now a clean slate. Ready for testing!")

if __name__ == "__main__":
    confirm = input("This will DELETE all analyzed data. Are you sure? (y/N): ")
    if confirm.lower() == 'y':
        asyncio.run(reset_database())
    else:
        print("Reset cancelled.")
