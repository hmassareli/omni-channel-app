# @omni/web

Frontend do CRM omnichannel: React 19, Vite, Tailwind v4, React Router, TanStack Query, Supabase Auth.

## Como rodar

```bash
npm install                       # na raiz do monorepo
npm run dev --workspace=apps/web  # http://localhost:5173
npm run build --workspace=apps/web
npx eslint src                    # dentro de apps/web
```

Variáveis (`.env`): `VITE_API_URL` (padrão `http://localhost:3333`), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_REDIRECT_AUTH_URL` (opcional).

## Estrutura

```
src/
  App.tsx            rotas (react-router); HOME_PATH define a rota inicial
  main.tsx           providers: QueryClient, Router, Auth
  index.css          tokens de design (@theme) e fonte Inter
  components/
    ui/              design system (Button, Input, Dialog...)
    layout/          AppShell, PageHeader, SidebarSection/InfoRow, LoadingScreen
  features/<nome>/   hooks.ts (TanStack Query), components/, pages/
    auth/ companies/ contacts/ opportunities/ operations/
    onboarding/ timeline/ inbox/ dashboard/ queues/
  hooks/useAuth.ts   estado de autenticação Supabase (use `useSession()` nas telas)
  lib/               api.ts (cliente HTTP), events.ts (SSE com fetch), format.ts, cn.ts, queryClient.ts
```

Regras: páginas em `features/*/pages` (< ~250 linhas), dados via hooks de `features/*/hooks.ts`
(nunca `useEffect` + `fetch`), URLs com `<Link>`/`useNavigate`.

## Dados (TanStack Query)

`lib/api.ts` continua sendo o cliente. Cada feature expõe hooks (`useCompany`, `useKanban`,
`useCreateOpportunity`...) com chaves de cache próprias (`companyKeys`, `opportunityKeys`);
mutations invalidam as chaves afetadas. Padrão de tela: `isPending` → `Skeleton`,
`isError` → `ErrorState` (com `onRetry`), lista vazia → `EmptyState`.

## Design system

Tokens em `index.css`: paleta neutra slate + cor de destaque `accent` (indigo), estados
`danger`/`success`/`warning`, superfícies (`bg-canvas`, `bg-surface`, `bg-subtle`), bordas
(`border-line`), texto (`text-fg`, `text-fg-muted`, `text-fg-faint`), raios e sombras sutis.
Nas telas use somente essas classes, nunca hex.

Importe de `components/ui`:

```tsx
import { Button, Input, Select, Dialog, Badge, EmptyState } from "../../components/ui";

<Button variant="primary|secondary|ghost|danger" size="sm|md|lg" loading icon={<Plus />}>Salvar</Button>
<Input label="Nome" hint="..." error="..." icon={<Search />} />
<Dialog open={open} onClose={close} title="Título" footer={<Button>OK</Button>}>...</Dialog>
<Tabs tabs={[{ id: "a", label: "A", count: 3 }]} value={tab} onChange={setTab} />
<EmptyState icon={Inbox} title="Vazio" description="..." action={<Button>Criar</Button>} />
```

Outros: `Textarea`, `Select`, `Badge` (tone), `Card/CardHeader/CardBody`, `Avatar` (iniciais),
`Skeleton/SkeletonList`, `Spinner`, `ErrorState`.
