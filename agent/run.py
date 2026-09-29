"""O agent guarda o grafo compilado. A rota só pede execute."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from agent.dispatcher import StreamDispatcher
from graph.builder import build_graph


class Agent:
    def __init__(
        self,
        graph: Any = None,
        dispatcher: StreamDispatcher | None = None,
    ) -> None:
        self._graph = graph if graph is not None else build_graph().compile()
        self._dispatcher = dispatcher or StreamDispatcher()

    async def execute(self, message: str) -> AsyncIterator[str]:
        async for event in self._graph.astream_events(
            {"messages": [("user", message)]},
            version="v2",
            include_types=self._dispatcher.include_types,
        ):
            yield self._dispatcher.dispatch(event)
