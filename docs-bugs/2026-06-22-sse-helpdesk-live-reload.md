# SSE Helpdesk — Live Reload não funcionava (Bug resolvido)

**Data:** 2026-06-22
**Branch:** stable-1.3.1
**Severidade:** Alta — novos tickets criados pelo portal público não apareciam na listagem do agente sem F5.

---

## Sintoma

Ao abrir a página `/[workspaceSlug]/helpdesk/` o console mostrava:

```
XHRPOST /api/workspaces/growatt/helpdesk/sse-token/ 403 Forbidden
```

ou, após a correção do 403:

```
XHRGET http://127.0.0.1:8000/api/workspaces/growatt/helpdesk/events/?token=... 500 Internal Server Error
[SSE] error, retrying in 2000 ms: Error: SSE: HTTP 500
```

A listagem continuava estática — um ticket criado pelo portal público só aparecia depois de F5 ou ao trocar de página e voltar.

---

## Diagnóstico

### Problema 1 — Cookie `SameSite=Lax` bloqueando requisições cross-origin

O frontend roda em `http://127.0.0.1:3000` (Vite dev server) e o backend em `http://127.0.0.1:8000` (Django runserver). Apesar de serem a mesma máquina, para o browser são **origens distintas** (porta diferente).

Todos os cookies de autenticação do Plane são `HttpOnly` + `SameSite=Lax`. Isso impede que o browser envie a sessão do usuário em qualquer requisição cross-origin iniciada via JavaScript (`fetch`, `EventSource`, `XMLHttpRequest`).

Consequências:

- `EventSource` com `withCredentials: true` não envia cookies → 401.
- `fetch` com `credentials: "include"` não envia cookies → 401.
- `document.cookie` não lê o valor da sessão (HttpOnly) → impossível passá-la via query string.

### Problema 2 — `GZipMiddleware` bufferizando o stream

O `GZipMiddleware` do Django estava interceptando a `StreamingHttpResponse` do SSE e tentando comprimí-la, o que consumia todo o stream antes de enviar. Resultado: o browser recebia um body comprimido/vazio sem nenhum evento, com CORS error status `null`.

Corrigido adicionando o header `Content-Encoding: identity` na resposta SSE — esse header diz ao middleware que a resposta já tem seu encoding final e não deve ser re-comprimida.

### Problema 3 — Django `Connection: close` quebrando o streaming pelo proxy Vite

O Django runserver define `Connection: close` em toda `StreamingHttpResponse` que não tem `Content-Length` conhecido (i.e., qualquer stream aberto). O Vite proxy (`http-proxy` por baixo) ao receber `Connection: close` do upstream encerrava a conexão com o cliente imediatamente, antes de qualquer evento ser entregue.

Corrigido interceptando o header no callback `proxyRes` do Vite:

```typescript
proxy.on("proxyRes", (proxyRes, req) => {
  if (req.url?.includes("/helpdesk/events/")) {
    proxyRes.headers["connection"] = "keep-alive";
    proxyRes.headers["transfer-encoding"] = "chunked";
    delete proxyRes.headers["content-length"];
  }
});
```

### Problema 4 — 500 no endpoint SSE: `TypeError: a bytes-like object is required, not 'str'`

**Esta foi a causa raiz do 500 em produção.**

O fluxo de autenticação no endpoint SSE usava um token de uso único armazenado no Redis:

1. `POST /sse-token/` → armazena `user_id` (string) com `redis.setex(key, ttl, str(user.id))`
2. `GET /events/?token=` → lê com `redis.get(key)` e passa para `User.objects.get(pk=user_id)`

O problema: `redis.get()` em Python retorna `bytes` por padrão quando o cliente não é configurado com `decode_responses=True`. O campo `pk` do model `User` é um `UUIDField`, que internamente chama `uuid.UUID(hex=value)`. Esse construtor não aceita `bytes` como argumento para o parâmetro `hex` — lança `TypeError: a bytes-like object is required, not 'str'` (mensagem confusa, mas o `hex` é o parâmetro de string que recebeu bytes).

O Django converte essa exceção não tratada em HTTP 500.

### Problema 5 — `PublicHelpdeskFormSubmitEndpoint` não publicava evento SSE

O endpoint de submissão pública de tickets (`POST /api/helpdesk/public/portals/<slug>/forms/<slug>/submit/`) criava o ticket no banco mas não chamava `sse_broker.publish()`. Isso significa que tickets criados via portal público nunca disparariam o live reload, independentemente de todos os outros problemas estarem corrigidos.

---

## Causa Raiz Técnica

Dois bugs de código + uma limitação de protocolo + um problema de infraestrutura de proxy:

| #   | Onde                               | Causa                                                                                             |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | `SameSite=Lax` + porta diferente   | Cookie não enviado cross-origin → não há como autenticar diretamente em `:8000` via JS de `:3000` |
| 2   | `GZipMiddleware`                   | Bufferiza stream antes de enviar → entrega vazia                                                  |
| 3   | Django `Connection: close`         | Proxy Vite encerra conexão ao receber esse header                                                 |
| 4   | `redis.get()` retorna `bytes`      | `UUIDField.get_prep_value()` não aceita `bytes` → 500                                             |
| 5   | `PublicHelpdeskFormSubmitEndpoint` | Sem `publish()` → tickets públicos nunca disparam SSE                                             |

---

## Solução

### Arquitetura final

Em vez de fazer o browser conectar diretamente em `:8000` (impossível por SameSite), usar o **Vite dev proxy** como intermediário:

```
Browser (:3000)
  └─ fetch("/api/workspaces/.../helpdesk/events/")   ← same-origin, cookies enviados
       └─ Vite proxy → Django (:8000)
```

Como a requisição sai do próprio servidor Vite (Node.js) para Django, não há restrição de cookies — o proxy preserva todos os headers HTTP incluindo `Cookie`. O browser vê apenas a URL relativa `/api/...` no mesmo host:porta, portanto envia os cookies sem restrição.

### Correção 1 — Hook frontend: URL relativa sem token

**`apps/web/core/hooks/use-helpdesk-sse.ts`**

Versão final usa `fetch()` com URL relativa (rota pelo Vite proxy) e parse manual do stream SSE:

```typescript
const response = await fetch(`/api/workspaces/${workspaceSlug}/helpdesk/events/`, {
  credentials: "include",
  headers: { Accept: "text/event-stream" },
  signal,
});
```

Removido todo o código de token (`POST /sse-token/` + `?token=`).

### Correção 2 — Vite proxy com `Connection: close` fix

**`apps/web/vite.config.ts`**

```typescript
server: {
  host: "127.0.0.1",
  proxy: {
    "/api/workspaces": {
      target: process.env.VITE_API_BASE_URL || "http://127.0.0.1:8000",
      changeOrigin: true,
      secure: false,
      configure: (proxy) => {
        proxy.on("proxyRes", (proxyRes, req) => {
          if (req.url?.includes("/helpdesk/events/")) {
            proxyRes.headers["connection"] = "keep-alive";
            proxyRes.headers["transfer-encoding"] = "chunked";
            delete proxyRes.headers["content-length"];
          }
        });
      },
    },
  },
},
```

### Correção 3 — Decode de bytes do Redis

**`apps/api/plane/app/views/helpdesk/sse.py`**

```python
user_id = redis.get(key)
if not user_id:
    return None
redis.delete(key)

if isinstance(user_id, bytes):      # ← correção
    user_id = user_id.decode()

User = get_user_model()
return User.objects.get(pk=user_id)
```

O cliente Redis usado por `get_redis_connection("default")` (django-redis) opera com `decode_responses=False` por padrão. O `redis-py` puro também retorna bytes. Sempre decodificar IDs lidos do Redis antes de passá-los para ORM queries.

### Correção 4 — Publicar evento na submissão pública

**`apps/api/plane/app/views/helpdesk/form.py`** — `PublicHelpdeskFormSubmitEndpoint.post`

```python
from plane.app.helpdesk.sse_broker import publish as sse_publish

# ... após criar helpdesk_request ...
sse_publish(str(portal.workspace.slug), {"type": "request.created", "request_id": str(helpdesk_request.id)})
```

### Correção 5 — `Content-Encoding: identity` na resposta SSE

**`apps/api/plane/app/views/helpdesk/sse.py`** — `HelpdeskSSEView.get`

```python
response["Content-Encoding"] = "identity"
```

Evita que o `GZipMiddleware` bufferize ou comprima o stream.

---

## Broker SSE (Redis pub/sub)

Como o Django runserver pode ser recarregado (e em produção usa múltiplos workers Gunicorn), um broker em memória não compartilha estado entre processos. A solução usa **Redis pub/sub**:

**`apps/api/plane/app/helpdesk/sse_broker.py`**

- `publish(slug, event)` → publica no canal Redis `helpdesk:sse:{slug}`.
- `subscribe(slug)` → cria um `_Subscriber` (threading.Condition + queue) e inicia um daemon thread que assina o canal Redis e entrega mensagens localmente.
- `_Subscriber.events()` → generator que bloqueia a thread do worker Django até receber evento ou heartbeat (20s).

Isso funciona corretamente com Django sync views e `StreamingHttpResponse`.

---

## Arquivos Modificados

| Arquivo                                     | Mudança                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/api/plane/app/views/helpdesk/sse.py`  | Decode de bytes do Redis; `Content-Encoding: identity`; CORS headers     |
| `apps/api/plane/app/views/helpdesk/form.py` | Adiciona `sse_publish()` em `PublicHelpdeskFormSubmitEndpoint`           |
| `apps/api/plane/app/helpdesk/sse_broker.py` | Broker Redis pub/sub (novo arquivo)                                      |
| `apps/web/core/hooks/use-helpdesk-sse.ts`   | Hook com URL relativa via Vite proxy, sem token                          |
| `apps/web/vite.config.ts`                   | Proxy `/api/workspaces` com intercept `Connection: close` → `keep-alive` |

---

## Observações

- **Em produção** (Nginx na frente, sem Vite proxy): o Nginx já une frontend e backend na mesma origem, portanto cookies são enviados normalmente e o `EventSource` padrão funcionaria. O `fetch()` com parse manual funciona em ambos os casos.
- **Redis obrigatório**: o broker pub/sub requer que `REDIS_URL` esteja acessível pelo processo Django. Em dev local, o `docker-compose` já provisiona o Redis e expõe via `REDIS_URL`.
- **`decode_responses`**: o cliente de publish usa `redis.from_url(_redis_url, decode_responses=True)` (strings) enquanto `get_redis_connection("default")` (django-redis) usa bytes por padrão. Sempre checar qual cliente está em uso ao ler IDs do Redis.
- **Heartbeat de 20s**: o generator envia `: heartbeat\n\n` a cada 20s para manter a conexão TCP viva através de proxies e load balancers com timeout de idle.
