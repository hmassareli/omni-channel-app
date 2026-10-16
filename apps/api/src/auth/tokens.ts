import { createHash, randomBytes } from "crypto";
import { jwtVerify, SignJWT } from "jose";
import { prisma } from "../prisma";

const ISSUER = "omni-api";
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;
const JWT_SECRET_SETTING = "auth.jwtSecret";

let cachedSecret: Uint8Array | null = null;

/**
 * Segredo do JWT: AUTH_JWT_SECRET se definido; senão é gerado uma vez e
 * guardado no banco (omni_app_settings), para não depender de variável manual.
 */
async function getJwtSecret(): Promise<Uint8Array> {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env.AUTH_JWT_SECRET?.trim();
  if (fromEnv) {
    cachedSecret = new TextEncoder().encode(fromEnv);
    return cachedSecret;
  }

  const generated = randomBytes(48).toString("base64url");
  // createMany + skipDuplicates evita corrida entre instâncias no primeiro boot
  await prisma.appSetting.createMany({
    data: [{ key: JWT_SECRET_SETTING, value: generated }],
    skipDuplicates: true,
  });
  const setting = await prisma.appSetting.findUniqueOrThrow({
    where: { key: JWT_SECRET_SETTING },
  });
  cachedSecret = new TextEncoder().encode(setting.value);
  return cachedSecret;
}

/** Limpa o cache (testes). */
export function resetJwtSecretCache() {
  cachedSecret = null;
}

export async function signAccessToken(user: { id: string; email: string }) {
  const token = await new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(await getJwtSecret());
  return { token, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

/** Devolve o e-mail do token válido, ou null. */
export async function verifyAccessToken(token: string): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, await getJwtSecret(), {
      issuer: ISSUER,
      algorithms: ["HS256"],
    });
    return typeof payload.email === "string" ? { email: payload.email } : null;
  } catch {
    return null;
  }
}

export function generateRefreshToken() {
  return randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
