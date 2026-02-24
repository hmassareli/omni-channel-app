import { Prisma } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth";
import { prisma } from "../../prisma";

// ============================================================================
// CNPJ Lookup Service (CNPJA API)
// ============================================================================

interface CNPJAPIOffice {
  taxId: string;
  alias: string;
  status?: { id: number; text: string };
  founded?: string;
  address?: {
    street?: string;
    number?: string;
    details?: string;
    district?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: { id: number; name: string };
    municipality?: { id: number };
  };
  phones?: Array<{ type: string; area: string; number: string }>;
  emails?: Array<{ ownership: string; address: string; domain: string }>;
  company?: {
    id: number;
    name: string;
    equity?: number;
    size?: { id: number; text: string };
    nature?: { id: number; text: string };
    members?: Array<{
      since?: string;
      role?: { id: number; text: string };
      person?: {
        id: string;
        name: string;
        type: string;
        taxId?: string;
        age?: number;
      };
    }>;
  };
  mainActivity?: { id: number; text: string };
  sideActivities?: Array<{ id: number; text: string }>;
}

async function fetchEmpresaPorCNPJ(
  cnpj: string,
): Promise<CNPJAPIOffice | null> {
  const CNPJA_API_KEY = process.env.CNPJA_API_KEY;

  if (!CNPJA_API_KEY) {
    console.warn("[CNPJA] API key não configurada");
    return null;
  }

  const cleanCnpj = cnpj.replace(/\D/g, "");

  try {
    const response = await fetch(`https://api.cnpja.com/office/${cleanCnpj}`, {
      headers: {
        Authorization: CNPJA_API_KEY,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`CNPJA API error: ${response.status}`);
    }

    return (await response.json()) as CNPJAPIOffice | null;
  } catch (error) {
    console.error("[CNPJA] Erro ao buscar empresa:", error);
    return null;
  }
}

function mapCNPJDataToCompany(data: CNPJAPIOffice) {
  return {
    taxId: data.taxId,
    name: data.company?.name || data.alias,
    alias: data.alias,
    status: data.status?.text,
    statusId: data.status?.id,
    statusDate: data.founded ? new Date(data.founded) : null,
    founded: data.founded ? new Date(data.founded) : null,
    equity: data.company?.equity,
    sizeId: data.company?.size?.id,
    sizeText: data.company?.size?.text,
    mainActivityId: data.mainActivity?.id,
    mainActivityText: data.mainActivity?.text,
    sideActivities: data.sideActivities || [],
    natureId: data.company?.nature?.id,
    natureText: data.company?.nature?.text,
    addressStreet: data.address?.street,
    addressNumber: data.address?.number,
    addressDetails: data.address?.details,
    addressDistrict: data.address?.district,
    addressCity: data.address?.city,
    addressState: data.address?.state,
    addressZip: data.address?.zip,
    addressMunicipality: data.address?.municipality?.id,
    addressCountryId: data.address?.country?.id,
    addressCountryName: data.address?.country?.name,
    phones: data.phones,
    emails: data.emails,
    members: data.company?.members,
    sourceApi: "CNPJA" as const,
    apiUpdatedAt: new Date(),
    wealthSigns: {},
  };
}

// ============================================================================
// Schemas
// ============================================================================

const companyParamsSchema = z.object({
  id: z.uuid("ID inválido"),
});

const companyQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const createCompanySchema = z.object({
  cnpj: z.string().min(14, "CNPJ deve ter pelo menos 14 dígitos").max(18),
  name: z.string().optional(),
  alias: z.string().optional(),
  wealthSigns: z.record(z.string(), z.unknown()).optional(),
});

const updateCompanySchema = z.object({
  name: z.string().min(1).optional(),
  alias: z.string().optional(),
  wealthSigns: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// Routes
// ============================================================================

export async function companiesRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const query = companyQuerySchema.parse(request.query);

    const where: Prisma.CompanyWhereInput = {
      operationId: user.operationId,
    };

    if (query.search) {
      where.AND = [
        {
          OR: [
            { name: { contains: query.search, mode: "insensitive" } },
            { alias: { contains: query.search, mode: "insensitive" } },
            { taxId: { contains: query.search } },
          ],
        },
      ];
    }

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        include: {
          _count: { select: { contacts: true, opportunities: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: query.limit,
        skip: query.offset,
      }),
      prisma.company.count({ where }),
    ]);

    return reply.send({
      companies,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + companies.length < total,
      },
    });
  });

  app.post("/", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const body = createCompanySchema.parse(request.body);
    const cleanCnpj = body.cnpj.replace(/\D/g, "");

    // Verifica se já existe para esta operation
    const existing = await prisma.company.findFirst({
      where: { taxId: cleanCnpj, operationId: user.operationId },
    });

    if (existing) {
      return reply.status(409).send({
        error: "Empresa já existe",
        company: existing,
      });
    }

    const cnpjData = await fetchEmpresaPorCNPJ(cleanCnpj);

    if (!cnpjData) {
      return reply.status(404).send({
        error: "CNPJ não encontrado na base de dados",
      });
    }

    const companyData = mapCNPJDataToCompany(cnpjData);

    if (body.name) companyData.name = body.name;
    if (body.alias) companyData.alias = body.alias;
    if (body.wealthSigns)
      (companyData as { wealthSigns?: Record<string, unknown> }).wealthSigns =
        body.wealthSigns;

    const company = await prisma.company.create({
      data: { ...companyData, operationId: user.operationId },
    });

    return reply.status(201).send({ company });
  });

  app.get("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = companyParamsSchema.parse(request.params);

    const company = await prisma.company.findFirst({
      where: { id, operationId: user.operationId },
      include: {
        contacts: {
          include: {
            identities: { select: { type: true, value: true } },
          },
        },
        opportunities: {
          include: {
            stage: { select: { id: true, name: true, color: true } },
            agent: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!company) {
      return reply.status(404).send({ error: "Empresa não encontrada" });
    }

    return reply.send({ company });
  });

  app.put("/:id", { preHandler: authMiddleware }, async (request, reply) => {
    const user = request.user!;
    const { id } = companyParamsSchema.parse(request.params);
    const body = updateCompanySchema.parse(request.body);

    const existing = await prisma.company.findFirst({
      where: { id, operationId: user.operationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: "Empresa não encontrada" });
    }

    const company = await prisma.company.update({
      where: { id },
      data: body as Prisma.CompanyUpdateInput,
    });

    return reply.send({ company });
  });

  app.post(
    "/:id/contacts",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!;
      const { id } = companyParamsSchema.parse(request.params);
      const body = z
        .object({ contactId: z.uuid("ID do contato inválido") })
        .parse(request.body);

      const company = await prisma.company.findFirst({
        where: { id, operationId: user.operationId },
      });
      if (!company) {
        return reply.status(404).send({ error: "Empresa não encontrada" });
      }

      const contact = await prisma.contact.findUnique({
        where: { id: body.contactId },
      });
      if (!contact) {
        return reply.status(404).send({ error: "Contato não encontrado" });
      }

      await prisma.contact.update({
        where: { id: body.contactId },
        data: { companyId: id },
      });

      return reply.status(201).send({ success: true });
    },
  );

  app.get(
    "/:id/timeline",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!;
      const { id } = companyParamsSchema.parse(request.params);

      const company = await prisma.company.findFirst({
        where: { id, operationId: user.operationId },
      });
      if (!company) {
        return reply.status(404).send({ error: "Empresa não encontrada" });
      }

      const timelineQuery = z.object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        offset: z.coerce.number().int().min(0).default(0),
      });
      const query = timelineQuery.parse(request.query);

      const contacts = await prisma.contact.findMany({
        where: { companyId: id },
        select: { id: true, name: true },
      });

      const contactIds = contacts.map((c) => c.id);

      const [events, total] = await Promise.all([
        prisma.timelineEvent.findMany({
          where: { contactId: { in: contactIds } },
          include: {
            contact: { select: { id: true, name: true } },
            conversation: {
              select: {
                id: true,
                channel: { select: { id: true, name: true, type: true } },
              },
            },
          },
          orderBy: { occurredAt: "desc" },
          take: query.limit,
          skip: query.offset,
        }),
        prisma.timelineEvent.count({
          where: { contactId: { in: contactIds } },
        }),
      ]);

      return reply.send({
        events,
        contacts: contacts,
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
          hasMore: query.offset + events.length < total,
        },
      });
    },
  );

  app.get(
    "/:id/insights",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = request.user!;
      const { id } = companyParamsSchema.parse(request.params);

      const company = await prisma.company.findFirst({
        where: { id, operationId: user.operationId },
      });
      if (!company) {
        return reply.status(404).send({ error: "Empresa não encontrada" });
      }

      const contacts = await prisma.contact.findMany({
        where: { companyId: id },
        select: { id: true },
      });

      const contactIds = contacts.map((c) => c.id);

      const insights = await prisma.contactInsight.findMany({
        where: { contactId: { in: contactIds } },
        include: {
          definition: { select: { id: true, name: true, slug: true } },
          contact: { select: { id: true, name: true } },
        },
        orderBy: { generatedAt: "desc" },
      });

      return reply.send({ insights });
    },
  );

  // Lookup CNPJ - retorna dados da API sem criar empresa
  app.get(
    "/lookup/:cnpj",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { cnpj } = z.object({ cnpj: z.string() }).parse(request.params);
      const cleanCnpj = cnpj.replace(/\D/g, "");

      if (cleanCnpj.length !== 14) {
        return reply.status(400).send({ error: "CNPJ inválido" });
      }

      // Verifica se já existe no banco
      const existing = await prisma.company.findUnique({
        where: { taxId: cleanCnpj },
      });

      if (existing) {
        return reply.send({
          company: existing,
          source: "database",
          exists: true,
        });
      }

      // Busca na API
      const cnpjData = await fetchEmpresaPorCNPJ(cleanCnpj);

      if (!cnpjData) {
        return reply.status(404).send({ error: "CNPJ não encontrado" });
      }

      const companyData = mapCNPJDataToCompany(cnpjData);

      return reply.send({
        company: companyData,
        source: "api",
        exists: false,
      });
    },
  );
}
