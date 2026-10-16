import { prisma } from "../prisma";
import {
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_DAYS,
} from "./tokens";

const ttlMs = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

/** Abre uma sessão e devolve o refresh token (só o hash fica no banco). */
export async function createSession(userId: string, userAgent?: string) {
  const refreshToken = generateRefreshToken();
  await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + ttlMs),
      userAgent: userAgent?.slice(0, 300),
    },
  });
  return refreshToken;
}

/**
 * Troca um refresh token por outro (rotação). Se um token já revogado for
 * reapresentado, é sinal de roubo: todas as sessões do usuário são revogadas.
 */
export async function rotateSession(refreshToken: string, userAgent?: string) {
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken) },
    include: { user: { select: { id: true, email: true, passwordHash: true } } },
  });
  if (!session) return null;

  if (session.revokedAt) {
    await revokeAllSessions(session.userId);
    return null;
  }
  if (session.expiresAt < new Date() || !session.user.passwordHash) return null;

  const next = generateRefreshToken();
  await prisma.$transaction([
    prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    }),
    prisma.authSession.create({
      data: {
        userId: session.userId,
        tokenHash: hashRefreshToken(next),
        expiresAt: new Date(Date.now() + ttlMs),
        userAgent: userAgent?.slice(0, 300) ?? session.userAgent,
      },
    }),
  ]);
  return { user: session.user, refreshToken: next };
}

export async function revokeSession(refreshToken: string) {
  await prisma.authSession.updateMany({
    where: { tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessions(userId: string, exceptRefreshToken?: string) {
  await prisma.authSession.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptRefreshToken
        ? { NOT: { tokenHash: hashRefreshToken(exceptRefreshToken) } }
        : {}),
    },
    data: { revokedAt: new Date() },
  });
}
