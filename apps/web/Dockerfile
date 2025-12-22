# Estágio 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Copiar arquivos de definição de pacotes
COPY package*.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/

# Instalar dependências
RUN npm install

# Copiar código fonte
COPY apps/web ./apps/web
COPY apps/api ./apps/api

# Buildar o projeto
RUN npm run build --workspace=@omni/web

# Estágio 2: Runner (Nginx)
FROM nginx:stable-alpine AS runner

# Copiar o build do Vite para o diretório do Nginx
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Configuração básica para SPA (redirecionar rotas para index.html)
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
