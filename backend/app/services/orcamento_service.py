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
