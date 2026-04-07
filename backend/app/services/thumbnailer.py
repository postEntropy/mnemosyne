import asyncio
from pathlib import Path
from PIL import Image
import uuid
from app.config import settings

async def generate_thumbnail(image_path: Path) -> str:
    """
    Generates a 400px wide JPEG thumbnail.
    Handles RGBA conversion to RGB to avoid 'cannot write mode RGBA as JPEG' errors.
    """
    thumbnails_dir = Path(settings.thumbnails_dir)
    thumbnails_dir.mkdir(parents=True, exist_ok=True)

    loop = asyncio.get_event_loop()
    
    def process():
        with Image.open(image_path) as img:
            # Convert RGBA to RGB if necessary
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
                
            img.thumbnail((400, 400))
            thumb_filename = f"thumb_{uuid.uuid4().hex}.jpg"
            thumb_path = thumbnails_dir / thumb_filename
            img.save(thumb_path, "JPEG", quality=85)
            return thumb_filename

    return await loop.run_in_executor(None, process)
