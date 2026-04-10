from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, Text

from app.models.database import Base


class DeadLetterItem(Base):
    __tablename__ = "dead_letter_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    screenshot_id = Column(Integer, nullable=True)
    file_path = Column(Text, nullable=False)
    error_message = Column(Text, nullable=False)
    attempts = Column(Integer, nullable=False, default=1)
    provider = Column(Text, nullable=True)
    failed_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    resolved = Column(Boolean, nullable=False, default=False)
    retried_at = Column(DateTime, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "screenshot_id": self.screenshot_id,
            "file_path": self.file_path,
            "error_message": self.error_message,
            "attempts": self.attempts,
            "provider": self.provider,
            "failed_at": self.failed_at.isoformat() if self.failed_at else None,
            "resolved": self.resolved,
            "retried_at": self.retried_at.isoformat() if self.retried_at else None,
        }