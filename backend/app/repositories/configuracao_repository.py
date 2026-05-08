from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc
from typing import List, Optional

from app.models.configuracao_model import ConfiguracaoEmail, ConfiguracaoEmpresa, ConfiguracaoInter


class ConfiguracaoEmailRepository:

    @staticmethod
    def get_all(db: Session) -> List[ConfiguracaoEmail]:
        return db.query(ConfiguracaoEmail).order_by(ConfiguracaoEmail.criado_em.desc()).all()

    @staticmethod
    def get_by_id(db: Session, id: int) -> Optional[ConfiguracaoEmail]:
        return db.query(ConfiguracaoEmail).filter(ConfiguracaoEmail.id == id).first()

    @staticmethod
    def get_ativo(db: Session) -> Optional[ConfiguracaoEmail]:
        return db.query(ConfiguracaoEmail).filter(ConfiguracaoEmail.ativo == True).first()

    @staticmethod
    def create(db: Session, data: dict) -> ConfiguracaoEmail:
        obj = ConfiguracaoEmail(**data)
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj

    @staticmethod
    def update(db: Session, obj: ConfiguracaoEmail, data: dict) -> ConfiguracaoEmail:
        for k, v in data.items():
            setattr(obj, k, v)
        db.commit()
        db.refresh(obj)
        return obj

    @staticmethod
    def delete(db: Session, obj: ConfiguracaoEmail) -> None:
        db.delete(obj)
        db.commit()

    @staticmethod
    def desativar_todos(db: Session) -> None:
        db.query(ConfiguracaoEmail).update({"ativo": False})
        db.commit()


class ConfiguracaoEmpresaRepository:

    @staticmethod
    def get(db: Session) -> Optional[ConfiguracaoEmpresa]:
        return db.query(ConfiguracaoEmpresa).first()

    @staticmethod
    def upsert(db: Session, data: dict) -> ConfiguracaoEmpresa:
        obj = db.query(ConfiguracaoEmpresa).first()
        if obj:
            for k, v in data.items():
                setattr(obj, k, v)
        else:
            obj = ConfiguracaoEmpresa(**data)
            db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj


class ConfiguracaoInterRepository:

    @staticmethod
    def get_all(db: Session) -> List[ConfiguracaoInter]:
        return db.query(ConfiguracaoInter).order_by(ConfiguracaoInter.criado_em.desc()).all()

    @staticmethod
    def get_ativos(db: Session) -> List[ConfiguracaoInter]:
        return db.query(ConfiguracaoInter).filter(ConfiguracaoInter.ativo == True).all()

    @staticmethod
    def get_by_id(db: Session, id: int) -> Optional[ConfiguracaoInter]:
        return db.query(ConfiguracaoInter).filter(ConfiguracaoInter.id == id).first()

    @staticmethod
    def get_by_cnpj(db: Session, cnpj_limpo: str) -> Optional[ConfiguracaoInter]:
        """Busca pelo CNPJ removendo pontuação para comparação."""
        return (
            db.query(ConfiguracaoInter)
            .filter(
                sqlfunc.replace(
                    sqlfunc.replace(
                        sqlfunc.replace(ConfiguracaoInter.cnpj, ".", ""),
                        "/", ""
                    ),
                    "-", ""
                ) == cnpj_limpo,
                ConfiguracaoInter.ativo == True,
            )
            .first()
        )

    @staticmethod
    def create(db: Session, data: dict) -> ConfiguracaoInter:
        obj = ConfiguracaoInter(**data)
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj

    @staticmethod
    def update(db: Session, obj: ConfiguracaoInter, data: dict) -> ConfiguracaoInter:
        for k, v in data.items():
            setattr(obj, k, v)
        db.commit()
        db.refresh(obj)
        return obj

    @staticmethod
    def desativar(db: Session, obj: ConfiguracaoInter) -> ConfiguracaoInter:
        obj.ativo = False
        db.commit()
        db.refresh(obj)
        return obj
