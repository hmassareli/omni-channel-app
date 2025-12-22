# Estágio 1: Build
FROM node:20-slim AS builder

# Instalar dependências do sistema necessárias para o Prisma e builds nativos
RUN apt-get update -y && apt-get install -y openssl python3 make g++

WORKDIR /app

# Copiar arquivos de definição de pacotes (raiz e api)
COPY package*.json ./
COPY apps/api/package.json ./apps/api/

# Instalar todas as dependências (incluindo devDependencies para o build)
# O npm workspaces instalará tudo na raiz/node_modules
RUN npm install

# Copiar o código fonte da API e o schema do Prisma
COPY apps/api ./apps/api

# Gerar o Prisma Client
RUN npx prisma generate --schema=apps/api/prisma/schema.prisma

# Buildar o projeto (TypeScript -> JS)
RUN npm run build --workspace=@omni/api

# Remover dependências de desenvolvimento para reduzir o tamanho da imagem
RUN npm prune --production

# Estágio 2: Runner (Imagem final leve)
FROM node:20-slim AS runner

# Prisma precisa do openssl para rodar
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

ENV NODE_ENV=production

# Copiar apenas o necessário do estágio de build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/package.json ./package.json

# Porta padrão da sua API
EXPOSE 3000

# Comando para rodar a aplicação usando o workspace
CMD ["npm", "run", "start", "--workspace=@omni/api"]
