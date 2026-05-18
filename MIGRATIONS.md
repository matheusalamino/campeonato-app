# Migrations

Este projeto versiona schema em SQL dentro de `supabase/migrations/` e aplica tudo com Supabase CLI.

## Comandos principais

- Criar migration: `npm run db:new -- nome_da_migration`
- Aplicar migrations locais pendentes: `npm run db:up:local`
- Ver migrations locais: `npm run db:migrations:local`
- Ver diff remoto antes de aplicar: `npm run db:push:dry`
- Aplicar migrations no ambiente linkado: `npm run db:push`

## Fluxo local recomendado

1. Suba o ambiente local:

```bash
npm run local:start
npm run local:env
```

2. Crie a migration:

```bash
npm run db:new -- nome_descritivo
```

3. Edite o SQL em `supabase/migrations/`.

4. Aplique no banco local:

```bash
npm run db:up:local
```

5. Se precisar repovoar os dados:

```bash
npm run local:seed
```

6. Se precisar reconstruir tudo:

```bash
npm run local:reset
```

7. Valide no app:

```bash
npm run dev
```

## Fluxo para staging

1. Confirme que a migration foi validada localmente.
2. Linke staging:

```bash
npm run db:link:staging
```

3. Veja o preview:

```bash
npm run db:push:dry
```

4. Aplique apenas as pendentes:

```bash
npm run db:push
```

`npm run db:push` nao reseta o banco. Ele apenas aplica o diff pendente.

## Seed local

O seed local existe apenas para desenvolvimento:

- dados de dominio: `supabase/seed.sql`
- admin local: `scripts/seed-auth-local.sh`

Credenciais locais:

- E-mail: `admin@local.test`
- Senha: `Admin123!`

## O que nunca fazer

- Nunca rode `supabase db reset --linked` em staging ou producao
- Nunca rode seed local em staging ou producao
- Nunca aplique migrations sem validar localmente antes
- Nunca aponte o fluxo diario de desenvolvimento para producao
