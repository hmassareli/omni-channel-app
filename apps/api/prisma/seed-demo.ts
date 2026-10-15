/**
 * Seed de demonstração (dados fictícios): distribuidora de água e insumos
 * vendendo para redes de supermercados.
 *
 *   DEMO_ADMIN_EMAIL=voce@empresa.com npm run db:seed:demo
 *
 * Recria a operação "Água Branca (Demo)" a cada execução. Não roda em produção.
 */
import {
  ChannelStatus,
  ChannelType,
  ConversationStatus,
  EventType,
  IdentityType,
  MessageDirection,
  TagSource,
  UserRole,
} from "@prisma/client";
import { prisma } from "../src/prisma";

const OPERATION_NAME = "Água Branca (Demo)";
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

type Line = ["in" | "out" | "note", string, number]; // direção, texto, minutos atrás

const COMPANIES = [
  { taxId: "11222333000181", name: "Supermercados Bom Preço Ltda", alias: "Bom Preço", city: "Campinas", state: "SP" },
  { taxId: "22333444000172", name: "Rede Mais Econômica S.A.", alias: "Mais Econômica", city: "Ribeirão Preto", state: "SP" },
  { taxId: "33444555000163", name: "Atacado Vila Nova Comércio Ltda", alias: "Vila Nova", city: "Uberlândia", state: "MG" },
  { taxId: "44555666000154", name: "Hipermercado Central do Vale Ltda", alias: "Central do Vale", city: "São José dos Campos", state: "SP" },
];

const CONVERSATIONS: {
  company: number;
  contact: string;
  role: string;
  phone: string;
  queue: "Comercial" | "Entregas" | "Financeiro";
  agent: number | null;
  status: ConversationStatus;
  unread: number;
  csat?: number;
  summary?: string;
  lines: Line[];
}[] = [
  {
    company: 0, contact: "Rafael Moura", role: "Comprador", phone: "5519988110001",
    queue: "Comercial", agent: 0, status: "OPEN", unread: 2,
    summary: "Cliente quer reposição semanal de 400 fardos de água 500ml e pede condição para 30 dias.",
    lines: [
      ["in", "Bom dia! Preciso repor o estoque de água 500ml, umas 400 fardos.", 95],
      ["out", "Bom dia, Rafael! Consigo atender. Entrega na mesma loja de sempre?", 88],
      ["in", "Isso. E queria saber se dá pra faturar em 30 dias.", 40],
      ["in", "Fechando com meu diretor hoje ainda.", 38],
    ],
  },
  {
    company: 1, contact: "Patrícia Lima", role: "Gerente de loja", phone: "5516988110002",
    queue: "Entregas", agent: 1, status: "PENDING", unread: 0,
    summary: "Entrega de ontem chegou com 12 fardos avariados; aguardando reposição.",
    lines: [
      ["in", "A entrega de ontem veio com fardos furados.", 300],
      ["out", "Sinto muito, Patrícia! Pode mandar uma foto?", 290],
      ["in", "Mando agora, foram 12 fardos.", 280],
      ["note", "Avisar logística: reposição de 12 fardos na próxima rota (quinta).", 270],
      ["out", "Registrado. Repomos na próxima rota, quinta-feira. Confirma o recebimento?", 260],
    ],
  },
  {
    company: 2, contact: "Eduardo Castro", role: "Diretor comercial", phone: "5534988110003",
    queue: "Comercial", agent: null, status: "OPEN", unread: 1,
    summary: "Lead novo: atacado com 3 lojas quer tabela de preços de galões 20L e água com gás.",
    lines: [
      ["in", "Olá, vi vocês na feira. Podem me mandar a tabela de galões de 20L?", 12],
    ],
  },
  {
    company: 3, contact: "Simone Barros", role: "Financeiro", phone: "5512988110004",
    queue: "Financeiro", agent: 2, status: "RESOLVED", unread: 0, csat: 5,
    summary: "Segunda via do boleto enviada; pagamento confirmado.",
    lines: [
      ["in", "Preciso da segunda via do boleto de março.", 1500],
      ["out", "Claro, Simone! Segue o boleto atualizado.", 1490],
      ["in", "Recebi, obrigada!", 1480],
      ["out", "Ficamos à disposição. Poderia avaliar o atendimento de 1 a 5?", 1470],
      ["in", "5", 1460],
    ],
  },
  {
    company: 0, contact: "Luiz Fernandes", role: "Estoquista", phone: "5519988110005",
    queue: "Entregas", agent: 1, status: "RESOLVED", unread: 0, csat: 4,
    summary: "Reagendamento de entrega para a manhã seguinte.",
    lines: [
      ["in", "Dá pra entregar amanhã cedo em vez de à tarde?", 2900],
      ["out", "Dá sim, Luiz. Reagendei para 8h.", 2880],
      ["out", "Poderia avaliar o atendimento de 1 a 5?", 2870],
      ["in", "4", 2860],
    ],
  },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Seed de demonstração não roda em produção");
  }
  const adminEmail = process.env.DEMO_ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) {
    throw new Error("Defina DEMO_ADMIN_EMAIL (e-mail do seu login)");
  }

  await prisma.operation.deleteMany({ where: { name: OPERATION_NAME } });
  const operation = await prisma.operation.create({
    data: { name: OPERATION_NAME, onboardingCompleted: true },
  });

  // Funil
  const stageNames = ["Novo lead", "Qualificado", "Proposta", "Negociação", "Fechado"];
  const stages = await Promise.all(
    stageNames.map((name, order) =>
      prisma.stage.create({
        data: {
          operationId: operation.id,
          name,
          slug: name.toLowerCase().replace(/\s+/g, "-").normalize("NFD").replace(/[̀-ͯ]/g, ""),
          order,
        },
      }),
    ),
  );

  // Equipe
  await prisma.user.upsert({
    where: { email: adminEmail },
    create: { email: adminEmail, name: "Administrador", role: UserRole.ADMIN, operationId: operation.id },
    update: { operationId: operation.id, role: UserRole.ADMIN },
  });
  const team = ["Marina Alves", "Carlos Souza", "Juliana Prado"];
  const agents = [];
  for (const [i, name] of team.entries()) {
    const email = `demo.agente${i + 1}@exemplo.com`;
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name, role: UserRole.AGENT, operationId: operation.id },
      update: { operationId: operation.id },
    });
    agents.push(await prisma.agent.create({ data: { name, operationId: operation.id, userId: user.id } }));
  }

  // Filas
  const queues: Record<string, string> = {};
  const queueMembers: Record<string, number[]> = { Comercial: [0], Entregas: [1], Financeiro: [2] };
  for (const [name, members] of Object.entries(queueMembers)) {
    const queue = await prisma.queue.create({
      data: {
        operationId: operation.id,
        name,
        members: { create: members.map((i) => ({ agentId: agents[i].id })) },
      },
    });
    queues[name] = queue.id;
  }

  const tag = await prisma.tag.create({
    data: { operationId: operation.id, slug: "cliente-estrategico", name: "Cliente estratégico", color: "#4f46e5" },
  });

  const channel = await prisma.channel.create({
    data: {
      name: "WhatsApp Comercial",
      type: ChannelType.WHATSAPP,
      status: ChannelStatus.WORKING,
      externalIdentifier: `demo-${operation.id.slice(0, 8)}`,
      operationId: operation.id,
      whatsappDetails: { create: { sessionName: `demo-${operation.id.slice(0, 8)}` } },
    },
  });

  // Empresas
  const companies = [];
  for (const c of COMPANIES) {
    companies.push(
      await prisma.company.upsert({
        where: { taxId: c.taxId },
        create: {
          taxId: c.taxId,
          name: c.name,
          alias: c.alias,
          status: "Ativa",
          sector: "Supermercados",
          addressCity: c.city,
          addressState: c.state,
          operationId: operation.id,
        },
        update: { operationId: operation.id },
      }),
    );
  }

  // Oportunidades: [empresa, estágio, atendente, valor]
  const deals: [number, number, number, number][] = [
    [0, 3, 0, 48000],
    [1, 2, 1, 21000],
    [2, 0, 0, 90000],
    [3, 4, 2, 35000],
  ];
  for (const [c, s, a, value] of deals) {
    await prisma.opportunity.create({
      data: { companyId: companies[c].id, stageId: stages[s].id, agentId: agents[a].id, estimatedValue: value },
    });
  }

  // Conversas
  for (const conv of CONVERSATIONS) {
    const company = companies[conv.company];
    const existing = await prisma.identity.findUnique({
      where: { type_value: { type: IdentityType.WHATSAPP, value: conv.phone } },
    });
    if (existing) await prisma.contact.delete({ where: { id: existing.contactId } });

    const contact = await prisma.contact.create({
      data: {
        name: conv.contact,
        role: conv.role,
        companyId: company.id,
        identities: { create: { type: IdentityType.WHATSAPP, value: conv.phone } },
      },
    });
    if (conv.company === 0) {
      await prisma.contactTag.create({ data: { contactId: contact.id, tagId: tag.id, source: TagSource.SYSTEM } });
    }

    const times = conv.lines.map((l) => l[2]);
    const firstIn = conv.lines.find((l) => l[0] === "in");
    const firstOut = conv.lines.find((l) => l[0] === "out");
    const conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        channelId: channel.id,
        externalId: `${conv.phone}@c.us`,
        status: conv.status,
        queueId: queues[conv.queue],
        assignedAgentId: conv.agent === null ? null : agents[conv.agent].id,
        unreadCount: conv.unread,
        summary: conv.summary,
        firstMessageAt: minutesAgo(Math.max(...times)),
        lastMessageAt: minutesAgo(Math.min(...times)),
        firstInboundMessageAt: firstIn ? minutesAgo(firstIn[2]) : null,
        firstOutboundMessageAt: firstOut ? minutesAgo(firstOut[2]) : null,
        firstResponseAt: firstOut ? minutesAgo(firstOut[2]) : null,
        isStartedByContact: true,
        timeToFirstInteraction: firstIn && firstOut ? (firstIn[2] - firstOut[2]) * 60 : null,
        resolvedAt: conv.status === "RESOLVED" ? minutesAgo(Math.min(...times)) : null,
        needsAnalysis: false,
      },
    });

    for (const [i, [kind, text, ago]] of conv.lines.entries()) {
      if (kind === "note") {
        await prisma.timelineEvent.create({
          data: {
            contactId: contact.id,
            conversationId: conversation.id,
            type: EventType.NOTE,
            content: text,
            occurredAt: minutesAgo(ago),
          },
        });
        continue;
      }
      const direction = kind === "in" ? MessageDirection.INBOUND : MessageDirection.OUTBOUND;
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          contactId: contact.id,
          direction,
          content: text,
          externalId: `demo-${conversation.id}-${i}`,
          sentAt: minutesAgo(ago),
          requiresProcessing: false,
          sentByAgentId: direction === MessageDirection.OUTBOUND && conv.agent !== null ? agents[conv.agent].id : null,
        },
      });
      await prisma.timelineEvent.create({
        data: {
          contactId: contact.id,
          conversationId: conversation.id,
          type: kind === "in" ? EventType.MESSAGE_RECEIVED : EventType.MESSAGE_SENT,
          content: text,
          occurredAt: minutesAgo(ago),
        },
      });
    }

    if (conv.csat) {
      await prisma.csatResponse.create({ data: { conversationId: conversation.id, score: conv.csat } });
    }
  }

  console.log(`Seed concluído: ${OPERATION_NAME} (${CONVERSATIONS.length} conversas). Login: ${adminEmail}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
