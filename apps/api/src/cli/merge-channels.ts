/**
 * Passa todo o histórico de um canal antigo para o canal atual do mesmo número.
 * O antigo fica arquivado, como registro da substituição. Normalmente isso é
 * automático ao conectar; use para casos em que o canal antigo já perdeu o número.
 *
 *   Local:     npx tsx src/cli/merge-channels.ts <canalAntigoId> <canalAtualId>
 *   Produção:  node dist/src/cli/merge-channels.js <canalAntigoId> <canalAtualId>
 */
import { prisma } from "../prisma";
import { mergeChannelInto } from "../services/channels/merge";

async function main() {
  const [sourceId, targetId] = process.argv.slice(2);
  if (!sourceId || !targetId) throw new Error("Uso: merge-channels <canalAntigoId> <canalAtualId>");

  const [source, target] = await Promise.all([
    prisma.channel.findUnique({ where: { id: sourceId } }),
    prisma.channel.findUnique({ where: { id: targetId } }),
  ]);
  if (!source) throw new Error(`Canal ${sourceId} não existe`);
  if (!target) throw new Error(`Canal ${targetId} não existe`);
  if (source.replacedById) throw new Error(`Canal "${source.name}" já foi absorvido`);
  if (target.archivedAt) throw new Error(`Canal "${target.name}" está arquivado`);
  if (source.operationId && source.operationId !== target.operationId) {
    throw new Error("Os canais são de operações diferentes: o histórico não pode ser transferido");
  }

  const stats = await mergeChannelInto(sourceId, targetId);
  console.log(
    `"${source.name}" -> "${target.name}": ${stats.moved} conversas movidas, ${stats.merged} unidas, ` +
      `${stats.duplicates} mensagens repetidas descartadas`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
