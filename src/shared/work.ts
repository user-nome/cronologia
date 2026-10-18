import type { Work } from '@zero/types';

/**
 * Validadores da forma de uma obra, compartilhados por quem **lê** acervo.
 *
 * São dois lugares com a mesma pergunta e respostas diferentes quando erram, e
 * por isso a validação mora aqui em vez de duplicada:
 *
 * - `library.ts`, que abre o acervo local cifrado. Payload autenticado (o
 *   AES-256-GCM já bateu) que não seja lista de obras é corrupção interna, e
 *   vira `libraryTampered` — **nunca** `[]`, porque `[]` faria o próximo
 *   salvamento sobrescrever o acervo inteiro;
 * - `drive/backup.ts`, que restaura da nuvem. Aí corpo de outro formato é
 *   Simply ignorado pelo `every` abaixo, porque o backup pode não ter obra
 *   alguma e lista vazia é resultado legítimo.
 *
 * Pura e sem estado: só texto e objetos, então roda nos dois processos.
 */

/** Campos obrigatórios de uma obra, e o tipo que cada um precisa ter. */
const REQUIRED_WORK_FIELDS = ['id', 'title', 'synopsis', 'type', 'status', 'progress'] as const;

/**
 * `true` quando `value` é uma obra com todos os campos obrigatórios no tipo
 * certo.
 *
 * O `in` antes do `typeof` é o que permite ao TypeScript estreitar `unknown`:
 * sem ele não há como saber que `value.id` existe. Os campos opcionais
 * (`createdAt`, `updatedAt`, `category`, `marker`, `notes`) não são conferidos:
 * são exatamente os que o backup antigo não tinha.
 */
export function isWorkRecord(value: unknown): value is Work {
  if (typeof value !== 'object' || value === null) return false;
  if (!REQUIRED_WORK_FIELDS.every((field) => field in value)) return false;
  const record = value as Record<(typeof REQUIRED_WORK_FIELDS)[number], unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.title === 'string' &&
    typeof record.synopsis === 'string' &&
    typeof record.type === 'string' &&
    typeof record.status === 'string' &&
    typeof record.progress === 'number'
  );
}

/** `true` quando `value` é uma lista (possivelmente vazia) de obras válidas. */
export function isWorkArray(value: unknown): value is Work[] {
  return Array.isArray(value) && value.every(isWorkRecord);
}
