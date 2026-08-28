from datetime import datetime
from typing import List

from sqlalchemy.orm import Session

from app.models.funcionario_model import Funcionario
from app.repositories.funcionario_repository import FuncionarioRepository
from app.schemas.funcionario_schema import (
    FuncionarioCreate, FuncionarioUpdate, FuncionarioResponse,
)


class FuncionarioService:

    @staticmethod
    def listar(db: Session, incluir_inativos: bool = True) -> List[FuncionarioResponse]:
        return [
            FuncionarioResponse.model_validate(f)
            for f in FuncionarioRepository.listar(db, incluir_inativos=incluir_inativos)
        ]

    @staticmethod
    def buscar(db: Session, id: int) -> FuncionarioResponse:
        f = FuncionarioRepository.get_by_id(db, id)
        if not f:
            raise Exception("Funcionario nao encontrado.")
        return FuncionarioResponse.model_validate(f)

    @staticmethod
    def criar(db: Session, req: FuncionarioCreate) -> FuncionarioResponse:
        cnpj = "".join(filter(str.isdigit, req.empresa_padrao_cnpj or ""))
        funcionario = Funcionario(
            nome=req.nome,
            empresa_padrao_cnpj=cnpj,
            cargo=req.cargo,
            data_admissao=req.data_admissao,
            data_demissao=req.data_demissao,
            ativo=req.ativo,
            observacao=req.observacao,
        )
        funcionario = FuncionarioRepository.create(db, funcionario)
        if req.variaveis is not None:
            FuncionarioRepository.upsert_variaveis(db, funcionario.id, req.variaveis.model_dump())
        return FuncionarioService.buscar(db, funcionario.id)

    @staticmethod
    def editar(db: Session, id: int, req: FuncionarioUpdate) -> FuncionarioResponse:
        funcionario = FuncionarioRepository.get_by_id(db, id)
        if not funcionario:
            raise Exception("Funcionario nao encontrado.")
        dados = req.model_dump(exclude_unset=True)
        variaveis = dados.pop("variaveis", None)
        if "empresa_padrao_cnpj" in dados and dados["empresa_padrao_cnpj"]:
            dados["empresa_padrao_cnpj"] = "".join(filter(str.isdigit, dados["empresa_padrao_cnpj"]))
        if dados:
            FuncionarioRepository.update(db, funcionario, dados)
        if variaveis is not None:
            FuncionarioRepository.upsert_variaveis(db, id, variaveis)
        return FuncionarioService.buscar(db, id)

    @staticmethod
    def deletar(db: Session, id: int):
        from app.routers.auditoria_router import registrar_exclusao
        funcionario = FuncionarioRepository.get_by_id(db, id)
        if not funcionario:
            raise Exception("Funcionario nao encontrado.")
        registrar_exclusao(db, "funcionario", id, {"id": funcionario.id, "nome": funcionario.nome})
        FuncionarioRepository.update(db, funcionario, {"deletado_em": datetime.utcnow(), "ativo": False})
