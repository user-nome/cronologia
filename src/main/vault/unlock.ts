import { isMasterPasswordFormat, isPinFormat } from '@zero/shared';
import { authState, registerFailedAttempt, wrongCredentialCode } from '@zero/main/vault/auth';
import { writeContainer } from '@zero/main/vault/store';
import { wrapperFor } from '@zero/main/vault/wrapping';
import type { VaultContainer } from '@zero/main/vault/container';
import type { UnlockInput, VaultErrorCode } from '@zero/types/vault';

/**
 * Cadeia de desbloqueio (Chain of Responsibility): cada elo lê o que o anterior
 * deixou e pode encerrar a sequência devolvendo a falha.
 *
 * Os elos estão na ordem em que o **custo** cresce, e essa ordem é a defesa:
 * a trava exponencial é um número no disco, o formato da credencial é uma regex,
 * e só o Argon2id é caro. Se o Argon2id viesse antes, a espera de 24 h seria
 * contornável por um `await` a menos, e um PIN de dois dígitos custaria 256 MiB
 * de memória para ser recusado.
 */

/** Estado que corre pela cadeia. */
export interface UnlockContext {
  readonly input: UnlockInput;
  readonly container: VaultContainer;
  /**
   * Confere que a chave liberada abre o payload do container. Vem injetada
   * porque o formato do payload é do domínio de `vault.ts`, e a cadeia não
   * precisa saber decifrar segredo nenhum: ela só pergunta se a chave é a do
   * cofre.
   */
  readonly verifyKey: (key: Buffer) => boolean;
  /** Chave-mestra liberada quando a cadeia chega ao fim. */
  vaultKey?: Buffer | undefined;
}

/**
 * Falha de um elo: o código vai para a camada de cima localizar a mensagem no
 * bundle corrente, e `retryInMs` alimenta a contagem regressiva da tela.
 */
export interface UnlockFailure {
  code: VaultErrorCode;
  retryInMs: number;
}

/** Resposta de um elo: `null` segue a cadeia, o resto encerra o desbloqueio. */
export type HandlerOutcome = UnlockFailure | null;

/**
 * Elo da cadeia (Chain of Responsibility): devolve `null` para passar a
 * requisição adiante ou a falha que encerra o desbloqueio.
 */
export abstract class UnlockHandler {
  private next: UnlockHandler | null = null;

  /** Encadeia o próximo elo e o devolve (leitura de baixo para cima). */
  public setNext(handler: UnlockHandler): UnlockHandler {
    this.next = handler;
    return handler;
  }

  public async handle(context: UnlockContext): Promise<UnlockFailure | null> {
    const outcome = await this.process(context);
    if (outcome !== null || this.next === null) return outcome;
    return this.next.handle(context);
  }

  protected abstract process(context: UnlockContext): HandlerOutcome | Promise<HandlerOutcome>;
}

/**
 * Credencial recusada: conta a tentativa na trava exponencial, regrava o
 * container e devolve o código da credencial que falhou, sem ecoar o valor
 * digitado. Formato errado entra por aqui de propósito: uma credencial
 * malformada não é menos errada, só é mais barata de recusar.
 */
function credentialFailure(context: UnlockContext, kind: UnlockInput['kind']): UnlockFailure {
  const next = registerFailedAttempt(authState(context.container));
  writeContainer({ ...context.container, ...next });
  return { code: wrongCredentialCode(kind), retryInMs: next.lockUntil };
}

/** 1. Trava exponencial: a espera vale antes de qualquer derivação. */
class LockoutHandler extends UnlockHandler {
  protected process(context: UnlockContext): HandlerOutcome {
    const retryInMs = context.container.lockUntil - Date.now();
    // Quem está esperando não gasta nova tentativa: a trava não é punição nova.
    if (retryInMs <= 0) return null;
    return { code: 'vaultLockedOut', retryInMs };
  }
}

/** 2. Formato: um PIN de dois dígitos não deve custar 256 MiB de Argon2id. */
class FormatHandler extends UnlockHandler {
  protected process(context: UnlockContext): HandlerOutcome {
    const { kind, credential } = context.input;
    const valid = kind === 'pin' ? isPinFormat(credential) : isMasterPasswordFormat(credential);
    if (valid) return null;
    return credentialFailure(context, kind);
  }
}

/** 3. Derivação Argon2id e desembrulho da chave: o passo caro do desbloqueio. */
class KeyDerivationHandler extends UnlockHandler {
  protected async process(context: UnlockContext): Promise<HandlerOutcome> {
    const { kind, credential } = context.input;
    const method = context.container.methods[kind];
    // Método ausente é credencial recusada, não erro: um cofre sem PIN não
    // pode ser aberto por PIN, e dizer isso custa o mesmo que errar o PIN.
    if (method === undefined) return credentialFailure(context, kind);
    const wrapper = wrapperFor(kind);
    let derived: Buffer | null = null;
    try {
      derived = await wrapper.derive(method, credential);
      // `unwrap` devolve `null` para credencial errada, e o contexto guarda
      // `undefined` para "nenhuma chave liberada": são o mesmo evento, e o elo
      // de integridade é quem decide se falta chave ou se a chave é de outro
      // cofre (que é `vaultTampered`).
      context.vaultKey = wrapper.unwrap(method, derived) ?? undefined;
    } catch {
      return credentialFailure(context, kind);
    } finally {
      // A chave de trabalho sai da RAM mesmo quando o desembrulho falha, então
      // o zero fica no `finally` e não no corpo feliz.
      derived?.fill(0);
    }
    return context.vaultKey === undefined ? credentialFailure(context, kind) : null;
  }
}

/**
 * 4. Integridade: a chave precisa abrir o payload também. Uma escrita
 * interrompida deixa o embrulho íntegro e o payload pela metade; sem este elo o
 * app adotaria a chave e só descobriria o problema ao tentar decifrar a
 * biblioteca.
 *
 * A resposta é `vaultTampered`, e não "credencial errada": a senha está certa e
 * dizer o contrário levaria o usuário a trocar uma senha que funciona.
 */
class PayloadIntegrityHandler extends UnlockHandler {
  protected process(context: UnlockContext): HandlerOutcome {
    const vaultKey = context.vaultKey;
    if (vaultKey === undefined) return credentialFailure(context, context.input.kind);
    return context.verifyKey(vaultKey) ? null : { code: 'vaultTampered', retryInMs: 0 };
  }
}

/**
 * Monta a cadeia na ordem em que o custo cresce: trava (barata, em disco)
 * corta antes do formato (regex), que corta antes do Argon2id.
 */
export function unlockPipeline(): UnlockHandler {
  const lockout = new LockoutHandler();
  lockout
    .setNext(new FormatHandler())
    .setNext(new KeyDerivationHandler())
    .setNext(new PayloadIntegrityHandler());
  return lockout;
}

/** Roda a cadeia: `null` significa que a chave foi liberada no contexto. */
export async function runUnlockChain(context: UnlockContext): Promise<UnlockFailure | null> {
  return unlockPipeline().handle(context);
}
