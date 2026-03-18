import base64
import requests
from datetime import datetime, timedelta
from typing import Optional

from app.core.config import settings


TOKEN_DATA = {
    "token": None,
    "expires_at": None
}

# URLs por ambiente
_BASE_URLS = {
    "sandbox":    "https://cdpj-sandbox.partners.uatinter.co",
    "production": "https://cdpj.partners.bancointer.com.br",
}


def _base_url() -> str:
    return _BASE_URLS.get(settings.INTER_ENV, _BASE_URLS["sandbox"])


def _cert():
    return (
        settings.INTER_CERT_PATH + "certificado.crt",
        settings.INTER_CERT_PATH + "key.key"
    )


def _obter_token() -> Optional[str]:
    credentials = base64.b64encode(
        f"{settings.INTER_CLIENT_ID}:{settings.INTER_CLIENT_SECRET}".encode()
    ).decode()

    headers = {
        "Authorization": f"Basic {credentials}",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    data = {
        "grant_type": "client_credentials",
        "scope": "boleto-cobranca.read boleto-cobranca.write"
    }

    try:
        response = requests.post(
            f"{_base_url()}/oauth/v2/token",
            headers=headers,
            data=data,
            cert=_cert()
        )
        if response.status_code == 200:
            info = response.json()
            TOKEN_DATA["token"] = info.get("access_token")
            expires_in = info.get("expires_in", 3600)
            TOKEN_DATA["expires_at"] = datetime.now() + timedelta(seconds=expires_in - 300)
            return TOKEN_DATA["token"]
        print(f"[Inter/{settings.INTER_ENV}] Erro ao obter token: {response.status_code} — {response.text}")
        return None
    except Exception as e:
        print(f"[Inter/{settings.INTER_ENV}] Exceção ao obter token: {e}")
        return None


def _get_token() -> str:
    if TOKEN_DATA["token"] and TOKEN_DATA["expires_at"] and datetime.now() < TOKEN_DATA["expires_at"]:
        return TOKEN_DATA["token"]
    token = _obter_token()
    if not token:
        raise Exception("Não foi possível obter token da API Inter.")
    return token


def _headers_inter() -> dict:
    return {
        "Authorization": f"Bearer {_get_token()}",
        "x-conta-corrente": settings.INTER_CONTA_CORRENTE,
        "x-inter-conta-corrente": settings.INTER_CONTA_CORRENTE,
        "Content-Type": "application/json"
    }


def emitir_boleto(payload: dict) -> dict:
    response = requests.post(
        f"{_base_url()}/cobranca/v3/cobrancas",
        headers=_headers_inter(),
        json=payload,
        cert=_cert()
    )
    if response.status_code in [200, 201]:
        return response.json()
    raise Exception(f"Erro ao emitir boleto Inter [{settings.INTER_ENV}]: {response.status_code} — {response.text}")


def consultar_boleto(codigo_solicitacao: str) -> dict:
    response = requests.get(
        f"{_base_url()}/cobranca/v3/cobrancas/{codigo_solicitacao}",
        headers=_headers_inter(),
        cert=_cert()
    )
    if response.status_code == 200:
        return response.json()
    raise Exception(f"Erro ao consultar boleto Inter [{settings.INTER_ENV}]: {response.status_code} — {response.text}")


def cancelar_boleto(codigo_solicitacao: str, motivo: str = "ACERTOS") -> bool:
    response = requests.post(
        f"{_base_url()}/cobranca/v3/cobrancas/{codigo_solicitacao}/cancelar",
        headers=_headers_inter(),
        json={"motivoCancelamento": motivo},
        cert=_cert()
    )
    if response.status_code in [200, 201, 202, 204]:
        return True
    raise Exception(f"Erro ao cancelar boleto Inter [{settings.INTER_ENV}]: {response.status_code} — {response.text}")


def listar_cobrancas(data_inicio: str, data_fim: str, situacao: str = "TODAS") -> list:
    """Lista todas as cobranças no período. Faz paginação automática."""
    todos = []
    pagina = 1
    while True:
        params = {
            "dataInicial": data_inicio,
            "dataFinal": data_fim,
            "filtrarDataPor": "VENCIMENTO",
            "situacao": situacao,
            "pagina": pagina,
            "tamanhoPagina": 100,
        }

        response = requests.get(
            f"{_base_url()}/cobranca/v3/cobrancas",
            headers=_headers_inter(),
            params=params,
            cert=_cert()
        )
        if response.status_code != 200:
            raise Exception(f"Erro ao listar cobrancas Inter [{settings.INTER_ENV}]: {response.status_code} — {response.text}")

        data = response.json()
        print(f"[Inter/listar] pagina={pagina} status={response.status_code}")
        print(f"[Inter/listar] chaves na resposta: {list(data.keys())}")
        itens = data.get("cobrancas", [])
        total = data.get("total", 0)
        print(f"[Inter/listar] total={total} itens_pagina={len(itens)}")
        if itens:
            print(f"[Inter/listar] primeiro item: {itens[0]}")
        todos.extend(itens)
        if len(todos) >= total or not itens:
            break
        pagina += 1

    return todos


def baixar_pdf(codigo_solicitacao: str) -> bytes:
    response = requests.get(
        f"{_base_url()}/cobranca/v3/cobrancas/{codigo_solicitacao}/pdf",
        headers=_headers_inter(),
        cert=_cert()
    )
    if response.status_code == 200:
        data = response.json()
        pdf_b64 = data.get("pdf") or data.get("boleto") or data.get("conteudo")
        if not pdf_b64:
            raise Exception("PDF não encontrado na resposta da API Inter.")
        return base64.b64decode(pdf_b64)
    raise Exception(f"Erro ao baixar PDF Inter [{settings.INTER_ENV}]: {response.status_code} — {response.text}")
