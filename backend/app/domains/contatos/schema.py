class Contato(Base):
    __tablename__ = "contatos"

    id = Column(Integer, primary_key=True)
    condominio_id = Column(
        Integer, ForeignKey("condominios.id")
    )

    condominio = relationship("Condominio", back_populates="contatos")
