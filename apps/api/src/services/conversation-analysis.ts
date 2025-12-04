import type { InsightDefinition, Message, Stage, Tag } from "@prisma/client";
import { EventType, MessageDirection, Prisma, TagSource } from "@prisma/client";
import type { Response } from "undici";
import { fetch } from "undici";
import { prisma } from "../prisma";

const pendingConversations = new Set<string>();
const runningConversations = new Set<string>();
const analysisConcurrency = Math.max(
  1,
  Number(process.env.CONVERSATION_ANALYSIS_CONCURRENCY ?? 1)
);

export function scheduleConversationAnalysis(conversationId: string) {
  if (runningConversations.has(conversationId)) {
    return;
  }

  pendingConversations.add(conversationId);
  queueMicrotask(drainAnalysisQueue);
}

async function drainAnalysisQueue(): Promise<void> {
  if (runningConversations.size >= analysisConcurrency) {
    return;
  }

  const iterator = pendingConversations.values().next();
  if (iterator.done) {
    return;
  }

  const conversationId = iterator.value;
  pendingConversations.delete(conversationId);
  runningConversations.add(conversationId);

  try {
    await processConversation(conversationId);
  } catch (error) {
    console.error("conversation-analysis: failed", conversationId, error);
  } finally {
    runningConversations.delete(conversationId);

    if (pendingConversations.size > 0) {
      queueMicrotask(drainAnalysisQueue);
    }
  }
}

async function processConversation(conversationId: string): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      channel: {
        include: {
          operation: {
            include: {
              tags: {
                where: { isActive: true },
                orderBy: { createdAt: "asc" },
              },
              insightDefinitions: {
                where: { isActive: true },
                orderBy: { createdAt: "asc" },
              },
              stages: {
                orderBy: { order: "asc" },
              },
            },
          },
        },
      },
      messages: {
        orderBy: { sentAt: "asc" },
      },
      contact: {
        include: {
          stage: {
            select: {
              id: true,
              slug: true,
            },
          },
          tags: {
            include: {
              tag: {
                select: {
                  slug: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!conversation) {
    return;
  }

  const hasPendingMessages = conversation.messages.some(
    (message) => message.requiresProcessing
  );

  if (!hasPendingMessages && !conversation.needsAnalysis) {
    return;
  }

  const conversationSnippet = formatConversation(conversation.messages);

  if (!conversationSnippet) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { needsAnalysis: false },
    });
    return;
  }

  const operation = conversation.channel.operation;

  const tagDefinitions = operation?.tags ?? [];
  const insightDefinitions = operation?.insightDefinitions ?? [];
  const stageDefinitions = operation?.stages ?? [];
  const currentStageSlug = conversation.contact?.stage?.slug ?? undefined;
  const currentTagSlugs =
    conversation.contact?.tags
      .map((entry) => entry.tag.slug)
      .filter((slug): slug is string => Boolean(slug)) ?? [];

  const runResult = await runGroqAnalysis({
    conversationSnippet,
    conversationSummary: conversation.summary ?? undefined,
    tags: tagDefinitions.map((tag) => ({
      slug: tag.slug,
      label: tag.name,
      description: tag.description ?? undefined,
      promptCondition: tag.promptCondition ?? undefined,
    })),
    insights: insightDefinitions.map((definition) => ({
      slug: definition.slug,
      name: definition.name,
      description: definition.description ?? undefined,
      promptInstruction: definition.promptInstruction ?? undefined,
      schema: definition.schema ?? undefined,
    })),
    stages: stageDefinitions.map((stage) => ({
      slug: stage.slug,
      name: stage.name,
      promptCondition: stage.promptCondition ?? undefined,
      autoTransition: stage.autoTransition,
    })),
    currentStageSlug,
    currentTags: currentTagSlugs,
  });

  if (!runResult) {
    return;
  }

  const tagSelections = resolveTagSelections(runResult.tags, tagDefinitions);
  const insightSelections = resolveInsightSelections(
    runResult.insights,
    insightDefinitions
  );
  const stageSuggestion = resolveStageSuggestion(
    runResult.stage,
    stageDefinitions
  );

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        summary: runResult.summary ?? conversation.summary ?? null,
        lastAnalysisAt: now,
        needsAnalysis: false,
      },
    });

    if (tagSelections.length) {
      await tx.contactTag.createMany({
        data: tagSelections.map((tag) => ({
          contactId: conversation.contactId,
          tagId: tag.id,
          source: TagSource.AI,
          assignedAt: now,
        })),
        skipDuplicates: true,
      });
    }

    if (insightSelections.length) {
      await tx.contactInsight.deleteMany({
        where: {
          contactId: conversation.contactId,
          definitionId: {
            in: insightSelections.map((selection) => selection.definitionId),
          },
        },
      });

      for (const selection of insightSelections) {
        await tx.contactInsight.create({
          data: {
            contactId: conversation.contactId,
            definitionId: selection.definitionId,
            payload:
              selection.payload === null
                ? undefined
                : (selection.payload as Prisma.InputJsonValue),
            confidence: selection.confidence,
            generatedAt: now,
            expiresAt: selection.expiresAt ?? null,
          },
        });
      }
    }

    if (stageSuggestion) {
      const previousStageId = conversation.contact?.stageId ?? null;
      const shouldTransition =
        stageSuggestion.definition.autoTransition &&
        stageSuggestion.confidence >= 0.6 &&
        previousStageId !== stageSuggestion.definition.id;

      if (shouldTransition) {
        await tx.contact.update({
          where: { id: conversation.contactId },
          data: { stageId: stageSuggestion.definition.id },
        });

        await tx.timelineEvent.create({
          data: {
            contactId: conversation.contactId,
            conversationId: conversation.id,
            type: EventType.STAGE_CHANGE,
            content: `Estágio atualizado automaticamente para ${stageSuggestion.definition.name}`,
            metadata: {
              fromStageId: previousStageId,
              toStageId: stageSuggestion.definition.id,
              confidence: stageSuggestion.confidence,
              reason: "auto-transition",
            },
            occurredAt: now,
          },
        });
      } else if (
        stageSuggestion.definition.slug !== currentStageSlug &&
        stageSuggestion.confidence >= 0.4
      ) {
        await tx.timelineEvent.create({
          data: {
            contactId: conversation.contactId,
            conversationId: conversation.id,
            type: EventType.SYSTEM_LOG,
            content: `Sugerido estágio ${
              stageSuggestion.definition.name
            } (confiança ${(stageSuggestion.confidence * 100).toFixed(0)}%).`,
            metadata: {
              suggestedStageId: stageSuggestion.definition.id,
              confidence: stageSuggestion.confidence,
              reason: "ai-suggestion",
            },
            occurredAt: now,
          },
        });
      }
    }

    await tx.message.updateMany({
      where: {
        conversationId: conversation.id,
        requiresProcessing: true,
      },
      data: {
        requiresProcessing: false,
        processedAt: now,
      },
    });
  });
}

function formatConversation(
  messages: Array<
    Pick<Message, "content" | "direction" | "hasMedia" | "sentAt">
  >
): string {
  if (!messages.length) {
    return "";
  }

  const conversationArray: string[] = [];
  let currentSpeaker: MessageDirection | null = null;

  for (const message of messages) {
    const speaker =
      message.direction === MessageDirection.OUTBOUND
        ? "[ATENDENTE]"
        : "[CLIENTE]";

    if (currentSpeaker !== message.direction) {
      conversationArray.push(`${speaker}:`);
      currentSpeaker = message.direction;
    }

    const baseContent = message.content?.trim();
    const finalContent = baseContent?.length
      ? baseContent
      : message.hasMedia
      ? "<media>"
      : "<sem texto>";

    conversationArray.push(finalContent.slice(0, 400));
  }

  const truncated: string[] = [];
  let totalChars = 0;

  for (let index = conversationArray.length - 1; index >= 0; index -= 1) {
    const entry = conversationArray[index];
    if (!entry) {
      continue;
    }

    if (totalChars + entry.length > 800) {
      break;
    }

    truncated.unshift(entry);
    totalChars += entry.length;
  }

  return truncated.join("\n");
}

interface GroqRequestInput {
  conversationSnippet: string;
  conversationSummary?: string;
  tags: Array<{
    slug: string;
    label: string;
    description?: string;
    promptCondition?: string;
  }>;
  insights: Array<{
    slug: string;
    name: string;
    description?: string;
    promptInstruction?: string;
    schema?: unknown;
  }>;
  stages: Array<{
    slug: string;
    name: string;
    promptCondition?: string;
    autoTransition: boolean;
  }>;
  currentStageSlug?: string;
  currentTags?: string[];
}

interface GroqResult {
  summary?: string;
  tags?: string[];
  insights?: Record<string, unknown> | null;
  stage?: {
    slug?: string | null;
    confidence?: number | string | null;
  } | null;
}

async function runGroqAnalysis(
  input: GroqRequestInput
): Promise<GroqResult | null> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    console.warn("GROQ_API_KEY not set. Skipping conversation analysis.");
    return null;
  }

  const model =
    process.env.GROQ_MODEL ?? "meta-llama/llama-4-maverick-17b-128e-instruct";

  const prompt = buildUnifiedPrompt(input);

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Você é um analisador que SEMPRE responde em JSON válido contendo as chaves obrigatórias 'summary', 'tags', 'insights' e 'stage'. Nunca adicione texto fora do JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const errorPayload = await safeJson(response);
    console.error("Groq request failed", response.status, errorPayload);
    return null;
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as GroqResult;
    const summary =
      typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.filter(
          (value): value is string => typeof value === "string"
        )
      : [];
    const insights =
      parsed.insights && typeof parsed.insights === "object"
        ? parsed.insights
        : {};
    const stage = parsed.stage ?? null;

    return {
      summary,
      tags,
      insights,
      stage,
    };
  } catch (error) {
    console.error("Failed to parse Groq response", error, content);
    return null;
  }
}

function buildUnifiedPrompt(input: GroqRequestInput) {
  const tagsJson = JSON.stringify(input.tags);
  const insightsJson = JSON.stringify(input.insights);
  const stagesJson = JSON.stringify(input.stages);
  const summaryText = input.conversationSummary
    ? `Resumo atual conhecido: "${escapeJson(input.conversationSummary)}".`
    : "Não existe resumo anterior.";
  const stageText = input.currentStageSlug
    ? `Estágio atual no funil: ${input.currentStageSlug}.`
    : "Estágio atual desconhecido.";
  const currentTagsText = input.currentTags?.length
    ? `Tags já aplicadas: ${JSON.stringify(input.currentTags)}.`
    : "Nenhuma tag aplicada até o momento.";

  return `Você é um analisador de conversas responsável por atualizar resumo, tags e insights estruturados de um lead.

${summaryText}
${stageText}
${currentTagsText}

### Conversa analisada (ordem cronológica):
"${escapeJson(input.conversationSnippet)}"

### Catálogo disponível
- **Tags**: ${tagsJson}
- **Insights estruturados**: ${insightsJson}
- **Estágios do funil**: ${stagesJson}

### Regras
1. Reavalie tudo do zero em cada execução (não assuma que instruções anteriores ainda valem).
2. Use apenas slugs presentes nas listas fornecidas.
3. Só sugira mudança de estágio se houver indícios claros.
4. Quando não tiver dados suficientes para um item, retorne-o vazio.

### Formato de resposta (JSON estrito, sem texto extra)
{
  "summary": "resumo conciso em português",
  "tags": ["slug_tag"],
  "insights": {
    "slug_insight": { "payload": { ... }, "confidence": 0.0, "expiresAt": "ISO8601" }
  },
  "stage": { "slug": "slug_stage" | null, "confidence": 0.0 }
}

Certifique-se de que o JSON seja válido e não inclua comentários.`;
}

function resolveTagSelections(tagSlugs: string[] | undefined, tags: Tag[]) {
  if (!tagSlugs?.length || !tags.length) {
    return [] as Array<Pick<Tag, "id" | "slug">>;
  }

  const tagMap = new Map(tags.map((tag) => [tag.slug, tag]));
  const selections: Array<Pick<Tag, "id" | "slug">> = [];

  for (const slug of tagSlugs) {
    const definition = tagMap.get(slug);
    if (!definition || selections.some((sel) => sel.id === definition.id)) {
      continue;
    }

    selections.push({ id: definition.id, slug: definition.slug });
  }

  return selections;
}

interface InsightSelection {
  definitionId: string;
  payload: Prisma.JsonValue | null;
  confidence?: number | null;
  expiresAt?: Date | null;
}

function resolveInsightSelections(
  rawInsights: Record<string, unknown> | undefined | null,
  definitions: InsightDefinition[]
): InsightSelection[] {
  if (!rawInsights || !definitions.length) {
    return [];
  }

  const definitionMap = new Map(definitions.map((item) => [item.slug, item]));
  const selections: InsightSelection[] = [];

  for (const [slug, value] of Object.entries(rawInsights)) {
    const definition = definitionMap.get(slug);
    if (!definition) {
      continue;
    }

    const normalized = normalizeInsightPayload(value);

    selections.push({
      definitionId: definition.id,
      payload: normalized.payload,
      confidence: normalized.confidence,
      expiresAt: normalized.expiresAt,
    });
  }

  return selections;
}

function normalizeInsightPayload(value: unknown): {
  payload: Prisma.JsonValue | null;
  confidence?: number | null;
  expiresAt?: Date | null;
} {
  if (!value || typeof value !== "object") {
    return { payload: (value ?? null) as Prisma.JsonValue };
  }

  const record = value as Record<string, unknown>;
  const rawPayload = record.payload ?? value;
  const confidenceCandidate = record.confidence;
  const expiresCandidate = record.expiresAt;

  let confidence: number | undefined;
  if (typeof confidenceCandidate === "number") {
    confidence = clamp(confidenceCandidate, 0, 1);
  } else if (typeof confidenceCandidate === "string") {
    const parsed = Number(confidenceCandidate);
    if (Number.isFinite(parsed)) {
      confidence = clamp(parsed, 0, 1);
    }
  }

  let expiresAt: Date | undefined;
  if (typeof expiresCandidate === "string") {
    const parsed = new Date(expiresCandidate);
    if (!Number.isNaN(parsed.getTime())) {
      expiresAt = parsed;
    }
  }

  return {
    payload: (rawPayload ?? null) as Prisma.JsonValue,
    confidence: confidence ?? null,
    expiresAt: expiresAt ?? null,
  };
}

function resolveStageSuggestion(
  rawStage: GroqResult["stage"],
  stages: Stage[]
): { definition: Stage; confidence: number } | null {
  if (!rawStage || !stages.length) {
    return null;
  }

  const stageMap = new Map(stages.map((stage) => [stage.slug, stage]));
  const slug = rawStage.slug;
  if (typeof slug !== "string") {
    return null;
  }

  const definition = stageMap.get(slug);
  if (!definition) {
    return null;
  }

  const confidenceRaw = rawStage.confidence;
  let confidence = 1;

  if (typeof confidenceRaw === "number") {
    confidence = clamp(confidenceRaw, 0, 1);
  } else if (typeof confidenceRaw === "string") {
    const parsed = Number(confidenceRaw);
    if (Number.isFinite(parsed)) {
      confidence = clamp(parsed, 0, 1);
    }
  }

  return { definition, confidence };
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch (error) {
    return { error: "unable-to-parse-json", detail: String(error) };
  }
}

function escapeJson(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
