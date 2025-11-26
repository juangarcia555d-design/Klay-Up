-- Migración: añadir columna `is_public` a la tabla `photos`

alter table if exists public.photos
  add column if not exists is_public boolean default true;

-- Index opcional para consultas por visibilidad
create index if not exists idx_photos_is_public on public.photos(is_public);
