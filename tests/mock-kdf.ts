import { vi } from 'vitest';
import { fastArgon2id } from './helpers/kdf.ts';

/**
 * Argon2id de mentira para a suíte.
 *
 * A explicação do porquê (e do que a troca deixa de provar) está em
 * `tests/helpers/kdf.ts`. Aqui só o registro do mock.
 */
vi.mock('hash-wasm', () => ({ argon2id: fastArgon2id }));
