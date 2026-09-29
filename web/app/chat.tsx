"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  createTurn,
  failTurn,
  finishTurn,
  groupEvents,
  reduceEvent,
  traceDocument,
  type Step,
  type Turn,
} from "@/lib/events";
import { readSse } from "@/lib/sse";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const PROMPTS = [
  { label: "PETR4", text: "Qual a cotação da PETR4?" },
  { label: "VALE3", text: "Qual a cotação da VALE3?" },
  { label: "ITUB4", text: "Qual a cotação da ITUB4?" },
  { label: "BBDC4", text: "Qual a cotação da BBDC4?" },
];

type UserMessage = { id: string; role: "user"; text: string };
type AssistantMessage = { id: string; role: "assistant"; turn: Turn };
type ChatMessage = UserMessage | AssistantMessage;

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const node = threadRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  function resetChat() {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    setDraft("");
    setMessages([]);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    const assistantId = crypto.randomUUID();
    const controller = new AbortController();
    abortRef.current = controller;
    setDraft("");
    setSending(true);
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text },
      { id: assistantId, role: "assistant", turn: createTurn() },
    ]);

    const update = (turn: Turn) => {
      if (controller.signal.aborted) return;
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId && item.role === "assistant" ? { ...item, turn } : item,
        ),
      );
    };

    try {
      const response = await fetch(`${API_URL}/agent/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error((await response.text()) || "A mesa não respondeu.");
      }
      let turn = createTurn();
      await readSse(response, (streamEvent) => {
        turn = reduceEvent(turn, streamEvent);
        update(turn);
      });
      update(finishTurn(turn));
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      setMessages((current) =>
        current.map((item) => {
          if (item.id !== assistantId || item.role !== "assistant") return item;
          return { ...item, turn: failTurn(item.turn, message) };
        }),
      );
    } finally {
      if (!controller.signal.aborted) setSending(false);
    }
  }

  return (
    <main className="shell">
      <header className="top">
        <div>
          <h1 className="word">Mesa</h1>
          <p className="mark">Cotações de exercício, sem mercado ao vivo.</p>
        </div>
        <button type="button" className="ghost" onClick={resetChat}>
          Novo chat
        </button>
      </header>

      <div className="thread" ref={threadRef} aria-live="polite">
        {messages.length === 0 ? (
          <div className="empty">
            <p>A mesa está quieta.</p>
            <p>O livro desta semana é PETR4, VALE3, ITUB4 e BBDC4.</p>
          </div>
        ) : null}
        {messages.map((message) =>
          message.role === "user" ? (
            <p className="user" key={message.id}>
              {message.text}
            </p>
          ) : (
            <AssistantTurn key={message.id} turn={message.turn} />
          ),
        )}
      </div>

      <form className="composer" onSubmit={onSubmit}>
        <label className="sr" htmlFor="message">
          Mensagem
        </label>
        <textarea
          id="message"
          rows={2}
          value={draft}
          placeholder="Qual a cotação da PETR4?"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button className="send" type="submit" disabled={sending || !draft.trim()}>
          Enviar
        </button>
        <div className="prompts">
          {PROMPTS.map((prompt) => (
            <button
              key={prompt.label}
              type="button"
              className="ghost"
              disabled={sending}
              onClick={() => setDraft(prompt.text)}
            >
              {prompt.label}
            </button>
          ))}
        </div>
      </form>
    </main>
  );
}

function AssistantTurn({ turn }: { turn: Turn }) {
  const shown = turn.answer || turn.draft;
  return (
    <article className="assistant">
      {turn.streaming ? <Timeline steps={turn.steps} /> : null}
      {shown ? (
        <p className={turn.streaming && !turn.answer ? "answer is-draft" : "answer"}>{shown}</p>
      ) : null}
      {turn.error ? <p className="error">{turn.error}</p> : null}
      {!turn.streaming && turn.events.length > 0 ? <TraceWindow turn={turn} /> : null}
    </article>
  );
}

function Timeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="timeline">
      {steps.map((step) => (
        <li key={step.id} data-kind={step.kind}>
          <span className="rail" aria-hidden="true" />
          <div>
            <p className="step-title">{step.title}</p>
            <p className="step-detail">{step.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function TraceWindow({ turn }: { turn: Turn }) {
  const groups = groupEvents(turn.events);
  return (
    <details className="trace">
      <summary>Traceback e JSON</summary>
      <div className="trace-body">
        <section>
          <h3>Traceback</h3>
          <ol>
            {groups.map((group, index) => (
              <li key={`${index}-${group.event}-${group.name}`}>
                {group.event}
                {group.name ? ` · ${group.name}` : ""}
                {group.count > 1 ? ` × ${group.count}` : ""}
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h3>JSON</h3>
          <pre>{JSON.stringify(traceDocument(turn), null, 2)}</pre>
        </section>
      </div>
    </details>
  );
}
