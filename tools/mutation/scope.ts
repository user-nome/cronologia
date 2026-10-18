/**
 * Escopo padrão da varredura: o que entra no denominador do score.
 *
 * Ficam de fora só arquivos em que mutação não diz nada sobre a suíte, e o
 * motivo de cada um está escrito aqui. Regra geral: código com decisão entra,
 * dado puro e casca de entrada não.
 */

/** Diretórios e arquivos que a varredura nunca mede. */
export const DEFAULT_EXCLUDES = [
  // Não têm runtime: só `interface`, `type` e unions. O Babel nem gera código
  // para eles, então não existe mutante possível.
  /^src\/types\//,
  // Traduções. São dados (pares de chave e texto). O operador `string-empty`
  // já pula elemento de tabela com cinco ou mais entradas, que é quase toda
  // linha de tradução, e o resto é o registro de idiomas (`index.ts`), que é
  // medido de verdade.
  /^src\/messages\/(pt-BR|en|ja|ko|zh-CN)\.ts$/,
  // Barrels puros de `reexport`: os módulos que eles reexportam são medidos
  // (`drive/backup.ts`, `vault/vault.ts`).
  /^src\/main\/(drive|vault)\/index\.ts$/,
  /^src\/main\/drive\/providers\/(dropbox|google)\/index\.ts$/,
  // Barrel da camada compartilhada, pelo mesmo motivo: ninguém importa
  // `src/shared/index.ts` diretamente, e os módulos que ele reexporta
  // (`policy`, `format`, `strength`, `strategy`) são medidos um a um.
  /^src\/shared\/index\.ts$/,
  // Entry point do renderer: monta o React em `#root` e nada mais. A suíte
  // renderiza `<App/>` diretamente, então este arquivo nunca é importado por um
  // teste, e a mutação dele mediria a montagem, que não tem decisão.
  /^src\/renderer\/src\/main\.tsx$/,
  // Texto de licença e atribuições de dependência. Dado, não decisão.
  /^src\/renderer\/src\/attributions\.ts$/,
  // URL e rótulo da doação. Dado, não decisão.
  /^src\/renderer\/src\/donations\.ts$/,
  // Carregador de aliases do Node. Só roda em processo filho, e o V8 não mede
  // cobertura entre processos: mutar isso exigiria rodar o Node por mutante
  // sem ganho nenhum no score da suíte.
  /^src\/node\.loader\.ts$/,
];

/** Todo arquivo `.ts`/`.tsx` de `src/` que a varredura mede por padrão. */
export function isInScope(relFile: string, excludes: RegExp[] = DEFAULT_EXCLUDES): boolean {
  if (!/^src\/.*\.tsx?$/.test(relFile)) return false;
  return !excludes.some((pattern) => pattern.test(relFile));
}