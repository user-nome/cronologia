import {
  RECOVERY_MIN_WORDS,
  isMasterPasswordFormat,
  isPinFormat,
  normalizePhrase,
  strengthFor,
} from '@zero/shared';
import { deriveDataKey, newSalt, seal, unseal } from '@zero/main/vault/crypto';
import {
  authState,
  clearedAttempts,
  registerFailedAttempt,
  remainingMs,
} from '@zero/main/vault/auth';
import { runUnlockChain } from '@zero/main/vault/unlock';
import type { UnlockContext } from '@zero/main/vault/unlock';
import { setupVaultDirectory } from '@zero/main/vault/privilege';
import { shredFile } from '@zero/main/shred';
import { vaultSession } from '@zero/main/vault/session';
import { createVaultKey, isKdfCurrent, wrapperFor } from '@zero/main/vault/wrapping';
import {
  clearDestroyedFlag,
  ensureStructure,
  isDirUnavailable,
  markDestroyed,
  readContainer,
  vaultExists,
  vaultPath,
  writeContainer,
} from '@zero/main/vault/store';
import { VaultError } from '@zero/main/vault/errors';
import type { VaultContainer, VaultWrappings } from '@zero/main/vault/container';
import type {
  ChangeMasterInput,
  ChangePinInput,
  CreateVaultInput,
  ResetPinInput,
  UnlockInput,
  UnlockKind,
  VaultErrorCode,
  VaultStatus,
} from '@zero/types/vault';

/**
 * Ciclo de vida do cofre: criar, desbloquear, travar, trocar credencial e
 * ler/gravar segredos. O container mora em `<cofre>/vault.zkv`; a chave-mestra
 * só existe na sessão (`VaultSessionManager`), nunca em variável de módulo nem
 * em disco.
 *
 * Este módulo é a fachada do domínio: valida o que o usuário digitou, roda a
 * cadeia de desbloqueio e decide o que a sessão faz. Quem fala com arquivo é
 * `store.ts` e quem embrulha chave é `wrapping.ts`, para que aqui só sobre a
 * regra de negócio.
 */

/**
 * Versão do esquema do payload (não do container, que é o `VAULT_VERSION` de
 * `container.ts`). Mora dentro do texto cifrado, então mudar o esquema dos
 * segredos não muda o formato em disco.
 */
const PAYLOAD_VERSION = 1;

/** Conteúdo decifrado do payload do cofre. */
interface VaultPayload {
  version: number;
  secrets: Record<string, string>;
}

/** Container sem o payload, que é sempre derivado da chave no mesmo passo. */
type ContainerDraft = Omit<VaultContainer, 'payload'>;

/**
 * Erro de desbloqueio: carrega o código da credencial e o `lockUntil` gravado
 * no disco, que é o que a tela converte em contagem regressiva.
 */
class UnlockError extends VaultError {
  constructor(code: VaultErrorCode, lockUntil: number) {
    super(code, Math.max(0, lockUntil - Date.now()));
  }
}

function decodePayload(data: Buffer): VaultPayload | null {
  try {
    const parsed: unknown = JSON.parse(data.toString('utf-8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (!('version' in parsed) || !('secrets' in parsed)) return null;
    const version: unknown = parsed.version;
    const secrets: unknown = parsed.secrets;
    if (typeof version !== 'number') return null;
    if (typeof secrets !== 'object' || secrets === null) return null;
    const record: Record<string, string> = {};
    for (const [key, value] of Object.entries(secrets)) {
      if (typeof value !== 'string') return null;
      record[key] = value;
    }
    return { version, secrets: record };
  } catch {
    return null;
  }
}

/**
 * Chave de dados do payload: HKDF da chave-mestra com o `payloadSalt` do
 * cabeçalho. O segredo do cofre não é o sal do Argon2id de nenhuma credencial,
 * é o seu próprio, e é isso que permite trocar senha, PIN e frase sem tocar no
 * acervo cifrado em disco.
 */
function dataKeyOf(container: ContainerDraft, masterKey: Buffer): Buffer {
  return deriveDataKey(masterKey, container.payloadSalt);
}

/** Lê e decifra o payload; falha fechada (`null` = container ilegível). */
function readPayload(container: VaultContainer, masterKey: Buffer): VaultPayload | null {
  const plain = unseal(dataKeyOf(container, masterKey), container.payload);
  if (plain === null) return null;
  const payload = decodePayload(plain);
  return payload?.version === PAYLOAD_VERSION ? payload : null;
}

/** Junta o rascunho do container com o payload cifrado dos segredos. */
function withPayload(
  draft: ContainerDraft,
  masterKey: Buffer,
  secrets: Record<string, string>,
): VaultContainer {
  const body = Buffer.from(JSON.stringify({ version: PAYLOAD_VERSION, secrets }), 'utf-8');
  return { ...draft, payload: seal(dataKeyOf(draft, masterKey), body) };
}

/** Chave da sessão corrente; lança o erro localizado se o cofre estiver fechado. */
function requireSessionKey(): Buffer {
  const key = vaultSession.key();
  if (key === null) throw new VaultError('vaultLocked');
  return key;
}

/**
 * Container legível. `null` vira `vaultMissing` quando não há arquivo e
 * `vaultTampered` quando há um que o app não consegue ler: as duas respostas
 * pedem ações opostas do usuário (criar um cofre novo x. restaurar de um
 * backup), então elas não podem virar o mesmo código.
 */
function requireContainer(): VaultContainer {
  const container = readContainer();
  if (container !== null) return container;
  throw new VaultError(vaultExists() ? 'vaultTampered' : 'vaultMissing');
}

/**
 * Recusa a credencial no main, e não só na tela. O renderer é conveniência:
 * quem decide o que entra no disco é este processo, então formato e padrão
 * óbvio são conferidos aqui de novo.
 */
function assertUsable(kind: 'master' | 'pin' | 'phrase', value: string): void {
  if (kind === 'master') {
    if (!isMasterPasswordFormat(value)) throw new VaultError('vaultInvalidMaster');
    if (strengthFor('master').evaluate(value).blocked) throw new VaultError('vaultWeakMaster');
    return;
  }
  if (kind === 'pin') {
    if (!isPinFormat(value)) throw new VaultError('vaultInvalidPin');
    if (strengthFor('pin').evaluate(value).blocked) throw new VaultError('vaultWeakPin');
    return;
  }
  if (countPhraseWords(value) < RECOVERY_MIN_WORDS) throw new VaultError('vaultInvalidRecovery');
  if (strengthFor('phrase').evaluate(value).blocked) throw new VaultError('vaultWeakRecovery');
}

/** Palavras da frase já normalizada (espaço a mais não conta como palavra). */
function countPhraseWords(phrase: string): number {
  return normalizePhrase(phrase).split(' ').length;
}

/**
 * Estado do cofre para a interface: existe, está aberto, quanto falta da trava
 * e se há frase de recuperação (é o que habilita a tela "esqueci o PIN").
 */
export function vaultStatus(): VaultStatus {
  // A existência é lida **primeiro**: `readContainer` só olha o disco se o
  // arquivo estiver lá, e a leitura invertida diria "não existe" para um cofre
  // que a pessoa acabou de abrir se o arquivo sumisse no meio do caminho.
  const exists = vaultExists();
  const container = readContainer();
  return {
    exists,
    unlocked: vaultSession.isUnlocked(),
    attempts: container?.attempts ?? 0,
    lockUntil: container?.lockUntil ?? 0,
    lockRemainingMs: remainingMs(authState(container)),
    hasRecovery: container?.methods.recovery !== undefined,
  };
}

/** Bloqueia o cofre: a chave sai da memória e o auto-lock é cancelado. */
export function lockVault(): VaultStatus {
  vaultSession.wipe();
  return vaultStatus();
}

/**
 * Cria a árvore do cofre. Sem permissão em `/var/lib` (máquina onde o
 * `postinst` não rodou, ou pasta removida pelo usuário), abre a caixinha de
 * senha do sistema e tenta de novo; recusada pelo usuário o código é
 * `vaultAuthCancelled`.
 */
function ensureStructureWithSetup(): void {
  try {
    ensureStructure();
  } catch (error) {
    if (!isDirUnavailable(error)) throw error;
    const setup = setupVaultDirectory();
    if (setup === 'cancelled') throw new VaultError('vaultAuthCancelled');
    if (setup === 'failed') throw error;
    ensureStructure();
  }
}

/**
 * Cria o cofre: um embrulho por credencial, todos sobre a mesma chave-mestra,
 * cada um com o custo de Argon2id do segredo que o protege.
 *
 * A senha mestra é o caminho mestre (trocar PIN, trocar senha, recuperar), o PIN
 * é o do dia a dia e a frase é a prova de posse que regenera o do PIN. Os três
 * entram juntos porque uma chave sem PIN obriga a digitar 24 caracteres todo
 * dia, e uma frase sem valor é campo morto.
 */
export async function createVault(input: CreateVaultInput): Promise<VaultStatus> {
  if (vaultExists()) throw new VaultError('vaultExists');
  assertUsable('master', input.masterPassword);
  assertUsable('pin', input.pin);
  assertUsable('phrase', input.recoveryPhrase);

  // A criação é o único caminho que ressuscita um cofre destruído.
  clearDestroyedFlag();

  // A criação da estrutura pode tornar visível um cofre que já existia
  // (pasta sem permissão de listagem); rechega antes de escrever por cima.
  ensureStructureWithSetup();
  if (vaultExists()) throw new VaultError('vaultExists');

  const masterKey = createVaultKey();
  const phrase = normalizePhrase(input.recoveryPhrase);
  const methods: VaultWrappings = {
    master: await wrapperFor('master').wrap(masterKey, input.masterPassword),
    pin: await wrapperFor('pin').wrap(masterKey, input.pin),
    recovery: await wrapperFor('recovery').wrap(masterKey, phrase),
  };
  writeContainer(
    withPayload(
      { createdAt: Date.now(), attempts: 0, lockUntil: 0, payloadSalt: newSalt(), methods },
      masterKey,
      {},
    ),
  );

  vaultSession.adopt(masterKey);
  masterKey.fill(0);
  return vaultStatus();
}

/**
 * Sobe o custo do Argon2id quando o método gravado está mais fraco que o
 * perfil vigente, mutando o container para quem for gravá-lo em seguida. Só
 * quem detém a credencial consegue reembrulhar, então cada método sobe no
 * próprio desbloqueio.
 */
async function upgradeMethod(
  container: VaultContainer,
  kind: UnlockKind,
  credential: string,
  vaultKey: Buffer,
): Promise<void> {
  const current = container.methods[kind];
  if (current === undefined || isKdfCurrent(kind, current)) return;
  container.methods[kind] = await wrapperFor(kind).wrap(vaultKey, credential);
}

/**
 * Desbloqueia com a senha mestra ou com o PIN de 8 dígitos. A cadeia
 * (`unlock.ts`) decide na ordem em que o custo cresce: trava exponencial,
 * formato, Argon2id e integridade do payload.
 */
export async function unlockVault(input: UnlockInput): Promise<VaultStatus> {
  const container = requireContainer();
  const context: UnlockContext = {
    input,
    container,
    // O elo de integridade pergunta se a chave é a do cofre, sem precisar
    // saber o formato dos segredos: quem sabe é este módulo.
    verifyKey: (key: Buffer): boolean => readPayload(container, key) !== null,
  };
  const failure = await runUnlockChain(context);
  if (failure !== null) {
    // O `lockUntil` relido do disco é o que a tela precisa: ele já inclui a
    // tentativa que a cadeia acabou de contar.
    const written = readContainer();
    throw new UnlockError(failure.code, written?.lockUntil ?? failure.retryInMs);
  }
  const vaultKey = context.vaultKey;
  if (vaultKey === undefined) throw new VaultError('vaultTampered');

  await upgradeMethod(container, input.kind, input.credential, vaultKey);
  writeContainer({ ...container, ...clearedAttempts() });
  vaultSession.adopt(vaultKey);
  vaultKey.fill(0);
  return vaultStatus();
}

/**
 * Redefine o PIN provando posse da frase de recuperação, e abre o cofre.
 *
 * A frase não é forma de login: ela nunca libera a sessão sozinha, só
 * reembrulha a chave-mestra com o PIN novo. Isso é o que impede que a frase
 * (foto, papel, gerenciador de senhas) valha o mesmo que a chave: quem tem a
 * frase ainda precisa gravar o PIN em algum lugar físico para abrir todo dia.
 */
export async function resetPin(input: ResetPinInput): Promise<VaultStatus> {
  const container = requireContainer();
  const recovery = container.methods.recovery;
  if (recovery === undefined) throw new VaultError('vaultMissing');
  const wait = remainingMs(authState(container));
  if (wait > 0) throw new VaultError('vaultLockedOut', wait);

  assertUsable('pin', input.newPin);
  if (countPhraseWords(input.phrase) < RECOVERY_MIN_WORDS) {
    throw new VaultError('vaultInvalidRecovery');
  }

  const phrase = normalizePhrase(input.phrase);
  const vaultKey = await unwrapWith(container, 'recovery', phrase);
  if (vaultKey === null) {
    // Frase errada conta tentativa como qualquer credencial recusada: a rampa
    // precisa valer também contra força bruta à frase, que é o único caminho
    // que não passa pelo PIN de 8 dígitos.
    const next = registerFailedAttempt(authState(container));
    writeContainer({ ...container, ...next });
    throw new UnlockError('vaultWrongRecovery', next.lockUntil);
  }

  // A frase está na mão: aproveita para subir o custo do método de recuperação
  // junto com o PIN novo.
  container.methods.pin = await wrapperFor('pin').wrap(vaultKey, input.newPin);
  if (!isKdfCurrent('recovery', recovery)) {
    container.methods.recovery = await wrapperFor('recovery').wrap(vaultKey, phrase);
  }
  writeContainer({ ...container, ...clearedAttempts() });
  vaultSession.adopt(vaultKey);
  vaultKey.fill(0);
  return vaultStatus();
}

/**
 * Troca da senha mestra com o cofre aberto.
 *
 * A senha atual é exigida de novo porque cofre aberto é **estado do processo**,
 * não prova de posse: quem chega na mesa de alguém com o app aberto não pode
 * trocar a chave-mestra de quem está usando. E como a chave é aleatória, trocar
 * a senha é só reembrulhar: o acervo em disco não é tocado.
 */
export async function changeMasterPassword(input: ChangeMasterInput): Promise<VaultStatus> {
  const container = requireContainer();
  requireSessionKey();
  const current = container.methods.master;
  if (current === undefined) throw new VaultError('vaultTampered');
  assertUsable('master', input.newPassword);

  const vaultKey = await unwrapWith(container, 'master', input.currentPassword);
  if (vaultKey === null) throw new UnlockError('vaultWrongMaster', 0);
  container.methods.master = await wrapperFor('master').wrap(vaultKey, input.newPassword);
  writeContainer(container);
  vaultKey.fill(0);
  return vaultStatus();
}

/**
 * Troca do PIN do dia a dia, pelo mesmo motivo da troca da senha mestra: o PIN
 * novo tem que vir de quem sabe o antigo, e a troca não pode custar o acervo.
 */
export async function changePin(input: ChangePinInput): Promise<VaultStatus> {
  const container = requireContainer();
  requireSessionKey();
  assertUsable('pin', input.newPin);

  const vaultKey = await unwrapWith(container, 'pin', input.currentPin);
  if (vaultKey === null) throw new UnlockError('vaultWrongPin', 0);
  container.methods.pin = await wrapperFor('pin').wrap(vaultKey, input.newPin);
  writeContainer(container);
  vaultKey.fill(0);
  return vaultStatus();
}

/** Desembrulha a chave com uma credencial; `null` = credencial recusada. */
async function unwrapWith(
  container: VaultContainer,
  kind: 'master' | 'pin' | 'recovery',
  credential: string,
): Promise<Buffer | null> {
  const method = container.methods[kind];
  if (method === undefined) throw new VaultError('vaultTampered');
  const wrapper = wrapperFor(kind);
  let derived: Buffer | null = null;
  try {
    derived = await wrapper.derive(method, credential);
    return wrapper.unwrap(method, derived);
  } catch {
    return null;
  } finally {
    derived?.fill(0);
  }
}

/** Segredo salvo, ou `null` se não existir. Exige cofre desbloqueado. */
export function getSecret(name: string): string | null {
  const masterKey = requireSessionKey();
  const payload = readPayload(requireContainer(), masterKey);
  if (payload === null) throw new VaultError('vaultTampered');
  return payload.secrets[name] ?? null;
}

/** Grava (ou sobrescreve) um segredo e re-sela o container. */
export function setSecret(name: string, value: string): void {
  const masterKey = requireSessionKey();
  const container = requireContainer();
  const payload = readPayload(container, masterKey);
  if (payload === null) throw new VaultError('vaultTampered');
  writeContainer(withPayload(container, masterKey, { ...payload.secrets, [name]: value }));
}

/** Remove um segredo (remapeado no payload re-selado). */
export function deleteSecret(name: string): void {
  const masterKey = requireSessionKey();
  const container = requireContainer();
  const payload = readPayload(container, masterKey);
  if (payload === null) throw new VaultError('vaultTampered');
  if (!(name in payload.secrets)) return;
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload.secrets)) {
    if (key !== name) next[key] = value;
  }
  writeContainer(withPayload(container, masterKey, next));
}

/**
 * Destrói o cofre: zera a chave na memória **antes** de tocar no disco (se a
 * gravação falhar, a RAM já está limpa) e sobrescreve o `vault.zkv` e o
 * `vault.zkv.tmp` — o temporário importa porque carrega os mesmos blobs de
 * chave embrulhada que o container.
 *
 * Não remove `vaultDir()` nem a raiz em `/var/lib`: elas são do sistema
 * (`0711 root:root`) e o app não é o dono.
 *
 * A partir daqui nada recria o container sem um `createVault` explícito.
 */
export function destroyVault(): void {
  vaultSession.wipe();
  shredFile(vaultPath());
  shredFile(`${vaultPath()}.tmp`);
  markDestroyed();
}
