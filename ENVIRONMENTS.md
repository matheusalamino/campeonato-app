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

O caminho esta completo: a inscricao grava linha em `email_outbox` dentro da mesma transacao do commit, e um dreno envia. Existem a fila, os gatilhos que a enchem, o dreno (`services/email-outbox.ts`), os templates, a rota de verificacao e a rota que dispara o dreno.

Sao TRES gatilhos de disparo, e os tres chamam o mesmo dreno:

1. **Depois do submit da inscricao** (`services/public-registration.ts`). E o que faz o comprovante sair na hora, em vez de esperar o cron. A chamada tem teto de tempo e nao pode levantar — as duas travas moram em `features/email/post-action-drain.ts`, com teste. Estourar o teto nao perde nada: a linha continua na fila.
2. **Depois de o admin marcar "pagamento conferido"** (`PlayersSection.tsx`). A tela bate em `/api/email/drain` pela porta da sessao de admin, so por POST.
3. **O cron da Vercel**, diario, definido em `vercel.json`.

#### O cron e diario, e isso e limite de plano

O plano deste projeto e o **Hobby**, e nele a Vercel **recusa no deploy** um cron mais frequente que diario. Nao e escolha de desenho — e a razao de os dois disparos pos-acao acima existirem.

O horario e `0 23 * * *`, em **UTC** (a Vercel agenda em UTC). A escolha tem motivo:

- A pausa de sabado vai do por do sol de sexta ao de sabado, ou seja ~24h, e um disparo diario acontece a cada 24h. **Nao existe horario diario que escape de toda pausa**: ha sempre um disparo por semana caindo dentro dela, que adia a fila em vez de envia-la. O que se escolhe e QUAL disparo se perde.
- As janelas terminam entre 20:30 e 22:02 UTC (medido em `sabbath_windows`, 178 janelas ate 2029). As 23:00 UTC de sabado ficam **depois** do fim de todas elas, e a menos de uma hora — entao o disparo de sabado a noite e o primeiro apos o fim da pausa, e a fila represada desde sexta sai naquela mesma noite. O disparo perdido e o de sexta.

As duas propriedades tem assertiva em `features/email/drain-wiring.test.ts`, calculadas a partir de `scripts/generate-sabbath-windows.mjs` — nao de um numero copiado para dentro do teste.

`vercel.json` nao carrega essa explicacao porque e JSON: nao aceita comentario, e a Vercel recusa propriedade desconhecida no arquivo.

#### O que ainda NAO tem chamador

`waitlist_promoted`. O template existe, o `kind` existe e `enqueueWaitlistPromotedEmail` existe — mas nao ha, hoje, gatilho de desistencia nem de promocao da lista de espera no app. Quem enfileira essa linha nasce no A6b.

As sete variaveis desse caminho, presentes nos dois modelos:

- `BREVO_API_KEY`: chave v3 do Brevo, gerada em Settings > SMTP & API > Chaves de API. Nao sao as credenciais SMTP da mesma tela: o app fala HTTP, nao SMTP.
- `EMAIL_FROM`: o remetente. Tem de ser exatamente o endereco verificado no Brevo, ou a API recusa.
- `EMAIL_FROM_NAME`: o nome que aparece na caixa de entrada.
- `ORGANIZER_EMAIL`: para onde vai o aviso de cada inscricao nova.
- `NEXT_PUBLIC_SITE_URL`: a base dos links do e-mail, com esquema e sem barra final. Diferente por ambiente. **E a variavel mais perigosa deste bloco**, por dois motivos: ausente ou invalida, o dreno ADIA toda linha (`no_site_url`) — sem enviar e sem erro visivel, so um relatorio de dreno com `deferred` igual a `claimed`; e com a base ERRADA, o link de verificacao manda o jogador para o outro ambiente e ele nao tem como saber. O relatorio que `/api/email/drain` devolve e onde isso aparece.
- `EMAIL_TOKEN_SECRET`: segredo do HMAC do link de descadastro. Gere com `openssl rand -base64 32`.
- `CRON_SECRET`: protege `/api/email/drain` contra quem nao e o cron. Gere com `openssl rand -base64 32`. **Ausente, a rota RECUSA** — nunca o contrario. Um endpoint de cron que se abre quando a variavel falta nasce aberto em todo ambiente novo, que e justamente onde ninguem esta olhando.

O plano usado e o gratuito do Brevo: remetente unico verificado, sem dominio proprio, com teto de 300 e-mails por dia. Esse teto e o motivo de o envio classificar o erro — so 429 e 5xx vao voltar para a fila, porque retentar endereco invalido queima cota a toa.

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
