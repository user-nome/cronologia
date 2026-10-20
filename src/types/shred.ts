/**
 * Contagem do que foi sobrescrito e do que sobrou no disco.
 *
 * O mesmo formato aparece em três camadas — o shred do main (`main/shred.ts`),
 * a varredura de disco (`main/cleanup.ts`) e a resposta da IPC
 * (`types/api.ts`) — e as três precisam concordar. Antes desta interface cada
 * uma tinha a sua (`ShredResult`, `SweepResult` e os campos repetidos em
 * `LibraryReset`), e a repetição era justamente o que permitia as três
 * divergirem sem ninguém perceber.
 *
 * O nome é o do shred porque é o shred que produz a contagem: sobrescrever e
 * apagar um arquivo é a operação que pode dar certo ou falhar, e o resto do
 * app só quer saber quantos de cada.
 */
export interface ShredCounts {
  /** Quantos arquivos foram sobrescritos e apagados. */
  shredded: number;
  /** Quantos ficaram no disco (permissão negada, symlink, pasta no lugar). */
  failed: number;
}
