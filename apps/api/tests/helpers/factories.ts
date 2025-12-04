import { prisma } from "../../src/prisma";

/**
 * Factory para criar dados de teste de forma fácil.
 * Cada função cria uma entidade com dados default que podem ser sobrescritos.
 */

// Counter para gerar IDs únicos
let counter = 0;
const uniqueId = () => ++counter;

/**
 * Cria uma Operation de teste
 */
export async function createOperation(
  overrides: Partial<{
    name: string;
  }> = {}
) {
  const id = uniqueId();
  return prisma.operation.create({
    data: {
      name: overrides.name ?? `Test Operation ${id}`,
    },
  });
}

/**
 * Cria um Stage de teste
 */
export async function createStage(
  overrides: Partial<{
    name: string;
    slug: string;
    operationId: string;
    order: number;
    color: string;
    promptCondition: string;
    autoTransition: boolean;
  }> = {}
) {
  const id = uniqueId();

  // Se não foi passado operationId, cria uma operation
  let operationId = overrides.operationId;
  if (!operationId) {
    const operation = await createOperation();
    operationId = operation.id;
  }

  return prisma.stage.create({
    data: {
      name: overrides.name ?? `Test Stage ${id}`,
      slug: overrides.slug ?? `test-stage-${id}`,
      operationId,
      order: overrides.order ?? 0,
      color: overrides.color,
      promptCondition: overrides.promptCondition,
      autoTransition: overrides.autoTransition ?? false,
    },
  });
}

/**
 * Cria um User de teste
 */
export async function createUser(
  overrides: Partial<{
    name: string;
    email: string;
    operationId: string;
  }> = {}
) {
  const id = uniqueId();

  return prisma.user.create({
    data: {
      name: overrides.name ?? `Test User ${id}`,
      email: overrides.email ?? `user${id}@test.com`,
      operationId: overrides.operationId,
    },
  });
}

/**
 * Cria um Channel de teste
 */
export async function createChannel(
  overrides: Partial<{
    name: string;
    type: "WHATSAPP" | "EMAIL" | "INSTAGRAM" | "SMS" | "OTHER";
    operationId: string;
  }> = {}
) {
  const id = uniqueId();

  let operationId = overrides.operationId;
  if (!operationId) {
    const operation = await createOperation();
    operationId = operation.id;
  }

  return prisma.channel.create({
    data: {
      name: overrides.name ?? `Test Channel ${id}`,
      type: overrides.type ?? "WHATSAPP",
      operationId,
    },
  });
}

/**
 * Cria um Contact de teste
 */
export async function createContact(
  overrides: Partial<{
    name: string;
    stageId: string;
  }> = {}
) {
  const id = uniqueId();

  return prisma.contact.create({
    data: {
      name: overrides.name ?? `Test Contact ${id}`,
      stageId: overrides.stageId,
    },
  });
}

/**
 * Cria uma Tag de teste
 */
export async function createTag(
  overrides: Partial<{
    name: string;
    slug: string;
    operationId: string;
    color: string;
    promptCondition: string;
  }> = {}
) {
  const id = uniqueId();

  let operationId = overrides.operationId;
  if (!operationId) {
    const operation = await createOperation();
    operationId = operation.id;
  }

  return prisma.tag.create({
    data: {
      name: overrides.name ?? `Test Tag ${id}`,
      slug: overrides.slug ?? `test-tag-${id}`,
      operationId,
      color: overrides.color,
      promptCondition: overrides.promptCondition,
    },
  });
}

/**
 * Cria um Agent de teste
 */
export async function createAgent(
  overrides: Partial<{
    name: string;
    operationId: string;
    userId: string;
  }> = {}
) {
  const id = uniqueId();

  let operationId = overrides.operationId;
  if (!operationId) {
    const operation = await createOperation();
    operationId = operation.id;
  }

  return prisma.agent.create({
    data: {
      name: overrides.name ?? `Test Agent ${id}`,
      operationId,
      userId: overrides.userId,
    },
  });
}
