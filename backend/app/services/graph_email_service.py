import base64
from typing import List, Optional, Tuple

import msal
import requests


GRAPH_URL     = "https://graph.microsoft.com/v1.0"
AUTHORITY_BASE = "https://login.microsoftonline.com"


class GraphEmailService:

    @staticmethod
    def obter_token(client_id: str, client_secret: str, tenant_id: str) -> str:
        app = msal.ConfidentialClientApplication(
            client_id=client_id,
            client_credential=client_secret,
            authority=f"{AUTHORITY_BASE}/{tenant_id}",
        )
        resultado = app.acquire_token_for_client(
            scopes=["https://graph.microsoft.com/.default"]
        )
        if "error" in resultado:
            raise Exception(
                f"Erro ao obter token Graph: "
                f"{resultado.get('error_description', resultado.get('error'))}"
            )
        token = resultado.get("access_token")
        if not token:
            raise Exception("Token Graph não retornado pelo MSAL.")
        return token

    @staticmethod
    def enviar(
        sender_email: str,
        destinatarios: List[str],
        assunto: str,
        corpo_html: str,
        token: str,
        from_name: Optional[str] = None,
        anexos_extras: Optional[List[Tuple[str, bytes, str]]] = None,
    ) -> None:
        """
        Envia email via POST /users/{sender}/sendMail.
        anexos_extras: lista de (filename, bytes, content_type)
        """
        url = f"{GRAPH_URL}/users/{sender_email}/sendMail"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type":  "application/json",
        }

        to_recipients = [
            {"emailAddress": {"address": dest}} for dest in destinatarios
        ]

        attachments = []
        for (filename, content, content_type) in (anexos_extras or []):
            attachments.append({
                "@odata.type":  "#microsoft.graph.fileAttachment",
                "name":         filename,
                "contentType":  content_type or "application/octet-stream",
                "contentBytes": base64.b64encode(content).decode(),
            })

        payload: dict = {
            "message": {
                "subject": assunto,
                "body": {
                    "contentType": "HTML",
                    "content":     corpo_html,
                },
                "toRecipients": to_recipients,
            },
            "saveToSentItems": True,
        }
        if attachments:
            payload["message"]["attachments"] = attachments

        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=60)
        except requests.exceptions.RequestException as exc:
            raise Exception(f"Falha na requisição Graph API: {exc}") from exc

        if resp.status_code != 202:
            detail = ""
            try:
                detail = resp.json().get("error", {}).get("message", resp.text)
            except Exception:
                detail = resp.text
            raise Exception(f"Graph API retornou {resp.status_code}: {detail}")
