import asyncio

from langchain_core.tools import tool

# Stub de propósito: sem HTTP. Os preços não mudam, para o exercício ficar verificável.
BOOK = {
    "PETR4": {
        "ticker": "PETR4",
        "name": "Petrobras PN",
        "price": 38.20,
        "currency": "BRL",
        "change_pct": 0.0,
        "found": True,
    },
    "VALE3": {
        "ticker": "VALE3",
        "name": "Vale ON",
        "price": 62.15,
        "currency": "BRL",
        "change_pct": -0.8,
        "found": True,
    },
    "ITUB4": {
        "ticker": "ITUB4",
        "name": "Itaú Unibanco PN",
        "price": 31.40,
        "currency": "BRL",
        "change_pct": 0.3,
        "found": True,
    },
    "BBDC4": {
        "ticker": "BBDC4",
        "name": "Bradesco PN",
        "price": 14.75,
        "currency": "BRL",
        "change_pct": -0.2,
        "found": True,
    },
}


def _normalize(ticker: str) -> str:
    return ticker.strip().upper().removesuffix(".SA")


@tool
async def get_quote(ticker: str) -> dict:
    """Obtém a cotação de exercício de um ticker.

    Use quando o usuário perguntar cotação, preço ou variação de um papel.
    ticker é o código, como PETR4.
    """
    # O atraso existe para o chat mostrar a chamada antes do resultado.
    await asyncio.sleep(2)
    key = _normalize(ticker)
    row = BOOK.get(key)
    if row is None:
        return {
            "ticker": key,
            "found": False,
            "available": sorted(BOOK),
        }
    return dict(row)
