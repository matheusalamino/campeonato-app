/**
 * Gerador de payload PIX no formato EMV-QRCPS (BR Code).
 *
 * O projeto usava dois codigos estaticos colados no formulario: um com valor
 * fixo e outro sem valor nenhum — entao quem comprava ingresso extra recebia um
 * QR em branco e tinha que calcular o total a mao. Gerando aqui, o valor sai
 * sempre certo e o texto do campeonato deixa de estar preso ao ano.
 *
 * O formato e uma sequencia de campos `IILLvalor`: dois digitos de id, dois de
 * tamanho, e o conteudo.
 */

const PIX_GUI = "br.gov.bcb.pix";
const MAX_NAME = 25;
const MAX_CITY = 15;
/**
 * O campo 26 declara o proprio tamanho em dois digitos, entao ele nao passa de
 * 99 bytes. Dentro dele moram o GUI, a chave e a descricao — e a chave e quem
 * manda: um e-mail no teto do padrao (77) consome o campo inteiro sozinho.
 */
const MAX_MERCHANT_ACCOUNT = 99;

/**
 * `TextEncoder` e nao `Buffer`: este modulo tambem roda no navegador, dentro do
 * wizard de inscricao.
 */
const utf8 = new TextEncoder();

/** Quantos bytes a string ocupa em UTF-8. */
function byteLength(value: string): number {
  return utf8.encode(value).length;
}

/**
 * Monta um campo no formato id + tamanho + valor.
 *
 * O tamanho conta BYTES em UTF-8, nao caracteres de JS. `String.length` conta
 * unidades UTF-16: "Sao Paulo" da 9 nas duas contas, mas "Sao Paulo" com til
 * da 9 caracteres e 10 bytes. Quem le o BR Code avanca por bytes, entao um
 * cabecalho contado em caracteres faz o leitor parar cedo e todo o resto do
 * payload desandar a partir dali.
 */
function field(id: string, value: string): string {
  return `${id}${String(byteLength(value)).padStart(2, "0")}${value}`;
}

/**
 * Teto da chave PIX, em bytes.
 *
 * Sai do proprio campo 26: dos 99 bytes, o GUI ocupa 18 e o cabecalho da
 * chave, 4. Uma chave maior faz o campo 26 declarar o tamanho em TRES digitos
 * — o cabecalho tem dois —, e o payload sai malformado sem nada avisar. E o
 * mesmo 77 que o padrao da como limite da chave de e-mail; aqui ele e
 * calculado, e nao copiado, para nao descolar se o GUI mudar.
 */
export const MAX_PIX_KEY = MAX_MERCHANT_ACCOUNT - byteLength(field("00", PIX_GUI)) - 4;

/** A chave cabe no campo 26? Acima do teto o BR Code sai malformado. */
export function pixKeyFits(key: string): boolean {
  return byteLength(key) <= MAX_PIX_KEY;
}

/**
 * Reduz o texto a ASCII imprimivel, tirando acento em vez de tirar a letra.
 *
 * Por que, se o `field()` ja conta bytes: porque o conserto do `field()` assume
 * que quem le o BR Code avanca por BYTES, e isso nao da para provar de todo app
 * de banco. Sem nenhum byte multibyte, contar caractere e contar byte dao o
 * mesmo numero, e a duvida deixa de existir. E o que o proprio Mercado Pago faz
 * — o payload de referencia deste modulo traz "Sao Paulo", sem til.
 *
 * O `NFD` separa a letra do diacritico, e a faixa `0300-036F` remove so o
 * diacritico solto: "ç" vira "c", e nao some. O que sobra fora do ASCII (emoji,
 * por exemplo) sai, e o espaco duplo que isso deixaria e fechado em seguida.
 *
 * Nao vale para a chave: ali o texto tem de ser byte a byte o que o banco
 * registrou, e trocar um caractere apontaria o QR para outro destinatario.
 */
function toAscii(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Corta para caber em `max` BYTES, sem partir um caractere ao meio.
 *
 * Os limites do padrao tambem sao em bytes, entao cortar com `slice` conta
 * errado: 13 cedilhas sao 13 caracteres e 26 bytes, e passariam do limite de
 * 25 do campo 59. Itera por code points, e nao por unidades UTF-16, porque
 * cortar dentro de um par substituto produziria um caractere invalido.
 */
function sliceBytes(value: string, max: number): string {
  if (byteLength(value) <= max) return value;
  let out = "";
  let used = 0;
  for (const ch of value) {
    const n = byteLength(ch);
    if (used + n > max) break;
    out += ch;
    used += n;
  }
  return out;
}

/**
 * Como `sliceBytes`, mas recuando ate o fim da ultima palavra inteira.
 *
 * A descricao e o texto que o pagador le como referencia do pagamento, entao
 * entregar "Sorocaba" como "Sor" e pior do que entregar uma palavra a menos.
 */
function sliceWords(value: string, max: number): string {
  const cortado = sliceBytes(value, max);
  if (cortado === value) return value;
  const fim = cortado.lastIndexOf(" ");
  // Sem espaco onde recuar — uma palavra so —, o corte por bytes fica.
  return fim > 0 ? cortado.slice(0, fim) : cortado;
}

/**
 * CRC-16/CCITT-FALSE, exigido pelo padrao no campo 63.
 *
 * O calculo cobre todo o payload ja incluindo o "6304" do proprio campo, por
 * isso ele e montado antes de o CRC ser conhecido.
 */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export type PixPayloadInput = {
  /**
   * Chave PIX do recebedor (e-mail, CPF, telefone ou aleatoria). Vai crua: e a
   * unica entrada que nao passa por `toAscii`, porque mudar um caractere dela
   * apontaria o QR para outro destinatario.
   */
  key: string;
  /** Nome do recebedor. Sai sem acento, cortado em 25 bytes. */
  merchantName: string;
  /** Cidade do recebedor. Sai sem acento, cortada em 15 bytes. */
  merchantCity: string;
  /** Texto que o pagador ve como referencia. Sai sem acento, e cortado no que
   *  sobrar do campo 26 depois da chave. */
  description: string;
  /** Valor em reais. Omitido deixa o pagador digitar — evite. */
  amount?: number;
  /** Identificador da transacao, util para conciliar o recebimento depois. */
  txid?: string;
};

export function buildPixPayload({
  key,
  merchantName,
  merchantCity,
  description,
  amount,
  txid,
}: PixPayloadInput): string {
  const identificacao = field("00", PIX_GUI) + field("01", key);
  // O que sobra do campo 26 depois do GUI e da chave. O `- 4` e o cabecalho do
  // proprio campo 02: sem espaco nem para ele, a descricao nao entra.
  const orcamento = MAX_MERCHANT_ACCOUNT - byteLength(identificacao) - 4;
  // `toAscii` ANTES do corte: normalizar depois encolheria o texto de novo, e
  // o corte teria contado bytes que o acento levaria embora.
  const referencia = orcamento > 0 ? sliceWords(toAscii(description), orcamento) : "";
  const merchantAccount = identificacao + (referencia ? field("02", referencia) : "");

  let payload =
    field("00", "01") +
    field("26", merchantAccount) +
    field("52", "0000") +
    field("53", "986");

  if (amount != null && amount > 0) {
    payload += field("54", amount.toFixed(2));
  }

  payload +=
    field("58", "BR") +
    field("59", sliceBytes(toAscii(merchantName), MAX_NAME)) +
    field("60", sliceBytes(toAscii(merchantCity), MAX_CITY)) +
    // "***" e o txid neutro previsto pelo padrao para quando nao ha um proprio.
    field("62", field("05", txid || "***"));

  const withCrcTag = `${payload}6304`;
  return withCrcTag + crc16(withCrcTag);
}

/**
 * Identificador de transacao para uma inscricao.
 *
 * O padrao aceita ate 25 caracteres alfanumericos no campo 05. Prefixo legivel
 * mais aleatoriedade: da para reconhecer a origem olhando o extrato, e o txid
 * e o que permite casar o recebimento com a inscricao depois.
 */
export function makePixTxid(prefix = "CMS"): string {
  const random = Array.from(crypto.getRandomValues(new Uint8Array(11)))
    .map((byte) => byte.toString(36).padStart(2, "0"))
    .join("")
    .replace(/[^a-z0-9]/g, "");
  return `${prefix}${random}`.slice(0, 25).toUpperCase();
}
