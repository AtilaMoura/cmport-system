"""
Teste de envio de email via Microsoft Graph API (client_credentials flow).
Objetivo: validar que a conta financeiro@cmport.com.br consegue enviar
emails via Graph sem usuário logado (daemon/backend use case).

Pré-requisitos no Azure AD:
  - App registration com permissão Mail.Send (Application, não Delegated)
  - Admin consent concedido para Mail.Send

Rodar: python test_graph_email.py
"""

import base64
import json
import sys

import msal
import requests


# ── Credenciais ───────────────────────────────────────────────────────────────

CLIENT_ID     = "ad6878ec-b628-4532-ba97-32f1ca13aa19"
CLIENT_SECRET = "wZT8Q~gZQR-Annia0q4Qv8y0XGGLvrMNYqveHb9g"
TENANT_ID     = "5e66cda7-acd6-4ce0-8fad-72231d2a0615"
SENDER_EMAIL  = "financeiro@cmport.com.br"
TO_EMAIL      = "atilagmoura@gmail.com"

AUTHORITY = f"https://login.microsoftonline.com/{TENANT_ID}"
SCOPE     = ["https://graph.microsoft.com/.default"]
GRAPH_URL = "https://graph.microsoft.com/v1.0"


# ── Token ─────────────────────────────────────────────────────────────────────

def obter_token() -> str:
    """Obtém access token via client_credentials (sem usuário logado)."""
    app = msal.ConfidentialClientApplication(
        client_id=CLIENT_ID,
        client_credential=CLIENT_SECRET,
        authority=AUTHORITY,
    )

    resultado = app.acquire_token_for_client(scopes=SCOPE)

    if "error" in resultado:
        print(f"\n[ERRO] Falha ao obter token:")
        print(f"  error:             {resultado.get('error')}")
        print(f"  error_description: {resultado.get('error_description')}")
        sys.exit(1)

    token = resultado.get("access_token")
    if not token:
        print("[ERRO] Resposta do MSAL não contém access_token.")
        print(json.dumps(resultado, indent=2))
        sys.exit(1)

    print(f"[OK] Token obtido: {token[:40]}...  ({len(token)} chars)")
    return token


# ── Email ─────────────────────────────────────────────────────────────────────

def montar_payload(destinatario: str, assunto: str, corpo_html: str) -> dict:
    """Monta o payload JSON para /sendMail."""
    return {
        "message": {
            "subject": assunto,
            "body": {
                "contentType": "HTML",
                "content": corpo_html,
            },
            "toRecipients": [
                {"emailAddress": {"address": destinatario}}
            ],
            # ── Exemplo de anexos (descomente e adapte conforme necessário) ──
            #
            # "attachments": [
            #     {
            #         # ── PDF ──────────────────────────────────────────────
            #         "@odata.type":  "#microsoft.graph.fileAttachment",
            #         "name":         "boleto.pdf",
            #         "contentType":  "application/pdf",
            #         "contentBytes": base64.b64encode(open("boleto.pdf", "rb").read()).decode(),
            #     },
            #     {
            #         # ── XML ──────────────────────────────────────────────
            #         "@odata.type":  "#microsoft.graph.fileAttachment",
            #         "name":         "nota_fiscal.xml",
            #         "contentType":  "application/xml",
            #         "contentBytes": base64.b64encode(open("nota.xml", "rb").read()).decode(),
            #     },
            #     {
            #         # ── Bytes em memória (PDF gerado dinamicamente) ───────
            #         "@odata.type":  "#microsoft.graph.fileAttachment",
            #         "name":         "boleto_parcela1.pdf",
            #         "contentType":  "application/pdf",
            #         "contentBytes": base64.b64encode(pdf_bytes).decode(),
            #         # pdf_bytes = bytes retornados por inter_client.baixar_pdf(codigo)
            #     },
            # ],
        },
        "saveToSentItems": True,
    }


def enviar_email(token: str, destinatario: str, assunto: str, corpo_html: str) -> None:
    """Envia email via POST /users/{sender}/sendMail."""
    url     = f"{GRAPH_URL}/users/{SENDER_EMAIL}/sendMail"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type":  "application/json",
    }
    payload = montar_payload(destinatario, assunto, corpo_html)

    print(f"\n[INFO] POST {url}")
    print(f"[INFO] De:  {SENDER_EMAIL}")
    print(f"[INFO] Para: {destinatario}")

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=30)
    except requests.exceptions.RequestException as exc:
        print(f"[ERRO] Falha na requisição HTTP: {exc}")
        sys.exit(1)

    print(f"\n[INFO] Status code: {resp.status_code}")

    # Graph retorna 202 Accepted e corpo vazio em caso de sucesso
    if resp.text.strip():
        try:
            print("[INFO] Resposta da API:")
            print(json.dumps(resp.json(), indent=2, ensure_ascii=False))
        except ValueError:
            print(f"[INFO] Resposta (raw): {resp.text}")
    else:
        print("[INFO] Resposta: (sem corpo — esperado para status 202)")

    if resp.status_code == 202:
        print("\n[OK] Email enviado com sucesso!")
    else:
        print("\n[ERRO] Erro ao enviar email")
        sys.exit(1)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Teste: Microsoft Graph API — envio de email")
    print("=" * 60)

    token = obter_token()

    corpo_html = """
    <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <h1 style="color: #1a73e8;">Teste de Envio — CMPort</h1>
        <p>Este é um email de <strong>teste automatizado</strong> enviado pelo sistema CMPort.</p>
        <p>Enviado via <em>Microsoft Graph API</em> usando autenticação
           <code>client_credentials</code> (sem usuário logado).</p>
        <hr>
        <p style="font-size: 12px; color: #888;">
          Remetente: financeiro@cmport.com.br<br>
          Fluxo: client_credentials (daemon/backend)
        </p>
      </body>
    </html>
    """

    enviar_email(
        token=token,
        destinatario=TO_EMAIL,
        assunto="Teste envio CMPort via Graph API",
        corpo_html=corpo_html,
    )


if __name__ == "__main__":
    main()
