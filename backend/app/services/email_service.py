import base64
import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from typing import List, Optional
from datetime import date

from app.core.config import settings

# Importação lazy para evitar ciclo (graph_email_service → msal → requests)
# O import real acontece dentro do método enviar_boleto quando necessário.

# Carrega a imagem de assinatura em base64 uma única vez ao importar o módulo
_ASSETS_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")
_ASSINATURA_B64 = ""
try:
    _sig_path = os.path.join(_ASSETS_DIR, "assinatura.jpg")
    with open(_sig_path, "rb") as _f:
        _ASSINATURA_B64 = base64.b64encode(_f.read()).decode()
except Exception:
    pass  # Assinatura não encontrada — rodapé ficará sem imagem


def gerar_html_boleto(
    nome_condominio: str,
    numero_nota: str,
    valor: float,
    vencimento,
    numero_parcela: int = 1,
    total_parcelas: int = 1,
    linha_digitavel: Optional[str] = None,
) -> str:
    """Gera e retorna o HTML do email de boleto (usado no preview)."""
    return _html_boleto(
        nome_condominio=nome_condominio,
        numero_nota=numero_nota,
        valor=valor,
        vencimento=vencimento,
        numero_parcela=numero_parcela,
        total_parcelas=total_parcelas,
        linha_digitavel=linha_digitavel,
    )


def _fmt_valor(valor: float) -> str:
    return f"R$ {valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _fmt_data(d) -> str:
    if isinstance(d, date):
        return d.strftime("%d/%m/%Y")
    return str(d)


_SAUDACAO_PADRAO = "Prezados(as),"
_RODAPE_PADRAO   = ("O boleto em PDF e a ordem de serviço estão anexados a este email.\n"
                    "Por gentileza, confirmar o recebimento deste e-mail.")


def _html_boleto(
    nome_condominio: str,
    numero_nota: str,
    valor: float,
    vencimento,
    numero_parcela: int,
    total_parcelas: int,
    linha_digitavel: Optional[str],
    saudacao: Optional[str] = None,
    corpo: Optional[str] = None,
    rodape: Optional[str] = None,
) -> str:
    parcela_txt = f"Parcela {numero_parcela}/{total_parcelas}" if total_parcelas > 1 else "À vista"

    _saudacao = (saudacao or _SAUDACAO_PADRAO).replace("\n", "<br>")
    _corpo = (corpo or (
        f"Segue em anexo o boleto e a ordem de serviço "
        f"referente à Nota Fiscal <strong>#{numero_nota}</strong> — "
        f"<strong>{nome_condominio}</strong>."
    )).replace("\n", "<br>")
    _rodape = (rodape or _RODAPE_PADRAO).replace("\n", "<br>")

    linha_bloco = ""
    if linha_digitavel:
        linha_bloco = (
            '<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">'
            '<span style="color:#64748b;font-size:13px;">Linha Digitável</span><br>'
            '<span style="font-family:monospace;font-size:15px;font-weight:700;'
            'letter-spacing:1px;color:#1e293b;word-break:break-all;">'
            f'{linha_digitavel}</span></td></tr>'
        )

    assinatura_bloco = ""
    if _ASSINATURA_B64:
        assinatura_bloco = (
            f'<img src="data:image/jpeg;base64,{_ASSINATURA_B64}" '
            'alt="Assinatura CM Port" '
            'style="max-width:480px;width:100%;height:auto;display:block;margin:0 auto;" />'
        )

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;overflow:hidden;
                    box-shadow:0 4px 24px rgba(0,0,0,.08);">

        <!-- Cabeçalho -->
        <tr>
          <td style="background:#1e40af;padding:32px 40px;text-align:center;">
            <p style="margin:0;color:#93c5fd;font-size:13px;font-weight:600;
                      text-transform:uppercase;letter-spacing:2px;">CMPort</p>
            <h1 style="margin:8px 0 0;color:#ffffff;font-size:24px;font-weight:800;">
              Boleto Disponível
            </h1>
          </td>
        </tr>

        <!-- Corpo -->
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 24px;color:#374151;font-size:15px;">
              {_saudacao}<br><br>{_corpo}
            </p>

            <!-- Tabela de dados -->
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="border-collapse:collapse;margin-bottom:24px;">
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                  <span style="color:#64748b;font-size:13px;">Condomínio</span><br>
                  <span style="font-size:16px;font-weight:700;color:#1e293b;">{nome_condominio}</span>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                  <span style="color:#64748b;font-size:13px;">Nota Fiscal</span><br>
                  <span style="font-size:16px;font-weight:700;color:#1e293b;">#{numero_nota}
                    &nbsp;<span style="font-size:13px;font-weight:400;color:#64748b;">
                      ({parcela_txt})</span>
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                  <span style="color:#64748b;font-size:13px;">Valor do Boleto</span><br>
                  <span style="font-size:22px;font-weight:800;color:#1e40af;">
                    {_fmt_valor(valor)}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                  <span style="color:#64748b;font-size:13px;">Vencimento</span><br>
                  <span style="font-size:16px;font-weight:700;color:#dc2626;">
                    {_fmt_data(vencimento)}
                  </span>
                </td>
              </tr>
              {linha_bloco}
            </table>

            <p style="margin:0 0 8px;color:#64748b;font-size:13px;">
              {_rodape}
            </p>
          </td>
        </tr>

        <!-- Assinatura -->
        <tr>
          <td style="background:#f8fafc;padding:28px 40px;border-top:1px solid #e2e8f0;">
            {assinatura_bloco}
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


class EmailService:
    @staticmethod
    def enviar_boleto(
        destinatarios: List[str],
        boleto_pdf: bytes,
        codigo_boleto: str,
        numero_nota: str,
        nome_condominio: str,
        valor: float,
        vencimento,
        numero_parcela: int = 1,
        total_parcelas: int = 1,
        linha_digitavel: Optional[str] = None,
        xml_bytes: Optional[bytes] = None,
        xml_filename: Optional[str] = None,
        assunto_override: Optional[str] = None,
        saudacao: Optional[str] = None,
        corpo: Optional[str] = None,
        rodape: Optional[str] = None,
        anexos_extras: Optional[List[tuple]] = None,
        # Credenciais SMTP explícitas (legado — ignoradas quando db é fornecido)
        email_remetente: Optional[str] = None,
        senha_remetente: Optional[str] = None,
        from_name: Optional[str] = None,
        # Sessão DB: quando presente, detecta automaticamente SMTP vs Graph
        db=None,
    ) -> None:
        """
        Envia email com boleto (PDF + XML + anexos extras).
        Quando `db` é fornecido, usa a conta ativa do banco (SMTP ou Graph API).
        Sem `db`, usa SMTP com as credenciais explícitas ou o fallback do .env.
        """
        if not destinatarios:
            raise Exception("Nenhum destinatário informado.")

        assunto = assunto_override or f"Boleto #{numero_nota} — {nome_condominio} — Venc. {_fmt_data(vencimento)}"

        # Monta lista de todos os anexos para ambos os fluxos
        todos_anexos: List[tuple] = []
        todos_anexos.append((f"boleto_{codigo_boleto}.pdf", boleto_pdf, "application/pdf"))
        if xml_bytes and xml_filename:
            todos_anexos.append((xml_filename, xml_bytes, "application/xml"))
        for item in (anexos_extras or []):
            todos_anexos.append(item)

        # Gera HTML do email
        html = _html_boleto(
            nome_condominio=nome_condominio,
            numero_nota=numero_nota,
            valor=valor,
            vencimento=vencimento,
            numero_parcela=numero_parcela,
            total_parcelas=total_parcelas,
            linha_digitavel=linha_digitavel,
            saudacao=saudacao,
            corpo=corpo,
            rodape=rodape,
        )

        # ── Detecta conta ativa ───────────────────────────────────────────────
        if db is not None:
            from app.services.configuracao_service import get_config_ativa
            cfg = get_config_ativa(db)

            if cfg["tipo"] == "GRAPH_API":
                EmailService._enviar_graph(
                    sender_email=cfg["email"],
                    destinatarios=destinatarios,
                    assunto=assunto,
                    corpo_html=html,
                    from_name=cfg.get("from_name"),
                    graph_client_id=cfg["graph_client_id"],
                    graph_tenant_id=cfg["graph_tenant_id"],
                    graph_client_secret=cfg["graph_client_secret"],
                    todos_anexos=todos_anexos,
                )
                return

            # SMTP via DB
            email_remetente = cfg["email"]
            senha_remetente = cfg["senha"]
            from_name       = cfg.get("from_name") or from_name

        # ── Fluxo SMTP ────────────────────────────────────────────────────────
        _email = email_remetente or settings.OUTLOOK_EMAIL
        _senha = senha_remetente or settings.OUTLOOK_PASSWORD
        _from  = from_name or settings.EMAIL_FROM_NAME

        if not _email or not _senha:
            raise Exception("Nenhuma conta de email configurada. Acesse Configurações → Email.")

        msg = MIMEMultipart("mixed")
        msg["From"]    = f"{_from} <{_email}>"
        msg["To"]      = ", ".join(destinatarios)
        msg["Subject"] = assunto
        msg.attach(MIMEText(html, "html", "utf-8"))

        for (filename, conteudo, content_type) in todos_anexos:
            tipo_principal, subtipo = (content_type or "application/octet-stream").split("/", 1)
            parte = MIMEBase(tipo_principal, subtipo)
            parte.set_payload(conteudo)
            encoders.encode_base64(parte)
            parte.add_header("Content-Disposition", "attachment", filename=filename)
            msg.attach(parte)

        context = ssl.create_default_context()
        with smtplib.SMTP("smtp.office365.com", 587, timeout=30) as smtp:
            smtp.ehlo()
            smtp.starttls(context=context)
            smtp.ehlo()
            smtp.login(_email, _senha)
            smtp.sendmail(_email, destinatarios, msg.as_bytes())

    @staticmethod
    def _enviar_graph(
        sender_email: str,
        destinatarios: List[str],
        assunto: str,
        corpo_html: str,
        from_name: Optional[str],
        graph_client_id: str,
        graph_tenant_id: str,
        graph_client_secret: str,
        todos_anexos: List[tuple],
    ) -> None:
        if not graph_client_id or not graph_tenant_id or not graph_client_secret:
            raise Exception("Credenciais Graph API incompletas. Verifique Configurações → Email.")

        from app.services.graph_email_service import GraphEmailService
        token = GraphEmailService.obter_token(graph_client_id, graph_client_secret, graph_tenant_id)
        GraphEmailService.enviar(
            sender_email=sender_email,
            destinatarios=destinatarios,
            assunto=assunto,
            corpo_html=corpo_html,
            token=token,
            from_name=from_name,
            anexos_extras=todos_anexos,
        )
