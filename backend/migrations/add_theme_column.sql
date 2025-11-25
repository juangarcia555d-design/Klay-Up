-- Migración: añadir columna `theme` a la tabla `usuarios`

alter table if exists public.usuarios
  add column if not exists theme text default 'default';
