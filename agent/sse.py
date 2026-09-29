"""Frame SSE. O dump do LangChain serializa a mensagem; um walker próprio não."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from langchain_core.load.dump import dumps


@dataclass(frozen=True)
class SseFrame:
    event: str
    data: Any

    def encode(self) -> str:
        payload = dumps(self.data, ensure_ascii=False)
        return f"event: {self.event}\ndata: {payload}\n\n"
