import assert from "node:assert/strict";
import { createTurn, finishTurn, groupEvents, reduceEvent, traceDocument } from "./events.ts";

const turn = [
  { event: "on_chat_model_start", run_id: "a", name: "ChatOpenAI", data: {} },
  { event: "on_chat_model_stream", run_id: "a", name: "ChatOpenAI", data: { chunk: { content: "vou " } } },
  { event: "on_chat_model_stream", run_id: "a", name: "ChatOpenAI", data: { chunk: { content: "consultar" } } },
  {
    event: "on_chat_model_end",
    run_id: "a",
    name: "ChatOpenAI",
    data: { output: { content: "", tool_calls: [{ name: "get_quote", args: { ticker: "PETR4" } }] } },
  },
  { event: "on_tool_start", run_id: "t", name: "get_quote", data: { input: { ticker: "PETR4" } } },
  {
    event: "on_tool_end",
    run_id: "t",
    name: "get_quote",
    data: {
      output: {
        content: JSON.stringify({
          ticker: "PETR4",
          name: "Petrobras PN",
          price: 38.2,
          currency: "BRL",
          change_pct: 0,
          found: true,
        }),
      },
    },
  },
  { event: "on_chat_model_start", run_id: "b", name: "ChatOpenAI", data: {} },
  { event: "on_chat_model_stream", run_id: "b", name: "ChatOpenAI", data: { chunk: { content: "rascunho " } } },
  { event: "on_chat_model_stream", run_id: "b", name: "ChatOpenAI", data: { chunk: { content: "parcial" } } },
  {
    event: "on_chat_model_end",
    run_id: "b",
    name: "ChatOpenAI",
    data: { output: { content: "PETR4 está a R$ 38,20, variação 0%.", tool_calls: [] } },
  },
].reduce((state, event) => reduceEvent(state, event), createTurn());

assert.equal(turn.draft, "");
assert.equal(turn.answer, "PETR4 está a R$ 38,20, variação 0%.");
assert.equal(turn.steps.some((step) => step.detail.includes("vou consultar")), false);
assert.deepEqual(
  turn.steps.map((step) => step.title),
  ["Pedido", "Chamada", "Resultado", "Resposta"],
);
assert.equal(turn.steps[1]?.detail, 'get_quote({"ticker":"PETR4"})');
assert.equal(turn.steps[2]?.detail, "PETR4 · R$ 38.20 · 0.0%");
assert.equal(turn.tools[0]?.output.price, 38.2);
assert.equal(groupEvents(turn.events)[0]?.event, "on_chat_model_start");
assert.equal(traceDocument(finishTurn(turn)).tools[0]?.output.ticker, "PETR4");

assert.throws(
  () => reduceEvent(createTurn(), { event: "on_chain_start" }),
  /Tipo de evento não suportado/,
);

const dumped = [
  { event: "on_chat_model_start", run_id: "a", name: "ChatOpenAI", data: {} },
  {
    event: "on_chat_model_stream",
    run_id: "a",
    name: "ChatOpenAI",
    data: { chunk: { lc: 1, type: "constructor", kwargs: { content: "vou " } } },
  },
  {
    event: "on_chat_model_end",
    run_id: "a",
    name: "ChatOpenAI",
    data: {
      output: {
        lc: 1,
        type: "constructor",
        kwargs: {
          content: "",
          tool_calls: [{ name: "get_quote", args: { ticker: "PETR4" }, id: "c1", type: "tool_call" }],
        },
      },
    },
  },
  { event: "on_tool_start", run_id: "t", name: "get_quote", data: { input: { ticker: "PETR4" } } },
  {
    event: "on_tool_end",
    run_id: "t",
    name: "get_quote",
    data: {
      output: {
        lc: 1,
        type: "constructor",
        kwargs: {
          content: JSON.stringify({ ticker: "PETR4", price: 38.2, change_pct: 0, found: true }),
          type: "tool",
        },
      },
    },
  },
  {
    event: "on_chat_model_end",
    run_id: "b",
    name: "ChatOpenAI",
    data: {
      output: {
        lc: 1,
        type: "constructor",
        kwargs: { content: "PETR4 está a R$ 38,20.", tool_calls: [] },
      },
    },
  },
].reduce((state, event) => reduceEvent(state, event), createTurn());

assert.equal(dumped.answer, "PETR4 está a R$ 38,20.");
assert.equal(dumped.draft, "");
assert.equal(dumped.steps[1]?.detail, 'get_quote({"ticker":"PETR4"})');
assert.equal(dumped.tools[0]?.output.price, 38.2);

console.log("events ok");
