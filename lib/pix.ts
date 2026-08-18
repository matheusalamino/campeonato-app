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

/** Monta um campo no formato id + tamanho + valor. */
function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
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
    field("59", merchantName.slice(0, MAX_NAME)) +
    field("60", merchantCity.slice(0, MAX_CITY)) +
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
