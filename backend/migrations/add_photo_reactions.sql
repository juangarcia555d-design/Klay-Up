-- Migración: crear tabla para reacciones (like/dislike) a fotos

create table if not exists public.photo_reactions (
  id bigserial primary key,
  photo_id bigint not null,
  user_id bigint not null,
  reaction text not null, -- 'like' o 'dislike'
  created_at timestamptz not null default now(),
  unique(photo_id, user_id)
);

create index if not exists idx_photo_reactions_photo_id on public.photo_reactions(photo_id);
create index if not exists idx_photo_reactions_user_id on public.photo_reactions(user_id);
