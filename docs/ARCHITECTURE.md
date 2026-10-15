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
