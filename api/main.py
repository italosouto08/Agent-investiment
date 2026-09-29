from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agent.run import Agent

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

# O grafo nasce com o processo. A rota não compila e não lê o evento.
agent = Agent()

app = FastAPI(title="Mesa")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


class ExecuteBody(BaseModel):
    message: str = Field(min_length=1)


@app.get("/health")
def health() -> dict[str, str]:
    return {"ok": "mesa"}


@app.post("/agent/execute")
async def execute_agent(body: ExecuteBody) -> StreamingResponse:
    return StreamingResponse(
        agent.execute(body.message),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
