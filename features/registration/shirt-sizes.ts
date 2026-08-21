/**
 * Tamanhos de camiseta oferecidos na inscricao.
 *
 * Nao existe PP: o menor e P. Nao existe XG: quem precisa de mais que GG
 * escolhe Personalizado, e a organizacao acerta as medidas individualmente com
 * o jogador — ja foi assim com dois jogadores na edicao passada. Esticar a
 * grade com mais um tamanho padrao nao resolveria, porque ainda assim nao
 * serviria em todo mundo.
 *
 * A lista e fixa de proposito, e nao configuravel por campeonato: tamanho de
 * camiseta nao muda de uma edicao para a outra.
 */
export const SHIRT_SIZES = ["P", "M", "G", "GG", "Personalizado"] as const;

export type ShirtSize = (typeof SHIRT_SIZES)[number];

/** O tamanho que dispara o combinado individual com a organizacao. */
export const CUSTOM_SHIRT_SIZE: ShirtSize = "Personalizado";
