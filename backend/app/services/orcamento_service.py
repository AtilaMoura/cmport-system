import base64
import os
from sqlalchemy.orm import Session
from datetime import datetime, date
from typing import List, Optional, Dict, Any

from app.services.auvo_client import auvo_client
from app.repositories.orcamento_repository import OrcamentoRepository
from app.repositories.condominio_repository import CondominioRepository
from app.repositories.produto_repository import ProdutoRepository
from app.models.orcamento_model import TipoItemOrcamento

class OrcamentoService:

    @staticmethod
    def _parse_date(date_str: Optional[str]) -> Optional[date]:
        if not date_str:
            return None
        try:
            # Auvo costuma mandar ISO 8601 (ex: 2024-04-28T00:00:00)
            return datetime.fromisoformat(date_str.split('T')[0]).date()
        except:
            return None

    @staticmethod
    def sincronizar(db: Session, date_start: str, date_end: str) -> Dict[str, int]:
        """Busca orçamentos do Auvo no período e salva localmente."""
        orcamentos_auvo_list = auvo_client.get_all_quotations_by_period(date_start, date_end)
        
        novos = 0
        atualizados = 0
        
        for o_brief in orcamentos_auvo_list:
            auvo_id = o_brief.get("publicId")
            
            # Busca detalhe completo do orçamento (incluindo itens e taskIds)
            o = auvo_client.get_quotation(auvo_id)
            if not o:
                continue
                
            # Verificar se já existe localmente para o relatório
            existente = OrcamentoRepository.get_by_auvo_id(db, auvo_id)
            
            # Tentar vincular ao condomínio local pelo customer_id do Auvo
            customer_id = o.get("customerId")
            condo_local = CondominioRepository.get_by_auvo_id(db, customer_id)
            condominio_id = condo_local.id if condo_local else None
            
            # Extrair objetos aninhados do V2
            summary = o.get("summary", {})
            current_stage = o.get("currentStage", {})
            discount = summary.get("discount", {})
            
            # Mapear dados principais
            orcamento_data = {
                "auvo_public_id": o.get("publicId"),
                "customer_id": customer_id,
                "customer_name": o.get("customerName"),
                "condominio_id": condominio_id,
                "external_code": o.get("externalCode"),
                "register_date": OrcamentoService._parse_date(o.get("registerDate")),
                "request_date": OrcamentoService._parse_date(o.get("requestDate")),
                "expire_date": OrcamentoService._parse_date(o.get("expireDate")),
                "last_update_date": OrcamentoService._parse_date(o.get("lastUpdateDate")),
                "observations": o.get("observations"),
                "internal_note": o.get("internalNote"),
                "public_link": o.get("publicLink"),
                "current_stage_description": current_stage.get("description"),
                "is_cancelled": current_stage.get("isCancelled", False),
                "discount_value": discount.get("value", 0),
                "total_products": summary.get("totalProducts", 0),
                "total_services": summary.get("totalServices", 0),
                "total_additional_costs": summary.get("totalAdditionalCosts", 0),
                "gross_total_value": summary.get("grossTotalValue", 0),
                "net_total_value": summary.get("netTotalValue", 0),
            }
            
            # Mapear itens
            items_data = []
            
            # 1. Produtos
            for p in o.get("products", []):
                auvo_product_id = p.get("productId")
                # Tenta resolver FK para produto sincronizado localmente
                produto_local = ProdutoRepository.get_by_auvo_id(db, auvo_product_id)
                
                # Desconto do item no V2 é um objeto
                p_discount = p.get("unitaryDiscount", {})
                
                items_data.append({
                    "tipo": TipoItemOrcamento.PRODUTO,
                    "produto_id": produto_local.id if produto_local else None,
                    "auvo_product_id": auvo_product_id,
                    "nome": p.get("name") or (produto_local.nome if produto_local else None),
                    "descricao": p.get("description"),
                    "quantidade": p.get("amount", 1),
                    "valor_unitario": p.get("unitaryValue", 0),
                    "desconto_tipo": p_discount.get("type"),
                    "desconto_valor": p_discount.get("value", 0),
                    "valor_total": float(p.get("amount", 1)) * float(p.get("unitaryValue", 0)) # Cálculo manual se não vier pronto
                })
                
            # 2. Serviços
            for s in o.get("services", []):
                s_discount = s.get("unitaryDiscount", {})
                items_data.append({
                    "tipo": TipoItemOrcamento.SERVICO,
                    "auvo_service_id": s.get("serviceId"), # GUID do serviço no Auvo
                    "nome": s.get("name"),
                    "descricao": s.get("description"),
                    "quantidade": s.get("amount", 1),
                    "valor_unitario": s.get("unitaryValue", 0),
                    "desconto_tipo": s_discount.get("type"),
                    "desconto_valor": s_discount.get("value", 0),
                    "valor_total": float(s.get("amount", 1)) * float(s.get("unitaryValue", 0))
                })
                
            # 3. Custos Adicionais
            for c in o.get("additionalCosts", []):
                items_data.append({
                    "tipo": TipoItemOrcamento.CUSTO_ADICIONAL,
                    "nome": c.get("description"), # V2 usa description para o nome do custo
                    "descricao": c.get("description"),
                    "quantidade": 1,
                    "valor_unitario": c.get("value", 0),
                    "valor_total": c.get("value", 0)
                })
                
            # Task IDs (OSs vinculadas)
            task_ids = o.get("taskIds", [])
            
            # Salva orçamento e itens
            OrcamentoRepository.upsert(db, orcamento_data, items_data, task_ids)
            
            if existente:
                atualizados += 1
            else:
                novos += 1
                
        db.commit()
        return {"novos": novos, "atualizados": atualizados}

    @staticmethod
    def listar(db: Session, condominio_id: Optional[int] = None, search: Optional[str] = None, page: int = 1, page_size: int = 50):
        skip = (page - 1) * page_size
        return OrcamentoRepository.list(db, condominio_id=condominio_id, search=search, skip=skip, limit=page_size)

    @staticmethod
    def detalhe(db: Session, orcamento_id: int):
        return OrcamentoRepository.get_by_id(db, orcamento_id)

    @staticmethod
    def listar_por_condominio(db: Session, condominio_id: int, limit: int = 10):
        return OrcamentoRepository.list_by_condominio(db, condominio_id, limit)

    @staticmethod
    def get_por_servico(db: Session, servico_id: int):
        """Retorna o orçamento vinculado ao serviço: manual (orcamento_id) tem prioridade, depois task_id."""
        from app.models.servico_model import ManutencaoAssistencia
        from app.models.orcamento_model import OrcamentoTaskId

        servico = db.query(ManutencaoAssistencia).filter(ManutencaoAssistencia.id == servico_id).first()
        if not servico:
            return None

        if servico.orcamento_id:
            return OrcamentoRepository.get_by_id(db, servico.orcamento_id)

        if not servico.numero_os:
            return None

        try:
            task_id = int(servico.numero_os)
        except (ValueError, TypeError):
            return None

        link = db.query(OrcamentoTaskId).filter(OrcamentoTaskId.task_id == task_id).first()
        if not link:
            return None

        return OrcamentoRepository.get_by_id(db, link.orcamento_id)

    @staticmethod
    def listar_candidatos_para_servico(db: Session, servico_id: int):
        """Retorna orçamentos do condomínio nos 90 dias antes da data do serviço."""
        from app.models.servico_model import ManutencaoAssistencia
        from datetime import timedelta

        servico = db.query(ManutencaoAssistencia).filter(ManutencaoAssistencia.id == servico_id).first()
        if not servico or not servico.condominio_id:
            return []

        data_fim = servico.data_servico
        data_inicio = data_fim - timedelta(days=90)

        return OrcamentoRepository.list_by_condominio_e_periodo(
            db, servico.condominio_id, data_inicio, data_fim
        )

    @staticmethod
    def gerar_pdf(db: Session, orcamento_id: int) -> bytes:
        """Gera PDF do orçamento com WeasyPrint a partir dos dados locais."""
        from weasyprint import HTML
        from app.models.orcamento_model import TipoItemOrcamento
        from app.models.configuracao_model import ConfiguracaoEmpresa

        orc = OrcamentoRepository.get_by_id(db, orcamento_id)
        if not orc:
            raise Exception(f"Orçamento #{orcamento_id} não encontrado.")

        empresa_obj = db.query(ConfiguracaoEmpresa).first()
        empresa_nome = (empresa_obj.nome if empresa_obj else None) or "CMPort"

        _assets = os.path.join(os.path.dirname(__file__), "..", "assets")
        logo_b64 = ""
        try:
            _logo_path = os.path.join(_assets, "logo_novo.jpg")
            with open(_logo_path, "rb") as _f:
                logo_b64 = base64.b64encode(_f.read()).decode()
        except Exception:
            pass

        def fmt(v) -> str:
            try:
                return f"R$ {float(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            except Exception:
                return "—"

        def fmt_date(d) -> str:
            return d.strftime('%d/%m/%Y') if d else "—"

        def fmt_qtd(q) -> str:
            try:
                v = float(q)
                return str(int(v)) if v == int(v) else f"{v:.2f}"
            except Exception:
                return str(q)

        tipo_labels = {
            TipoItemOrcamento.PRODUTO: "Produto",
            TipoItemOrcamento.SERVICO: "Serviço",
            TipoItemOrcamento.CUSTO_ADICIONAL: "Custo Adicional",
        }

        linhas_itens = ""
        for item in (orc.itens or []):
            tipo_txt = tipo_labels.get(item.tipo, str(item.tipo))
            linhas_itens += f"""
            <tr>
              <td>{tipo_txt}</td>
              <td>{item.nome or '—'}</td>
              <td style="text-align:center">{fmt_qtd(item.quantidade)}</td>
              <td style="text-align:right">{fmt(item.valor_unitario)}</td>
              <td style="text-align:right">{fmt(item.valor_total)}</td>
            </tr>"""

        logo_tag = f'<img src="data:image/jpeg;base64,{logo_b64}" style="height:50px;margin-bottom:8px;" /><br/>' if logo_b64 else ""

        html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  body {{ font-family: Arial, sans-serif; font-size: 11px; color: #222; margin: 0; padding: 20px 30px; }}
  h2 {{ font-size: 14px; margin: 0 0 4px; color: #1a3a5c; }}
  .header {{ display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; border-bottom: 2px solid #1a3a5c; padding-bottom: 10px; }}
  .info-block {{ margin-bottom: 12px; }}
  .info-block strong {{ display: inline-block; width: 130px; color: #555; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 12px; }}
  th {{ background: #1a3a5c; color: #fff; padding: 6px 8px; text-align: left; font-size: 11px; }}
  td {{ padding: 5px 8px; border-bottom: 1px solid #e0e0e0; vertical-align: top; }}
  tr:nth-child(even) td {{ background: #f7f9fc; }}
  .totais {{ margin-top: 10px; text-align: right; font-size: 12px; }}
  .totais div {{ margin: 2px 0; }}
  .totais .total-final {{ font-weight: bold; font-size: 14px; color: #1a3a5c; border-top: 2px solid #1a3a5c; padding-top: 4px; margin-top: 6px; display: inline-block; }}
  .obs {{ margin-top: 16px; font-size: 10px; color: #666; border-top: 1px solid #ddd; padding-top: 8px; }}
</style>
</head>
<body>
<div class="header">
  <div>
    {logo_tag}
    <h2>{empresa_nome}</h2>
    <div style="color:#555;font-size:11px;">Orçamento</div>
  </div>
  <div style="text-align:right;">
    <div><strong style="width:auto;color:#555">Nº Auvo:</strong> {orc.auvo_public_id}</div>
    {"<div><strong style='width:auto;color:#555'>Cód. Externo:</strong> " + (orc.external_code or "—") + "</div>"}
    <div><strong style="width:auto;color:#555">Data:</strong> {fmt_date(orc.register_date)}</div>
    <div><strong style="width:auto;color:#555">Validade:</strong> {fmt_date(orc.expire_date)}</div>
    <div style="margin-top:6px;padding:4px 8px;background:#1a3a5c;color:#fff;border-radius:3px;display:inline-block;">{orc.current_stage_description or 'Orçamento'}</div>
  </div>
</div>

<div class="info-block">
  <div><strong>Cliente:</strong> {orc.customer_name or '—'}</div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:90px">Tipo</th>
      <th>Descrição</th>
      <th style="width:50px;text-align:center">Qtd</th>
      <th style="width:100px;text-align:right">Unit.</th>
      <th style="width:100px;text-align:right">Total</th>
    </tr>
  </thead>
  <tbody>
    {linhas_itens or '<tr><td colspan="5" style="text-align:center;color:#999">Nenhum item</td></tr>'}
  </tbody>
</table>

<div class="totais">
  <div><strong style="color:#555">Produtos:</strong> {fmt(orc.total_products)}</div>
  <div><strong style="color:#555">Serviços:</strong> {fmt(orc.total_services)}</div>
  {"<div><strong style='color:#555'>Custos Adicionais:</strong> " + fmt(orc.total_additional_costs) + "</div>" if float(orc.total_additional_costs or 0) else ""}
  {"<div><strong style='color:#555'>Desconto:</strong> -" + fmt(orc.discount_value) + "</div>" if float(orc.discount_value or 0) else ""}
  <div class="total-final">Total Líquido: {fmt(orc.net_total_value)}</div>
</div>

{"<div class='obs'><strong>Observações:</strong> " + orc.observations + "</div>" if orc.observations else ""}
</body>
</html>"""

        base_url = f"file://{os.path.abspath(_assets)}/"
        return HTML(string=html, base_url=base_url).write_pdf()
