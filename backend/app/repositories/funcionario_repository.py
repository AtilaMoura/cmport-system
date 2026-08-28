from typing import List, Optional

from sqlalchemy.orm import Session, joinedload

from app.models.funcionario_model import Funcionario, FuncionarioVariaveis


class FuncionarioRepository:

    @staticmethod
    def listar(db: Session, incluir_inativos: bool = True) -> List[Funcionario]:
        q = (
            db.query(Funcionario)
            .options(joinedload(Funcionario.variaveis))
            .filter(Funcionario.deletado_em.is_(None))
        )
        if not incluir_inativos:
            q = q.filter(Funcionario.ativo.is_(True))
        return q.order_by(Funcionario.ativo.desc(), Funcionario.nome.asc()).all()

    @staticmethod
    def get_by_id(db: Session, id: int) -> Optional[Funcionario]:
        return (
            db.query(Funcionario)
            .options(joinedload(Funcionario.variaveis))
            .filter(Funcionario.id == id, Funcionario.deletado_em.is_(None))
            .first()
        )

    @staticmethod
    def create(db: Session, funcionario: Funcionario) -> Funcionario:
        db.add(funcionario)
        db.commit()
        db.refresh(funcionario)
        return funcionario

    @staticmethod
    def update(db: Session, funcionario: Funcionario, dados: dict) -> Funcionario:
        for k, v in dados.items():
            setattr(funcionario, k, v)
        db.commit()
        db.refresh(funcionario)
        return funcionario

    @staticmethod
    def get_variaveis(db: Session, funcionario_id: int) -> Optional[FuncionarioVariaveis]:
        return (
            db.query(FuncionarioVariaveis)
            .filter(FuncionarioVariaveis.funcionario_id == funcionario_id)
            .first()
        )

    @staticmethod
    def upsert_variaveis(db: Session, funcionario_id: int, dados: dict) -> FuncionarioVariaveis:
        v = FuncionarioRepository.get_variaveis(db, funcionario_id)
        if v is None:
            v = FuncionarioVariaveis(funcionario_id=funcionario_id, **dados)
            db.add(v)
        else:
            for k, val in dados.items():
                setattr(v, k, val)
        db.commit()
        db.refresh(v)
        return v
