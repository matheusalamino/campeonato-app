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
  /** Chave PIX do recebedor (e-mail, CPF, telefone ou aleatoria). */
  key: string;
  /** Nome do recebedor, cortado em 25 caracteres pelo padrao. */
  merchantName: string;
  /** Cidade do recebedor, cortada em 15. */
  merchantCity: string;
  /** Texto que o pagador ve como referencia do pagamento. */
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
  const merchantAccount = field("00", PIX_GUI) + field("01", key) + field("02", description);

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
    field("59", sliceBytes(merchantName, MAX_NAME)) +
    field("60", sliceBytes(merchantCity, MAX_CITY)) +
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
