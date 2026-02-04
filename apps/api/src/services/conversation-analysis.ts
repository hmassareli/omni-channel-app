import { EventType, MessageDirection, Prisma, TagSource } from "@prisma/client";
import { prisma } from "../prisma";

const pendingConversations = new Set();
const runningConversations = new Set();
const analysisConcurrency = Math.max(1, Number(process.env.CONVERSATION_ANALYSIS_CONCURRENCY ?? 1));

export function scheduleConversationAnalysis(conversationId) {
  if (runningConversations.has(conversationId)) {
    return;
  }

  pendingConversations.add(conversationId);
  queueMicrotask(drainAnalysisQueue);
}

async function drainAnalysisQueue() {
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

async function processConversation(conversationId) {
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
          company: {
            include: {
              opportunities: {
                include: {
                  stage: { select: { id: true, slug: true, name: true, autoTransition: true } },
                },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          },
          tags: {
            include: {
              tag: {
                select: { slug: true },
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

  const hasPendingMessages = conversation.messages.some((m) => m.requiresProcessing);

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
  const opportunity = conversation.contact?.company?.opportunities?.[0];

  const tagDefinitions = operation?.tags ?? [];
  const insightDefinitions = operation?.insightDefinitions ?? [];
  const stageDefinitions = operation?.stages ?? [];
  
  const currentStageSlug = opportunity?.stage?.slug ?? undefined;
  const currentTagSlugs = conversation.contact?.tags
    ?.map((entry) => entry.tag.slug)
    .filter(Boolean) ?? [];

  const runResult = await runGroqAnalysis({
    conversationSnippet,
    conversationSummary: conversation.summary ?? undefined,
    tags: tagDefinitions.map((tag) => ({
      slug: tag.slug,
      label: tag.name,
      description: tag.description ?? undefined,
      promptCondition: tag.promptCondition ?? undefined,
    })),
    insights: insightDefinitions.map((def) => ({
      slug: def.slug,
      name: def.name,
      description: def.description ?? undefined,
      promptInstruction: def.promptInstruction ?? undefined,
      schema: def.schema ?? undefined,
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
  const insightSelections = resolveInsightSelections(runResult.insights, insightDefinitions);
  const stageSuggestion = resolveStageSuggestion(runResult.stage, stageDefinitions);

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
          definitionId: { in: insightSelections.map((s) => s.definitionId) },
        },
      });

      for (const selection of insightSelections) {
        await tx.contactInsight.create({
          data: {
            contactId: conversation.contactId,
            definitionId: selection.definitionId,
            payload: selection.payload === null ? undefined : selection.payload,
            confidence: selection.confidence,
            generatedAt: now,
            expiresAt: selection.expiresAt ?? null,
          },
        });
      }
    }

    if (stageSuggestion && opportunity) {
      const previousStageId = opportunity.stageId;
      const shouldTransition =
        stageSuggestion.definition.autoTransition &&
        stageSuggestion.confidence >= 0.6 &&
        previousStageId !== stageSuggestion.definition.id;

      if (shouldTransition) {
        await tx.opportunity.update({
          where: { id: opportunity.id },
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
            content: `Sugerido estágio ${stageSuggestion.definition.name} (confiança ${(stageSuggestion.confidence * 100).toFixed(0)}%).`,
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

function formatConversation(messages) {
  if (!messages.length) {
    return "";
  }

  const conversationArray = [];
  let currentSpeaker = null;

  for (const message of messages) {
    const speaker = message.direction === MessageDirection.OUTBOUND ? "[ATENDENTE]" : "[CLIENTE]";

    if (currentSpeaker !== message.direction) {
      conversationArray.push(`${speaker}:`);
      currentSpeaker = message.direction;
    }

    const baseContent = message.content?.trim();
    const finalContent = baseContent?.length ? baseContent : message.hasMedia ? "<media>" : "<sem texto>";

    conversationArray.push(finalContent.slice(0, 400));
  }

  const truncated = [];
  let totalChars = 0;

  for (let index = conversationArray.length - 1; index >= 0; index -= 1) {
    const entry = conversationArray[index];
    if (!entry) continue;

    if (totalChars + entry.length > 800) {
      break;
    }

    truncated.unshift(entry);
    totalChars += entry.length;
  }

  return truncated.join("\n");
}

async function runGroqAnalysis(input) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    console.warn("GROQ_API_KEY not set. Skipping conversation analysis.");
    return null;
  }

  const model = process.env.GROQ_MODEL ?? "meta-llama/llama-4-maverick-17b-128e-instruct";
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
            content: "Você é um analisador que SEMPRE responde em JSON válido contendo as chaves obrigatórias 'summary', 'tags', 'insights' e 'stage'. Nunca adicione texto fora do JSON.",
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
    console.error("Groq request failed", response.status);
    return null;
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    return null;
  }

  try {
    const parsed = JSON.parse(content);
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((v) => typeof v === "string") : [],
      insights: parsed.insights && typeof parsed.insights === "object" ? parsed.insights : {},
      stage: parsed.stage ?? null,
    };
  } catch (error) {
    console.error("Failed to parse Groq response", error);
    return null;
  }
}

function buildUnifiedPrompt(input) {
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
1. Reavalie tudo do zero em cada execução.
2. Use apenas slugs presentes nas listas fornecidas.
3. Só sugira mudança de estágio se houver indícios claros.
4. Quando não tiver dados suficientes, retorne vazio.

### Formato de resposta (JSON estrito, sem texto extra)
{
  "summary": "resumo conciso em português",
  "tags": ["slug_tag"],
  "insights": { "slug_insight": { "payload": {}, "confidence": 0.0, "expiresAt": "ISO8601" } },
  "stage": { "slug": "slug_stage" | null, "confidence": 0.0 }
}

Certifique-se de que o JSON seja válido.`;
}

function resolveTagSelections(tagSlugs: string[], tags: Array<{ slug: string; id: string }>) {
  if (!tagSlugs?.length || !tags.length) {
    return [];
  }

  const tagMap = new Map(tags.map((tag) => [tag.slug, tag] as [string, typeof tags[0]]));
  const selections = [];

  for (const slug of tagSlugs) {
    const definition = tagMap.get(slug);
    if (!definition || selections.some((sel) => sel.id === definition.id)) {
      continue;
    }
    selections.push({ id: definition.id, slug: definition.slug });
  }

  return selections;
}

function resolveInsightSelections(rawInsights: Record<string, unknown>, definitions: Array<{ slug: string; id: string }>) {
  if (!rawInsights || !definitions.length) {
    return [];
  }

  const definitionMap = new Map(definitions.map((item) => [item.slug, item] as [string, typeof definitions[0]]));
  const selections = [];

  for (const [slug, value] of Object.entries(rawInsights)) {
    const definition = definitionMap.get(slug);
    if (!definition) continue;

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

function normalizeInsightPayload(value) {
  if (!value || typeof value !== "object") {
    return { payload: value };
  }

  const record = value;
  const rawPayload = record.payload ?? value;
  const confidenceCandidate = record.confidence;
  const expiresCandidate = record.expiresAt;

  let confidence;
  if (typeof confidenceCandidate === "number") {
    confidence = clamp(confidenceCandidate, 0, 1);
  } else if (typeof confidenceCandidate === "string") {
    const parsed = Number(confidenceCandidate);
    if (Number.isFinite(parsed)) {
      confidence = clamp(parsed, 0, 1);
    }
  }

  let expiresAt;
  if (typeof expiresCandidate === "string") {
    const parsed = new Date(expiresCandidate);
    if (!Number.isNaN(parsed.getTime())) {
      expiresAt = parsed;
    }
  }

  return {
    payload: rawPayload,
    confidence: confidence ?? null,
    expiresAt: expiresAt ?? null,
  };
}

function resolveStageSuggestion(rawStage: { slug?: string; confidence?: number | string }, stages: Array<{ slug: string; id: string; name: string; autoTransition: boolean }>) {
  if (!rawStage || !stages.length) {
    return null;
  }

  const stageMap = new Map(stages.map((stage) => [stage.slug, stage] as [string, typeof stages[0]]));
  const slug = rawStage.slug;
  if (typeof slug !== "string") {
    return null;
  }

  const definition = stageMap.get(slug);
  if (!definition) {
    return null;
  }

  let confidence = 1;
  if (typeof rawStage.confidence === "number") {
    confidence = clamp(rawStage.confidence, 0, 1);
  } else if (typeof rawStage.confidence === "string") {
    const parsed = Number(rawStage.confidence);
    if (Number.isFinite(parsed)) {
      confidence = clamp(parsed, 0, 1);
    }
  }

  return { definition, confidence };
}

function escapeJson(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
