-- Crear tabla de categorías personalizadas por usuario
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    name VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name)
);