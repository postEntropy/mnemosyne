import json
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text
from app.models.database import Base


class Screenshot(Base):
    __tablename__ = "screenshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    file_path = Column(Text, nullable=False, unique=True)
    filename = Column(String, nullable=False)
    description = Column(Text, default="")
    application = Column(String, default="")
    tags = Column(Text, default="[]")
    summary = Column(Text, default="")
    timestamp = Column(DateTime, nullable=False)
    processed_at = Column(DateTime, nullable=True)
    status = Column(String, default="pending")
    thumbnail_path = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "file_path": self.file_path,
            "filename": self.filename,
            "description": self.description,
            "application": self.application,
            "tags": json.loads(self.tags) if self.tags else [],
            "summary": self.summary,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "processed_at": self.processed_at.isoformat()
            if self.processed_at
            else None,
            "status": self.status,
            "thumbnail_path": self.thumbnail_path,
            "error_message": self.error_message,
        }
