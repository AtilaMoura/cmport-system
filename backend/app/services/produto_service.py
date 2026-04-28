from sqlalchemy.orm import Session
from app.repositories.produto_repository import ProdutoRepository
from app.services.auvo_client import auvo_client
from typing import List, Optional, Dict

class ProdutoService:

    @staticmethod
    def sincronizar(db: Session) -> Dict[str, int]:
        """Sincroniza todos os produtos ativos do Auvo para o banco local."""
        products_auvo = auvo_client.get_all_products()
        
        novos = 0
        atualizados = 0
        
        for p in products_auvo:
            # Mapear dados do Auvo para nosso modelo
            product_data = {
                "auvo_id": p.get("code"),               # ID numérico principal no Auvo
                "auvo_uuid": p.get("productId"),         # GUID no Auvo
                "external_id": p.get("externalId"),
                "nome": p.get("name") or f"Produto {p.get('code')}",
                "descricao": p.get("description"),
                "categoria_id": p.get("categoryId"),
                "valor_unitario": p.get("salesPrice"),
                "custo_unitario": p.get("costPrice"),
                "estoque_minimo": p.get("minimumStock"),
                "estoque_total": p.get("totalStock"),
                "imagem_url": p.get("imageUrl"),
                "ativo": p.get("active", True)
            }
            
            # Upsert na base local
            _, criado = ProdutoRepository.upsert_by_auvo_id(db, product_data)
            if criado:
                novos += 1
            else:
                atualizados += 1
                
        db.commit()
        return {"novos": novos, "atualizados": atualizados}

    @staticmethod
    def listar(db: Session, search: Optional[str] = None, ativo: Optional[bool] = None, page: int = 1, page_size: int = 50):
        skip = (page - 1) * page_size
        return ProdutoRepository.list(db, search=search, ativo=ativo, skip=skip, limit=page_size)

    @staticmethod
    def get_by_auvo_id(db: Session, auvo_id: int):
        return ProdutoRepository.get_by_auvo_id(db, auvo_id)
