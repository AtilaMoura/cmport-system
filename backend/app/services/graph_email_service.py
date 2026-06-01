import base64
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional, Tuple

import msal
import requests


GRAPH_URL      = "https://graph.microsoft.com/v1.0"
AUTHORITY_BASE = "https://login.microsoftonline.com"

# Acima deste limite o payload JSON do sendMail ultrapassa 4 MB (overhead base64 ~33%).
# Nesses casos usamos o fluxo MIME, que só exige Mail.Send e suporta até ~25 MB.
_SENDMAIL_JSON_LIMIT = 3 * 1024 * 1024  # 3 MB em bytes brutos


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
        - Anexos < 3 MB total: sendMail com JSON (simples).
        - Anexos >= 3 MB total: sendMail com MIME (não precisa de Mail.ReadWrite).
        """
        anexos = list(anexos_extras or [])

        total_bytes = sum(len(c) for _, c, _ in anexos)
        print(f"[Graph] Total anexos: {total_bytes/1024/1024:.1f} MB ({len(anexos)} arquivo(s))")

        if total_bytes >= _SENDMAIL_JSON_LIMIT:
            print(f"[Graph] Anexos somam {total_bytes/1024/1024:.1f} MB — usando envio MIME.")
            GraphEmailService._enviar_via_mime(
                sender_email, destinatarios, assunto, corpo_html,
                token, from_name, anexos, cc_emails,
            )
        else:
            GraphEmailService._enviar_via_json(
                sender_email, destinatarios, assunto, corpo_html,
                token, from_name, anexos, cc_emails,
            )

    # ── sendMail JSON (< 3 MB) ────────────────────────────────────────────────

    @staticmethod
    def _enviar_via_json(
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

    # ── sendMail MIME (>= 3 MB, exige apenas Mail.Send) ───────────────────────

    @staticmethod
    def _enviar_via_mime(
        sender_email: str,
        destinatarios: List[str],
        assunto: str,
        corpo_html: str,
        token: str,
        from_name: Optional[str],
        anexos: List[Tuple[str, bytes, str]],
        cc_emails: Optional[List[str]],
    ) -> None:
        # Constrói mensagem MIME
        msg = MIMEMultipart("mixed")
        remetente = f"{from_name} <{sender_email}>" if from_name else sender_email
        msg["From"]    = remetente
        msg["To"]      = ", ".join(destinatarios)
        msg["Subject"] = assunto
        if cc_emails:
            msg["CC"] = ", ".join(cc_emails)

        msg.attach(MIMEText(corpo_html, "html", "utf-8"))

        for filename, content, ct in anexos:
            main_type, sub_type = (ct or "application/octet-stream").split("/", 1)
            part = MIMEBase(main_type, sub_type)
            part.set_payload(content)
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", "attachment", filename=filename)
            msg.attach(part)

        # Codifica a mensagem MIME em base64 padrão para a Graph API
        mime_b64 = base64.b64encode(msg.as_bytes()).decode()

        url = f"{GRAPH_URL}/users/{sender_email}/sendMail"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type":  "text/plain",
        }

        try:
            resp = requests.post(url, headers=headers, data=mime_b64, timeout=120)
        except requests.exceptions.RequestException as exc:
            raise Exception(f"Falha na requisição Graph API (MIME): {exc}") from exc

        if resp.status_code != 202:
            detail = ""
            try:
                detail = resp.json().get("error", {}).get("message", resp.text)
            except Exception:
                detail = resp.text
            raise Exception(f"Graph API MIME retornou {resp.status_code}: {detail}")
