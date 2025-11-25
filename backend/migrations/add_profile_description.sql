-- Migración: añadir columna `profile_description` a la tabla `usuarios`

alter table if exists public.usuarios
  add column if not exists profile_description text default null;
