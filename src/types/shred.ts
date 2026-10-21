/**
 * Contagem do que foi sobrescrito e do que sobrou no disco.
 *
 * O mesmo formato aparece em três camadas — o shred do main (`main/shred.ts`),
 * a varredura de disco (`main/cleanup.ts`) e a resposta da IPC
 * (`types/api.ts`) — e as três precisam concordar.
 */
export interface ShredCounts {
  /** Quantos arquivos foram sobrescritos e apagados. */
  shredded: number;
  /** Quantos ficaram no disco (permissão negada, symlink, pasta no lugar). */
  failed: number;
}
