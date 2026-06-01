import base64
from typing import List, Optional, Tuple

import msal
import requests


GRAPH_URL      = "https://graph.microsoft.com/v1.0"
AUTHORITY_BASE = "https://login.microsoftonline.com"

# Limite seguro: se o total bruto de anexos passar de 3 MB usamos
# o fluxo draft + upload-session (evita o limite de 4 MB do sendMail).
_SENDMAIL_LIMIT = 3 * 1024 * 1024


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
        cc_emails: Optional[List[str]] = None,
    ) -> None:
        """
        Envia email via Graph API.
        Usa /sendMail para mensagens pequenas e draft+upload-session para grandes.
        """
        anexos = list(anexos_extras or [])
        total_bytes = sum(len(c) for _, c, _ in anexos)

        if total_bytes > _SENDMAIL_LIMIT:
            GraphEmailService._enviar_via_draft(
                sender_email, destinatarios, assunto, corpo_html,
                token, from_name, anexos, cc_emails,
            )
        else:
            GraphEmailService._enviar_via_sendmail(
                sender_email, destinatarios, assunto, corpo_html,
                token, from_name, anexos, cc_emails,
            )

    # ── sendMail (< 3 MB de anexos) ──────────────────────────────────────────

    @staticmethod
    def _enviar_via_sendmail(
        sender_email: str,
        destinatarios: List[str],
        assunto: str,
        corpo_html: str,
        token: str,
        from_name: Optional[str],
        anexos: List[Tuple[str, bytes, str]],
        cc_emails: Optional[List[str]],
    ) -> None:
        url = f"{GRAPH_URL}/users/{sender_email}/sendMail"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        attachments = [
            {
                "@odata.type":  "#microsoft.graph.fileAttachment",
                "name":         filename,
                "contentType":  ct or "application/octet-stream",
                "contentBytes": base64.b64encode(content).decode(),
            }
            for filename, content, ct in anexos
        ]

        payload: dict = {
            "message": {
                "subject": assunto,
                "body": {"contentType": "HTML", "content": corpo_html},
                "toRecipients": [{"emailAddress": {"address": d}} for d in destinatarios],
            },
            "saveToSentItems": True,
        }
        if cc_emails:
            payload["message"]["ccRecipients"] = [{"emailAddress": {"address": cc}} for cc in cc_emails]
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

    # ── Draft + upload-session (>= 3 MB de anexos) ───────────────────────────

    @staticmethod
    def _enviar_via_draft(
        sender_email: str,
        destinatarios: List[str],
        assunto: str,
        corpo_html: str,
        token: str,
        from_name: Optional[str],
        anexos: List[Tuple[str, bytes, str]],
        cc_emails: Optional[List[str]],
    ) -> None:
        base_url = f"{GRAPH_URL}/users/{sender_email}"
        headers  = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # 1. Cria rascunho
        draft_payload: dict = {
            "subject": assunto,
            "body": {"contentType": "HTML", "content": corpo_html},
            "toRecipients": [{"emailAddress": {"address": d}} for d in destinatarios],
        }
        if cc_emails:
            draft_payload["ccRecipients"] = [{"emailAddress": {"address": cc}} for cc in cc_emails]

        resp = requests.post(f"{base_url}/messages", headers=headers, json=draft_payload, timeout=30)
        if resp.status_code not in (200, 201):
            raise Exception(f"Erro ao criar rascunho Graph: {resp.status_code}: {resp.text}")

        msg_id = resp.json()["id"]

        # 2. Adiciona cada anexo
        for filename, content, ct in anexos:
            size = len(content)
            ct = ct or "application/octet-stream"

            if size < 3 * 1024 * 1024:
                # Anexo pequeno — inline
                att_payload = {
                    "@odata.type":  "#microsoft.graph.fileAttachment",
                    "name":         filename,
                    "contentType":  ct,
                    "contentBytes": base64.b64encode(content).decode(),
                }
                resp = requests.post(
                    f"{base_url}/messages/{msg_id}/attachments",
                    headers=headers, json=att_payload, timeout=30,
                )
                if resp.status_code not in (200, 201):
                    raise Exception(f"Erro ao anexar {filename}: {resp.status_code}: {resp.text}")
            else:
                # Anexo grande — upload session
                session_payload = {
                    "AttachmentItem": {
                        "attachmentType": "file",
                        "name": filename,
                        "size": size,
                        "contentType": ct,
                    }
                }
                resp = requests.post(
                    f"{base_url}/messages/{msg_id}/attachments/createUploadSession",
                    headers=headers, json=session_payload, timeout=30,
                )
                if resp.status_code not in (200, 201):
                    raise Exception(f"Erro ao criar upload session para {filename}: {resp.status_code}: {resp.text}")

                upload_url = resp.json()["uploadUrl"]

                # Envia em chunks de 4 MB
                chunk_size = 4 * 1024 * 1024
                for start in range(0, size, chunk_size):
                    chunk = content[start: start + chunk_size]
                    end   = min(start + chunk_size - 1, size - 1)
                    upload_headers = {
                        "Content-Length": str(len(chunk)),
                        "Content-Range":  f"bytes {start}-{end}/{size}",
                    }
                    resp = requests.put(upload_url, headers=upload_headers, data=chunk, timeout=60)
                    if resp.status_code not in (200, 201, 202):
                        raise Exception(f"Erro no upload de {filename} (chunk {start}-{end}): {resp.status_code}: {resp.text}")

        # 3. Envia o rascunho
        resp = requests.post(f"{base_url}/messages/{msg_id}/send", headers=headers, timeout=30)
        if resp.status_code != 202:
            detail = ""
            try:
                detail = resp.json().get("error", {}).get("message", resp.text)
            except Exception:
                detail = resp.text
            raise Exception(f"Erro ao enviar rascunho Graph: {resp.status_code}: {detail}")
