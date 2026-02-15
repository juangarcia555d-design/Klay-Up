-- Migración: añadir columna `verified_role` a la tabla `usuarios`
alter table if exists public.usuarios
  add column if not exists verified_role varchar(32);

-- Valores posibles: 'ADMIN' para administrador, 'ARTIST' para artista, NULL para no verificado
