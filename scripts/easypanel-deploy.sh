#!/usr/bin/env bash
# Configura e publica o projeto "crm" no Easypanel (Contabo) via API interna.
# Uso (Git Bash, na raiz do repo):  bash scripts/easypanel-deploy.sh
#
# O que faz:
#   1. crm-api: define WEBHOOK_SECRET, CORS_ORIGINS e WHATSAPP_WEBHOOK_DEBUG=false
#      (as demais variáveis são preservadas)
#   2. crm-api e crm-web: troca a branch de origem para $BRANCH
#   3. faz o deploy do crm-api e depois do crm-web
# A chave vem de .env.deploy (EASYPANEL_API_KEY) e nunca é impressa.
set -euo pipefail

cd "$(dirname "$0")/.."
BRANCH="${BRANCH:-refactor/helpdesk-core}"
WEB_URL="${WEB_URL:-https://crm-crm-web.lnyx9r.easypanel.host}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-$(openssl rand -hex 24)}"

KEY="$(grep '^EASYPANEL_API_KEY=' .env.deploy | cut -d= -f2- | tr -d '\r"')"
[ -n "$KEY" ] || { echo "EASYPANEL_API_KEY ausente em .env.deploy"; exit 1; }

# Fim do script Python (enviado por stdin; a chave segue na primeira linha)
PY=$(cat <<'EOF'
import json, os, sys, urllib.request, urllib.parse

def get(path, payload):
    url = "http://localhost:3000/api/trpc/" + path + "?input=" + urllib.parse.quote(json.dumps({"json": payload}))
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"Authorization": key}), timeout=30))["json"]

def post(path, payload):
    req = urllib.request.Request("http://localhost:3000/api/trpc/" + path,
        data=json.dumps({"json": payload}).encode(),
        headers={"content-type": "application/json", "Authorization": key})
    return json.load(urllib.request.urlopen(req, timeout=120))

branch, web_url, secret = sys.stdin.readline().split()
api = {"projectName": "crm", "serviceName": "crm-api"}
web = {"projectName": "crm", "serviceName": "crm-web"}

# 1. variáveis do crm-api (preserva o resto)
lines = get("services.app.inspectService", api)["env"].replace("\r", "").split("\n")
want = {"WEBHOOK_SECRET": secret, "CORS_ORIGINS": web_url, "WHATSAPP_WEBHOOK_DEBUG": "false"}
out, seen = [], set()
for l in lines:
    k = l.split("=", 1)[0]
    if k in want:
        out.append(k + "=" + want[k]); seen.add(k)
    else:
        out.append(l)
out += [k + "=" + v for k, v in want.items() if k not in seen]
post("services.app.updateEnv", {**api, "env": "\n".join(out).strip("\n")})
print("crm-api: variáveis atualizadas")

# 2. branch de origem
for svc in (api, web):
    cur = get("services.app.inspectService", svc)["source"]
    post("services.app.updateSourceGithub", {**svc, "owner": cur["owner"], "repo": cur["repo"],
        "ref": branch, "path": cur.get("path", "/"), "autoDeploy": cur.get("autoDeploy", False)})
    print(svc["serviceName"] + ": origem ->", branch)

# 3. deploy (api primeiro)
for svc in (api, web):
    post("services.app.deployService", svc)
    print(svc["serviceName"] + ": deploy disparado")
EOF
)

printf '%s\n%s\n' "$KEY" "$BRANCH $WEB_URL $WEBHOOK_SECRET" \
  | ssh contabo "python3 -c 'import sys; key=sys.stdin.readline().strip(); exec(sys.argv[1])' \"\$(cat <<'PYEOF'
$PY
PYEOF
)\"" 2>&1 || true

echo
echo "WEBHOOK_SECRET usado: $WEBHOOK_SECRET   (guarde; o crm-api já recebeu o mesmo valor)"
echo "Acompanhe o build no Easypanel ou me avise que eu confiro os logs e o /health."
