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

## Ordem de deploy: app primeiro ou migration primeiro?

A ordem so e indiferente quando a migration ACRESCENTA. Fora disso ha **dois
lados**, e eles pedem ordens OPOSTAS:

| A migration... | quem quebra | ordem que salva |
| --- | --- | --- |
| REMOVE ou RENOMEIA coluna | os **leitores** antigos (aba aberta) | **app primeiro**, migration depois |
| ESTREITA `CHECK`, enum ou `NOT NULL` | os **escritores** novos | **migration primeiro**, app depois |

Migration que REMOVE ou RENOMEIA coluna exige **app primeiro, migration depois**
— o bundle antigo continua rodando na aba de quem ja estava com o site aberto, e
ele nao sabe que a coluna sumiu.

Migration que ESTREITA um dominio exige o **inverso**: enquanto ela nao subir, o
banco ainda recusa o valor novo, entao o app novo no ar escreve contra a regra
velha e **nada grava**. Uma migration que faz as DUAS coisas nao tem ordem
segura — as duas regras se contradizem. E o caso da 20260821010000; ver abaixo.

O ponto que costuma pegar de surpresa: no PostgREST a coluna que sumiu nao volta
como `null`, e a requisicao INTEIRA falha. Medido no stack local em 2026-08-21,
contra a `20260821010000_position_vocabulary_codes.sql`, que dropou
`players.position`:

```
GET /rest/v1/championship_registrations?select=id,profile_photo_link,players(id,name,position)
-> HTTP 400  {"code":"42703","message":"column players_1.position does not exist"}

GET /rest/v1/championship_registrations?select=id,profile_photo_link,players(id,name,preferred_position)
-> HTTP 200
```

Entao nao e um campo faltando na tela: e a consulta inteira morrendo.

### A saida limpa: expand / contract

Escolher entre "quebra leitor" e "nao grava nada" e escolher qual prejuizo levar.
Da para nao escolher: parta a migration em duas e ponha o deploy no meio.

1. **Expand** — a migration ALARGA e nao tira nada: a `CHECK` passa a aceitar o
   valor novo **e** o velho, a coluna antiga CONTINUA de pe. Neste ponto qualquer
   versao do app funciona, entao a ordem para de importar.
2. **Deploy do app**, ja falando o vocabulario novo. As abas antigas seguem
   escrevendo o velho, e o banco aceita as duas.
3. **Contract** — so depois que nao houver mais escritor antigo: converte o dado,
   ESTREITA a `CHECK` e dropa a coluna de compatibilidade.

O passo 3 tem uma **pre-condicao, e ela nao e automatica**: so vale depois que
**todos** os consumidores falarem o vocabulario novo — inclusive os que so LEEM e
comparam por igualdade, que sao os que somem do radar. Um `=== "Goleiro"`
esquecido nao levanta erro nenhum: ele so passa a ser sempre falso, e o goleiro
vira jogador de linha em silencio. Antes do contract, faca a varredura pelo valor
antigo no repo inteiro e conte os sitios; enquanto sobrar um, o passo 3 espera.

### O caso da 20260821010000

Esta migration faz as DUAS coisas de uma vez, e por isso nenhuma das duas ordens
sai de graca.

**Do lado da leitura**, ela dropou `players.position` (a coluna GERADA de
compatibilidade). Sao **tres `select`** que a pediam, em **dois arquivos** —
ambos hooks `"use client"`: `features/hooks/useGoalkeeper.ts` (1) e
`features/hooks/useMatchDetail.ts` (2). Se a migration for antes do deploy, quem
estiver com a aba aberta perde a pagina de jogo e o ranking de goleiros ate
recarregar.

**Do lado da escrita**, a mesma migration ESTREITA a `CHECK`
`players_preferred_position_known` de `('Zagueiro','Meia','Atacante','Goleiro')`
— como a 20260820010000 a deixou — para `('GOL','ZAG','MEI','ATA')`. Se o app for
antes da migration, todo formulario que grava posicao manda codigo contra a regra
velha e **nenhuma inscricao grava** durante a janela.

Os dois custos, lado a lado:

| Ordem | Custo |
| --- | --- |
| migration primeiro | duas telas de LEITURA quebram na aba aberta ate recarregar |
| app primeiro | **nenhuma inscricao grava** ate a migration subir |

Nao ha "sequencia correta" aqui — ha uma escolha, e a menos ruim e **migration
primeiro**: o dano e temporario, some com um refresh e nao perde dado, enquanto a
outra ordem perde inscricao de gente que tentou e foi embora. Faca com a janela
curta e fora do horario de pico.

Para a proxima migration desta forma, nao repita a escolha: **parta em
expand/contract** (secao acima) e o dilema deixa de existir.

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
- Nunca aplique migration que REMOVE ou RENOMEIA coluna antes do deploy do app
  (ver "Ordem de deploy" acima)
- Nunca faca o contrario com migration que ESTREITA `CHECK`, enum ou `NOT NULL`:
  essa exige a ordem INVERSA — migration primeiro, senao o app novo escreve
  contra a regra velha e nada grava
- Nunca ESTREITE um dominio antes de varrer o repo pelo valor antigo: um
  `=== "Goleiro"` esquecido nao da erro, so passa a ser sempre falso
