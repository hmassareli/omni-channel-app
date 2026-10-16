/**
 * Define uma senha provisória para um usuário (troca obrigatória no 1º acesso).
 *
 *   Local:     npx tsx src/cli/set-password.ts <email> [--create --name "Nome" --role ADMIN]
 *   Produção:  node dist/src/cli/set-password.js <email>
 *
 * Imprime a senha provisória uma única vez e encerra as sessões abertas do usuário.
 */
import { UserRole } from "@prisma/client";
import { generateTemporaryPassword, hashPassword } from "../auth/password";
import { revokeAllSessions } from "../auth/sessions";
import { prisma } from "../prisma";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || email.startsWith("--")) {
    throw new Error('Uso: set-password <email> [--create --name "Nome" --role ADMIN]');
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordData = {
    passwordHash: await hashPassword(temporaryPassword),
    mustChangePassword: true,
    passwordChangedAt: new Date(),
  };

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    if (!process.argv.includes("--create")) {
      throw new Error(`Usuário ${email} não existe (use --create para criar)`);
    }
    const role = (arg("role") ?? "ADMIN") as UserRole;
    if (!Object.values(UserRole).includes(role)) throw new Error(`Papel inválido: ${role}`);
    user = await prisma.user.create({
      data: { email, name: arg("name") ?? email.split("@")[0], role, ...passwordData },
    });
  } else {
    await prisma.user.update({ where: { id: user.id }, data: passwordData });
    await revokeAllSessions(user.id);
  }

  console.log(`Usuário: ${user.email} (${user.role})`);
  console.log(`Senha provisória: ${temporaryPassword}`);
  console.log("Ela será trocada no primeiro acesso.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
