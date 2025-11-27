Nuevas rutas y cambios importantes
================================

1) Privacidad de fotos
- Fotos subidas desde el perfil del usuario (endpoint: `POST /auth/profile/photos`) ahora se crean con `user_id` y `is_public = false`. De esta forma sólo son visibles en el perfil del propietario.
- Fotos subidas desde la galería pública (`POST /api/photos`) se marcan `is_public = true`.

2) Endpoints para seguimiento
- POST /api/users/:id/follow  — el usuario autenticado empieza a seguir al usuario :id
- POST /api/users/:id/unfollow — el usuario autenticado deja de seguir a :id
- GET  /api/users/:id/followers — devuelve la lista (max 500) y count de seguidores de :id
- GET  /api/users/:id/following — devuelve la lista (max 500) y count de cuentas a las que :id sigue
- GET  /api/users/:id/relationship — devuelve { isFollowing, followerCount, followingCount, isOwner }

3) Notas de seguridad y comportamiento
- Las rutas que modifican follow/unfollow requieren autenticación por cookie de sesión (`session_token`) — si no estás autenticado, devolverán 401.
- Las páginas públicas de perfil (`/u/:id`) ahora sólo muestran fotos públicas (`is_public = true`) a menos que el visitante sea el propio propietario.

4) Comandos de prueba (ejemplos)
Usa curl incluyendo la cookie de sesión (ejemplo en PowerShell):

```powershell
# Obtener relación / estado
curl -i -H "Cookie: session_token=TOKEN" http://localhost:8080/api/users/123/relationship

# Seguir
curl -i -X POST -H "Cookie: session_token=TOKEN" http://localhost:8080/api/users/123/follow

# Dejar de seguir
curl -i -X POST -H "Cookie: session_token=TOKEN" http://localhost:8080/api/users/123/unfollow

# Lista de seguidores
curl -i http://localhost:8080/api/users/123/followers
```
