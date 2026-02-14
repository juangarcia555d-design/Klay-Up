-- Tabla para almacenar comentarios en publicaciones
CREATE TABLE IF NOT EXISTS photo_comments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  photo_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT fk_photo_comments_photo FOREIGN KEY(photo_id) REFERENCES photos(id) ON DELETE CASCADE,
  CONSTRAINT fk_photo_comments_user FOREIGN KEY(user_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_photo_comments_photo_id ON photo_comments(photo_id);