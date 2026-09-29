export type StreamEvent = {
  event: string;
  name?: string;
  run_id?: string;
  data?: {
    chunk?: unknown;
    output?: unknown;
    input?: unknown;
  };
  [key: string]: unknown;
};

export type Step = {
  id: string;
  kind: "model" | "tool_call" | "tool_result" | "answer" | "error";
  title: string;
  detail: string;
};

export type ToolRecord = {
  name: string;
  output: unknown;
};

type Pass = {
  stepId: string;
  text: string;
};

export type Turn = {
  streaming: boolean;
  draft: string;
  answer: string;
  steps: Step[];
  events: StreamEvent[];
  tools: ToolRecord[];
  passes: Record<string, Pass>;
  error?: string;
};

export function createTurn(): Turn {
  return {
    streaming: true,
    draft: "",
    answer: "",
    steps: [{ id: "sent", kind: "model", title: "Pedido", detail: "enviado" }],
    events: [],
    tools: [],
    passes: {},
  };
}

export function finishTurn(turn: Turn): Turn {
  return { ...turn, streaming: false, draft: "" };
}

export function failTurn(turn: Turn, message: string): Turn {
  return {
    ...finishTurn(turn),
    error: message,
    steps: [
      ...turn.steps,
      { id: "error", kind: "error", title: "Erro", detail: message },
    ],
  };
}

export function reduceEvent(turn: Turn, event: StreamEvent): Turn {
  const type = event?.event;
  if (typeof type !== "string") {
    throw new Error("Evento sem tipo.");
  }
  if (!type.startsWith("on_chat_model_") && !type.startsWith("on_tool_")) {
    throw new Error(`Tipo de evento não suportado: ${type}`);
  }

  const next: Turn = {
    ...turn,
    events: [...turn.events, event],
    steps: turn.steps.slice(),
    tools: turn.tools.slice(),
    passes: { ...turn.passes },
  };

  if (type === "on_chat_model_start") {
    return startModel(next, event);
  }
  if (type === "on_chat_model_stream") {
    return streamModel(next, event);
  }
  if (type === "on_chat_model_end") {
    return endModel(next, event);
  }
  if (type === "on_tool_start") {
    return startTool(next, event);
  }
  if (type === "on_tool_end" || type === "on_tool_error") {
    return endTool(next, event, type === "on_tool_error");
  }
  return next;
}

export function traceDocument(turn: Turn) {
  return {
    answer: turn.answer,
    tools: turn.tools,
    events: turn.events
      .map(presentEvent)
      .filter((item) => item.event !== "on_chat_model_stream" || ("content" in item && item.content)),
  };
}

function presentEvent(event: StreamEvent) {
  const base = { event: event.event, name: event.name, run_id: event.run_id };
  if (event.event === "on_chat_model_stream") {
    return { ...base, content: textOf(event.data?.chunk) };
  }
  if (event.event === "on_chat_model_end") {
    return {
      ...base,
      content: textOf(event.data?.output),
      tool_calls: toolCallsOf(event.data?.output),
    };
  }
  if (event.event === "on_tool_start") {
    return { ...base, input: event.data?.input };
  }
  if (event.event === "on_tool_end" || event.event === "on_tool_error") {
    return { ...base, output: toolOutput(event) };
  }
  return base;
}

export function groupEvents(events: StreamEvent[]) {
  const groups: { event: string; name: string; count: number }[] = [];
  for (const item of events) {
    const name = item.name ?? "";
    const last = groups[groups.length - 1];
    if (last && last.event === item.event && last.name === name) {
      last.count += 1;
    } else {
      groups.push({ event: item.event, name, count: 1 });
    }
  }
  return groups;
}

function startModel(turn: Turn, event: StreamEvent): Turn {
  const runId = event.run_id || "model";
  const stepId = `model-${runId}`;
  turn.passes[runId] = { stepId, text: "" };
  turn.steps = upsert(turn.steps, {
    id: stepId,
    kind: "model",
    title: "Modelo",
    detail: "gerando",
  });
  return turn;
}

function streamModel(turn: Turn, event: StreamEvent): Turn {
  const runId = event.run_id || "model";
  const previous = turn.passes[runId];
  const stepId = previous?.stepId ?? `model-${runId}`;
  const text = `${previous?.text ?? ""}${textOf(event.data?.chunk)}`;
  turn.passes[runId] = { stepId, text };
  turn.draft = text;
  turn.steps = upsert(turn.steps, {
    id: stepId,
    kind: "model",
    title: "Modelo",
    detail: text ? "escrevendo" : "gerando",
  });
  return turn;
}

function endModel(turn: Turn, event: StreamEvent): Turn {
  const runId = event.run_id || "model";
  const previous = turn.passes[runId];
  const stepId = previous?.stepId ?? `model-${runId}`;
  const calls = toolCallsOf(event.data?.output);
  if (calls.length) {
    turn.draft = "";
    turn.passes[runId] = { stepId, text: "" };
    turn.steps = upsert(turn.steps, {
      id: stepId,
      kind: "tool_call",
      title: "Chamada",
      detail: calls.map(formatCall).join("\n"),
    });
    return turn;
  }
  const answer = textOf(event.data?.output);
  turn.answer = answer;
  turn.draft = "";
  turn.passes[runId] = { stepId, text: answer };
  turn.steps = upsert(turn.steps, {
    id: stepId,
    kind: "answer",
    title: "Resposta",
    detail: "pronta",
  });
  return turn;
}

function startTool(turn: Turn, event: StreamEvent): Turn {
  const rendered =
    typeof event.data?.input === "string"
      ? event.data.input
      : JSON.stringify(event.data?.input ?? {});
  const detail = `${event.name ?? "ferramenta"}(${rendered}) · em execução`;
  const existing = [...turn.steps].reverse().find((step) => step.kind === "tool_call");
  if (existing) {
    turn.steps = upsert(turn.steps, { ...existing, detail });
    return turn;
  }
  turn.steps = upsert(turn.steps, {
    id: `tool-${event.run_id || event.name || "tool"}`,
    kind: "tool_call",
    title: "Chamada",
    detail,
  });
  return turn;
}

function endTool(turn: Turn, event: StreamEvent, failed: boolean): Turn {
  turn.steps = turn.steps.map((step) => ({
    ...step,
    detail: step.detail.replace(" · em execução", ""),
  }));
  const output = toolOutput(event);
  turn.tools = [...turn.tools, { name: event.name || "ferramenta", output }];
  turn.steps = upsert(turn.steps, {
    id: `result-${event.run_id || turn.tools.length}`,
    kind: failed ? "error" : "tool_result",
    title: failed ? "Erro" : "Resultado",
    detail: failed ? "a ferramenta falhou" : summarizeOutput(output),
  });
  return turn;
}

function upsert(steps: Step[], step: Step): Step[] {
  const index = steps.findIndex((item) => item.id === step.id);
  if (index === -1) return [...steps, step];
  const copy = steps.slice();
  copy[index] = step;
  return copy;
}

function textOf(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  const record = messageFields(value);
  if (!record) return "";
  return contentText(record.content);
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      const block = asRecord(part);
      if (block?.type === "text" && typeof block.text === "string") return block.text;
      return "";
    })
    .join("");
}

function toolCallsOf(message: unknown) {
  const record = messageFields(message);
  if (!record) return [];
  if (Array.isArray(record.tool_calls) && record.tool_calls.length) {
    return record.tool_calls;
  }
  const extra = asRecord(record.additional_kwargs);
  return Array.isArray(extra?.tool_calls) ? extra.tool_calls : [];
}

function formatCall(call: unknown) {
  const record = asRecord(call);
  const fn = asRecord(record?.function);
  const name =
    (typeof record?.name === "string" && record.name) ||
    (typeof fn?.name === "string" && fn.name) ||
    "ferramenta";
  const args = record?.args ?? fn?.arguments ?? {};
  const rendered = typeof args === "string" ? args : JSON.stringify(args);
  return `${name}(${rendered})`;
}

function toolOutput(event: StreamEvent): unknown {
  const fields = messageFields(event.data?.output);
  if (fields && "content" in fields) {
    const content = fields.content;
    if (typeof content === "string") {
      try {
        return JSON.parse(content);
      } catch {
        return content;
      }
    }
    return content;
  }
  return event.data?.output ?? event.data?.input;
}

/** Dump do LangChain guarda o corpo em kwargs. O model_dump plano fica na raiz. */
function messageFields(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) return null;
  return asRecord(record.kwargs) ?? record;
}

function summarizeOutput(output: unknown) {
  const record = asRecord(output);
  if (!record) return "recebido";
  if (record.found === false && typeof record.ticker === "string") {
    return `${record.ticker} · fora do livro`;
  }
  if ("price" in record && typeof record.ticker === "string") {
    const price = typeof record.price === "number" ? record.price.toFixed(2) : String(record.price);
    const change = typeof record.change_pct === "number" ? ` · ${formatChange(record.change_pct)}` : "";
    return `${record.ticker} · R$ ${price}${change}`;
  }
  return "recebido";
}

function formatChange(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
