"""Um StreamEvent conhecido vira um frame. Tipo fora da lista erra de propósito.

Os handlers são o mesmo encode: a política ainda não diverge por tipo.
Um handler novo só entra quando um evento precisar de regra própria.
"""

from __future__ import annotations

from typing import Any, Mapping

from agent.sse import SseFrame

INCLUDE_TYPES = ("chat_model", "tool")

# include_types filtra a família. Estes são os nomes que essa família emite,
# inclusive erro e stream de tool. Sem eles, o fluxo morre no meio.
EVENTS = frozenset(
    {
        "on_chat_model_start",
        "on_chat_model_stream",
        "on_chat_model_end",
        "on_chat_model_error",
        "on_tool_start",
        "on_tool_stream",
        "on_tool_end",
        "on_tool_error",
    }
)


class UnknownStreamType(RuntimeError):
    def __init__(self, kind: str) -> None:
        super().__init__(f"unknown stream type: {kind}")
        self.kind = kind


class StreamDispatcher:
    def __init__(self, events: frozenset[str] | None = None) -> None:
        self._events = EVENTS if events is None else events

    @property
    def include_types(self) -> list[str]:
        return list(INCLUDE_TYPES)

    def dispatch(self, event: Mapping[str, Any]) -> str:
        kind = event["event"]
        if kind not in self._events:
            raise UnknownStreamType(kind)
        return SseFrame(kind, event).encode()
