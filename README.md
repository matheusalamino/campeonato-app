# campeonato-app

Aplicacao Next.js para gestao de campeonato usando Supabase.

## Arquitetura

- App: Next.js 16
- Banco: PostgreSQL via Supabase
- Servicos locais: Supabase CLI com Docker
- Migrations: `supabase/migrations/*.sql`
- Seed local: `supabase/seed.sql`

Observacao importante:

Este projeto nao roda corretamente com um `docker compose` contendo apenas Postgres. O app depende do stack local do Supabase, incluindo Auth, API e Storage. Por isso, o fluxo local oficial continua sendo `supabase start`, encapsulado aqui pelos scripts `npm run local:*`.

## Onboarding rapido

### Pre-requisitos

- Node.js 20 LTS
- Docker Desktop ativo
- Supabase CLI instalada
- cliente `psql` instalado

### Primeira subida local

1. Instale dependencias:

```bash
npm install
```

2. Copie o arquivo de ambiente:

```bash
cp .env.example .env.local
```

3. Suba tudo e popule o ambiente local:

```bash
npm run local:setup
```

4. Rode o app:

```bash
npm run dev
```

Credenciais locais:

- E-mail: `admin@local.test`
- Senha: `Admin123!`

## Fluxo local

Comandos principais:

- Subir o stack local: `npm run local:start`
- Atualizar `.env.local`: `npm run local:env`
- Setup completo: `npm run local:setup`
- Reaplicar o seed local: `npm run local:seed`
- Resetar o banco local: `npm run local:reset`
- Parar o stack local: `npm run local:stop`
- Apagar o stack local sem backup: `npm run local:purge`
- Ver status do Supabase local: `npm run local:status`

Se quiser conectar com `psql`:

```bash
psql "$SUPABASE_DB_URL"
```

## Clonar dados de staging

Esse fluxo gera um dump sanitizado em `dumps/`, restaura no Supabase local e recria o admin local conhecido.

1. Crie o arquivo de secrets:

```bash
cp .secrets/staging.env.example .secrets/staging.env
```

2. Preencha as credenciais reais do banco de staging em `.secrets/staging.env`.

3. Rode:

```bash
npm run local:pull:staging
```

Atalho equivalente:

```bash
make pull-stg
```

## Clonar dados de producao

Use somente quando staging nao for suficiente.

1. Crie o arquivo de secrets:

```bash
cp .secrets/production.env.example .secrets/production.env
```

2. Preencha as credenciais reais do banco de producao.

3. Rode:

```bash
npm run local:pull:production
```

O script exige confirmacao explicita no terminal antes de continuar.

Atalho equivalente:

```bash
make pull-prod
```

## Onde ficam os arquivos importantes

- `docker-compose.staging.yml`: utilitario Docker para dump de staging
- `docker-compose.prod.yml`: utilitario Docker para dump de producao
- `scripts/pull-staging.sh`: gera dump sanitizado de staging e restaura localmente
- `scripts/pull-prod.sh`: mesmo fluxo para producao, com confirmacao
- `scripts/restore-local-from-dump.sh`: restaura qualquer dump compatibilizando com o schema local
- `scripts/prepare-local-import.mjs`: adapta o dump para colunas que existem no schema local
- `scripts/sanitize-dump.mjs`: remove dados sensiveis e vinculos de usuarios reais
- `.secrets/`: credenciais locais ignoradas pelo Git
- `dumps/`: dumps gerados localmente, ignorados pelo Git

## Migrations

Fluxo resumido:

```bash
npm run db:new -- nome_da_migration
npm run db:up:local
npm run dev
```

Quando a migration estiver validada:

```bash
npm run db:link:staging
npm run db:push:dry
npm run db:push
```

Guia detalhado: [MIGRATIONS.md](/Users/ALAMINO/Documents/projects/campeonato-app/MIGRATIONS.md)

## Ambientes

Guia detalhado de local, staging e producao: [ENVIRONMENTS.md](/Users/ALAMINO/Documents/projects/campeonato-app/ENVIRONMENTS.md)
