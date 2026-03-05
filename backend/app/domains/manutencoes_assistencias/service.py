# service.py
from sqlalchemy.orm import Session
from typing import Optional, List
from .repository import ServicoRepository
from .schema import ServicoCreate, ServicoUpdate, ServicoResponse
from .repository import ServicoRepository
from ..auditoria.router import registrar_exclusao 

class ServicoService:
    @staticmethod
    def create_servico(db: Session, servico: ServicoCreate):
        return ServicoRepository.create(db, servico.model_dump())

    @staticmethod
    def list_servicos_condominio(db: Session, condominio_id: int):
        return ServicoRepository.list_by_condominio(db, condominio_id)

    @staticmethod
    def list_all_servicos(db: Session, condominio_id: Optional[int] = None) -> List[ServicoResponse]:
        servicos = ServicoRepository.list_all(db, condominio_id)
        # Se quiser converter para schema de resposta (opcional, mas recomendado)
        return [ServicoResponse.from_orm(s) for s in servicos]

    @staticmethod
    def update_servico(db: Session, servico_id: int, servico_update: ServicoUpdate):
        db_servico = ServicoRepository.get_by_id(db, servico_id)
        if not db_servico:
            return None
        return ServicoRepository.update(db, db_servico, servico_update.model_dump(exclude_unset=True))



    @staticmethod
    def delete_servico(db: Session, servico_id: int) -> bool:
        db_servico = ServicoRepository.get_by_id(db, servico_id)
        if not db_servico:
            return False
    
    # Converter para dict antes de deletar (snapshot completo)
        dados_servico = {
            "id": db_servico.id,
            "condominio_id": db_servico.condominio_id,
            "nota_fiscal_id": db_servico.nota_fiscal_id,
            "tipo": db_servico.tipo.value if db_servico.tipo else None,
            "data_servico": db_servico.data_servico.isoformat() if db_servico.data_servico else None,
            "descricao": db_servico.descricao,
            "criado_em": db_servico.criado_em.isoformat() if db_servico.criado_em else None,
            "atualizado_em": db_servico.atualizado_em.isoformat() if db_servico.atualizado_em else None,
            # Adicione mais campos se quiser (ex: condomínio nome, nota número, etc.)
        }
    
        # Registrar exclusão ANTES de deletar
        try:
            registrar_exclusao(
                db=db,
                tipo="servico",
                registro_id=servico_id,
                dados=dados_servico,
                motivo="Exclusão manual via interface"  # ou pegue do frontend se tiver motivo
            )
        except Exception as e:
            print(f"Erro ao registrar exclusão de serviço {servico_id}: {e}")
            # Decida: raise ou continue (depende se quer bloquear exclusão se auditoria falhar)
    
        # Agora deleta
        ServicoRepository.delete(db, db_servico)
        return True
    
    @staticmethod
    def get_servico_by_id(db: Session, servico_id: int):
        return ServicoRepository.get_by_id(db, servico_id)