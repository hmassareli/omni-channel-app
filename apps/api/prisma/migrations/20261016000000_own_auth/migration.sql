-- Autenticação própria: senha no usuário, sessões (refresh token) e configurações internas

ALTER TABLE "omni_users"
ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

CREATE TABLE "omni_auth_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "omni_auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "omni_auth_sessions_tokenHash_key" ON "omni_auth_sessions"("tokenHash");
CREATE INDEX "omni_auth_sessions_userId_idx" ON "omni_auth_sessions"("userId");

ALTER TABLE "omni_auth_sessions" ADD CONSTRAINT "omni_auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "omni_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "omni_app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "omni_app_settings_pkey" PRIMARY KEY ("key")
);
