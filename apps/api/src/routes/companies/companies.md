# Companies Routes

API para gerenciamento de empresas (CNPJ).

## Base URL

```
/companies
```

## Endpoints

### GET /companies

Lista todas as empresas com paginação e busca.

**Query Parameters:**
- `search` (opcional): Busca por nome, nome fantasia ou CNPJ
- `limit` (opcional): Limite de resultados (default: 50, max: 100)
- `offset` (opcional): Offset para paginação (default: 0)

**Response:**
```json
{
  "companies": [
    {
      "id": "uuid",
      "taxId": "37335118000180",
      "name": "Razão Social da Empresa",
      "alias": "Nome Fantasia",
      "status": "Ativa",
      "sizeText": "Microempresa",
      "mainActivityText": "Atividade Principal",
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-01T00:00:00Z",
      "_count": {
        "contacts": 5,
        "opportunities": 2
      }
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### POST /companies

Cria uma nova empresa a partir do CNPJ.

**Request Body:**
```json
{
  "cnpj": "37.335.118/0001-80",
  "name": "Nome Personalizado (opcional)",
  "alias": "Nome Fantasia (opcional)",
  "wealthSigns": {
    "score": 85,
    "notes": "Cliente VIP"
  }
}
```

**Notas:**
- O campo `cnpj` é obrigatório
- Os dados são buscados automaticamente na API CNPJA
- Se `name` não for fornecido, será usado o nome da razão social da API
- O CNPJ deve ter pelo menos 14 dígitos ( caracteres não numéricos são removidos)

**Response (201 Created):**
```json
{
  "company": {
    "id": "uuid",
    "taxId": "37335118000180",
    "name": "Razão Social da Empresa",
    "alias": "Nome Fantasia",
    "status": "Ativa",
    ...
  }
}
```

**Errors:**
- `400`: CNPJ inválido
- `404`: CNPJ não encontrado na base de dados
- `409`: Empresa já existe

---

### GET /companies/:id

Busca uma empresa pelo ID com detalhes completos.

**Response:**
```json
{
  "company": {
    "id": "uuid",
    "taxId": "37335118000180",
    "name": "Razão Social da Empresa",
    "alias": "Nome Fantasia",
    "status": "Ativa",
    "statusId": 2,
    "statusDate": "2020-01-15",
    "founded": "2020-01-15T00:00:00Z",
    "equity": 100000.00,
    "sizeId": 1,
    "sizeText": "Microempresa",
    "natureId": 205,
    "natureText": "Sociedade Empresária Limitada",
    "mainActivityId": 6202,
    "mainActivityText": "Desenvolvimento de programas de computador sob encomenda",
    "sideActivities": [
      { "id": 4751, "text": "Comunicação visual" }
    ],
    "addressStreet": "Rua Example",
    "addressNumber": "100",
    "addressDetails": "Sala 1",
    "addressDistrict": "Bairro",
    "addressCity": "São Paulo",
    "addressState": "SP",
    "addressZip": "01000-000",
    "phones": [
      { "type": "cell", "area": "11", "number": "99999-0001" }
    ],
    "emails": [
      { "ownership": "comercial", "address": "comercial@empresa.com", "domain": "empresa.com" }
    ],
    "members": [
      {
        "since": "2020-01-15",
        "role": { "id": 16, "text": "Sócio" },
        "person": { "id": "uuid", "name": "Nome do Sócio", "type": "person", "taxId": "000.000.000-00", "age": 35 }
      }
    ],
    "wealthSigns": { "score": 85 },
    "contacts": [...],
    "opportunities": [...]
  }
}
```

---

### PUT /companies/:id

Atualiza uma empresa.

**Request Body:**
```json
{
  "name": "Novo Nome",
  "alias": "Novo Alias",
  "wealthSigns": {
    "score": 90,
    "notes": "Atualização do score"
  }
}
```

**Response:**
```json
{
  "company": { ... }
}
```

---

### POST /companies/:id/contacts

Associa um contato existente à empresa.

**Request Body:**
```json
{
  "contactId": "uuid-do-contato"
}
```

**Response (201 Created):**
```json
{ "success": true }
```

---

### GET /companies/:id/timeline

Retorna a timeline agregada de TODOS os contatos da empresa.

**Query Parameters:**
- `limit` (opcional): Limite de eventos (default: 50, max: 100)
- `offset` (opcional): Offset para paginação (default: 0)

**Response:**
```json
{
  "events": [
    {
      "id": "uuid",
      "type": "MESSAGE_RECEIVED",
      "content": "Olá, gostaria de saber mais sobre o produto",
      "metadata": { "hasMedia": false },
      "occurredAt": "2025-01-15T10:30:00Z",
      "contact": { "id": "uuid", "name": "Nome do Contato" },
      "conversation": {
        "id": "uuid",
        "channel": { "id": "uuid", "name": "WhatsApp", "type": "WHATSAPP" }
      }
    }
  ],
  "contacts": [
    { "id": "uuid", "name": "Nome do Contato 1" },
    { "id": "uuid", "name": "Nome do Contato 2" }
  ],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### GET /companies/:id/insights

Retorna insights agregados de todos os contatos da empresa.

**Response:**
```json
{
  "insights": [
    {
      "id": "uuid",
      "contactId": "uuid",
      "definitionId": "uuid",
      "payload": { "budget": 2500, "interest": "Produto X" },
      "confidence": 0.85,
      "generatedAt": "2025-01-15T10:00:00Z",
      "definition": {
        "id": "uuid",
        "name": "Budget Detection",
        "slug": "budget-detection"
      },
      "contact": {
        "id": "uuid",
        "name": "Nome do Contato"
      }
    }
  ]
}
```

---

## CNPJ Lookup

A criação de empresas utiliza a API CNPJA para buscar dados públicos do CNPJ. Os seguintes dados são sincronizados:

- **Identificação**: Razão Social, Nome Fantasia, CNPJ
- **Status**: Situação cadastral, data de abertura
- **Porte**: Capital social, porte (ME/EPP)
- **Atividades**: CNAE principal e secundárias
- **Natureza**: Tipo de sociedade
- **Endereço**: Completo com CEP e município
- **Contatos**: Telefones e emails
- **Sócios**: Lista de sócios e administradores

Para utilizar esta funcionalidade, configure a variável de ambiente:

```
CNPJA_API_KEY=sua-api-key
```

Obtenha sua chave em: https://www.cnpja.com.br/
