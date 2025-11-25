-- Migración: crear tabla `usuarios` para autenticación personalizada

create table if not exists public.usuarios (
  id serial primary key,
  email text not null unique,
  password_hash text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_usuarios_email on public.usuarios(email);
