require("dotenv").config({ path: ".env" });
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const [operations, companies, contacts, identities, conversations, messages, timelineEvents, rawWhatsappMessages] = await Promise.all([
    prisma.operation.findMany({ select: { id: true, name: true } }),
    prisma.company.findMany({ select: { id: true, name: true, alias: true, taxId: true } }),
    prisma.contact.findMany({ include: { company: true, identities: true }, orderBy: { updatedAt: "desc" }, take: 10 }),
    prisma.identity.findMany({ where: { type: "WHATSAPP" }, include: { contact: { include: { company: true } } }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.conversation.findMany({ include: { contact: { include: { company: true } }, channel: true, _count: { select: { messages: true, events: true } } }, orderBy: { updatedAt: "desc" }, take: 10 }),
    prisma.message.findMany({ include: { contact: { include: { company: true } }, conversation: true }, orderBy: { sentAt: "desc" }, take: 20 }),
    prisma.timelineEvent.findMany({ include: { contact: { include: { company: true } }, conversation: true }, orderBy: { occurredAt: "desc" }, take: 20 }),
    prisma.rawWhatsappMessage.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  console.log(
    JSON.stringify(
      {
        env: {
          databaseUrlHost: process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] ?? null,
        },
        operations,
        companies,
        contacts,
        identities,
        conversations,
        messages,
        timelineEvents,
        rawWhatsappMessages,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
