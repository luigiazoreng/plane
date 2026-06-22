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

### Problema 6 — `StreamingHttpResponse` + async generator fecha o stream em ~10ms (CAUSA RAIZ FINAL)

**Este foi o último e mais persistente bug — o que mantinha o sintoma `[SSE] error: Error in input stream` mesmo após todas as correções anteriores.**

Sintoma observável nos logs do backend:

```
GET /api/workspaces/growatt/helpdesk/events/ 200  duration_ms: 10
GET /api/workspaces/growatt/helpdesk/events/ 200  duration_ms: 11
GET /api/workspaces/growatt/helpdesk/events/ 200  duration_ms: 12
```

Uma conexão SSE **deveria durar minutos** (aberta, com heartbeats). Em vez disso completava em ~10ms, o frontend recebia no máximo um chunk e a conexão fechava — entrando em loop de reconexão (`Error in input stream` → backoff → reconnect → repeat).

**Causa:** sob ASGI (uvicorn), o `ASGIHandler` do Django **drena o generator inteiro** de uma `StreamingHttpResponse` e fecha a requisição imediatamente. O laço `async def stream(): while True: yield ...` nunca chega a "pausar" entre eventos da forma esperada — o handler consome o iterável até o primeiro `await` que bloqueia e, dependendo do caminho de conversão sync/async do Django, encerra a resposta. `StreamingHttpResponse` foi projetado para WSGI/iteráveis finitos, não para streams infinitos sob ASGI.

Tentativas que **não** resolveram:

- Trocar `EventSource` por `fetch()` com parser manual — o problema era no servidor, não no cliente.
- Substituir o proxy `http-proxy` do Vite por um tunnel manual (`http.request` + pipe) — necessário (ver Problema 3), mas não suficiente: a conexão ainda fechava na origem (Django).
- Ajustar o `_redis_thread` para não parar prematuramente (`ps.get_message(timeout=1.0)` em vez de `ps.listen()`) — correção válida e mantida (ver abaixo), mas não era a causa do fechamento.

**Solução:** parar de usar `StreamingHttpResponse` e falar **ASGI puro** (`scope`/`receive`/`send`) através de um middleware ASGI que intercepta `/helpdesk/events/` **antes** do ciclo request/response do Django. Ver seção "Arquitetura final".

---

## Causa Raiz Técnica

Vários bugs encadeados — bugs de código, limitação de protocolo, infraestrutura de proxy e, por fim, a incompatibilidade fundamental do `StreamingHttpResponse` com ASGI:

| #   | Onde                               | Causa                                                                                             |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | `SameSite=Lax` + porta diferente   | Cookie não enviado cross-origin → não há como autenticar diretamente em `:8000` via JS de `:3000` |
| 2   | `GZipMiddleware`                   | Bufferiza stream antes de enviar → entrega vazia                                                  |
| 3   | `http-proxy` do Vite (buffering)   | Acumula o body inteiro antes de encaminhar → quebra streaming                                     |
| 4   | `redis.get()` retorna `bytes`      | `UUIDField.get_prep_value()` não aceita `bytes` → 500                                             |
| 5   | `PublicHelpdeskFormSubmitEndpoint` | Sem `publish()` → tickets públicos nunca disparam SSE                                             |
| 6   | `StreamingHttpResponse` sob ASGI   | Handler drena o generator e fecha em ~10ms → **causa raiz final**                                 |

---

## Solução

### Arquitetura final

```
Browser (:3000)
  └─ fetch("/api/workspaces/.../helpdesk/events/")        ← same-origin, cookies enviados
       └─ Vite SSE tunnel (http.request raw pipe)         ← bypass do http-proxy buffering
            └─ uvicorn (:8000)
                 └─ SSEMiddleware (ASGI puro)             ← bypass do StreamingHttpResponse
                      └─ sse_broker (Redis pub/sub)
```

Duas decisões-chave, cada uma resolvendo um ponto onde o stream era bufferizado/encerrado:

1. **Browser → Vite same-origin**: a requisição sai do próprio servidor Vite (Node.js) para o backend, então não há restrição de cookie `SameSite` (ver Problema 1). O browser vê só a URL relativa `/api/...` no mesmo host:porta.

2. **Vite tunnel em vez de proxy** (Problema 3): o `http-proxy` interno do Vite bufferiza a resposta inteira antes de encaminhar, o que quebra streaming. Um **plugin `configureServer`** intercepta `/helpdesk/events/` e faz um pipe cru via `http.request`, encaminhando cada chunk imediatamente (`res.write` + `res.flush`).

3. **Middleware ASGI em vez de `StreamingHttpResponse`** (Problema 6): `SSEMiddleware` em `apps/api/plane/asgi.py` intercepta `/helpdesk/events/` e fala `scope`/`receive`/`send` diretamente — mantendo o loop de streaming aberto, emitindo heartbeats a cada 20s e reagindo a `http.disconnect`.

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

### Correção 2 — Vite SSE tunnel (bypass do http-proxy buffering)

**`apps/web/vite.config.ts`**

Tentar consertar o `http-proxy` interno via `proxyRes` (ajustando `Connection`/`Transfer-Encoding`) não foi suficiente: o `http-proxy` ainda acumula o body. A solução é um plugin `configureServer` que intercepta `/helpdesk/events/` **antes** do proxy e faz um pipe cru:

```typescript
function sseTunnelPlugin(): Plugin {
  return {
    name: "helpdesk-sse-tunnel",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.includes("/helpdesk/events/")) return next();
        const parsed = new URL(backendBase);
        const upstreamReq = http.request(
          {
            hostname: parsed.hostname,
            port: parsed.port || 80,
            path: req.url,
            method: req.method ?? "GET",
            headers: { ...req.headers, host: parsed.host },
          },
          (upstream) => {
            const headers = { ...upstream.headers };
            delete headers["transfer-encoding"];
            delete headers["connection"];
            delete headers["keep-alive"];
            delete headers["content-length"];
            res.writeHead(upstream.statusCode ?? 200, headers);
            upstream.on("data", (chunk) => {
              res.write(chunk);
              (res as any).flush?.();
            });
            upstream.on("end", () => res.end());
            upstream.on("error", () => res.end());
          }
        );
        upstreamReq.on("error", (err) => {
          if (!res.headersSent) res.writeHead(502);
          res.end();
        });
        res.on("close", () => upstreamReq.destroy()); // browser desconectou
        req.pipe(upstreamReq, { end: true });
      });
    },
  };
}
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

### Correção 5 — Middleware ASGI puro (substitui `StreamingHttpResponse`)

**`apps/api/plane/asgi.py`** — `SSEMiddleware`

Em vez de retornar uma `StreamingHttpResponse` da view (que o ASGIHandler drena e fecha — Problema 6), um middleware ASGI envolve a aplicação e intercepta `/helpdesk/events/` antes do Django:

```python
class SSEMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or "/helpdesk/events/" not in scope.get("path", ""):
            await self.app(scope, receive, send)
            return

        user = await sync_to_async(_auth)()           # ASGIRequest + session/auth, sync em thread
        if not user:
            await send({"type": "http.response.start", "status": 401, "headers": []})
            await send({"type": "http.response.body", "body": b"", "more_body": False})
            return

        await send({"type": "http.response.start", "status": 200, "headers": [
            (b"content-type", b"text/event-stream"),
            (b"cache-control", b"no-cache"),
            (b"x-accel-buffering", b"no"),
        ]})

        q = await sse_broker.subscribe(slug)
        # ... loop: wait_for(q.get(), 20s) → http.response.body (more_body=True),
        #     TimeoutError → ": heartbeat\n\n", sentinel None → break,
        #     watch_disconnect() observa http.disconnect ...

application = SSEMiddleware(ProtocolTypeRouter({"http": django_asgi_app}))
```

A `HelpdeskSSEView` em `views/helpdesk/sse.py` permanece registrada na URL apenas como fallback (retorna 503 se o middleware não estiver ativo). As funções de auth (`_resolve_user_sync`, `_build_request_user_sync`) ficam nessa view e são reusadas pelo middleware.

---

## Broker SSE (Redis pub/sub, fully async)

Como o servidor pode ser recarregado (e em produção usa múltiplos workers uvicorn), um broker em memória não compartilha estado entre processos. A solução usa **Redis pub/sub**, agora totalmente async:

**`apps/api/plane/app/helpdesk/sse_broker.py`**

- `publish(slug, event)` → sync, publica no canal Redis `helpdesk:sse:{slug}` (seguro chamar de views DRF).
- `subscribe(slug)` → async, retorna uma `asyncio.Queue` registrada em `_subscribers[slug]`. Na primeira inscrição de um slug, cria um `_listener_task`.
- `_listener_task(slug)` → async task que roda um daemon thread (`_redis_thread`) assinando o canal Redis; o thread usa `ps.get_message(timeout=1.0)` (polling) em vez de `ps.listen()` (bloqueante) para poder observar `stop_event` e encerrar limpo em reload/shutdown. As mensagens chegam via `loop.call_soon_threadsafe` e são distribuídas (fan-out) para todas as `asyncio.Queue` locais.

> **Por que `get_message(timeout=1.0)` e não `listen()`?** `ps.listen()` bloqueia o thread indefinidamente. Quando o uvicorn `StatReload` tenta matar o processo num hot-reload, o daemon thread não morre → **deadlock/hang** do dev server. O polling com timeout permite checar `stop_event` a cada 1s e sair.

---

## Arquivos Modificados

| Arquivo                                     | Mudança                                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `apps/api/plane/asgi.py`                    | **`SSEMiddleware`** — ASGI puro que faz o streaming SSE (substitui `StreamingHttpResponse`)                       |
| `apps/api/plane/app/views/helpdesk/sse.py`  | Auth helpers (`_resolve_user_sync`, `_build_request_user_sync`); decode de bytes do Redis; view vira fallback 503 |
| `apps/api/plane/app/views/helpdesk/form.py` | Adiciona `sse_publish()` em `PublicHelpdeskFormSubmitEndpoint`                                                    |
| `apps/api/plane/app/helpdesk/sse_broker.py` | Broker Redis pub/sub async; `get_message(timeout=1.0)` em vez de `listen()`                                       |
| `apps/web/core/hooks/use-helpdesk-sse.ts`   | Hook `fetch()` com URL relativa (via tunnel Vite), parse manual, backoff/reconnect                                |
| `apps/web/vite.config.ts`                   | `sseTunnelPlugin()` — pipe cru via `http.request`, bypass do http-proxy buffering                                 |

---

## Observações

- **Lição-chave**: `StreamingHttpResponse` **não** serve para SSE de duração indefinida sob ASGI — o ASGIHandler drena o iterável e fecha. Para streams infinitos, falar ASGI direto (`scope`/`receive`/`send`) via middleware é a abordagem correta. O sintoma diagnóstico é a requisição completar em poucos ms (`duration_ms: 10`) quando deveria ficar aberta por minutos.
- **Em produção** (Nginx/uvicorn, sem Vite): o tunnel do Vite só existe no dev server. Em produção o Nginx une frontend e backend na mesma origem (cookies enviados normalmente) e encaminha `/helpdesk/events/` direto ao uvicorn — o `SSEMiddleware` em `asgi.py` continua sendo quem faz o streaming. Garantir no Nginx: `proxy_buffering off;` e `proxy_read_timeout` alto para a rota SSE.
- **Redis obrigatório**: o broker pub/sub requer que `REDIS_URL` esteja acessível. Em dev local o `docker-compose` já provisiona o Redis.
- **`decode_responses`**: o cliente de publish usa `redis.from_url(_redis_url, decode_responses=True)` (strings) enquanto `get_redis_connection("default")` (django-redis) usa bytes por padrão. Sempre decodificar IDs lidos do Redis antes de passá-los para queries ORM.
- **Heartbeat de 20s**: o middleware envia `: heartbeat\n\n` a cada 20s para manter a conexão TCP viva através de proxies/load balancers com idle timeout.
- **Hot-reload**: o `_redis_thread` usa `get_message(timeout=1.0)` (não `listen()`) para que o uvicorn `StatReload` consiga matar o processo sem hang ao editar arquivos.
