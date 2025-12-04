# GitHub Copilot Instructions – Omni-Channel App

> **Nota:** Atualize este arquivo quando houver mudanças relevantes no projeto.

---

## Visão Geral

CRM omnichannel que unifica conversas de WhatsApp (via WAHA) em uma timeline por contato, com análise automática por IA (Groq) para atribuição de tags, extração de insights e gestão de funil.

**Conceitos-chave:**

- **Contact**: Pessoa unificada com múltiplas identidades (telefone, email)
- **Operation**: Agrupamento lógico (empresa) que define tags, stages e insights disponíveis
- **Channel**: Número WhatsApp conectado via WAHA, vinculado a uma Operation
- **Conversation**: Thread de mensagens entre Contact e Channel
- **Timeline**: Histórico unificado de eventos (mensagens, notas, mudanças de estágio)

---

## Tecnologias

### Backend (`apps/api`)

| Tecnologia               | Uso                                        |
| ------------------------ | ------------------------------------------ |
| **Node.js + TypeScript** | Runtime e tipagem estática                 |
| **Fastify**              | Framework HTTP de alta performance         |
| **Prisma ORM**           | Acesso ao banco com type-safety            |
| **PostgreSQL**           | Banco de dados relacional                  |
| **Zod**                  | Validação de schemas em runtime            |
| **undici**               | Cliente HTTP para chamadas externas (Groq) |
| **Groq API**             | LLM para análise de conversas              |

### Frontend (`apps/web`)

| Tecnologia          | Uso                    |
| ------------------- | ---------------------- |
| **React 19**        | Biblioteca de UI       |
| **Vite**            | Build tool             |
| **Tailwind CSS v4** | Estilização utilitária |
| **Lucide React**    | Ícones                 |
| **TypeScript**      | Tipagem estática       |

### Infraestrutura

| Tecnologia         | Uso                                     |
| ------------------ | --------------------------------------- |
| **Docker Compose** | Orquestração local (Postgres + Adminer) |
| **npm workspaces** | Monorepo                                |

---

## Estrutura do Projeto

```
omni-channel-app/
├── apps/
│   ├── api/                      # Backend Node.js/Fastify
│   │   ├── prisma/
│   │   │   ├── schema.prisma     # Definição do banco de dados
│   │   │   └── migrations/       # Histórico de migrações
│   │   └── src/
│   │       ├── index.ts          # Entry point do servidor Fastify
│   │       ├── prisma.ts         # Singleton do PrismaClient
│   │       ├── routes/webhooks/  # Endpoints de webhook
│   │       └── services/
│   │           ├── whatsapp-ingest.ts       # Ingestão de mensagens
│   │           └── conversation-analysis.ts # Análise com IA
│   └── web/                      # Frontend React + Vite
│       └── src/
├── docker-compose.yml            # PostgreSQL + Adminer
└── package.json                  # Workspaces root
```

---

## Modelo de Dados

### Entidades Principais

| Modelo               | Descrição                                                                           |
| -------------------- | ----------------------------------------------------------------------------------- |
| `Contact`            | Pessoa unificada; possui identidades, tags, insights, conversas e estágio no funil. |
| `Identity`           | Identificador único (WhatsApp, Email, Instagram) ligado a um Contact.               |
| `Operation`          | Agrupamento lógico (empresa/projeto) que possui canais, tags, insights e estágios.  |
| `Channel`            | Canal de comunicação (WhatsApp, Email etc.) vinculado a uma Operation.              |
| `Conversation`       | Conversa entre um Contact e um Channel; contém mensagens e métricas.                |
| `Message`            | Mensagem individual (INBOUND/OUTBOUND) com conteúdo, mídia e payload original.      |
| `TimelineEvent`      | Evento na timeline do contato (mensagem, nota, mudança de estágio).                 |
| `Tag`                | Definição de tag por operação com `promptCondition` para IA.                        |
| `ContactTag`         | Relação N:N entre Contact e Tag com origem (AI, USER, SYSTEM).                      |
| `Stage`              | Etapa do funil com `promptCondition` e flag `autoTransition`.                       |
| `InsightDefinition`  | Definição de insight estruturado por operação.                                      |
| `ContactInsight`     | Valor extraído pela IA para um contato (payload JSON, confiança, expiração).        |
| `RawWhatsappMessage` | Payload cru do webhook para auditoria e reprocessamento.                            |

### Hierarquia

```
Operation (empresa)
├── Channel (número WhatsApp)
│   └── Conversation
│       └── Message
├── Tag (categorias com promptCondition)
├── Stage (etapas do funil)
└── InsightDefinition (dados a extrair)

Contact (pessoa)
├── Identity (WHATSAPP, EMAIL, INSTAGRAM)
├── ContactTag (tags aplicadas)
├── ContactInsight (dados extraídos)
└── TimelineEvent (histórico)
```

### Enums

- `IdentityType`: WHATSAPP, EMAIL, INSTAGRAM
- `ChannelType`: WHATSAPP, EMAIL, INSTAGRAM, SMS, OTHER
- `MessageDirection`: INBOUND, OUTBOUND
- `EventType`: MESSAGE_SENT, MESSAGE_RECEIVED, NOTE, STAGE_CHANGE, CALL_LOG, SYSTEM_LOG
- `TagSource`: AI, USER, SYSTEM

---

## Fluxos Principais

### 1. Ingestão de Mensagem (`whatsapp-ingest.ts`)

```
WAHA webhook → POST /webhooks/whatsapp
  1. Valida payload (Zod) e salva em RawWhatsappMessage
  2. Ignora grupos, broadcasts, mensagens vazias
  3. Resolve ou cria: Channel → Identity → Contact → Conversation
  4. Cria Message e agenda análise assíncrona
```

**Métricas calculadas na Conversation:**

- `firstMessageAt`, `lastMessageAt`
- `firstInboundMessageAt`, `firstOutboundMessageAt`
- `isStartedByContact`, `timeToFirstInteraction`

### 2. Análise de Conversa (`conversation-analysis.ts`)

```
scheduleConversationAnalysis(conversationId)
  1. Fila in-memory com concorrência configurável
  2. Carrega conversation + operation (tags, insights, stages)
  3. Formata conversa: [ATENDENTE]/[CLIENTE]
  4. Chama Groq API com prompt unificado
  5. Persiste: summary, tags (AI), insights, stage transition
```

**Regras de transição de Stage:**

- `autoTransition=true` + confiança ≥ 60% → move automaticamente
- Caso contrário → registra sugestão na timeline

---

## Tags, Insights e Stages

### Tags

Definidas por Operation com `promptCondition` (ex: "quando cliente mencionar preço").
A IA avalia e aplica com `source=AI`.

### Insights

`InsightDefinition` com `promptInstruction` e `schema` opcional.
Exemplo: extrair orçamento, área de interesse, data de evento.
Resultado salvo em `ContactInsight` com `confidence`.

### Stages (Funil)

Etapas ordenadas com `promptCondition` e flag `autoTransition`.
Mudanças geram `TimelineEvent` tipo `STAGE_CHANGE`.

---

## Variáveis de Ambiente (`apps/api/.env`)

```env
DATABASE_URL="postgresql://..."
WAHA_API_URL="https://..."                                  # URL base do WAHA
GROQ_API_KEY="gsk_..."                                      # Obrigatório para análise
GROQ_MODEL="meta-llama/llama-4-maverick-17b-128e-instruct"  # Opcional
CONVERSATION_ANALYSIS_CONCURRENCY="2"                       # Opcional (default: 1)
```

---

## Scripts

```bash
# Root
npm run dev:api          # API em watch mode
npm run dev:web          # Frontend Vite

# Em apps/api
npm run db:generate      # Gera Prisma Client (rodar após mudar schema)
npm run db:migrate       # Aplica migrações
npm run db:studio        # Abre Prisma Studio

# Docker
docker-compose up -d     # Postgres + Adminer
```

---

## Convenções de Código

- **TypeScript estrito**: Evite `any`; use `unknown` quando necessário e faça narrowing.
- **Validação com Zod**: Toda entrada externa (webhooks, query params) deve ser validada.
- **Prisma transactions**: Use `prisma.$transaction` para operações que envolvem múltiplas escritas.
- **Arquivos**: kebab-case (`whatsapp-ingest.ts`)
- **Funções/variáveis**: camelCase
- **Tipos/Interfaces**: PascalCase
- **Enums Prisma**: UPPER_SNAKE_CASE
- **Rotas**: `src/routes/<domínio>/`, registrar com `app.register(fn, { prefix })`
- **Serviços**: `src/services/`, funções exportadas com side-effects claros

---

## Pendências Conhecidas

- [ ] Sincronização de labels com WAHA (criar/atualizar labels no WhatsApp)
- [ ] Onboarding de WhatsApp (criar sessão, QR code, verificar status)
- [ ] Cron job para reprocessar conversas com `needsAnalysis=true`
- [ ] Frontend ainda em desenvolvimento inicial

---

## Observações

- Sem `GROQ_API_KEY`, a análise não roda (apenas armazena mensagens)
- Sempre rodar `npm run db:generate` após alterar `schema.prisma`
- WAHA deve enviar webhooks para `/webhooks/whatsapp`

---

_Última atualização: Dezembro 2024_
