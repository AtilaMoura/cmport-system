class Condominio(Base):
    __tablename__ = "condominios"

    id = Column(Integer, primary_key=True)
    nome = Column(String)

    contatos = relationship("Contato", back_populates="condominio")
