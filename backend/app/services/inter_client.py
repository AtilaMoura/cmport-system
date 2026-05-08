import base64
import requests
from datetime import datetime, timedelta
from typing import Optional

from app.core.config import settings


TIMEOUT = 20  # segundos

# URLs por ambiente
_BASE_URLS = {
    "sandbox":    "https://cdpj-sandbox.partners.uatinter.co",
    "production": "https://cdpj.partners.bancointer.com.br",
}


class InterClient:
    """Cliente para a API Banco Inter. Uma instância por conta/CNPJ."""

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        conta_corrente: str,
        cert_path: str,
        env: str = None,
    ):
        self.client_id      = client_id
        self.client_secret  = client_secret
        self.conta_corrente = conta_corrente
        self.cert_path      = cert_path
        self.env            = env or settings.INTER_ENV
        self._token: Optional[str] = None
        self._expires_at: Optional[datetime] = None

    def _base_url(self) -> str:
        return _BASE_URLS.get(self.env, _BASE_URLS["sandbox"])

    def _cert(self) -> tuple:
        path = self.cert_path
        if not path.endswith("/"):
            path += "/"
        return (path + "certificado.crt", path + "key.key")

    def _obter_token(self) -> Optional[str]:
        credentials = base64.b64encode(
            f"{self.client_id}:{self.client_secret}".encode()
        ).decode()
        headers = {
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        data = {
            "grant_type": "client_credentials",
            "scope": "boleto-cobranca.read boleto-cobranca.write",
        }
        try:
            response = requests.post(
                f"{self._base_url()}/oauth/v2/token",
                headers=headers,
                data=data,
                cert=self._cert(),
                timeout=TIMEOUT,
            )
            if response.status_code == 200:
                info = response.json()
                self._token = info.get("access_token")
                expires_in = info.get("expires_in", 3600)
                self._expires_at = datetime.now() + timedelta(seconds=expires_in - 300)
                return self._token
            print(f"[Inter/{self.env}/{self.conta_corrente}] Erro ao obter token: {response.status_code} — {response.text}")
            return None
        except Exception as e:
            print(f"[Inter/{self.env}/{self.conta_corrente}] Exceção ao obter token: {e}")
            return None

    def _get_token(self) -> str:
        if self._token and self._expires_at and datetime.now() < self._expires_at:
            return self._token
        token = self._obter_token()
        if not token:
            raise Exception("Não foi possível obter token da API Inter.")
        return token

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._get_token()}",
            "x-conta-corrente": self.conta_corrente,
            "x-inter-conta-corrente": self.conta_corrente,
            "Content-Type": "application/json",
        }

    def emitir_boleto(self, payload: dict) -> dict:
        response = requests.post(
            f"{self._base_url()}/cobranca/v3/cobrancas",
            headers=self._headers(),
            json=payload,
            cert=self._cert(),
            timeout=TIMEOUT,
        )
        if response.status_code in [200, 201]:
            return response.json()
        raise Exception(
            f"Erro ao emitir boleto Inter [{self.env}/{self.conta_corrente}]: "
            f"{response.status_code} — {response.text}"
        )

    def consultar_boleto(self, codigo_solicitacao: str) -> dict:
        response = requests.get(
            f"{self._base_url()}/cobranca/v3/cobrancas/{codigo_solicitacao}",
            headers=self._headers(),
            cert=self._cert(),
            timeout=TIMEOUT,
        )
        if response.status_code == 200:
            return response.json()
        raise Exception(
            f"Erro ao consultar boleto Inter [{self.env}/{self.conta_corrente}]: "
            f"{response.status_code} — {response.text}"
        )

    def cancelar_boleto(self, codigo_solicitacao: str, motivo: str = "ACERTOS") -> bool:
        response = requests.post(
            f"{self._base_url()}/cobranca/v3/cobrancas/{codigo_solicitacao}/cancelar",
            headers=self._headers(),
            json={"motivoCancelamento": motivo},
            cert=self._cert(),
            timeout=TIMEOUT,
        )
        if response.status_code in [200, 201, 202, 204]:
            return True
        raise Exception(
            f"Erro ao cancelar boleto Inter [{self.env}/{self.conta_corrente}]: "
            f"{response.status_code} — {response.text}"
        )

    def listar_cobrancas(self, data_inicio: str, data_fim: str, situacao: str = "TODAS") -> list:
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
                f"{self._base_url()}/cobranca/v3/cobrancas",
                headers=self._headers(),
                params=params,
                cert=self._cert(),
                timeout=TIMEOUT,
            )
            if response.status_code != 200:
                raise Exception(
                    f"Erro ao listar cobranças Inter [{self.env}/{self.conta_corrente}]: "
                    f"{response.status_code} — {response.text}"
                )
            data = response.json()
            print(f"[Inter/listar/{self.conta_corrente}] pagina={pagina} status={response.status_code}")
            itens = data.get("cobrancas", [])
            total = data.get("totalElementos") or data.get("total", 0)
            print(f"[Inter/listar/{self.conta_corrente}] total={total} itens_pagina={len(itens)}")
            todos.extend(itens)
            if len(todos) >= total or not itens:
                break
            pagina += 1
        return todos

    def baixar_pdf(self, codigo_solicitacao: str) -> bytes:
        response = requests.get(
            f"{self._base_url()}/cobranca/v3/cobrancas/{codigo_solicitacao}/pdf",
            headers=self._headers(),
            cert=self._cert(),
            timeout=TIMEOUT,
        )
        if response.status_code == 200:
            data = response.json()
            pdf_b64 = data.get("pdf") or data.get("boleto") or data.get("conteudo")
            if not pdf_b64:
                raise Exception("PDF não encontrado na resposta da API Inter.")
            return base64.b64decode(pdf_b64)
        raise Exception(
            f"Erro ao baixar PDF Inter [{self.env}/{self.conta_corrente}]: "
            f"{response.status_code} — {response.text}"
        )


# ── Cliente padrão (variáveis de ambiente) ────────────────────────────────────

_default_client: Optional[InterClient] = None


def _get_default_client() -> InterClient:
    global _default_client
    if _default_client is None:
        _default_client = InterClient(
            client_id      = settings.INTER_CLIENT_ID,
            client_secret  = settings.INTER_CLIENT_SECRET,
            conta_corrente = settings.INTER_CONTA_CORRENTE,
            cert_path      = settings.INTER_CERT_PATH,
        )
    return _default_client


# Funções de compatibilidade com código que usa inter_client diretamente como módulo

def emitir_boleto(payload: dict) -> dict:
    return _get_default_client().emitir_boleto(payload)


def consultar_boleto(codigo_solicitacao: str) -> dict:
    return _get_default_client().consultar_boleto(codigo_solicitacao)


def cancelar_boleto(codigo_solicitacao: str, motivo: str = "ACERTOS") -> bool:
    return _get_default_client().cancelar_boleto(codigo_solicitacao, motivo)


def listar_cobrancas(data_inicio: str, data_fim: str, situacao: str = "TODAS") -> list:
    return _get_default_client().listar_cobrancas(data_inicio, data_fim, situacao)


def baixar_pdf(codigo_solicitacao: str) -> bytes:
    return _get_default_client().baixar_pdf(codigo_solicitacao)
