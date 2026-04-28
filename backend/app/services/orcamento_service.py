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
        orcamentos_auvo_list = auvo_client.get_all_budgets_by_period(date_start, date_end)
        
        novos = 0
        atualizados = 0
        
        for o_brief in orcamentos_auvo_list:
            auvo_id = o_brief.get("publicId")
            
            # Busca detalhe completo do orçamento (incluindo itens e taskIds)
            o = auvo_client.get_budget(auvo_id)
            if not o:
                continue
                
            # Verificar se já existe localmente para o relatório
            existente = OrcamentoRepository.get_by_auvo_id(db, auvo_id)
            
            # Tentar vincular ao condomínio local pelo customer_id do Auvo
            customer_id = o.get("customerId")
            condo_local = CondominioRepository.get_by_auvo_id(db, customer_id)
            condominio_id = condo_local.id if condo_local else None
            
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
                "current_stage_description": o.get("currentStageDescription"),
                "is_cancelled": o.get("isCancelled", False),
                "discount_value": o.get("discountValue", 0),
                "total_products": o.get("totalProducts", 0),
                "total_services": o.get("totalServices", 0),
                "total_additional_costs": o.get("totalAdditionalCosts", 0),
                "gross_total_value": o.get("grossTotalValue", 0),
                "net_total_value": o.get("netTotalValue", 0),
            }
            
            # Mapear itens
            items_data = []
            
            # 1. Produtos
            for p in o.get("products", []):
                auvo_product_id = p.get("code")
                # Tenta resolver FK para produto sincronizado localmente
                produto_local = ProdutoRepository.get_by_auvo_id(db, auvo_product_id)
                
                items_data.append({
                    "tipo": TipoItemOrcamento.PRODUTO,
                    "produto_id": produto_local.id if produto_local else None,
                    "auvo_product_id": auvo_product_id,
                    "nome": p.get("name"),
                    "descricao": p.get("description"),
                    "quantidade": p.get("quantity", 1),
                    "valor_unitario": p.get("unitPrice", 0),
                    "desconto_tipo": p.get("discountType"),
                    "desconto_valor": p.get("discountValue", 0),
                    "valor_total": p.get("totalPrice", 0)
                })
                
            # 2. Serviços
            for s in o.get("services", []):
                items_data.append({
                    "tipo": TipoItemOrcamento.SERVICO,
                    "auvo_service_id": s.get("id"), # GUID do serviço no Auvo
                    "nome": s.get("name"),
                    "descricao": s.get("description"),
                    "quantidade": s.get("quantity", 1),
                    "valor_unitario": s.get("unitPrice", 0),
                    "desconto_tipo": s.get("discountType"),
                    "desconto_valor": s.get("discountValue", 0),
                    "valor_total": s.get("totalPrice", 0)
                })
                
            # 3. Custos Adicionais
            for c in o.get("additionalCosts", []):
                items_data.append({
                    "tipo": TipoItemOrcamento.CUSTO_ADICIONAL,
                    "nome": c.get("name"),
                    "descricao": c.get("description"),
                    "quantidade": c.get("quantity", 1),
                    "valor_unitario": c.get("unitPrice", 0),
                    "valor_total": c.get("totalPrice", 0)
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
