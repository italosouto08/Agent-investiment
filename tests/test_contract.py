import asyncio
import json

from langchain_core.messages import AIMessageChunk

from agent.dispatcher import StreamDispatcher, UnknownStreamType
from agent.run import Agent
from graph.tools import get_quote


def test_quote_stub_contract():
    payload = asyncio.run(get_quote.ainvoke({"ticker": "petr4"}))
    assert payload == {
        "ticker": "PETR4",
        "name": "Petrobras PN",
        "price": 38.20,
        "currency": "BRL",
        "change_pct": 0.0,
        "found": True,
    }


def test_unknown_ticker_has_no_price():
    payload = asyncio.run(get_quote.ainvoke({"ticker": "XPTO3"}))
    assert payload == {
        "ticker": "XPTO3",
        "found": False,
        "available": ["BBDC4", "ITUB4", "PETR4", "VALE3"],
    }


def test_sse_event_carries_the_whole_stream_event():
    event = {
        "event": "on_tool_end",
        "name": "get_quote",
        "data": {"output": {"ticker": "PETR4", "price": 38.20}},
    }
    encoded = StreamDispatcher().dispatch(event)
    assert encoded.startswith("event: on_tool_end\n")
    data_line = encoded.split("data: ", 1)[1].strip()
    assert json.loads(data_line) == event


def test_dispatcher_dumps_the_message_chunk():
    encoded = StreamDispatcher().dispatch(
        {
            "event": "on_chat_model_stream",
            "data": {"chunk": AIMessageChunk(content="oi")},
        }
    )
    payload = json.loads(encoded.split("data: ", 1)[1])
    assert payload["data"]["chunk"]["kwargs"]["content"] == "oi"


def test_unknown_stream_type_fails():
    agent = Agent(graph=_Script([{"event": "on_chain_start", "data": {}}]))
    try:
        asyncio.run(_collect(agent))
    except UnknownStreamType as exc:
        assert exc.kind == "on_chain_start"
    else:
        raise AssertionError("expected UnknownStreamType")


def test_execute_reuses_the_injected_graph():
    graph = _Script(
        [{"event": "on_tool_end", "name": "get_quote", "data": {"output": {"price": 1}}}]
    )
    agent = Agent(graph=graph)
    first = asyncio.run(_collect(agent))
    second = asyncio.run(_collect(agent))
    assert graph.calls == 2
    assert first[0].startswith("event: on_tool_end\n")
    assert second[0].startswith("event: on_tool_end\n")
    assert graph.payloads[0] == {"messages": [("user", "PETR4")]}
    assert graph.versions == ["v2", "v2"]
    assert graph.include_types == [["chat_model", "tool"], ["chat_model", "tool"]]


class _Script:
    def __init__(self, events: list[dict]) -> None:
        self._events = events
        self.calls = 0
        self.payloads: list[dict] = []
        self.versions: list[str] = []
        self.include_types: list[list[str]] = []

    def astream_events(self, payload, *, version, include_types):
        self.calls += 1
        self.payloads.append(payload)
        self.versions.append(version)
        self.include_types.append(list(include_types))
        events = self._events

        async def generate():
            for event in events:
                yield event

        return generate()


async def _collect(agent: Agent) -> list[str]:
    return [frame async for frame in agent.execute("PETR4")]
