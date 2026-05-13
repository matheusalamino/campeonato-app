# Ambientes do Projeto

Este projeto usa Supabase. Por isso, trocar de ambiente significa trocar o conjunto de servicos e chaves do Supabase, nao apenas uma `DATABASE_URL`.

## Resumo rapido

- Local real do app: Supabase local via Docker e Supabase CLI
- Staging remoto: usado para validacao
- Producao remota: usada apenas em casos controlados

## Regra principal

O ambiente local oficial e `npm run local:*`.

Nao existe `docker-compose.local.yml` para Postgres puro porque isso nao representaria o ambiente real do app. O fluxo correto precisa do stack do Supabase local.

## Local

### Subir do zero

```bash
cp .env.example .env.local
npm install
npm run local:setup
npm run dev
```

O `local:setup` faz:

- sobe o Supabase local
- atualiza o `.env.local`
- aplica migrations locais pendentes
- reaplica o seed local
- recria o admin local conhecido

### Comandos uteis

- Subir local: `npm run local:start`
- Atualizar `.env.local`: `npm run local:env`
- Resetar banco local: `npm run local:reset`
- Reaplicar seed local: `npm run local:seed`
- Parar o stack: `npm run local:stop`
- Apagar o stack sem backup: `npm run local:purge`
- Ver status: `npm run local:status`

### Credenciais locais

- E-mail: `admin@local.test`
- Senha: `Admin123!`

## Staging

### Rodar o app apontando para staging

Use um arquivo ignorado, por exemplo `.env.staging.local`, e copie temporariamente para `.env.local` quando precisar validar no front.

Nunca desenvolva no dia a dia apontando para staging.

### Clonar dados de staging para o ambiente local

1. Crie o arquivo de credenciais:

```bash
cp .secrets/staging.env.example .secrets/staging.env
```

2. Preencha:

- `REMOTE_DB_HOST`
- `REMOTE_DB_PORT`
- `REMOTE_DB_NAME`
- `REMOTE_DB_USER`
- `REMOTE_DB_PASSWORD`
- `REMOTE_DB_SSLMODE`

3. Rode:

```bash
npm run local:check:staging
```

4. Se a conexao estiver correta, rode:

```bash
npm run local:pull:staging
```

Esse fluxo:

- usa `docker compose` com [docker-compose.staging.yml](/Users/ALAMINO/Documents/projects/campeonato-app/docker-compose.staging.yml)
- gera um dump em `dumps/staging_YYYY-MM-DD_HH-MM-SS.sql`
- sanitiza o dump
- restaura no Supabase local
- recria o admin local conhecido

## Producao

### Clonar dados de producao para o ambiente local

1. Crie o arquivo:

```bash
cp .secrets/production.env.example .secrets/production.env
```

2. Preencha as credenciais reais.

3. Valide a conexao sem restaurar nada localmente:

```bash
npm run local:check:production
```

4. Se estiver tudo certo, rode:

```bash
npm run local:pull:production
```

Esse fluxo pede confirmacao obrigatoria no terminal antes de iniciar.

## Arquivos sensiveis

Arquivos ignorados pelo Git:

- `.env.local`
- `.env.staging.local`
- `.env.production.local`
- `.secrets/*.env`
- `dumps/*.sql`

Arquivos commitados para orientar novos desenvolvedores:

- `.env.example`
- `.secrets/staging.env.example`
- `.secrets/production.env.example`

## Checklists

### Quero desenvolver localmente

```bash
npm run local:setup
npm run dev
```

### Quero trazer dados de staging

```bash
cp .secrets/staging.env.example .secrets/staging.env
npm run local:check:staging
npm run local:pull:staging
npm run dev
```

### Quero trazer dados de producao

```bash
cp .secrets/production.env.example .secrets/production.env
npm run local:check:production
npm run local:pull:production
npm run dev
```

## O que nunca fazer

- Nunca rode reset em staging ou producao
- Nunca commite `.env.local`, `.secrets/*.env` ou dumps
- Nunca trate producao como ambiente de desenvolvimento
- Nunca use dump bruto sem sanitizacao para restaurar localmente
