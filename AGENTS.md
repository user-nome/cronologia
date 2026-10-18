# AGENTS.md: Cronologia

Diretrizes para agentes e contribuidores deste repositório. Este arquivo manda
no código daqui; a visão do monorepo (duas partes, versão e distribuição) está
no `AGENTS.md` da raiz. Referências humanas: `README.md` (visão completa) e
`CONTRIBUTING.md` (commits e lançamentos).

## O projeto

App desktop Electron + TypeScript + React (Vite) para anotar progresso de
leituras, com backup criptografado no Dropbox, alvo Linux Mint e distribuição
`.deb`. Versão: `package.json` → `version` é a fonte da verdade.

Camadas (diagrama no `README.md`, seção Arquitetura; detalhe em
`docs/arquitetura.md`):

- `src/main/`: janela, IPC e ciclo de vida (`index.ts`), protocolos `cover://`
  e `cronologia://` (`protocols.ts`), persistência (`library.ts`, `settings.ts`)
  e backup na nuvem (`drive/`).
- `src/messages/`: textos do app em pt-BR (canônico), en, ko, zh-CN e ja (`@zero/messages`);
  guia em `docs/messages.md`.
- `src/shared/`: regras puras que o renderer e o main precisam concordar
  (`@zero/shared`): formato e força das credenciais do cofre (`policy`,
  `strength`, `strategy`) e normalização de frase/contagem de trava (`format`).
  Sem Node e sem DOM, para rodar nos dois processos; sem regra duplicada, ou o
  main acaba aceitando o que a tela recusa.
- `src/preload/`: única ponte da UI; monta e expõe `window.api` tipado.
- `src/renderer/`: React; não acessa disco, rede nem Node direto.
- `src/types/`: contratos compartilhados (`@zero/types`, barrel).
- `e2e/`: testes ponta a ponta com Playwright; **não** importam `src/`, sobem o
  app compilado (`out/`) ou o payload do `.deb`. Config em
  `vitest.e2e.config.mts`, fluxos em `e2e/support/`, guia em `docs/e2e.md`.
- `tools/mutation/`: motor da varredura de mutação (runner, operadores,
  grafo de módulos, matriz de linhas). Config em `vitest.mutation.config.mts`,
  guia em `docs/mutation.md`.

## Arquitetura

- Cada arquivo do `main` responde por um domínio; o renderer só conhece o
  contrato de `window.api` (`docs/api.md`).
- Persistência local: obras e capas em `~/.local/share/cronologia/`
  (`library.json.enc`, `covers/*.enc`), idioma em
  `~/.config/cronologia/settings.json` e **todos os segredos** no cofre
  `/var/lib/.cronologia/.vault` (Argon2id + AES-256-GCM; sem cofre aberto não há
  segredo nem acervo nem backup, ver `docs/cofre.md`/`docs/credenciais.md`). O
  cofre tem **três** credenciais — senha mestra de 24 caracteres, PIN de 8
  dígitos do dia a dia e frase de recuperação de 12+ palavras, que só redefine o
  PIN — e a chave-mestra é **aleatória**: trocar qualquer uma delas é reembrulhar
  (`vault/wrapping.ts`), nunca recifrar o acervo. Não existe caminho legado: o
  container v1, o manifesto v1 do backup e as varreduras de formato antigo saíram
  na 2.0 (`src/main/cleanup.ts` só varre `.tmp` órfão). A nuvem
  passa pelo contrato `BackupProvider` (`docs/backup-providers.md`): Dropbox
  usa a App folder e Google Drive usa `appDataFolder` quando `GOOGLE_CLIENT_ID`
  está configurado no build. As chaves OAuth públicas são injetadas no bundle
  main por `DROPBOX_APP_KEY`/`GOOGLE_CLIENT_ID`, nunca mantidas como literais no
  código-fonte.
- IPC via `ipcRenderer.invoke` e `ipcMain.handle`; canal novo só com tipo em
  `src/types/` e entrada em `docs/api.md`.

## Design patterns

- Fachada: `src/preload/index.ts` monta o objeto `api: ElectronApi` e o
  registra no `contextBridge`; `ipcRenderer` não aparece fora dele.
- Barrel exports: `index.ts` só re-exporta (exceto os entrypoints
  `src/main/index.ts` e `src/preload/index.ts`); exemplo:
  `src/main/drive/index.ts`.
- Módulos de serviço coesos em `src/main/drive/` (`provider`, `oauth`, `rest`,
  `crypto`, `backup`, `state`), um por responsabilidade; os adaptadores de
  provedor ficam em `drive/providers/`.
- Tipagem de domínio por uniões fechadas (`WorkStatus`, `WorkType` em
  `src/types/work.ts`), nunca strings soltas.
- UI composicional: estado no topo (`App.tsx`), cartões e modais
  controlados (`WorkCard`, `WorkModal`, `SettingsModal`).

## Código: regras duras

- Imports dentro de `src/` só pelos aliases ESM `@zero/*` (nenhum caminho
  relativo entre pastas). O mapa é declarado em `tsconfig.base.json` e
  espelhado em `electron.vite.config.mts`, `vitest.config.mts` e
  `src/node.loader.ts`; mudar um alias vale nos quatro. As configs de E2E e de
  mutação **importam** o mapa de `vitest.config.mts`, não o redeclaram.
  `paths` usam extensão explícita (`.ts`/`.tsx`/`index.tsx`) porque o projeto
  roda com `module: nodenext`.
- Arquivos no teto de ~500 linhas; passou disso, extraia módulos. O ESLint
  mede isso (`max-lines`: 520 em `src/`, 750 em `tests/`, `e2e/` e `tools/`).
- **Fronteira de camada é regra, não sugestão.** O `eslint.config.mjs` tem a
  matriz do AGENTS.md como `no-restricted-imports`: cada camada declara os
  aliases que pode importar, e `fs`/`electron`/`child_process` são concessão
  nomeada (o `fs` é do `src/main/**`; `electron` só de `index.ts`,
  `protocols.ts` e `external.ts`; `child_process` só de
  `vault/privilege.ts`). `CRONOLOGIA_VAR_LIB`, `CRONOLOGIA_VAULT_DIR` e
  `ELECTRON_RENDERER_URL` só são lidos por `vault/vault.ts`,
  `vault/privilege.ts` e `main/index.ts`.
- Type safety: `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitReturns` e
  `verbatimModuleSyntax` (import de tipo sempre `import type`). Sem `any`,
  sem cast gratuito; `unknown` para dado de fora (fetch/JSON validado antes
  de usar).
- Estilo: Prettier com 100 colunas, aspas simples e ponto e vírgula. Não
  desligue regra de lint para passar, corrija o código.
- `console` só `warn`/`error` (regra do ESLint); nenhum `debugger`/`alert`.
- Textos fixos de UI e de mensagem **só em `src/messages/`** (pt-BR é o
  canônico; `en.ts`, `ko.ts`, `zh-CN.ts` e `ja.ts` devem fechar com `Messages`): no renderer use
  `useMessages()`/`richText()` (`src/renderer/src/i18n.tsx`), no main
  `currentMessages()` (`src/main/i18n.ts`). Marcadores ricos `**negrito**` e
  `` `código` `` só em string exibida. Nomes de marca, dados por dependência
  (`attributions.ts`, `CATEGORIES`) e logs ficam fora dos bundles; regras e
  lista completas do que não se traduz em `docs/messages.md`.

## Comandos

- `npm run check`: typecheck + lint + format + auditoria OSV. Obrigatório
  antes de concluir qualquer mudança.
- `npm test` (ou `test:coverage`): Vitest em `tests/**`; cobertura mínima de
  **95% por arquivo** nas quatro métricas (`perFile: true`). Comportamento novo
  vem com teste. O Argon2id da suíte é um stand-in barato
  (`tests/helpers/kdf.ts`, registrado em `tests/mock-kdf.ts`) porque o perfil do
  PIN custa 2,1 s por abertura; `tests/main/vault-crypto.test.ts` desfaz o
  stand-in e compara a derivação do app com a da biblioteca, então a integração
  com `hash-wasm` continua verificada por um teste.
- `npm run test:e2e` / `test:e2e:bundled` / `test:e2e:packaged`: Playwright
  sobre o app compilado (`out/`) e o payload do `.deb`. Exige `npm run build` e
  `npm run dist:dir` antes. Entra no typecheck (`e2e/tsconfig.json`) e no lint,
  mas **não** no `npm run check` (abre janela, sobe porta de depuração e paga
  Argon2id de produção). Guia em `docs/e2e.md`.
- `npm run test:mutation` / `test:mutation:plan`: varredura de mutação de
  `src/` (2.045 mutantes). Leva horas: planeje em `--file src/main/arquivo.ts`
  para remediar um arquivo, e use `test:mutation:plan` para ver o plano sem
  executar. Também **não** entra no `npm run check`; no CI roda no job próprio do
  `quality.yml`, por disparo manual. Guia em `docs/mutation.md`.
- `npm run dev` / `build` / `dist`: desenvolvimento, build, `.deb`. O `dev`
  já exporta `CRONOLOGIA_VAULT_DIR` para a pasta `.dev-vault` (cofre no sandbox,
  sem tocar em `/var/lib` nem disparar `pkexec`) e `ELECTRON_ENABLE_LOGGING=1`
  (log do Chromium no terminal).
- `npm run dev:inspect` / `dev:inspect-brk`: o mesmo `dev` com o V8 inspector do
  **processo main** na porta 5858 (`--inspect` e `--inspect-brk` do
  `electron-vite`). O DevTools do Chromium (F11) só cobre o renderer. Funciona
  só no dev: o fuse `enableNodeCliInspectArguments` está desligado de propósito
  no binário instalado. Para o renderer, `npx react-devtools` (global, sem
  dependência do projeto) traz o Profiler. Guia em `docs/testes.md` §
  "Depuração".
- Heap snapshot para conferir o Cryptographic Erase (com snapshot de controle
  obrigatório): procedimento em `docs/cofre.md` § "Provar o Cryptographic Erase
  com heap snapshot".
- `node --import ./src/node.loader.ts <arquivo.ts>`: roda `.ts` direto com
  os aliases `@zero/*`.
- Capture o exit do próprio npm (`npm run check; echo $?`), não o código de
  saída de um `tail`/`grep` no fim do pipe.

## Melhores práticas de desenvolvimento

- Documentação junto com o código: mudou comportamento, fluxo, configuração,
  caminho, mensagem ou dependência → atualize `README.md` e/ou `docs/*` na
  mesma mudança; revise os diagramas Mermaid e as tabelas junto.
- Commits seguem Conventional Commits em pt-BR (`feat:`, `fix:`, `docs:`...):
  o tipo guia o bump de versão e o `CHANGELOG.md`.
- Dependências: só licenças permissivas OSI (MIT, Apache-2.0, BSD, ISC,
  BlueOak-1.0.0); prefira o que já existe e confira a licença antes de
  adicionar.
- Testes: `electron` é mockado em `tests/mocks/electron.ts` e `clearMocks`
  está desligado de propósito no `vitest.config.mts` (não ligar).
- **Teste novo vem com a pergunta certa.** Cobertura pergunta "rodou?"; a
  mutação pergunta "se fizesse outra coisa, a suíte veria?". Quando um teste novo
  fecha um buraco de mutação, vale dizer isso no `CHANGELOG.md`.
- Não versionar build e binário: `out/`, `release/`, `node_modules`, `.deb`,
  e o relatório da varredura em `mutation/` (o `.gitignore` usa `/mutation/`
  ancorado de propósito, para não pegar `tools/mutation/`).

## Segurança

- `npm run security:audit` limpo antes de concluir; vulnerabilidade sem fix
  upstream só com justificativa e `ignoreUntil` em `.osv-scanner.toml`.
- Nada de token OAuth no repositório: tokens Dropbox/Google saem do dispositivo
  do usuário (OAuth PKCE). As App keys OAuth são identificadores públicos,
  injetados no build por `.env` local ou por **Secrets and variables → Actions**
  no CI (`DROPBOX_APP_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: o
  `publish.yml` lê `secrets.*` e `vars.*` com o mesmo nome, e o `publish.yml`
  confere que a chave entrou no `.deb` antes de anexá-lo). Os secrets do CI
  (`GPG_PRIVATE_KEY`, `GPG_PASSPHRASE`) vivem só no GitHub. Tabela do que é
  obrigatório e em que aba cadastrar em `docs/build.md`.
- Renderer com CSP (schemes `cover:` e `cronologia:`) e preload sandboxed (por
  isso ele é CommonJS); não enfraquecer `contextIsolation` nem inserir HTML
  dinâmico. Na produção a SPA é servida por `cronologia://` via
  `registerAppProtocol` (substitui `file://`); todo handler IPC valida
  `event.senderFrame` com `assertAppFrame`. Fuses de segurança no electron-
  builder via chave `electronFuses`.
- Confinamento AppArmor no `.deb` (`build/apparmor-profile`, via
  `deb.appArmorProfile`): escrita só nos diretórios do app e no vault em
  `/var/lib/.cronologia`, deny-list de credenciais no home, exec só do
  pacote + `xdg-open`, rede só `stream` e `dgram` (DNS). O reparo da pasta do
  cofre é só via PolicyKit (`build/scripts/cronologia-setup` chamado por
  `src/main/vault/privilege.ts`): nenhum caminho vem do chamador. Negar regra da deny-list ou voltar ao perfil decorativo é
  regressão de segurança; ciclo complain/enforce e validação em
  `docs/build.md`.
- Backup: cifragem AES-256-GCM com nomes opacos (`docs/dropbox.md`); senha
  e conteúdo nunca em log ou mensagem exibida.
- Acervo cifrado em repouso (`library.enc`, `covers/*.enc`, formato `CLIB1` em
  `src/main/store-crypto.ts`) com a chave do cofre: sem cofre aberto não há
  biblioteca (`requireVault` em `library.ts`). Falha fechada: acervo ilegível
  vira `libraryTampered`, **nunca** lista vazia, porque `[]` faria o próximo
  salvamento sobrescrever o acervo.
- Destruição: `shred.ts` recebe **sempre** um caminho já validado pelo domínio
  (nunca id ou nome cru), sobrescreve com `fsync` antes do `unlink` e não segue
  symlink. `writeContainer` (`vault/store.ts`) recusa com `vaultDestroyed`
  depois de uma destruição, e só `createVault` limpa a marca. Ação destrutiva na
  interface sempre em duas etapas (`DangerZone.tsx`) e a falha parcial da nuvem é
  **contada**, nunca escondida.
- `.deb` nunca entra no git e a assinatura do repo APT acontece só no
  workflow, a partir dos secrets.

## Distribuição e release (resumo)

- Push na `main` dispara o `publish.yml`: o job **Verificar versão** compara
  `package.json` com as Releases existentes e, se for uma versão nova, cria a
  tag, gera o `.deb`, anexa a ele e ao repo APT flat assinado na GitHub
  Release e notifica o Vercel; a landing lê `releases/latest` no build.
  (Tag `v*` manual, `release: published` e `workflow_dispatch` seguem
  funcionando como gatilhos de reserva.)
- Nunca renomear os assets estáveis da Release (`Packages`, `Packages.gz`,
  `Release`, `Release.gpg`, `InRelease`, `public.key` e o alias
  `cronologia_amd64.deb`).
- O `quality.yml` é o gate do dia a dia (push na `main` e pull request): jobs
  **Verificar qualidade**, **Testes e cobertura** e **Testes E2E**. O job **Testes
  de mutação** é só por disparo manual (`min_score` e `mutation_file`), porque a
  varredura leva horas. O `publish.yml` continua com o `npm run check` + `npm test`
  próprios porque precisa ser autossuficiente para tag `v*` e Release criada na
  UI; a sobreposição é intencional.
- Passo a passo completo: `docs/distribuicao-apt.md`; build, `.deb` e gate de
  qualidade do CI: `docs/build.md`. Regras do monorepo:
  `AGENTS.md` da raiz.

## Documentação

- Documentação nova vai em `docs/`; o `README.md` é o índice (atualize a
  tabela na mesma mudança).
- Mapa: `docs/visao-geral.md` (visão geral e glossário),
  `docs/arquitetura.md` (camadas, aliases, IPC),
  `docs/telas.md` (telas e componentes do renderer),
  `docs/api.md` (contrato `window.api`), `docs/dropbox.md` (backup),
  `docs/cofre.md` (cofre: container, KDF, sessão, destruição),
  `docs/credenciais.md` (segredos do app e ciclo de vida),
  `docs/backup-providers.md` (provedores de nuvem e status do Google Drive),
  `docs/messages.md` (i18n: bundles e regras de tradução),
  `docs/testes.md` (suíte Vitest: convenções e cobertura),
  `docs/e2e.md` (testes ponta a ponta: app compilado e payload do `.deb`),
  `docs/mutation.md` (testes de mutação: operadores, escopo e garantias),
  `docs/atribuicoes.md` e `docs/doacoes.md` (páginas do app),
  `docs/distribuicao-apt.md` (distribuição APT), `docs/build.md` (build,
  `.deb` e gate no `publish.yml`), `docs/seguranca.md` (mapa medida →
  arquivo), `docs/openapi.yaml` (API em
  OpenAPI 3.1).
