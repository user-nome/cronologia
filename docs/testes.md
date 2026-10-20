# Testes

Três camadas, com três SIGNais diferentes. Esta doc é da primeira:

| Camada              | Onde              | O que responde                                      | Guia                         |
| ------------------- | ----------------- | --------------------------------------------------- | ---------------------------- |
| Unitária/integrada  | `tests/**`        | "este módulo faz o que diz?"                        | este arquivo                 |
| Ponta a ponta (E2E) | `e2e/**`          | "o app de verdade funciona depois que tudo monta?"  | [`e2e.md`](e2e.md)           |
| Mutação             | `tools/mutation/` | "se esta linha fizesse outra coisa, a suíte veria?" | [`mutation.md`](mutation.md) |

## A suíte unitária

Suíte em Vitest com ambiente `jsdom` único (`vitest.config.mts`): o renderer e
também o processo main rodam em `jsdom`, com o `electron` trocado pelo stub de
`tests/mocks/electron.ts`. São **72 arquivos** e **1.120 testes**; a duração gira
em torno de 3 minutos porque os testes de backup cifram de verdade com scrypt
`N=2^17` (~128 MiB por derivação), enquanto o Argon2id do cofre roda com o KDF
barato dos testes (16 MiB).

> **Rodando em máquina com pouca memória:** a suíte padrão abre um `jsdom` por
> arquivo de teste. Com os 8 núcleos dela em paralelo, o consumo chega a zerar a
> memória disponível e o processo morre no meio sem mensagem. Passe
> `--maxWorkers=4` (`npx vitest run --maxWorkers=4`) para reduzir o pico; o
> resultado é o mesmo, só mais lento.

## Como rodar

```bash
npm test               # execução única (o que o CI espera)
npm run test:watch     # modo watch
npm run test:coverage  # cobertura em coverage/ (95% por arquivo)
```

O `npm run check` **não** roda os testes: ele cobre typecheck, lint, formato e
auditoria OSV. Rode os dois antes de concluir qualquer mudança.

Os E2E e a varredura de mutação **também** não entram no `npm run check`: os
primeiros abrem janelas e pagam Argon2id de produção, e a segunda leva horas.
São sob demanda (ver os guias linkados no topo).

## Arquivos

### Processo main

| Arquivo                                     | O que cobre                                                                                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/main/index.test.ts`                  | Boot (instância única, protocolos, IPC), handlers, `cover://`, ciclo da janela, F11 e diretórios XDG                                                                       |
| `tests/main/index.dev.test.ts`              | Modo desenvolvimento (Vite dev server, ausência em produção)                                                                                                               |
| `tests/main/index-startup.test.ts`          | Arranque resiliente: falha de disco em `initDrive` não impede a janela nem o registro de IPC                                                                               |
| `tests/main/index-vault.test.ts`            | Canais `vault:*` (criar/desbloquear/trava/destruir), guarda `assertAppFrame` e auto-lock (`vault:locked`)                                                                  |
| `tests/main/protocols.test.ts`              | Scheme `cronologia://`: tabela de MIME por extensão, 403 em traversal percent-encoded, 404 e 500, e `appPageUrl` como base única                                           |
| `tests/main/ipc-origem.test.ts`             | Guarda de origem do IPC: frames recusados, origem com porta diferente, dev server e a recusa no idioma em uso                                                              |
| `tests/main/ipc-biblioteca.test.ts`         | Mensagem que atravessa o IPC do acervo: erro do cofre localizado e erro do domínio intacto                                                                                 |
| `tests/main/node-loader.test.ts`            | Loader de aliases `@zero/*` rodando o Node de verdade em processo filho                                                                                                    |
| `tests/main/external.test.ts`               | `openExternalSafe`: só `https`, esquema em qualquer caixa, URL malformada e recusa do shell                                                                                |
| `tests/main/cleanup.test.ts`                | Varredura de legado no boot: o que é sobrescrito, o que é contado como falha e o log sem caminho do home                                                                   |
| `tests/main/store-crypto.test.ts`           | Formato `CLIB1`: roundtrip, assinatura, tamanho, separação de domínio e recusa sem cofre aberto                                                                            |
| `tests/main/shred.test.ts`                  | sobrescrita segura: sumiu, bytes intermediários não são o original, symlink não é seguido, pasta vazia                                                                     |
| `tests/main/destroy.test.ts`                | destruição do cofre/acervo, guarda de não ressuscitar, legados em claro, `.tmp` órfãos                                                                                     |
| `tests/main/drive-purge.test.ts`            | `purgeRemote`: apaga tudo, conta falha parcial, não age sem cofre aberto                                                                                                   |
| `tests/main/drive-rest.test.ts`             | Chamadas REST do Dropbox: paginação, validação fail-closed do corpo, renovação e repetição após 401, erro traduzido                                                        |
| `tests/main/drive-oauth.test.ts`            | PKCE sem secret, loopback (porta fixa e porta livre quando a fixa está ocupada), troca e renovação de token, escopo parcial                                                |
| `tests/main/drive-crypto.test.ts`           | Formato `WTENC3`: cifra, manifesto com salt, recusa do formato antigo, nomes opacos, falha com senha errada                                                                |
| `tests/main/jsonfile.test.ts`               | `writeJsonAtomic`: escrita atômica, `mode` aplicado mesmo com `.tmp` pré-existente                                                                                         |
| `tests/main/library.test.ts`                | acervo cifrado: XDG, `clampProgress`, roundtrip, capa, restauração, mime, cofre fechado, arquivo corrompido                                                                |
| `tests/main/settings.test.ts`               | `settings.json`: idioma no disco, segredos no cofre, normalização e recusa com cofre fechado                                                                               |
| `tests/main/vault-crypto.test.ts`           | Perfis de custo do Argon2id, AES-256-GCM, HKDF, faixa do KDF e (unico arquivo sem o stand-in de KDF) a integração com `hash-wasm`                                          |
| `tests/main/vault-container.test.ts`        | Formato do `vault.zkv`: roundtrip, custo por método, offsets, lixo, truncamento, faixa e fail-closed                                                                       |
| `tests/main/vault-lockout.test.ts`          | Escala da trava (10 s até 24 h), contagem ilegível no teto e invariante de nunca destravar                                                                                 |
| `tests/main/vault-session.test.ts`          | Singleton da sessão: `adopt`/`wipe`, zeragem de bytes e repasse do auto-lock                                                                                               |
| `tests/main/vault-wrapping.test.ts`         | Estado da trava (projeção para a tela) e estratégia de embrulho da chave por credencial                                                                                    |
| `tests/main/vault-unlock.test.ts`           | Cadeia de desbloqueio: reembrulho de custo antigo, embrulho com tamanho errado, KDF que lança por dentro e separação de salt entre coframes                                |
| `tests/main/vault.test.ts`                  | Ciclo de vida: criar (3 credenciais), abrir por PIN/mestra, frase de recuperação, trocar credencial, segredos, adulteração, pasta sem permissão, destruição                |
| `tests/shared/policy.test.ts`               | Formato aceito de cada credencial, normalização da frase (espaço sim, caixa não) e contagem regressiva                                                                     |
| `tests/shared/strength.test.ts`             | Régua de força: o que recusa (`blocked`), a nota, o motivo, o acordo entre a tela e o main e a largura da barra                                                            |
| `tests/shared/json.test.ts`                 | Guarda de dado externo: o que `isRecord` aceita, o que `field` devolve para valor falsy e o que sobe pela cadeia de protótipos                                             |
| `tests/shared/work.test.ts`                 | Validador de obra: campo obrigatório faltando, campo no tipo errado, obra sem os opcionais do backup antigo e lista com um elemento ruim                                   |
| `tests/main/vault-secrets.test.ts`          | Cofre é a única fonte: sem/aberto/fechado/adulterado (falha fechada), JSON de forma errada e sessão ligada à chave em memória                                              |
| `tests/main/vault-privilege.test.ts`        | `setupVaultDirectory`: override bloqueia pkexec; exit 0/126/127/throw → ok/cancelled/failed; `isVaultDirUnavailable` e `createVault` sem pkexec no sandbox                 |
| `tests/main/drive-auth.test.ts`             | Estado do Dropbox, tokens no cofre, escopo divergente e refresh                                                                                                            |
| `tests/main/drive-backup.test.ts`           | `backupNow`/`restoreNow` ponta a ponta (rede simulada, cifra real), recusa sem cofre e execução paralela                                                                   |
| `tests/main/drive-info.test.ts`             | `backupInfo`, renovação de sessão e retry após 401                                                                                                                         |
| `tests/main/drive-provider.test.ts`         | Catálogo e disponibilidade dos provedores (Google Drive condicionado à credencial)                                                                                         |
| `tests/main/drive-provider-adapter.test.ts` | Adaptador do Dropbox: o `operational` relido a cada acesso, o override do cofre sobre a chave do build e as operações falando com a rota da API                            |
| `tests/main/google-drive.test.ts`           | OAuth e REST Google Drive: paginação, appDataFolder, upload multipart/PATCH, retry 401 e renovação                                                                         |
| `tests/main/google-oauth.test.ts`           | `googleFlow`: parâmetros offline/consent, `client_secret` condicional, mensagem de renovação e o `userinfo` que nunca derruba a conexão                                    |
| `tests/main/google-rest.test.ts`            | Defesas do REST do Google: `size` do Drive, corpo de erro truncado, 401 repetido uma vez, backup duplicado apagado depois do PATCH e sessão que não sobrevive sem gravação |
| `tests/main/oauth-flow.test.ts`             | Servidor de callback compartilhado: requisição sem `url`, rota errada, `address()` de socket e limpeza do temporizador do timeout                                          |
| `tests/main/drive-switch-provider.test.ts`  | Troca de destino e preservação de sessões independentes no cofre                                                                                                           |
| `tests/main/drive-remote-names.test.ts`     | Nomes remotos opacos (HMAC-SHA256) e manifesto de cadeia                                                                                                                   |
| `tests/main/drive-restore-lock.test.ts`     | Trava exponencial da restauração (só `PassphraseError` conta) e a rampa até saturar em 15 min                                                                              |

### Mensagens, preload, tipos e renderer

| Arquivo                                                       | O que cobre                                                                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `tests/messages/bundles.test.ts`                              | Varredura das 5 traduções: folha vazia, marcador de negrito/código sem par, reticência e mensagem com parâmetro |
| `tests/messages/branch-coverage.test.ts`                      | Ramos das mensagens que dependem de argumento (corpo de erro vazio, escala de segundos × minutos)               |
| `tests/preload/index.test.ts`                                 | Fachada `window.api`: lista **completa** de canais por grupo, assinaturas e o aviso de bloqueio com a sua causa |
| `tests/shared/types.test.ts`                                  | Uniões fechadas e guards dos contratos compartilhados                                                           |
| `tests/renderer/src/App.test.tsx`                             | Telas: carga, estatísticas, busca/filtros, ações nas obras, status Drive e fila de gravação                     |
| `tests/renderer/src/App.modais.test.tsx`                      | Modais a partir do App: configurações, atribuições, doações, zona de risco e o portão do cofre                  |
| `tests/renderer/src/main.test.tsx`                            | Entry do renderer: monta o `App` em `#root` e não quebra quando o elemento não existe                           |
| `tests/renderer/src/components/WorkCard.test.tsx`             | Card: badges, progresso, ações de status                                                                        |
| `tests/renderer/src/components/WorkModal.test.tsx`            | Criar/editar obra, validação e exclusão com confirmação                                                         |
| `tests/renderer/src/components/SettingsModal.test.tsx`        | Configurações: carga, provedores, senha de backup e indicador de ocupado                                        |
| `tests/renderer/src/components/SettingsModal.drive.test.tsx`  | Ações do Drive: rótulos de ocupado, fallbacks de erro e limpeza do prefixo de IPC                               |
| `tests/renderer/src/components/SettingsModal.vault.test.tsx`  | Cofre nas configurações: badge, prompt, ação adiada, fechamento com Escape e troca de senha mestra/PIN          |
| `tests/renderer/src/components/VaultModal.test.tsx`           | Cofre: medidor de força, confirmação, erro do backend, recontagem da trava e modo barreira                      |
| `tests/renderer/src/components/DangerZone.test.tsx`           | Confirmação em duas etapas das ações destrutivas e os três caminhos de falha                                    |
| `tests/renderer/src/components/RestorePasswordModal.test.tsx` | Senha de restauração: foco, tipo do campo, atalhos e cancelamento                                               |
| `tests/renderer/src/components/Select.test.tsx`               | Select acessível (teclado, `aria`, busca, menu vazio, e o controle desabilitado que não abre nem por clique)    |
| `tests/renderer/src/components/AttributionsModal.test.tsx`    | Página de Atribuições: rolagem em pausa e as duas faces do clique no overlay                                    |
| `tests/renderer/src/components/DonateModal.test.tsx`          | Página de Doações: cópia do link, sem clipboard e falha de escrita                                              |
| `tests/renderer/src/constants.test.ts`                        | Opções de filtro, cores, `coverUrl`, `formatDate`, `clampProgress`                                              |
| `tests/renderer/src/errors.test.ts`                           | `ipcErrorMessage`: limpeza do prefixo do Electron, mensagem com quebra de linha e valor que não é `Error`       |
| `tests/renderer/src/i18n.test.tsx`                            | `richText()` (marcadores no meio, no começo e no fim), contexto de idioma e catálogo de 5 idiomas               |

### Build

| Arquivo                                | O que cobre                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `tests/build/apparmor-profile.test.ts` | Perfil AppArmor: socket do IBus, mídia removível, macros do perfil e estrutura                              |
| `tests/build/dev-sandbox.test.ts`      | Sandbox do `npm run dev`: cofre e as três pastas XDG dentro do repositório (o acervo de dev não é o do app) |

### Apoios

| Arquivo                               | Papel                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `tests/mocks/electron.ts`             | Stub do `electron` aplicado por alias no `vitest.config.mts` (janela, ipcMain, app, shell)                          |
| `tests/setup-env.ts`                  | Sandbox `HOME`/`XDG_*` temporária por processo (antes de qualquer import)                                           |
| `tests/setup.ts`                      | `jest-dom`, `cleanup`, `restoreAllMocks`, `unstubAllGlobals` e `useRealTimers` após cada teste                      |
| `tests/helpers/sandbox.ts`            | `resetSandbox()`/`sandboxPath()`: limpa os diretórios XDG e a árvore do cofre do processo                           |
| `tests/helpers/api.ts`                | `createApiMock()`: fachada `ElectronApi` tipada para os testes de renderer                                          |
| `tests/helpers/drive.ts`              | Rede simulada (servidor local) e sessão do Drive pronta para os testes de backup                                    |
| `tests/helpers/vault.ts`              | `openTestVault()`: cofre de teste recriado e aberto (KDF barato)                                                    |
| `tests/tools/mutation-runner.test.ts` | Trava as garantias do motor de mutação: splicing, `fsModuleCache`, nomes de nó da AST e ausência de órfão em escopo |

Roda em ambiente `node` (`// @vitest-environment node`), e é o motivo do guarda
de DOM em `tests/setup.ts`: `setupFiles` roda para ele também.
| `tests/helpers/fixtures.ts` | Fábricas de `Work`/`AppSettings` com defaults válidos |

## Convenções

- **Correção vem com teste**: escreva o teste que reproduz o problema antes de
  corrigir; teste de domínio novo fica perto dos pares (`tests/main/`,
  `tests/renderer/`, `tests/preload/`).
- **Arquivo abaixo de ~500 linhas**: quando passar, extraia helpers para
  `tests/helpers/`.
- **Temporizadores**: `vi.useFakeTimers()` para travas e contagens, com
  `vi.useRealTimers()` no fim (o `setup.ts` já restaura, mas o teste que muda
  o relógio deve devolver).
- **`clearMocks` fica desligado de propósito** no `vitest.config.mts`: o
  registro de IPC e do protocolo acontece no import do `src/main/index.ts` e
  seria apagado antes dos asserts.
- **Sandbox sempre**: escritas caem em diretório temporário (`setup-env.ts`);
  testes que precisam de um disco limpo chamam `resetSandbox()` no
  `beforeEach`, que também apaga a árvore do cofre (`CRONOLOGIA_VAR_LIB` aponta
  para o sandbox, e `CRONOLOGIA_VAULT_DIR` nunca está definido fora do
  `npm run dev`). Cofre de teste se cria com `openTestVault()`
  (`tests/helpers/vault.ts`), que recria o arquivo e deixa a sessão aberta.
  **Todos** os testes de cofre derivam com o KDF barato (`FAST_KDF`, 16 MiB /
  1 iteração): nenhum roda o Argon2id de produção (128 MiB / 3 iterações).
  A faixa aceita é coberta por `kdfParamsInRange`, sem derivar. Quem cifra de verdade é o backup: os
  testes de `drive/*` usam scrypt de custo real (`N=2^17`), por isso os
  `describe` de backup/restauração declaram 60 s (o timeout global é 15 s).
- **`electron` é mock**: nunca importe o Electron real; o alias já aponta para
  `tests/mocks/electron.ts`. No renderer, use `createApiMock()` para a
  fachada.
- **Imports dos testes**: relativos com extensão (`.ts`/`.tsx`) para os
  helpers locais e alias `@zero/*` para o código sob teste. O `max-lines` é
  750 linhas em `tests/`, `e2e/` e `tools/` (tabela de caso e runner não
  melhoram por estarem quebrados em 500); em `src/` o teto do AGENTS.md vale
  (520).
- **Nada de `throw` de literal na suíte**: o ESLint libera `only-throw-error`
  com `allowThrowingUnknown` nos testes, porque boa parte das defesas do main só
  existe porque o valor lançado **não** é um `Error`, e o jeito honesto de dizer
  "isto é desconhecido em tempo de compilação" é o tipo `unknown`. `any` e
  literal continuam barrados.

## Cobertura

`vitest.config.mts` mede `src/**/*.{ts,tsx}` com o provedor v8 (relatórios em
texto e HTML em `coverage/`) e exige **95% por arquivo** (`perFile: true`) de
linhas, instruções, funções e ramos. Estado medido na 2.1.2 (**1.120 testes em
72 arquivos**, 83 arquivos de `src/` medidos):

| Métrica    | Global | Pior arquivo                   |
| ---------- | ------ | ------------------------------ |
| Statements | 99,31% | 96,00% (`main/cleanup.ts`)     |
| Branches   | 98,69% | 95,00% (`vault/unlock.ts`)     |
| Functions  | 99,57% | 95,23% (`drive/oauth-flow.ts`) |
| Lines      | 99,51% | 95,45% (`main/cleanup.ts`)     |

**Nenhum arquivo fica abaixo de 95% em nenhuma das quatro métricas**, e
`npm run test:coverage` termina com código 0. O piso subiu de 50% agregado
para 95% por arquivo depois da varredura de baixo para cima: o piso agregado
perdoa o arquivo esquecido, e era isso que acontecia, com o entry do renderer
em 0%, os bundles de idioma em 10% e o scheme da SPA em 35%.

Oito arquivos estavam abaixo do piso e subiram com os testes desta leva: o
adaptador do Dropbox (`dropbox/provider.ts`, o `getter operational` lido a cada
acesso e não congelado no import), o fluxo OAuth do Google
(`google/oauth.ts`, `google/credentials.ts`, `google/rest.ts`,
`google/session.ts`), o servidor de callback compartilhado
(`drive/oauth-flow.ts`) e, no renderer, `Select.tsx` (a trava do controle
desabilitado) e `SettingsModal.tsx` (troca de provedor recusada e troca de
credencial do cofre).

Dois achados que os testes gravaram, e que valem mais que a linha coberta:

- **`googleDriveProvider.operational` congela no import**, ao contrário do
  getter do Dropbox, que é relido a cada acesso. A diferença é de projeto, não
  de acaso: a App key do Dropbox pode vir do override gravado no cofre e mudar
  com o app aberto, enquanto o par do Google é chumbado no bundle no build.
  `tests/main/drive-provider-adapter.test.ts` fixa as duas metades.
- **Corpo não-JSON da API não vira `invalidListResponse`**: o `parseJson` devolve
  o erro do parser. O que importa é que a listagem **não** devolve `[]` em
  silêncio, que é como um backup apagaria o acervo inteiro como órfão.
  `tests/main/google-rest.test.ts` fixa esse comportamento como ele é.

Os módulos de destruição ficaram em 100% nas quatro métricas (`shred.ts`,
`store-crypto.ts`, `vault/container.ts`, `vault/vault.ts`, `drive/rest.ts`,
`drive/state.ts`, `drive/backup.ts`). O `src/renderer/src/main.tsx` (entry que
monta o React em `#root`) tem teste próprio: `tests/renderer/src/main.test.tsx`.

Rodar cobertura: `npm run test:coverage`. Um `npm run test -- coverage` **não**
funciona: sem os dois hífens, o Vitest lê `coverage` como filtro de nome de
arquivo e sai com "No test files found".

Ficam de fora do denominador, cada um com o motivo no `exclude` da config:
`global.d.ts` e o `index.html` do renderer, `src/types/**` e
`src/messages/index.ts` (declarações de tipo e barrel de reexport, que com
`verbatimModuleSyntax` não emitem nada) e `src/node.loader.ts` (hook que só roda
em processo filho; é verificado por `tests/main/node-loader.test.ts`, que roda o
Node de verdade, mas o V8 não mede cobertura entre processos).

### Duas decisões que a cobertura por arquivo mudou no código

Subir para 95% por arquivo expôs dois ramos que nenhum teste alcança porque o
`noUncheckedIndexedAccess` os exige, e as duas correções foram no `src/`, não na
medição:

- **`src/main/drive/restore-lock.ts`**: a rampa da trava de restauração era um
  índice numa tabela com `Math.min` de clamp e um `?? 10` defensivo. Com índice
  de tipo `number`, o TypeScript não acompanha o clamp, e o `??` era um branch
  inalcançável (75% de ramos no arquivo). Virou um `switch` total, com o
  `default` sendo o teto de 15 min: sem índice, sem `??`, e com todos os ramos
  alcançáveis por teste.
- **`src/renderer/src/i18n.tsx`**: `richText` fazia `match[2] ?? ''` ao montar o
  nó `<code>`. O `??` só existe para o tipo, porque o regex garante o grupo, e o
  React já renderiza `undefined` como nada. Foi removido.

O padrão é o mesmo: quando um ramo é inalcançável **por construção** (o código
provou que o caminho não existe), corrigir o código é melhor do que pedir
cobertura artificial. Cobertura é medida de execução: um ramo que o código torna impossível não é um buraco de teste, é um resto de tipagem.

## Depuração

A suíte cobre comportamento; quando o bug é de **runtime**, o caminho é outro.
Três frentes, todas só em desenvolvimento — nada disto existe no `.deb`
instalado.

### Renderer: React DevTools

Para inspecionar props/state e medir re-renders:

```bash
npm run dev          # em um terminal
npx react-devtools   # em outro
```

O `npx` baixa o pacote na hora, então **não** vira dependência do projeto (e
não entra no `package-lock.json` nem no `.deb`). A extensão do React DevTools
para navegador **não** funciona aqui: o app é servido por `cronologia://`, e
conectar a extensão exigiria `NODE_ENV=development` + a porta do backend.

O Profiler é a parte que compensa: `SettingsModal` e `App` re-renderizam a
árvore inteira quando um único card muda. Se o Profiler acusar commits
desnecessários, o conserto é `useMemo`/`useCallback` no ponto, não
desabilitar a checagem.

O DevTools do Chromium (F11 no app) continua disponível para rede, CSP,
console e Performance — ele cobre o renderer, **não** o processo main.

### Processo main: V8 inspector

O DevTools do Chromium não alcança o main. Para isso:

```bash
npm run dev:inspect      # abre e segue rodando; porta 5858
npm run dev:inspect-brk  # para na primeira linha, esperando o depurador
```

Ambos passam `--inspect[=-brk]=5858` ao binário do Electron via
`electron-vite`, com o mesmo sandbox do `npm run dev` (cofre em `.dev-vault`,
dados/config/cache em `.dev-home`) e `ELECTRON_ENABLE_LOGGING=1`. Para anexar:
`chrome://inspect` em um Chromium com "Configure…" apontando para
`localhost:5858`, ou a porta `5858` na sua IDE.

Vale para `library.ts`, `store-crypto.ts`, `vault/*`, `drive/*` e para o
`registerIpc` — inclusive para caçar um handler que devolve a promise errada.

> **Não funciona no app empacotado, por desenho.** O fuse
> `enableNodeCliInspectArguments` está em `false` (`package.json` →
> `build.electronFuses`): o binário instalado recusa `--inspect` para que o
> usuário final não consiga abrir um depurador no processo que tem a chave
> mestra em memória. Se precisar depurar o pacote instalado, faça-o no
> `electron-vite dev`.

### Logs do Chromium

`npm run dev` já exporta `ELECTRON_ENABLE_LOGGING=1`, então o que o Chromium
escreve (GPU, rede, sandbox, vídeo) aparece no terminal junto com o
`console.warn`/`console.error` do app. O lint libera só esses dois levels de
console de propósito: log de depuração permanente vira lixo na saída do
usuário. Para depurar ponto a ponto, use breakpoint, não `console.log`.

### Heap snapshot: o que sobra depois de destruir o cofre

O Cryptographic Erase depende de a chave-mestra **não sobreviver** em memória.
Isso é verificável, e o procedimento está em [`cofre.md`](cofre.md) §
"Provar o Cryptographic Erase com heap snapshot" e no `SECURITY.md`.

## Ver também

- [`e2e.md`](e2e.md) (app compilado e payload do `.deb`, com Playwright)
- [`mutation.md`](mutation.md) (o outro sinal: a suíte percebe a mudança?)
- [`arquitetura.md`](arquitetura.md) (camadas e aliases)
- [`api.md`](api.md) (contrato testado da fachada)
- [`cofre.md`](cofre.md) (KDF barato e `CRONOLOGIA_VAULT_DIR` nos testes)
