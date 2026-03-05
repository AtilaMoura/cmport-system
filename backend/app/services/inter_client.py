import base64
import requests
from datetime import datetime, timedelta
from typing import Optional

from app.core.config import settings


TOKEN_DATA = {
    "token": None,
    "expires_at": None
}


def _cert():
    """Retorna a tupla (crt, key) para requests."""
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
            "https://cdpj.partners.bancointer.com.br/oauth/v2/token",
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
        print(f"Erro ao obter token Inter: {response.status_code} — {response.text}")
        return None
    except Exception as e:
        print(f"Exceção ao obter token Inter: {e}")
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
        "Content-Type": "application/json"
    }


def emitir_boleto(payload: dict) -> dict:
    response = requests.post(
        "https://cdpj.partners.bancointer.com.br/cobranca/v3/cobrancas",
        headers=_headers_inter(),
        json=payload,
        cert=_cert()
    )
    if response.status_code in [200, 201]:
        return response.json()
    raise Exception(f"Erro ao emitir boleto Inter: {response.status_code} — {response.text}")


def consultar_boleto(codigo_solicitacao: str) -> dict:
    response = requests.get(
        f"https://cdpj.partners.bancointer.com.br/cobranca/v3/cobrancas/{codigo_solicitacao}",
        headers=_headers_inter(),
        cert=_cert()
    )
    if response.status_code == 200:
        return response.json()
    raise Exception(f"Erro ao consultar boleto Inter: {response.status_code} — {response.text}")


def cancelar_boleto(codigo_solicitacao: str, motivo: str = "ACERTOS") -> bool:
    response = requests.post(
        f"https://cdpj.partners.bancointer.com.br/cobranca/v3/cobrancas/{codigo_solicitacao}/cancelar",
        headers=_headers_inter(),
        json={"motivoCancelamento": motivo},
        cert=_cert()
    )
    if response.status_code in [200, 201, 202, 204]:
        return True
    raise Exception(f"Erro ao cancelar boleto Inter: {response.status_code} — {response.text}")


def baixar_pdf(codigo_solicitacao: str) -> bytes:
    response = requests.get(
        f"https://cdpj.partners.bancointer.com.br/cobranca/v3/cobrancas/{codigo_solicitacao}/pdf",
        headers=_headers_inter(),
        cert=_cert()
    )
    if response.status_code == 200:
        data = response.json()
        pdf_b64 = data.get("pdf") or data.get("boleto") or data.get("conteudo")
        if not pdf_b64:
            raise Exception("PDF não encontrado na resposta da API Inter.")
        return base64.b64decode(pdf_b64)
    raise Exception(f"Erro ao baixar PDF Inter: {response.status_code} — {response.text}")
