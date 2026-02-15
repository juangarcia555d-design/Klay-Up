-- Agrega el campo group_id a la tabla photos para agrupar fotos por publicación
ALTER TABLE photos ADD COLUMN group_id UUID;
-- Opcional: crea un índice para búsquedas rápidas por group_idd
CREATE INDEX IF NOT EXISTS idx_photos_group_id ON photos(group_id);