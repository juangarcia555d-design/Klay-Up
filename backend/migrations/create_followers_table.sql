-- Migración: crear tabla followers para almacenar relaciones follow/unfollow

create table if not exists public.followers (
  follower_id bigint not null references public.usuarios(id) on delete cascade,
  following_id bigint not null references public.usuarios(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, following_id)
);

create index if not exists idx_followers_following on public.followers(following_id);
create index if not exists idx_followers_follower on public.followers(follower_id);
