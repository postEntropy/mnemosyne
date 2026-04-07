from sqlalchemy import Column, String, Text
from app.models.database import Base


class Setting(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True)
    value = Column(Text, default="")
