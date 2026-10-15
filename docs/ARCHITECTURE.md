# Arquitetura – Omni (mesa de atendimento B2B)

Produto: mesa de atendimento humana (fila, produtividade, tempo de resposta, CSAT) sobre um CRM B2B
(Empresa → Contato → Conversa). WhatsApp é o primeiro canal; o núcleo é desacoplado de canal.

```
Adaptador de canal ─► ChannelEvent ─► Núcleo de conversas ─► EventBus ─► SSE (/events) / IA / métricas
(channels/<nome>/)    (normalizado)    (services/conversations)
```

## Camadas (apps/api/src)
- `channels/` – `types.ts` (contrato), `registry.ts`, e um diretório por canal (`whatsapp-waha/`). Só aqui existe código de provedor.
- `services/` – regras de negócio (conversas, desk, métricas, análise de IA). Não conhece provedores.
- `routes/` – HTTP fino: valida com Zod, chama services. Sempre filtra por `request.user.operationId`.
- `jobs/` – fila durável (pg-boss) para envio de mensagens e análise de IA.
- `events/` – EventBus em memória + rota SSE.
- `middleware/` – `authMiddleware` (JWT Supabase validado localmente), `webhookAuthMiddleware` (x-webhook-secret), `requireRole`.
- `config.ts` – variáveis de ambiente (getters tardios).

## Regras
- Multi-tenant: toda query de dados de negócio filtra por `operationId` do usuário autenticado.
- Testes: `buildApp({ tokenVerifier })`; o token de teste é o próprio e-mail (ver tests/helpers).
- Webhooks exigem header `x-webhook-secret` (== `WEBHOOK_SECRET`).

## Contrato da API da mesa (usado por api e web em paralelo)
Todas as rotas exigem Authorization: Bearer. `operationId` vem do usuário.

- `GET /conversations?status=OPEN|PENDING|RESOLVED&queueId=&assignee=me|unassigned|<agentId>&search=&cursor=&limit=`
  → `{ conversations: ConversationListItem[], nextCursor: string | null }`
  `ConversationListItem`: `{ id, status, lastMessageAt, contact:{id,name,avatarUrl,company:{id,name}|null}, channel:{id,name,type}, assignedAgent:{id,name,avatarUrl}|null, queue:{id,name}|null, lastMessage:{content,direction,sentAt}|null, unreadCount:number }`
- `GET /conversations/:id` → `{ conversation }` (item acima + `summary`, `firstResponseAt`, `resolvedAt`, `csat:{score,comment}|null`)
- `GET /conversations/:id/messages?limit=&before=` → `{ messages: Message[], hasMore }` (já existe)
- `POST /conversations/:id/messages` `{ text }` → 201 `{ message }` (envia via adaptador do canal; registra firstResponseAt; emite evento)
- `POST /conversations/:id/assign` `{ agentId: string|null }` → `{ conversation }`
- `POST /conversations/:id/status` `{ status }` → `{ conversation }` (RESOLVED dispara pergunta de CSAT pelo canal)
- `POST /conversations/:id/notes` `{ text }` → 201 `{ event }` (TimelineEvent NOTE)
- `POST /conversations/:id/read` → 204 (zera unreadCount)
- `GET|POST /queues`, `PUT|DELETE /queues/:id`, `PUT /queues/:id/members` `{ agentIds: string[] }`
- `GET /events` – SSE autenticado (consumir com fetch+ReadableStream e header Authorization). Eventos: `message.created {conversationId, messageId}`, `conversation.updated {conversationId}`.
- `GET /metrics/desk?from=ISO&to=ISO` →
  `{ totals:{open,pending,resolved,unassigned}, firstResponseAvgSeconds:number|null, resolutionAvgSeconds:number|null, csat:{avg:number|null,count:number}, byAgent:[{agentId,name,handled,resolved,firstResponseAvgSeconds,csatAvg}], byQueue:[{queueId,name,open,pending}], volumeByDay:[{date,inbound,outbound}] }`
- `POST /csat/:conversationId` (público via token assinado, opcional) – por ora o score chega por mensagem do cliente (1–5) e é gravado pelo ingest.

## Design (web)
Clean, minimalista, neutro, "ferramenta de trabalho". Tokens no Tailwind v4 (`@theme` em index.css):
paleta neutra (slate) + UMA cor de destaque, grade de 8px, bordas 1px de baixo contraste, sombras sutis,
cantos `rounded-lg`, fonte Inter, hierarquia tipográfica clara, light mode primeiro, estados vazios e skeletons.
Inbox em 3 painéis (lista | conversa | contexto da empresa/contato), navegação lateral estreita com ícones Lucide.
Componentes base em `src/components/ui/`: Button, Input, Select, Badge, Card, Avatar, Tabs, Dialog, Skeleton, EmptyState.

## Notas de implementação da mesa (backend)
- `POST /conversations/:id/assign` aceita também `queueId` (`{ agentId?, queueId? }`, ao menos um; só ADMIN/MANAGER mexe em fila). AGENT só assume para si (se sem responsável) ou devolve a própria (`agentId: null`).
- `GET /conversations` aceita ainda `channelId` e `contactId`; `limit` padrão 30 (máx. 100). `nextCursor` é opaco.
- Visibilidade do AGENT: conversas atribuídas a ele + não atribuídas sem fila ou de filas das quais é membro. Fora disso: 404.
- `GET /queues` -> `{ queues: [{ id, name, members:[{id,name,avatarUrl}] }] }` (qualquer papel); `POST /queues` -> 201 `{ queue }`; `PUT /queues/:id` e `PUT /queues/:id/members` -> `{ queue }`; `DELETE` -> 204. Mutações só ADMIN/MANAGER. Nome duplicado -> 409.
- `GET /metrics/desk` só ADMIN/MANAGER. Totais/filas são o retrato atual; tempos, CSAT, byAgent e volumeByDay usam o período (padrão: 30 dias).
- SSE: eventos `message.created` e `conversation.updated`, `data` = JSON sem `operationId`; heartbeat `: ping` a cada 25s.
- Erros de regra: `{ error: string }` com 400/403/404/409/422/502 (502 = canal falhou ao enviar; nada é gravado).
- CSAT: ao resolver, a pergunta é enviada pelo canal (falha não impede resolver) e `Conversation.csatRequestedAt` marca a espera. `onInboundMessage(conversationId, messageId?)` em `services/desk/hooks.ts` deve ser chamado pelo ingest após gravar mensagem INBOUND: incrementa unreadCount, trata CSAT (dígito 1-5 com espera pendente), reabre RESOLVED, chama `autoAssign` e emite `conversation.updated`.
- A fila de uma conversa só é definida manualmente (assign com `queueId`); `autoAssign` exige conversa com fila.

## Pendências do contrato (levantadas pelo front da mesa)
- Falta `GET /conversations/:id/notes` → `{ events: TimelineEvent[] }` (NOTE da conversa). O front já chama essa rota; enquanto ela retornar 404, só aparecem as notas criadas na sessão atual.

## Rodando a demo
1. `docker compose up -d postgres` e `npm run db:migrate -w @omni/api`
2. `DEMO_ADMIN_EMAIL=seu@email.com npm run db:seed:demo -w @omni/api` (cria a operação "Água Branca (Demo)")
3. `npm run dev:api` e `npm run dev:web`; entre com o mesmo e-mail.
Observação: o canal do seed não está conectado ao WAHA; enviar resposta nele retorna 502 até conectar uma sessão real.
