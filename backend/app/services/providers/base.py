from abc import ABC, abstractmethod
from pathlib import Path
from typing import TypedDict


class AnalysisResult(TypedDict):
    description: str
    application: str
    tags: list[str]
    summary: str


class BaseProvider(ABC):
    @abstractmethod
    async def analyze(self, image_path: Path) -> AnalysisResult:
        pass

    @abstractmethod
    async def test_connection(self) -> tuple[bool, str]:
        pass
