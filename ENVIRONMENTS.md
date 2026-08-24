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

```bash
cp .secrets/staging.app.env.example .secrets/staging.app.env
# preencha as chaves em Settings > API do projeto de staging
npm run dev:staging
```

O comando exporta as variaveis no proprio processo antes de subir o Next. O `.env.local` nao e tocado: `npm run dev` continua indo para o Supabase local, e voce sempre sabe para onde esta apontando pelo banner impresso na subida.

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

### Rodar o app apontando para producao

```bash
cp .secrets/production.app.env.example .secrets/production.app.env
# preencha as chaves em Settings > API do projeto de producao
npm run dev:production
```

O comando pede confirmacao digitada antes de subir. A service-role ignora RLS, e a inscricao publica grava jogador e inscricao reais — uma submissao de teste apontada para producao cria dado de verdade e pode fechar as inscricoes de um campeonato. Use apenas em caso controlado.

Para encadear sem o prompt, exporte `CONFIRM_PRODUCTION=1`.

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

Se voce ja tem um dump de producao salvo e quer apenas reaplicar o mais recente no banco local:

```bash
npm run local:restore:last-production
```

## Variaveis do app

Os modelos commitados em `.secrets/staging.app.env.example` e `.secrets/production.app.env.example` listam tudo que o app espera em cada ambiente remoto. Copie o modelo e preencha; nunca commite o arquivo preenchido.

### E-mail transacional (bloco C)

O comprovante da inscricao publica nao sai no submit. A inscricao grava uma linha em `email_outbox` dentro da mesma transacao, e um dreno envia depois — o provedor pode demorar ou falhar, e ninguem espera a rede de terceiro para ver a tela de sucesso.

As sete variaveis desse caminho, presentes nos dois modelos:

- `BREVO_API_KEY`: chave v3 do Brevo, gerada em Settings > SMTP & API > Chaves de API. Nao sao as credenciais SMTP da mesma tela: o app fala HTTP, nao SMTP.
- `EMAIL_FROM`: o remetente. Tem de ser exatamente o endereco verificado no Brevo, ou a API recusa.
- `EMAIL_FROM_NAME`: o nome que aparece na caixa de entrada.
- `ORGANIZER_EMAIL`: para onde vai o aviso de cada inscricao nova.
- `NEXT_PUBLIC_SITE_URL`: a base dos links do e-mail, com esquema e sem barra final. Diferente por ambiente: com a base errada, o link de verificacao manda o jogador para o ambiente errado e ele nao tem como saber.
- `EMAIL_TOKEN_SECRET`: segredo do HMAC do link de descadastro. Gere com `openssl rand -base64 32`.
- `CRON_SECRET`: protege o endpoint do dreno contra quem nao e o cron. Gere com `openssl rand -base64 32`.

O plano usado e o gratuito do Brevo: remetente unico verificado, sem dominio proprio, com teto de 300 e-mails por dia. Esse teto e o motivo de o envio classificar o erro — so 429 e 5xx voltam para a fila, porque retentar endereco invalido queima cota a toa.

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

### Quero reaplicar o ultimo dump de producao que ja possuo

```bash
npm run local:restore:last-production
npm run dev
```

## O que nunca fazer

- Nunca rode reset em staging ou producao
- Nunca commite `.env.local`, `.secrets/*.env` ou dumps
- Nunca trate producao como ambiente de desenvolvimento
- Nunca use dump bruto sem sanitizacao para restaurar localmente
