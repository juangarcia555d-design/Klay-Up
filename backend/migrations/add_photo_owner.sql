-- Migración: añadir columna `user_id` a la tabla `photos` para asociar fotos a usuarios

alter table if exists public.photos
  add column if not exists user_id bigint;

-- Opcional: crear índice para consultas por usuario
create index if not exists idx_photos_user_id on public.photos(user_id);
