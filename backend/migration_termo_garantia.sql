CREATE TABLE termos_garantia (
    id INT AUTO_INCREMENT PRIMARY KEY,
    servico_id INT NOT NULL UNIQUE,
    produto_descricao TEXT NOT NULL,
    prazo_meses INT NOT NULL,                     -- 3, 6 ou 12
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    orcamento_id INT NULL,                        -- FK local para orcamentos
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_termo_servico FOREIGN KEY (servico_id)
        REFERENCES manutencoes_assistencias(id) ON DELETE CASCADE,
    CONSTRAINT fk_termo_orcamento FOREIGN KEY (orcamento_id)
        REFERENCES orcamentos(id) ON DELETE SET NULL,
    INDEX idx_termo_servico (servico_id)
);
