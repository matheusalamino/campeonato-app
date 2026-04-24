import Link from "next/link";
import {
  Coins,
  Users,
  Layers,
  Goal,
  Gavel,
  AlertTriangle,
  Sparkles,
  PackagePlus,
  Repeat,
  Wallet,
  ShieldCheck,
  Presentation,
  Lightbulb,
  HelpCircle,
} from "lucide-react";
import type { ReactNode } from "react";

// ── Types ────────────────────────────────────────────────────
type QA = { q: string; a: ReactNode };
type Section = {
  id: string;
  title: string;
  icon: ReactNode;
  intro: ReactNode;
  items: QA[];
};

// ── Helpers ──────────────────────────────────────────────────
function Money({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-amber-200 whitespace-nowrap">
      {children}
    </span>
  );
}

function Emph({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-zinc-100">{children}</span>;
}

function Tag({
  tone,
  children,
}: {
  tone: "amber" | "rose" | "emerald" | "indigo" | "zinc";
  children: ReactNode;
}) {
  const map = {
    amber: "border-amber-700/60 bg-amber-900/25 text-amber-200",
    rose: "border-rose-700/60 bg-rose-900/25 text-rose-200",
    emerald: "border-emerald-700/60 bg-emerald-900/25 text-emerald-200",
    indigo: "border-indigo-700/60 bg-indigo-900/25 text-indigo-200",
    zinc: "border-zinc-700 bg-zinc-900/50 text-zinc-300",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${map[tone]}`}
    >
      {children}
    </span>
  );
}

// ── FAQ content ──────────────────────────────────────────────
const SECTIONS: Section[] = [
  {
    id: "visao-geral",
    title: "Visão Geral",
    icon: <Coins className="size-5" />,
    intro: (
      <p>
        O Draft é o evento em que os cartolas montam seus times leiloando
        jogadores em tempo real. A moeda oficial é o <Emph>CopaCoin (CC$)</Emph>,
        com valores inteiros e incrementos mínimos de <Money>CC$ 1.000</Money>.
        Tudo é controlado pelo app: saldos, lances, potes, multas e
        transferências.
      </p>
    ),
    items: [
      {
        q: "Com quanto eu começo?",
        a: (
          <p>
            Todo cartola começa com <Money>CC$ 100.000</Money>, usado tanto
            para habilitar nos potes quanto para comprar jogadores. Esse valor
            é o <Emph>saldo geral</Emph>.
          </p>
        ),
      },
      {
        q: "A moeda aceita centavos ou valores fracionários?",
        a: (
          <p>
            Não. O <Emph>CopaCoin (CC$)</Emph> opera somente com valores
            inteiros, e todos os lances e multas são múltiplos de{" "}
            <Money>CC$ 1.000</Money>.
          </p>
        ),
      },
      {
        q: "Onde acompanho meu saldo e transações?",
        a: (
          <p>
            No card <Emph>Saldo e Extrato</Emph> do seu dashboard. Todo
            lance, compra, multa ou devolução aparece em uma linha no
            extrato, em tempo real.
          </p>
        ),
      },
    ],
  },

  {
    id: "time",
    title: "Montagem do Time",
    icon: <Users className="size-5" />,
    intro: (
      <p>
        Cada cartola deve montar um time com exatamente <Emph>10 jogadores</Emph>
        , idealmente <Emph>1 goleiro + 9 jogadores de linha</Emph> (ATA, MEI,
        ZAG). Quando o time fecha, o app libera você automaticamente dos
        potes seguintes.
      </p>
    ),
    items: [
      {
        q: "Preciso obrigatoriamente de 1 goleiro e 9 jogadores de linha?",
        a: (
          <p>
            A composição recomendada é 1 goleiro + 9 linha. O app usa esse
            layout padrão (3 ATA, 3 MEI, 3 ZAG) no campo virtual, mas se você
            comprar, por exemplo, 4 meias, o componente realoca as vagas
            automaticamente para manter 9 jogadores de linha no total.
          </p>
        ),
      },
      {
        q: "O que acontece quando meu time fica cheio?",
        a: (
          <p>
            Assim que você chega a 10 jogadores, o app marca seu time como{" "}
            <Emph>fechado</Emph> e desabilita automaticamente os botões de
            lance de habilitação, carta especial e leilões futuros. Você fica
            isento de multas de potes em que não estiver classificado.
          </p>
        ),
      },
      {
        q: "Onde vejo o time que já montei?",
        a: (
          <p>
            No card <Emph>Meu Time</Emph>, no dashboard do cartola. O campo
            virtual mostra todos os jogadores adquiridos com foto, posição e
            valor pago.
          </p>
        ),
      },
    ],
  },

  {
    id: "potes",
    title: "Estrutura dos Potes",
    icon: <Layers className="size-5" />,
    intro: (
      <p>
        Os jogadores são distribuídos pelo app em potes organizados por
        posição. Há um pote exclusivo de <Emph>Goleiros</Emph> e múltiplos
        potes para cada posição de linha — <Emph>ATA</Emph>, <Emph>MEI</Emph>{" "}
        e <Emph>ZAG</Emph>. A quantidade de potes por posição e o número de
        classificados em cada um são calculados automaticamente.
      </p>
    ),
    items: [
      {
        q: "Como é definida a ordem dos potes?",
        a: (
          <p>
            A organização segue uma ordem cíclica entre as posições de linha
            intercalada com Goleiro (padrão:{" "}
            <Emph>ATA → MEI → ZAG → GOL → ZAG → MEI → ATA</Emph>, repetindo).
            Quando há mais de um pote por posição, a ordem entre eles é
            definida aleatoriamente.
          </p>
        ),
      },
      {
        q: "Como o app decide quem pode dar lance em cada pote?",
        a: (
          <p>
            O número de classificados (<Emph>X</Emph>) é calculado para que,
            em média, cada cartola tenha pelo menos 2 jogadores disponíveis
            dentro do pote. Os <Emph>X</Emph> maiores lances de habilitação
            passam para o leilão aberto.
          </p>
        ),
      },
      {
        q: "O que é um \"pote extra\"?",
        a: (
          <p>
            É um pote misto criado automaticamente ao final de cada pote com
            sobras. Jogadores não comprados são movidos para ele e leiloados
            ao final do Draft. Veja a seção <Emph>Pote Extra</Emph>.
          </p>
        ),
      },
    ],
  },

  {
    id: "pote-goleiros",
    title: "Pote de Goleiros",
    icon: <Goal className="size-5" />,
    intro: (
      <p>
        Todos os cartolas participam automaticamente do Pote de Goleiros,{" "}
        <Emph>sem lance de habilitação</Emph> e sem reserva de orçamento. A
        compra é debitada diretamente do <Emph>saldo geral</Emph>.
      </p>
    ),
    items: [
      {
        q: "Preciso habilitar para o pote de goleiros?",
        a: (
          <p>
            Não. O app <Emph>pula a fase de habilitação</Emph> para o pote de
            goleiros — todos os cartolas com time incompleto estão
            automaticamente elegíveis a dar lance no leilão aberto.
          </p>
        ),
      },
      {
        q: "Quantos goleiros posso comprar?",
        a: (
          <p>
            Um goleiro por cartola. O lance mínimo inicial é{" "}
            <Money>CC$ 5.000</Money> e <Emph>não há teto</Emph>. Quem der o
            maior lance leva após o &ldquo;dou-lhe uma, dou-lhe duas,
            dou-lhe três, vendido!&rdquo;.
          </p>
        ),
      },
      {
        q: "E se um goleiro não receber lance?",
        a: (
          <p>
            O fiscal aplica uma <Emph>Multa Geral de CC$ 2.000</Emph> sobre
            os cartolas elegíveis naquele pote. É uma multa fixa (não
            progressiva) e também não há multa de saldo restante ao final do
            pote de goleiros.
          </p>
        ),
      },
    ],
  },

  {
    id: "potes-linha",
    title: "Potes de Linha — Habilitação + Leilão",
    icon: <Gavel className="size-5" />,
    intro: (
      <p>
        Cada pote de linha (ATA, MEI, ZAG) tem <Emph>duas fases</Emph>{" "}
        consecutivas: primeiro a <Emph>Habilitação</Emph> (lance às cegas) e
        depois o <Emph>Leilão Aberto</Emph> entre os classificados.
      </p>
    ),
    items: [
      {
        q: "Como funciona o Lance de Habilitação?",
        a: (
          <div className="space-y-2">
            <p>
              Quando o admin abre a janela de habilitação, todos os cartolas
              com time incompleto e saldo podem enviar um lance às cegas pelo
              app. Você tem <Emph>30 segundos</Emph> para submeter. O lance
              mínimo é <Money>CC$ 1.000</Money> e não há teto.
            </p>
            <p>
              O valor é <Emph>imediatamente reservado</Emph> do seu saldo
              geral e vira o <Emph>orçamento do pote</Emph>.
            </p>
          </div>
        ),
      },
      {
        q: "O que é o orçamento do pote?",
        a: (
          <p>
            É o valor que você reservou no lance de habilitação. Ele funciona
            como um <Emph>limite de gastos exclusivo</Emph> naquele pote. O
            app bloqueia automaticamente qualquer tentativa de lance acima
            desse orçamento no leilão aberto.
          </p>
        ),
      },
      {
        q: "Qual o desempate na habilitação?",
        a: (
          <p>
            Em caso de empate no valor do lance, passa quem enviou{" "}
            <Emph>primeiro</Emph> (menor horário de submissão registrado pelo
            app).
          </p>
        ),
      },
      {
        q: "Se eu não me classificar, perco o valor?",
        a: (
          <p>
            Não. O valor do seu lance é <Emph>devolvido integralmente</Emph>{" "}
            ao saldo geral quando o admin resolve a habilitação, sem
            nenhuma penalidade.
          </p>
        ),
      },
      {
        q: "Como funciona o Leilão Aberto?",
        a: (
          <div className="space-y-2">
            <p>
              Apenas os classificados participam. Os jogadores são
              apresentados um a um, com lance mínimo de{" "}
              <Money>CC$ 1.000</Money>. Você dá o lance levantando a
              plaquinha e anunciando em voz alta; o admin registra no app.
            </p>
            <p>
              O jogador vai para quem der o maior lance após o &ldquo;dou-lhe
              uma, dou-lhe duas, dou-lhe três, vendido!&rdquo;. Você pode
              comprar{" "}
              <Emph>vários jogadores no mesmo pote</Emph>, respeitando o
              orçamento disponível e o limite de 10 no time.
            </p>
          </div>
        ),
      },
      {
        q: "E se um jogador não receber lance?",
        a: (
          <p>
            O fiscal aplica uma <Emph>Multa Geral de CC$ 2.000</Emph> sobre
            os classificados que ainda têm orçamento no pote. O jogador não
            vendido é movido para o <Emph>Pote Extra</Emph> assim que o pote
            é finalizado.
          </p>
        ),
      },
    ],
  },

  {
    id: "multas",
    title: "Multas",
    icon: <AlertTriangle className="size-5" />,
    intro: (
      <p>
        Existem <Emph>três tipos</Emph> de multa no Draft. Todas aparecem
        tanto no <Emph>extrato</Emph> (com a descrição e o valor) quanto na
        lista total de multas exibida no painel do fiscal.
      </p>
    ),
    items: [
      {
        q: "1. Multa de Saldo Restante (automática, regra dos 50%)",
        a: (
          <div className="space-y-2">
            <p>
              <Tag tone="emerald">Automática</Tag> Ao{" "}
              <Emph>finalizar o pote</Emph>, o app processa o orçamento que
              sobrou de cada classificado assim:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-zinc-300">
              <li>
                <Emph>Sobra par</Emph>: multa = 50% do valor; o resto volta
                pro saldo geral.
              </li>
              <li>
                <Emph>Sobra ímpar</Emph>: subtrai-se{" "}
                <Money>CC$ 1.000</Money>, aplica-se 50% sobre o resultado,
                e o resto volta pro saldo geral.
              </li>
              <li>
                Cartola que <Emph>zerou o orçamento</Emph> não leva multa.
              </li>
            </ul>
            <p>
              Exemplo 1 — sobra <Money>CC$ 4.000</Money> →{" "}
              <Tag tone="rose">multa</Tag> <Money>CC$ 2.000</Money>,{" "}
              <Tag tone="emerald">devolvido</Tag>{" "}
              <Money>CC$ 2.000</Money>.
              <br />
              Exemplo 2 — sobra <Money>CC$ 3.000</Money> →{" "}
              <Tag tone="rose">multa</Tag> <Money>CC$ 1.000</Money>,{" "}
              <Tag tone="emerald">devolvido</Tag>{" "}
              <Money>CC$ 2.000</Money>.
            </p>
          </div>
        ),
      },
      {
        q: "2. Multa por Lance Acima do Orçamento (progressiva)",
        a: (
          <div className="space-y-2">
            <p>
              <Tag tone="rose">Manual — fiscal</Tag> Aplicada quando você
              tenta dar um lance acima do orçamento restante no pote. É
              progressiva e <Emph>acumulada durante todo o Draft</Emph>:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-zinc-300">
              <li>
                1ª ocorrência: <Money>CC$ 2.000</Money>
              </li>
              <li>
                2ª ocorrência: <Money>CC$ 4.000</Money>
              </li>
              <li>
                3ª ocorrência: <Money>CC$ 6.000</Money>
              </li>
              <li>Incrementos de CC$ 2.000 a cada nova reincidência.</li>
            </ul>
            <p>
              O débito sai <Emph>primeiro do orçamento do pote</Emph>; se não
              couber, o restante sai do saldo geral. Só cartolas classificados
              no pote atual podem levar esta multa.
            </p>
          </div>
        ),
      },
      {
        q: "3. Multa por Jogador/Goleiro sem Lance (fixa CC$ 2.000)",
        a: (
          <div className="space-y-2">
            <p>
              <Tag tone="amber">Manual — fiscal</Tag> Aplicada com o botão{" "}
              <Emph>Multa Geral</Emph> quando um jogador não recebe nenhum
              lance no leilão aberto. O tipo da multa é escolhido
              automaticamente pelo app de acordo com o pote em andamento —
              goleiro sem lance num pote de goleiros, ou jogador sem lance
              num pote de linha.
            </p>
            <p>
              Valor: <Money>CC$ 2.000</Money> fixo por cartola. Nos potes de
              linha, a multa é debitada apenas do orçamento do pote (nunca
              do saldo geral) e limitada ao que sobra nele; cartolas sem
              orçamento no pote ficam isentos. No pote de goleiros, como
              não há orçamento reservado, a multa cai sobre o saldo geral
              dos cartolas elegíveis.
            </p>
          </div>
        ),
      },
      {
        q: "Recebo aviso quando uma multa automática cai?",
        a: (
          <p>
            Sim. O dashboard do cartola monitora novas multas automáticas e
            exibe um <Emph>toast de notificação</Emph> assim que elas são
            registradas. Tudo também fica no extrato.
          </p>
        ),
      },
    ],
  },

  {
    id: "carta-especial",
    title: "Carta Especial",
    icon: <Sparkles className="size-5" />,
    intro: (
      <p>
        Cada cartola recebe <Emph>1 Carta Especial</Emph> no início do Draft.
        Ela pode ser acionada durante o leilão aberto de qualquer pote (incluindo
        Goleiros) em que você esteja classificado e que ainda esteja em
        disputa ativa.
      </p>
    ),
    items: [
      {
        q: "O que acontece ao acionar a Carta?",
        a: (
          <div className="space-y-2">
            <p>
              O leilão aberto do jogador é <Emph>interrompido</Emph> e todos
              os lances anteriores são <Emph>anulados</Emph>. Todos os
              classificados com saldo restante no pote são convocados a enviar
              um <Emph>lance às cegas pelo app</Emph> em até{" "}
              <Emph>20 segundos</Emph>.
            </p>
            <p>
              O lance mínimo nessa situação é <Money>CC$ 0</Money> — você pode
              optar por não se comprometer com o jogador sem nenhuma
              penalidade. O débito sai do <Emph>orçamento restante</Emph> do
              pote.
            </p>
          </div>
        ),
      },
      {
        q: "Como é definido o vencedor?",
        a: (
          <p>
            Arremata quem oferecer o <Emph>maior lance às cegas</Emph>.
            Empate → menor horário de envio (igual na habilitação).
          </p>
        ),
      },
      {
        q: "Se todos lançarem CC$ 0, o que acontece?",
        a: (
          <p>
            A Carta Especial é <Emph>consumida</Emph> mesmo assim e o jogador
            volta para o leilão aberto normal, como se nada tivesse ocorrido.
            Só a carta se perde.
          </p>
        ),
      },
      {
        q: "Posso usar a carta mais de uma vez?",
        a: (
          <p>
            Não. É <Emph>uma única vez por cartola</Emph> durante todo o
            Draft. Uma vez acionada, é consumida independentemente do
            resultado.
          </p>
        ),
      },
    ],
  },

  {
    id: "pote-extra",
    title: "Pote Extra (Rodada Adicional)",
    icon: <PackagePlus className="size-5" />,
    intro: (
      <p>
        Ao finalizar cada pote, jogadores não comprados são movidos
        automaticamente para um <Emph>Pote Extra misto</Emph> (pode conter
        qualquer posição) que será leiloado ao final do programa.
      </p>
    ),
    items: [
      {
        q: "Como o Pote Extra é criado?",
        a: (
          <p>
            Quando o admin clica em <Emph>Finalizar Pote</Emph>, o app pega
            os jogadores que não foram comprados e os move para um novo pote
            chamado <Emph>Extra</Emph>, misto (com jogadores de qualquer
            posição) e aberto a todos os cartolas do campeonato.
          </p>
        ),
      },
      {
        q: "Tem lance de habilitação no Pote Extra?",
        a: (
          <p>
            Não. É um pote <Emph>aberto a todos os cartolas</Emph> com time
            incompleto. O app direciona direto para o leilão aberto.
          </p>
        ),
      },
      {
        q: "Qual o lance mínimo no Pote Extra?",
        a: (
          <p>
            <Money>CC$ 1.000</Money>, assim como nos demais leilões. Se mesmo
            assim algum cartola não tiver saldo suficiente, a comissão
            diretiva pode deliberar a concessão de saldo adicional via{" "}
            <Emph>Saldo Extra</Emph>.
          </p>
        ),
      },
    ],
  },

  {
    id: "transferencia",
    title: "Janela de Transferência",
    icon: <Repeat className="size-5" />,
    intro: (
      <p>
        Ao término de todo o processo de leilão (incluindo o Pote Extra),
        abre-se uma <Emph>Janela de Transferência de 5 minutos</Emph>, em que
        os cartolas podem trocar jogadores entre si, <Emph>sem uso de CC$</Emph>
        .
      </p>
    ),
    items: [
      {
        q: "Como funciona uma transferência?",
        a: (
          <p>
            É uma troca <Emph>1 por 1</Emph>, sem custo. Os dois cartolas
            devem se dirigir ao fiscal, que registra o acordo no app com ambas
            as partes presentes e cientes. Após confirmação é{" "}
            <Emph>definitiva e irrevogável</Emph>.
          </p>
        ),
      },
      {
        q: "Qualquer jogador pode ser trocado por qualquer outro?",
        a: (
          <p>
            Não. A troca respeita o grupo de posição:{" "}
            <Emph>goleiro por goleiro</Emph> ou{" "}
            <Emph>jogador de linha por jogador de linha</Emph> (ATA, MEI e ZAG
            contam como linha). A composição de 10 jogadores (1 GK + 9 linha)
            deve ser preservada.
          </p>
        ),
      },
      {
        q: "Tem limite de trocas?",
        a: (
          <p>
            Não. Durante os 5 minutos, cada cartola pode realizar quantas
            trocas quiser, desde que todas as condições sejam respeitadas.
          </p>
        ),
      },
    ],
  },

  {
    id: "saldo-extra",
    title: "Saldo Extra",
    icon: <Wallet className="size-5" />,
    intro: (
      <p>
        O <Emph>fiscal ou admin</Emph> pode conceder saldo extra a todos os
        cartolas do campeonato em situações excepcionais (por exemplo,
        durante a Rodada Adicional quando alguém ficou sem saldo).
      </p>
    ),
    items: [
      {
        q: "Como o saldo extra é aplicado?",
        a: (
          <p>
            O fiscal escolhe o valor (múltiplo de <Money>CC$ 1.000</Money>)
            e confirma. Todos os cartolas recebem o mesmo crédito no saldo
            geral, e a entrada aparece no extrato de cada um.
          </p>
        ),
      },
      {
        q: "O saldo extra afeta o pote atual?",
        a: (
          <p>
            Não diretamente. Ele vai para o <Emph>saldo geral</Emph> e pode
            ser usado em potes futuros ou em compras que debitem do saldo
            geral (como a do pote de goleiros).
          </p>
        ),
      },
    ],
  },

  {
    id: "papeis",
    title: "Papéis no Draft",
    icon: <ShieldCheck className="size-5" />,
    intro: (
      <p>
        O sistema reconhece três papéis operando em telas distintas, cada um
        com suas permissões.
      </p>
    ),
    items: [
      {
        q: "Cartola",
        a: (
          <p>
            É o participante do Draft. No seu dashboard pode dar o lance de
            habilitação, acionar a Carta Especial e consultar saldo,
            extrato, jogadores disponíveis e o próprio time montado.
          </p>
        ),
      },
      {
        q: "Fiscal do Leilão",
        a: (
          <p>
            Acompanha os saldos e orçamentos dos cartolas em tempo real num
            painel dedicado. Aplica as multas (Multa Geral e Multa
            Individual), registra as transferências na Janela de
            Transferência e concede Saldo Extra quando a comissão autoriza.
            Não opera a apresentação do leilão.
          </p>
        ),
      },
      {
        q: "Admin",
        a: (
          <p>
            Opera o modo de apresentação do Draft — a tela que o público vê.
            É ele quem abre e fecha as janelas de habilitação e leilão,
            registra as compras dos jogadores, finaliza e, se necessário,
            reseta os potes. Também tem acesso às funções do fiscal.
          </p>
        ),
      },
    ],
  },

  {
    id: "apresentacao",
    title: "Apresentação (Modo Admin)",
    icon: <Presentation className="size-5" />,
    intro: (
      <p>
        O modo de apresentação é a &ldquo;mesa&rdquo; do leilão. Reunimos
        aqui o comportamento das principais ações do admin durante a
        transmissão.
      </p>
    ),
    items: [
      {
        q: "Navegação inteligente entre potes",
        a: (
          <p>
            Ao reabrir um pote já em andamento, o app direciona
            automaticamente para a tela relevante:
            <br />• Se já existem compras → primeiro jogador não comprado.
            <br />• Se tem qualificados mas nenhuma compra → primeiro jogador do
            leilão.
            <br />• Se ainda não há qualificados → tela de lances de
            habilitação.
          </p>
        ),
      },
      {
        q: "Finalizar Pote",
        a: (
          <p>
            Aplica automaticamente a <Emph>multa de saldo restante</Emph>,
            devolve as sobras ao saldo geral, move os jogadores não comprados
            para o <Emph>Pote Extra</Emph> e fecha o pote. Depois de
            finalizado, o pote não pode ser reaberto.
          </p>
        ),
      },
      {
        q: "Resetar Pote",
        a: (
          <p>
            Desfaz todas as ações daquele pote: lances de habilitação,
            compras, multas e aquisições. Recalcula os saldos dos cartolas
            envolvidos a partir do extrato. Útil em caso de erro operacional.
          </p>
        ),
      },
    ],
  },

  {
    id: "dicas",
    title: "Dicas Estratégicas",
    icon: <Lightbulb className="size-5" />,
    intro: (
      <p>
        Algumas diretrizes para aproveitar melhor o Draft. Gerencie saldo,
        planeje e leia o jogo.
      </p>
    ),
    items: [
      {
        q: "Quanto lançar na habilitação?",
        a: (
          <p>
            Quanto maior o lance, maior a chance de classificar — mas também
            maior o risco de sobrar saldo e pagar multa de saldo restante.
            Equilibre pelo perfil dos jogadores do pote e pelos concorrentes
            prováveis.
          </p>
        ),
      },
      {
        q: "Quando usar a Carta Especial?",
        a: (
          <p>
            É um trunfo único. Use quando houver um jogador realmente
            estratégico que você teme perder num leilão aberto tradicional —
            principalmente contra cartolas com orçamento alto no pote.
          </p>
        ),
      },
      {
        q: "Evitar multa progressiva",
        a: (
          <p>
            Ela acumula durante todo o Draft — uma reincidência lá na frente
            custa caro. Confira sempre o orçamento restante antes de dar
            lance.
          </p>
        ),
      },
      {
        q: "Aproveite a Janela de Transferência",
        a: (
          <p>
            Cinco minutos é curto. Chegue com uma lista mental de trocas
            prioritárias, alinhe com os outros cartolas nos intervalos do
            Draft e vá direto ao fiscal.
          </p>
        ),
      },
    ],
  },
];

// ── Page ─────────────────────────────────────────────────────
export default function FaqPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      {/* Hero */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-md border border-amber-700/40 bg-amber-900/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200">
          <HelpCircle className="size-3.5" aria-hidden />
          Regulamento & FAQ
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
          Como funciona o Draft
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400 sm:text-base">
          Tudo sobre potes, lances, multas, carta especial, transferências e
          o fluxo do leilão — explicado sem juridiquês, do jeito que acontece
          na prática durante a Noite de Gala do Draft.
        </p>
      </div>

      {/* Sumário */}
      <nav
        aria-label="Sumário"
        className="mb-10 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">
          Sumário
        </p>
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              <Link
                href={`#${s.id}`}
                className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-zinc-300 transition hover:bg-zinc-800/60 hover:text-amber-200"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-950 text-[10px] font-bold text-zinc-400 group-hover:border-amber-700/60 group-hover:text-amber-300">
                  {i + 1}
                </span>
                {s.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Seções */}
      <div className="space-y-10">
        {SECTIONS.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="scroll-mt-24"
            aria-labelledby={`${section.id}-title`}
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg border border-amber-700/40 bg-amber-900/20 text-amber-300">
                {section.icon}
              </div>
              <div>
                <h2
                  id={`${section.id}-title`}
                  className="text-lg font-bold text-zinc-50 sm:text-xl"
                >
                  {section.title}
                </h2>
                <div className="mt-1 text-sm leading-relaxed text-zinc-400">
                  {section.intro}
                </div>
              </div>
            </div>

            <div className="space-y-2 pl-0 sm:pl-[52px]">
              {section.items.map((item, i) => (
                <details
                  key={i}
                  className="group rounded-lg border border-zinc-800 bg-zinc-900/30 transition hover:border-zinc-700"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-zinc-200 outline-none transition hover:text-amber-200 focus-visible:ring-2 focus-visible:ring-amber-500/40">
                    <span>{item.q}</span>
                    <span
                      className="flex size-5 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-xs text-zinc-400 transition group-open:rotate-45 group-open:border-amber-700/60 group-open:text-amber-300"
                      aria-hidden
                    >
                      +
                    </span>
                  </summary>
                  <div className="border-t border-zinc-800 px-4 py-3 text-sm leading-relaxed text-zinc-300">
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Rodapé */}
      <div className="mt-14 border-t border-zinc-800 pt-6 text-center">
        <p className="text-xs text-zinc-500">
          Em caso de dúvidas não previstas, a autoridade máxima de decisão
          cabe às apresentadoras junto com a comissão diretiva do campeonato.
        </p>
      </div>
    </main>
  );
}
