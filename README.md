# Mesa

Agente da semana 2 do Praxis, com cara de mesa de investimentos. A API é FastAPI. O chat é Next.js.

A ferramenta desta semana é a cotação. O livro é fixo — PETR4, VALE3, ITUB4 e BBDC4 — e não consulta o mercado. O laço é o mesmo: o modelo pede a ferramenta, a ferramenta responde, o modelo fala. A frase final só pode citar o preço que veio no JSON.

## Subir a API

Na raiz do projeto:

```bash
python -m venv .venv
```

Windows:

```bash
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn api.main:app --reload --port 8000
```

macOS ou Linux:

```bash
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn api.main:app --reload --port 8000
```

Coloque `OPENAI_API_KEY` no `.env` da raiz. O arquivo já está no `.gitignore`.

`POST http://localhost:8000/agent/execute` recebe `{"message": "..."}` e responde `text/event-stream`.

## Subir o chat

Em outro terminal:

```bash
cd web
npm install
npm run dev
```

O chat abre em http://localhost:3000/

Pergunta de fumaça: **Qual a cotação da PETR4?** Enquanto a mesa trabalha, a linha do tempo mostra o pedido, a chamada e o resultado. A frase final fica no chat e traz R$ 38,20. **Traceback e JSON** abre a trilha dos eventos e o JSON. Um ticker fora do livro volta sem preço.

**Novo chat** limpa a tela. Ainda não há histórico guardado.

## Onde cada peça mora

| Peça | Arquivo | Papel |
| --- | --- | --- |
| Tool | `graph/tools.py` | `get_quote(ticker)` espera ~2s e devolve o livro fixo |
| Grafo | `graph/builder.py` | Nó async do modelo, nó de tools, volta se houver chamada |
| Agent | `agent/run.py` | Compila o grafo uma vez e streama `astream_events` v2 |
| Dispatcher | `agent/dispatcher.py` | Tipo conhecido segue; tipo fora da lista erra |
| SSE | `agent/sse.py` | Frame com o dump do LangChain do StreamEvent inteiro |
| HTTP | `api/main.py` | Sobe o agent e só entrega o fluxo |
| Chat | `web/app/chat.tsx` | Chat, linha do tempo e janela de traceback |

Fora desta semana, de propósito: login, memória, RAG e cotação de verdade.
