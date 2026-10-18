# Registro de mudanças

Todos os lançamentos seguem [versionamento semântico](https://semver.org/lang/pt-BR/)
(`MAJOR.MINOR.PATCH`) e o formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
em português do Brasil.

## [2.0.0]

### Mudado

- **A URL da página do app passou a ser resolvida em um lugar só**
  (`appPageUrl()`, em `main/protocols.ts`). `ELECTRON_RENDERER_URL` era lida e a
  base montada em **dois** lugares: a `will-navigate` da janela e a guarda de
  origem do IPC. Se as duas cópias divergissem, uma delas passaria a recusar o
  frame legítimo sem mensagem visível, e o sintoma seria "o app não salva
  nada". O dono da variável na regra de ambiente do ESLint mudou para
  `protocols.ts`, ao lado do dono do cofre em `vault/store.ts`.
- **A recusa da guarda de origem do IPC saiu do código e foi para o bundle**
  (`m.errors.foreignFrame`, nos cinco idiomas). O erro **atravessa o IPC** e
  chega ao renderer como `Error` rejeitado, então a pessoa lê a frase na tela e
  pode estar em qualquer idioma; estava escrito como literal em português.
- **Os corpos de resposta do `protocol.handle` ficaram consistentes.** O mesmo
  arquivo tinha `'Forbidden'` (inglês) ao lado de `'Não encontrado.'`
  (português), sem regra para dizer qual usar. Agora são literais em inglês, com
  a razão anotada: é transporte, não interface.
- **O seletor de provedor desabilitado agora diz por quê.** Num build sem
  credencial embutida (`DROPBOX_APP_KEY`/`GOOGLE_CLIENT_ID`), os dois provedores
  ficam fora do seletor e o controle aparece desabilitado e mudo, o que lê como
  interface quebrada. Agora há uma linha explicando que nenhum provedor está
  disponível neste build, com o motivo de cada um logo abaixo na lista do
  catálogo. O gate de credencial continua: sem a chave no binário o OAuth
  falharia na hora de autorizar, e oferecer a escolha seria pior que não
  oferecer.
- **Fechar a janela agora desregistra o atalho global do F11.** Ele era
  registrado no `browser-window-focus` e desregistrado no `browser-window-blur`;
  fechar uma janela **focada** não emite `blur`, então o registro sobrevivia no
  sistema até o `will-quit`. Entre a janela sumir e o processo morrer (e por
  mais tempo se algum `before-quit` segurar o encerramento), o app ficava
  capturando F11 sem janela na tela.
- **Tipos que estavam escritos na hora foram nomeados e movidos para
  `src/types/`.** `assertAppFrame` usava um `as { senderFrame?: … }` inline
  (agora `IpcFrameEvent` em `src/types/ipc.ts`), e o mesmo `{ ok: boolean;
error?: string }` aparecia em **cinco** arquivos como retorno de
  `authorize`/`switchProvider` (agora `AuthorizeResult`). Outros que saíram do
  corpo da função: `TokenResponse`, `TokenGrant`, `AccountEmailResponse`,
  `AuthorizationCode`, `BackupResult`, `RestoreResult`, `ResolvedLocalNames` e as
  formas cruas do Dropbox (`DropboxEntry`, `DropboxListFolderResponse`,
  `DropboxErrorSummary`). Nenhum desses existia como nome, então mudar o formato
  do envelope exigia caçar o literal.
- **A camada `src/shared/` ganhou a guarda de dado externo** (`json.ts` com
  `isRecord`/`field`, `work.ts` com `isWorkRecord`/`isWorkArray`). O
  `typeof value === 'object' && value !== null` estava copiado em quatro módulos,
  e o par `'x' in v ? Reflect.get(v, 'x') : undefined` em três.
- **`library.ts` não devolve mais lista vazia para acervo ilegível.** O
  `Array.isArray(parsed) ? (parsed as Work[]) : []` era um cast que só provava que
  o valor era array, e o `[]` faria o **próximo** `saveLibrary` sobrescrever o
  acervo inteiro em silêncio. Agora é `libraryTampered`, como manda a regra de
  falha fechada do acervo.
- **Números mágicos ganharam nome.** Passo do progresso (`PROGRESS_STEP`, e os
  textos `decrease10`/`increase10` viraram `decreaseStep(step)`/
  `increaseStep(step)` nos cinco idiomas), prazos de UI (`TOAST_TIMEOUT_MS`,
  `COPY_FEEDBACK_MS`, `PROGRESS_SAVE_DEBOUNCE_MS`), `MS_PER_SECOND` no lugar
  dos `1000` soltos, parâmetros do scrypt (`SCRYPT_N` e companhia), tamanho da
  janela (`WINDOW_SIZE`), truncamento dos corpos de erro (`ERROR_BODY_CHARS`,
  `RAW_BODY_CHARS`) e a largura da barra do medidor, que agora sai de
  `LEVELS_PER_METER` em vez do `* 20` escrito na tela.

### Adicionado

- `e2e/quit.e2e.test.ts`: fecha a janela pelo "X" e confere que o processo
  principal sai. É a única garantia do app que nenhuma asserção de tela pega,
  porque uma bandeja ou um `preventDefault` no `close` só se revelam no `ps` e
  no painel do desktop. O app **já** encerrava ao fechar a janela e **não** tem
  bandeja; o que faltava era a trava contra a regressão.
- `tests/main/ipc-origem.test.ts`: a guarda de origem do IPC saiu do
  `index.test.ts` para o arquivo próprio. É a primeira coisa que roda em todos os
  canais, e o conjunto de frames recusados precisa ficar explícito num lugar que
  não compete com o teto de linhas do boot.
- `tests/main/index-ciclo-de-vida.test.ts`: trava a **ausência** dos quatro
  mecanismos que produziriam o app vivo com a janela fechada (`Tray`,
  `preventDefault` no `close`, `setLoginItemSettings`, `powerSaveBlocker`) e do
  `setInterval` na sessão do cofre. Verificado que os testes falham quando cada
  mecanismo é introduzido de propósito.
- `tests/build/apparmor-profile.test.ts`: trava as regras do perfil que já
  quebraram em campo (socket do IBus, mídia removível) e a macro do perfil.
- `tests/shared/json.test.ts` e `tests/shared/work.test.ts`, mais os casos do
  acervo ilegível em `tests/main/library.test.ts`.

### Corrigido

- **O build instalado recusava o socket do IBus, e a frase de recuperação
  ficava muda.** `~/.cache/ibus/dbus-<id>` não é coberto por
  `<abstractions/ibus>` (a regra concreta está comentada lá dentro por causa do
  LP#1856738, e só o peer abstrato `@/home/*/...` continua). Sem o socket, a
  tecla entrava no método de entrada e não voltava como caractere. Como senha e
  PIN são `<input type="password">` e não passam pelo IME, o defeito parecia
  isolado num campo só: busca, sinopse e frase de recuperação (os `<textarea>`
  e o `<input type="text">`) não recebiam nada, enquanto os campos de senha
  digitavam normal, e `npm run dev` não reproduzia porque roda sem perfil.
  Mesma causa e mesma correção do Guardinha (Cofre).
- **O seletor de capa falhava com capa em pendrive.** O `cover:pick` entrega um
  caminho qualquer para `importCover` ler, e o Mint monta pendrive e cartão em
  `/media/$USER/<rótulo>` ou `/run/media/$USER/`, fora do `owner @{HOME}/** r`.
  Agora há `owner /media/** r` e `owner /run/media/** r` (só leitura: o app
  escreve o resultado em `~/.local/share/cronologia/covers/`, que já tem regra
  própria).
- **`publish.yml` parava de publicar quando faltava `DROPBOX_APP_KEY`, mas
  seguia calado sem `GOOGLE_CLIENT_ID`.** A ausência virava um `.deb` com o
  Google Drive desabilitado, e a falha só aparecia na máquina de quem instalou.
  Os dois agora travam antes de empacotar, com `::error::` apontando o lugar
  certo da tela.

### Mudado (CI)

- **As chaves OAuth do `.deb` saem de Secrets **e** Variables.** O
  `publish.yml` lê `secrets.*` e `vars.*` com o mesmo nome
  (`DROPBOX_APP_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; o secret
  vence se os dois existirem), porque chaves de cliente Desktop são
  identificadores públicos, não segredos de servidor, e **Variables** é o lugar
  semântico certo. Os valores continuam indo só no `env:` do passo de build, sem
  arquivo `.env` no runner e sem literal no repositório.
- **Novo passo "Conferir que as credenciais entraram no bundle do main"**: depois
  de empacotar, ele abre o `.deb`, extrai o `app.asar` e confirma que a App key
  está dentro do artefato. É o teste que pega nome de variável errado, empacotar
  antes de compilar e `afterPack` apagando o `out/`.

### Mudado

- **O cofre passou a ter três credenciais** (o desenho é o do app Guardinha, já
  auditado por aqui). A chave-mestra continua sendo **uma só, aleatória**; o que
  mudou é o que a protege:
  - **senha mestra** com **exatamente 24 caracteres** (antes: mínimo de 12). O
    app não a gera nem sugere, e o formato fixo com recusa de padrão degenerado
    substitui a dica de "use 12 caracteres ou mais";
  - **PIN de 8 dígitos** para o dia a dia, novo. É o único segredo do cofre que
    dá para enumerar (10^8 candidatos), então recebe o **perfil mais caro do
    Argon2id**: 256 MiB e 4 iterações, contra 128 MiB e 3 da senha mestra e da
    frase. Medido nesta máquina: 2,1 s por abertura com o PIN certo, 0,8 s pela
    senha mestra;
  - **frase de recuperação** de 12+ palavras, nova, escrita pelo próprio usuário.
    Ela **não abre o cofre**: prova posse e **redefine o PIN**. Assim, um backup
    da frase (foto, papel, gerenciador) não vale o mesmo que a chave. A
    comparação **distingue maiúsculas de minúsculas** e normaliza apenas o
    espaço (colapsa tabulação e quebra de linha): cada palavra capitalizada é um
    bit a mais para quem escreve e para quem ataca, e ninguém decora o
    espaçamento exato do que anotou no celular. Acento e pontuação também
    contam.
- **A tela de abertura é o PIN por padrão**, e a senha mestra aparece como
  caminho alternativo depois de 3 PINs errados. Não há aba para escolher: 24
  caracteres só podem ser a senha mestra e 8 dígitos só podem ser o PIN, então
  o app decide pelo comprimento do que foi digitado.
- **A criação virou duas etapas** (senha mestra + PIN, depois a frase), porque a
  frase é um texto longo de escrever duas vezes e enfiar ela no mesmo bloco da
  senha mestra fazia a pessoa perder o que já digitado quando errava o PIN logo
  abaixo.
- **Trocar senha mestra e trocar PIN** são operações novas, pelo menu do cofre
  nas Configurações. Exigem cofre aberto **e** a credencial atual (cofre aberto é
  estado do processo, não prova de posse), e só reescrevem o embrulho da chave:
  o acervo em disco não é tocado e a biblioteca não recarrega.
- **A rampa de tentativas é compartilhada pelas três credenciais.** Um contador
  por método daria ao atacante que escolhe a credencial uma contagem maior que a
  do app, e o PIN é justamente o que se erra todo dia. A frase errada também
  entra nela, senão o caminho de recuperação seria o atalho para força bruta.
- **A camada `src/shared/`** (nova) concentra as regras de credencial que o
  renderer e o main precisam concordar: `policy.ts` (formato aceito),
  `strength.ts` (régua que recusa o degenerado), `strategy.ts` (Strategy por
  tipo) e `format.ts` (normalização da frase, contagem da trava). As duas cópias
  divergiam antes, e o main acabava aceitando o que a tela recusava.
- **O `VaultModal` foi dividido** por passo (`VaultCreateSteps`,
  `VaultUnlockSteps`) e a casca virou `VaultShell`. O modal deixou de passar de
  590 linhas e decide só qual fluxo aparece.

### Adicionado

- **Container `vault.zkv` versão 2**: a chave-mestra passa a ser **embrulhada por
  cada credencial** (três blobs AES-256-GCM, cada um com o custo do segredo que
  o protege) em vez de derivada da senha direto. O salt do payload virou campo
  do cabeçalho (`payloadSalt`), o que permite trocar senha, PIN e frase sem
  tocar no acervo cifrado em disco.
- **Cadeia de desbloqueio** (`src/main/vault/unlock.ts`, Chain of Responsibility)
  com a ordem que é a própria defesa: trava exponencial → formato da credencial →
  Argon2id → integridade do payload. Se o Argon2id viesse primeiro, a espera de
  24 h seria contornável por um `await` a menos e um PIN de dois dígitos
  custaria 256 MiB só para ser recusado. O último elo pega a escrita
  interrompida, que deixa o embrulho íntegro e o payload pela metade.
- **Reembrulho automático do custo**: método gravado abaixo do perfil vigente é
  reescrito no próprio desbloqueio (só quem tem a credencial consegue), e o
  acervo em disco não é tocado.
- Canais `vault:reset-pin`, `vault:change-master` e `vault:change-pin`, com
  entrada em `docs/api.md` e `docs/openapi.yaml`.

### Removido

- **Sem caminho de leitura do container v1.** Um `vault.zkv` com versão
  diferente é recusado como `vaultTampered` e a pessoa precisa criar um cofre
  novo. A decisão vale porque nenhuma versão publicada do 2.0 existia para que
  alguém tivesse um v1 em uso com acervo a perder.
- **Varreduras de disco de formato antigo** (`src/main/cleanup.ts`): tokens do
  Dropbox em claro (`dropbox-tokens.json`, `drive-tokens.json`), campo `enc:`
  do `settings.json`, pasta `.vault` em `~/.config` e acervo sem o sufixo `.enc`.
  Nenhuma versão atual escreve nada disso, e varrer arquivo que o app não
  escreve é código que só promete uma proteção que ninguém precisa. Ficou a
  varredura de `.tmp` órfão, que protege o app de hoje.
- **Leitura do manifesto v1 do backup** (`src/main/drive/crypto.ts`): um backup
  antigo é tratado como não aproveitável e o backup seguinte nasce no formato
  vigente. Quem só tem esse backup precisa de um novo, e é a resposta honesta.
- `passwordProblem` (substituído por `strengthFor(kind).evaluate().blocked`), o
  KDF único `KDF_DEFAULTS` e o formato de "senha livre com mínimo de 12".

### Cobertura de teste

- Suíte de **780 para 935 testes**, com 17 arquivos novos ou reescritos. O
  stand-in de KDF (`tests/helpers/kdf.ts`) veio porque o PIN de produção custa
  2,1 s por abertura e a suíte abre o cofre dezenas de vezes;
  `tests/main/vault-crypto.test.ts` desfaz o stand-in e compara a derivação do
  app com a da biblioteca, para a integração com `hash-wasm` continuar
  verificada.
- Todos os arquivos criados ou tocados na 2.0 passam do piso de **95% por
  arquivo** nas quatro métricas. O que ficou abaixo do piso
  (`src/main/drive/providers/*` e `src/renderer/src/components/Select.tsx`) já
  estava antes desta mudança e não foi tocado aqui.

### Cobertura de teste (1.9.2)

- **cobertura de 95% por arquivo** nas quatro métricas (`perFile: true` em
  `vitest.config.mts`), subindo de 50% agregado. Estado medido na 1.9.2:
  **99,7% de linhas, 99,5% de comandos, 99,5% de ramos e 98,8% de funções**, com
  **0 de 53 arquivos** abaixo de 95%. A varredura foi de baixo para cima, e ela
  expôs o que o piso agregado escondia: o entry do renderer (`main.tsx`) estava
  em 0% (a suíte renderiza `<App/>` direto e nunca importava o entry), os cinco
  bundles de idioma em 10%, o scheme `cronologia://` em 35% (a tabela de MIME e o
  403 de path traversal não tinham teste), `DangerZone` sem os caminhos de falha
  e `external.ts` com o `catch` da recusa do shell sem cobertura. A suíte foi de
  428 para **780 testes em 52 arquivos**, com 15 arquivos de teste novos.
- **testes ponta a ponta** (`e2e/`, `npm run test:e2e`): Playwright
  (`playwright-core`, sem download de browser) sobe o app **de verdade** em dois
  alvos, o bundle compilado (`out/`) pelo `_electron.launch` e o payload do
  `.deb` extraído com `dpkg-deb -x` + CDP. A jornada compilada cobre a criação
  do cofre (recusando confirmação e senha previsível), o cadastro de obra com
  tipo/status/categoria/marcação, o acompanhamento de progresso e status pelo
  cartão, busca e edição, exclusão em duas etapas, os chips de filtro, as telas
  de Atribuições e Doações, a troca de idioma e volta, a recusa da ação
  destrutiva sem a palavra exata, o fechar/reabrir do cofre, o apagar da
  biblioteca e o destruir do cofre. O alvo empacotado é fumaça: abrir, criar
  cofre, cadastrar obra, mexer no progresso. Cada app sobe com `HOME`,
  `XDG_*`, `CRONOLOGIA_VAR_LIB` e `CRONOLOGIA_VAULT_DIR` próprios em diretório
  temporário, e o pacote é derrubado pelo **grupo** de processos (Chromium tem
  zygote, GPU e crashpad) antes do `rmSync`. Guia em `docs/e2e.md`.
- **testes de mutação** (`tools/mutation/`, `npm run test:mutation`): motor
  próprio sobre a AST do Babel (doze operadores, splicing de texto, sem
  reprintar o arquivo). O plano cruza AST, cobertura da linha de base e um grafo
  de módulos que segue o nome importado **através** dos barrels, e seleciona por
  linha com uma matriz de teste → linha em cache; são **2.045 mutantes em 44
  arquivos** de `src/`. O runner exige baseline verde antes de medir qualquer
  veredito, usa um doppelgänger barato do Argon2id (PBKDF2 com os parâmetros do
  próprio pedido) para caber em horas em vez de dias, e desliga o
  `fsModuleCache` do Vitest, que revalidava o texto do mutante anterior e fazia
  a varredura medir o mutante errado. `tests/tools/mutation-runner.test.ts`
  trava splicing, cache, nomes de nó da AST e ausência de órfão em escopo.
  Guia em `docs/mutation.md`.
- `tests/messages/bundles.test.ts` e `tests/messages/branch-coverage.test.ts`:
  varredura das cinco traduções folha a folha. O que pega é o que a paridade de
  chave do tipo **não** pega: tradução vazia, `**` ou crase sem par, reticência
  de três pontos no lugar da elipse e mensagem com parâmetro devolvendo string
  vazia.
- `tests/main/node-loader.test.ts`: o loader de aliases `@zero/*` verificado
  rodando o Node de verdade em processo filho (barrel sem extensão, arquivo com
  subcaminho, extensão explícita, especificador que não é alias e alias
  inexistente). `node.loader.ts` ficou fora do denominador de cobertura, que
  mede execução entre processos e portanto não enxerga esse teste.
- `tests/main/protocols.test.ts`: tabela de MIME por extensão, 403 em traversal
  percent-encoded (o `..` declarado é normalizado pelo parser de URL e vira 404,
  então o 403 é justamente do caso codificado), 404 de arquivo e de diretório,
  500 de URL inválida e caminho com espaço percent-encoded.
- `tests/main/drive-rest.test.ts`, `drive-oauth.test.ts`, `cleanup.test.ts`,
  `external.test.ts` e `store-crypto.test.ts`: paginação e corpo inválido do
  Dropbox falhando fechado, renovação e repetição após 401, loopback com PKCE sem
  secret, varredura de legado do boot com a contagem real de falha, guarda de
  URL externa e o formato `CLIB1`.
- renderer: fila de gravação por obra no `App` (debounce × "Salvar" do modal),
  os três caminhos de falha da zona de risco, recontagem da trava do cofre,
  badge/prompt/ação adiada do cofre nas configurações, pausa dos créditos,
  cópia do link de doação sem clipboard, `RestorePasswordModal`, teclado e menu
  vazio do `Select`, e o entry `main.tsx`.
- `quality.yml` novo: **Verificar qualidade**, **Testes e cobertura** e **Testes
  E2E** em push na `main` e pull request, mais **Testes de mutação** por
  disparo manual (leva horas; `min_score` e `mutation_file` são inputs). O
  `publish.yml` continua com o `check` + `test` próprios, porque precisa ser
  autossuficiente para tag `v*` e Release criada na UI.
- lint completo: a matriz de camadas do `AGENTS.md` virou regra
  (`no-restricted-imports` por camada, com `fs`/`electron`/`child_process` como
  concessão nomeada), `max-lines` com o teto do projeto (520 em `src/`, 750 em
  `tests/`, `e2e/` e `tools/`), guarda de ambiente para `CRONOLOGIA_VAR_LIB`,
  `CRONOLOGIA_VAULT_DIR` e `ELECTRON_RENDERER_URL`, as regras mais duras do
  React Hooks, `only-throw-error`, `ban-ts-comment`/`prefer-ts-expect-error`,
  `consistent-type-imports`/`-exports` e a lista de armadilhas clássicas. As
  nove violações que apareceram foram corrigidas no código, não desligando
  regra. `npm run typecheck` agora inclui `e2e/tsconfig.json`.
- `dist`/`dist:dir` ganharam `--publish never`: sem isso o electron-builder
  detecta o CI, tenta publicar sozinho ("Implicit publishing") e morre sem
  token. O job de E2E depende disso para gerar o pacote.

### Corrigido

- A integração do Google Drive agora cria arquivos com nome e parent
  `appDataFolder`, atualiza o backup existente sem apagá-lo antes do upload,
  valida a resposta da listagem fail-closed e repete após renovar token em 401
  para métodos autenticados. O workflow de publicação injeta as credenciais
  OAuth de build sem colocá-las no repositório.
- **a gravação atrasada do cartão atropelava o "Salvar" do modal.** O cartão
  agenda a gravação com 450 ms de atraso e o modal grava na hora; sem serializar
  as duas pela mesma obra, a gravação atrasada saía depois e trazia o rascunho
  antigo de volta, na tela e no disco. Quem edita o título e clica em Salvar
  perdia a edição meio segundo depois. Agora as escritas passam por uma fila
  por id (`write` em `src/renderer/src/App.tsx`), e cada gravação descarta o
  agendamento pendente daquela obra. Regressão em
  `tests/renderer/src/App.test.tsx`.
- **o bloqueio manual do cofre não derrubava a barreira.** `vault:locked` só era
  emitido pelo auto-lock, então um "Fechar cofre" pedido pelo usuário zerava a
  chave em memória e em disco mas deixava as obras descifradas na grade. O evento
  passou a sair também de `vault:lock`, com um booleano que distingue as duas
  causas, para o aviso de "o cofre fechou sozinho por inatividade" continuar
  verdadeiro só no auto-lock. Regressão em `tests/main/index-vault.test.ts` e
  `tests/renderer/src/App.test.tsx`. Ambos os bugs foram encontrados pela
  jornada E2E, não por leitura.
- `tests/preload/index.test.ts` passou a conferir a lista **completa** de canais
  de cada grupo. Quatro deles (`library:reset`, `drive:purge`, `vault:destroy`,
  `vault:touch`) não eram conferidos por ninguém, e a primeira varredura de
  mutação apontou: trocar o nome do canal por `''` não quebrava nada, porque o
  mock de `ipcRenderer.invoke` devolve o que quiser. Um canal digitado errado só
  falharia em runtime, no clique do usuário.
- a rampa da trava de restauração (`restore-lock.ts`) era um índice numa tabela
  com `??` defensivo, que o `noUncheckedIndexedAccess` exige e que nenhum valor
  de `attempts` alcança. Virou um `switch` total, com o `default` sendo o teto
  de 15 min: sem índice, sem ramo morto.

### Comportamento interno

- `window.api.vault.onLocked` passou a entregar um `automatic: boolean` ao
  ouvinte (assinatura de `src/types/api.ts`, do preload e do mock de teste).
- `src/renderer/src/components/SettingsModal.tsx`: o estado do cofre lido em
  `ensureVault` deixou de se chamar `status`, que sombreava o estado do Drive.
- `richText` não faz mais `match[2] ?? ''` ao montar o nó `<code>`: o React já
  renderiza `undefined` como nada, e o `??` só existia para o tipo.

## [1.9.2]

### Features

- **a biblioteca passa a ser cifrada em repouso**: obras e capas saem de
  texto claro e passam para `library.enc` e `covers/<nome>.enc`, em AES-256-GCM
  com chave derivada da chave-mestra do cofre por HKDF-SHA512
  (`src/main/store-crypto.ts`). Abrir o app agora pede a senha mestra, porque
  sem cofre aberto não há acervo para mostrar: o `VaultModal` cobre a tela
  inteira e o acervo some da grade quando o auto-lock fecha a sessão.
- **Cryptographic Erase**: destruir o cofre mata a chave-mestra, e com ela todo
  `.enc` vira ruído irrecuperável sem sobrescrever o acervo. O acervo ficou
  fora do `vault.zkv` justamente para tornar isso instantâneo.
- **zona de risco** nas Configurações (`DangerZone`) com três ações, cada uma
  em duas etapas e com palavra digitada: apagar biblioteca (`APAGAR`),
  apagar o backup na nuvem (`APAGAR`, só com conta conectada) e destruir o
  cofre (`DESTRUIR`).
- **apagar o backup na nuvem** (`drive:purge`): desconectar só limpava a sessão
  local, então os blobs continuavam no Dropbox. A falha parcial é contada e a
  sessão local só é zerada quando nada ficou pendente.

### Segurança

- `src/main/shred.ts`: sobrescrita segura antes de apagar, com `fsync` antes do
  `unlink` (e do diretório), `O_NOFOLLOW` e `lstat` para não seguir symlink.
  Vale para obra removida, capa órfã, reset, cofre destruído, `.tmp` órfão e
  legado em claro.
- o acervo ilegível falha com `libraryTampered` em vez de devolver lista vazia:
  devolver `[]` faria o próximo salvamento sobrescrever um acervo que existe.
- `writeContainer` recusa com `vaultDestroyed` depois de uma destruição, e só
  `createVault` limpa a marca: sem isso, uma escrita acidental recriava o
  container pela metade e o usuário lia "adulterado" em vez de "destruído".
- `src/main/cleanup.ts`: o boot apaga o legado em claro que a 1.8 só ignorava
  (`settings.json` com `enc:`, `dropbox-tokens.json`, `drive-tokens.json` e o
  cofre antigo em `~/.config/cronologia/.vault`) e os `.tmp` órfãos.
  A verificação é por existência: o conteúdo do segredo nunca é lido, e o
  acervo e o `settings.json` vivo não são tocados.
- o auto-lock passou a medir **ociosidade real** (uso da interface, canal
  `vault:touch` com throttle de 30 s) em vez de acesso a segredo. Antes, quem
  só editava a biblioteca perdia o cofre no minuto 5, e uma única leitura
  interna reiniciava a janela inteira.
- `writeContainer` passou a fazer `chmod` explícito no `.tmp`, como o
  `jsonfile.ts` já fazia: um temporário órfão de um crash herdava a
  permissão antiga.

### Ferramentas de depuração

- `npm run dev:inspect` e `npm run dev:inspect-brk`: V8 inspector do **processo
  main** na porta 5858, pelo `--inspect`/`--inspect-brk` que o `electron-vite`
  repassa ao Electron. O DevTools do Chromium (F11) só cobre o renderer, e até
  agora não havia atalho para o main. Continua **off no binário instalado**: o
  fuse `enableNodeCliInspectArguments` segue desligado, para que o usuário não
  abra um depurador no processo que tem a chave-mestra em memória.
- `ELECTRON_ENABLE_LOGGING=1` em todos os scripts de `dev`: o que o Chromium
  escreve (GPU, rede, sandbox) passa a aparecer no terminal junto com o
  `console.warn`/`console.error` que o lint permite.
- Procedimento documentado para **conferir o Cryptographic Erase com heap
  snapshot** (`docs/cofre.md`), com snapshot de controle obrigatório: um "não
  achei a chave" só vale se a mesma busca acha no snapshot de antes da
  destruição. É a única forma de verificar a garantia, já que um teste de
  unidade passa com a chave intacta no heap.
- `npx react-devtools` para o renderer, com nota de que a extensão de browser
  não funciona (o app é servido por `cronologia://`) e de que o Profiler é o
  que compensa em `SettingsModal`/`App`.

### Corrigido

- **`library:reset` não anunciava mais um apagado que não aconteceu**: o handler
  devolvia `shredded: 0, failed: 0` fixo, descartando o retorno real do `shred`
  (que já contava corretamente). Agora `resetLibrary()` propaga a contagem e a
  interface distingue os dois caminhos de falha: cofre recusou (com `code`) e
  falha parcial, que sobrou resíduo no disco (sem `code`, com a contagem).
- **`docs/openapi.yaml` estava 9 endpoints atrás**: faltavam `library:reset`,
  `drive:purge` e todo o grupo `vault:*`, além dos esquemas `LibraryReset`,
  `PurgeResult`, `VaultStatus` e `VaultResult`. A versão da especificação (1.4.0)
  foi alinhada à do app, e o esquema `AppSettings` deixou de declarar um
  `driveClientSecret` que o código nunca teve (o app é PKCE, sem secret).
- documentação que descrevia o estado anterior: `docs/credenciais.md` e
  `docs/cofre.md` diziam que o legado em claro era "intocado e ignorado", quando
  o boot o sobrescreve e apaga (`src/main/cleanup.ts`); `SECURITY.md` com a linha
  suportada em `1.8.x`, o `1.0.0` de um placeholder e `npm run dist` como forma
  de atualizar (é comando de desenvolvimento; o canal é o repo APT), sem
  endereço de reporte acionável; `README.md` dizendo que o slim do pacote
  removia `libffmpeg`, que é exatamente o que quebrou a v1.1.1 e o que
  `build/after-pack.cjs` proíbe; `docs/cofre.md` com o cabeçalho dos `.enc` em
  38 bytes quando são 37 (`src/main/store-crypto.ts` tinha o mesmo erro no
  comentário).
- `Landing-page`: `release-info.json` estava travado em `1.8.0` enquanto o app
  está em `1.9.1`, então qualquer build da landing sem rede servia o download de
  uma versão antiga — a verificação de 4 vias da doc de distribuição falhava.

**Migração**: não existe. Sem cofre, o app pede a criação de um novo; o acervo
antigo em texto claro não é lido nem copiado, e quem apagar o arquivo
`library.json` antigo depois de criar o cofre perde o histórico local (o backup
na nuvem continua sendo a fonte). A 1.9 é a primeira versão que **exige** senha
mestra para abrir o app.

**O que a varredura de legado apaga no boot**: `settings.json` com `enc:`,
`dropbox-tokens.json`, `drive-tokens.json`, o cofre antigo em
`~/.config/cronologia/.vault`, o acervo `library.json` em claro e as capas sem
`.enc`. A decisão é por existência de arquivo, nunca pelo conteúdo do segredo, e
o `settings.json` vivo (só com `language`) nunca é tocado.

## [1.8.0] - 2026-10-10

### Features

- cofre de segredos: o cofre passa a morar em
  `/var/lib/.cronologia/.vault`, fora de `~` (raiz `0711 root:root`
  sem listagem + vault `0700` do usuário), criado no `postinst` e reparado
  pelo app só via PolicyKit (helper `resources/cronologia-setup` chamado por
  `pkexec`, senha do sistema nunca vista pelo app). Códigos novos
  `vaultDirUnavailable` e `vaultAuthCancelled` com mensagens nos 5 idiomas.
- remoção do modo legado de credenciais: acabaram `safeStorage`/`enc:`, o
  arquivo `dropbox-tokens.json`, o canal `settings:keyring`
  (`isKeyringAvailable`) e a migração de dados de marcas antigas.
  `settings.json` guarda **só o idioma** e todo segredo vem do cofre; com o
  cofre fechado `loadSettings` devolve `''`, `loadState` zera os tokens e
  gravar lança `vaultLocked` antes de tocar no disco (falha fechada).
- configurações e backup exigem cofre aberto: `SettingsModal` abre a
  criação/desbloqueio antes de Salvar, Conectar, Backup, Restaurar e
  Desconectar; `drive.disconnect()` não apaga nada às cegas com o cofre
  fechado. `npm run dev` já passa `CRONOLOGIA_VAULT_DIR=.dev-vault` (sandbox,
  sem `pkexec`).

**Migração**: não existe. Um cofre antigo em
`~/.config/cronologia/.vault`, um `settings.json` com `enc:`/keyring
ou um `dropbox-tokens.json` são ignorados (não lidos, não copiados, não
apagados); quem usava backup reconecta a conta uma vez e recria o cofre.

### Segurança

- `build/scripts/cronologia-setup` (root via `pkexec`) aceita **nenhum**
  caminho do chamador e só cria os dois diretórios fixos do cofre com modos
  fixos; a ação do PolicyKit anota o caminho absoluto do helper, e o perfil
  AppArmor ganha as regras de escrita em `/var/lib/.cronologia`.
- `build/postrm` apaga a ação do PolicyKit no `remove` e o cofre em
  `/var/lib/.cronologia` no `purge`.

### Documentação

- `cofre.md`, `credenciais.md`, `dropbox.md`, `api.md`, `openapi.yaml`,
  `arquitetura.md`, `seguranca.md`, `build.md`, `telas.md`, `testes.md`,
  `visao-geral.md`, `backup-providers.md`, `README.md`, `SECURITY.md` e
  `AGENTS.md` passam a descrever o cofre em `/var/lib`, o reparo via
  PolicyKit e a inexistência de caminho legado.

## [1.7.0](https://github.com/chronos-atalante/cronologia/compare/v1.6.1...v1.7.0) (2026-10-09)

### Features

- cofre de segredos: cofre local criptografado (Argon2id, container
  `vault.zkv`, trava exponencial e auto-lock) guardando a senha de backup e
  as credenciais; canais IPC `vault:*` com envelope `VaultResult` e
  `assertAppFrame`, gate `ensureVault` em todos os fluxos que usam segredo e
  modal `VaultModal` na tela de Configurações (textos nos 5 idiomas;
  `docs/cofre.md` e `docs/credenciais.md`).
- empacotamento: confinamento AppArmor real no `.deb`
  (`build/apparmor-profile` via `deb.appArmorProfile`): escrita só nos
  diretórios do app, deny-list de credenciais no home (chaveiros, navegadores
  inclusive Brave, cofre do Guardinha), exec só do pacote + `xdg-open` e rede
  `stream`/`dgram` (HTTPS e DNS do Dropbox); `build/postrm` custom
  (`deb.afterRemove`) descarrega o perfil do kernel e limpa o
  `update-alternatives` na remoção, e o ciclo complain→enforce foi executado
  numa máquina Linux Mint real (`docs/build.md`).

### Segurança

- CI: job **Verificar qualidade** no `publish.yml` (`npm run check` +
  `npm test`) vira gate do `build-deb` (`needs:` explícito): falha de tipo,
  lint, formato, vulnerabilidade ou teste trava a publicação antes de tag ou
  `.deb`.

### Documentação

- docs novos: `cofre.md`, `credenciais.md`, `testes.md`, `build.md` e
  `seguranca.md` (mapa medida → arquivo); `SECURITY.md` com o modelo de
  ameaça do cofre e os riscos do confinamento; índices atualizados em
  `README.md` e `AGENTS.md`.

## [1.6.1](https://github.com/chronos-atalante/cronologia/compare/v1.5.0...v1.6.1) (2026-10-08)

### Features

- README e estilos: seção de solução de problemas no `README.md` (sintomas
  comuns e o que verificar antes de reportar) e componentes revisados em
  `src/renderer/src/style/styles.css`.

### Bug Fixes

- traduções: revisão das 5 línguas (pt-BR, en, ko, zh-CN e ja) no app e no
  site: item de privacidade com o texto do link duplicado (zh-CN), ordem de
  frases e partículas (ko), frases quebradas nas doações e botão de conclusão
  (ja), pontuação com `…` e textos das doações (pt-BR), concordância e
  maiúsculas (en); rótulo do pílula de backup (`drivePill.off`) alinhado e
  `translationNotice.title` traduzido nos 4 idiomas.
- site: espaço e ponto finais das frases com link saíram do JSX e passaram a
  viver no dicionário (`*Lead`/`*Mid`/`*End` em `src/i18n/`), removendo os
  espaçamentos fixos entre termos CJK em `HomeContent` e `PrivacidadeContent`.

### Documentação

- japonês (`ja`) incluído nas listas de idioma que ainda citavam só 4 línguas:
  `docs/api.md`, `docs/messages.md`, `docs/openapi.yaml`, `README.md`,
  `AGENTS.md` e, na landing, `doc/i18n.md`, `doc/openapi.yaml`,
  `doc/paginas.md`, `doc/README.md` e `doc/arquitetura.md` (o idioma já
  estava no app e no site desde a 1.5.0).

## [1.5.0](https://github.com/chronos-atalante/cronologia/compare/v1.4.0...v1.5.0) (2026-10-07)

### Features

- backup: trava exponencial na restauração com senha errada
  (`src/main/drive/restore-lock.ts`): as duas primeiras falhas são livres e,
  a partir da terceira, a espera sobe 10 s → 30 s → 1 min → 5 min até o teto
  de 15 min, sempre antes de qualquer chamada de rede; sucesso no fim da
  tentativa zera a trava. Conta só `PassphraseError`, então erro de rede não
  atrasa a próxima tentativa (`driveErrors.restoreLocked` nos 4 idiomas).
- obras: régua de id (`isValidWorkId`) na entrada por IPC e na restauração:
  UUID ou id curto sem separador de caminho; id fora da regra vindo da nuvem
  vira UUID novo, o import de capa ignora id preferido inválido e o
  `upsertWork`/`deleteWork` recusam `..`, `/` e `\` (defesa em profundidade,
  classe CVE-2026-21589; `libraryErrors.invalidId` nos 4 idiomas).
- infraestrutura: escrita de JSON atômica com permissão
  (`writeJsonAtomic`, `src/main/jsonfile.ts`) para `library.json`,
  `settings.json` e `dropbox-tokens.json`, e diretórios XDG extraídos para
  `src/main/paths.ts` (quebra o ciclo `library` ↔ `settings` ↔ `drive`).

### Segurança

- janela: navegação presa na página do app (`will-navigate` recusa qualquer
  URL fora da página carregada, mantendo o `setWindowOpenHandler` que só
  repassa `https:` para o navegador do sistema).
- sessão: toda permissão web do renderer (mídia, geolocalização,
  notificações…) é negada; só o clipboard passa, para o modal de doação.
- produção: DevTools desligado no app empacotado (`devTools:
!app.isPackaged`).
- IPC pelo frame oficial: todo handler chegou com `assertAppFrame(event)`, que
  confere `event.senderFrame` contra a página do scheme `cronologia://` (ou o Vite
  dev server), bloqueando qualquer frame de fora antes do domínio.
- renderer entregue via scheme `cronologia://` em produção (`registerAppProtocol`
  serve `out/renderer`), em vez de `file://`; CSP com `object-src 'none';
base-uri 'self'; frame-ancestors 'none'; form-action 'self'` nos dois
  lugares.
- `electronFuses` no electron-builder: `runAsNode: false`,
  `enableNodeOptionsEnvironmentVariable: false`,
  `enableNodeCliInspectArguments: false`, `enableCookieEncryption: true`,
  `onlyLoadAppFromAsar: true` e
  `grantFileProtocolExtraPrivileges: false`.

### Documentação

- `SECURITY.md` com as proteções novas (janela e sessão contidas, trava de
  restauração, régua de id e escrita atômica), `docs/api.md` com a mensagem
  de trava na tabela de erros e o travamento em `drive.restore`, e
  `docs/dropbox.md` com o sintoma na tabela de problemas.

## [1.4.0](https://github.com/chronos-atalante/cronologia/compare/v1.3.0...v1.4.0) (2026-10-07)

### Features

- idioma: chinês simplificado (`zh-CN`, 简体中文) na interface do app e no
  site, escolhido em Configurações e persistido em `settings.json` (textos em
  `src/messages/zh-CN.ts`; detecção `zh-*` e seletor PT/EN/KO/中 na landing;
  ver `docs/messages.md`).
- configurações: aviso na tela de Configurações quando o cofre do sistema está
  indisponível (canal IPC `settings:keyring` com `settings.keyringWarning`
  nos 4 idiomas), em vez de cair em silêncio no fallback em claro.

### Bug Fixes

- privacidade: caminhos de persistência corrigidos na política do site, no
  `README.md` e no `AGENTS.md` (obras e capas em `~/.local/share/`, configs e
  tokens em `~/.config/`), incluindo a instrução de exclusão.
- textos: pontuação restaurada nas mensagens em pt-BR e en (parênteses e ponto
  e vírgula onde a remoção de travessões tinha truncado frases) e progresso
  descrito em capítulos no site (era "porcentagem"), com o tipo "outro" na
  lista.
- doações: removidas as menções ao QR Code Pix (`README.md` e
  `docs/doacoes.md`); o modal oferece link do Mercado Pago e botão de copiar.
- metadados: `homepage` e `maintainer` do pacote apontam para o repositório e
  o e-mail oficiais; exemplo de instalação local usa glob de versão;
  workflow do CI no Node 24 e scripts de limpeza sem `rimraf`.

## [1.3.0](https://github.com/chronos-atalante/cronologia/compare/v1.2.1...v1.3.0) (2026-10-06)

### Features

- categorias: lista ampliada de 16 para 56 gêneros e `Select` pesquisável na
  Categoria da obra (campo "Digite para filtrar…", sem diferenciar acentos ou
  maiúsculas, com mensagem de vazio).
- idioma: coreano (`ko`, 한국어) na interface do app, escolhido em
  Configurações e persistido em `settings.json` (textos em `src/messages/ko.ts`;
  ver `docs/messages.md`).

## [1.2.1](https://github.com/chronos-atalante/cronologia/compare/v1.1.2...v1.2.1) (2026-10-06)

### Features

- backup: contrato `BackupProvider` com catálogo de provedores na seção
  "Provedores de backup" das Configurações (canal IPC `drive:providers`):
  Dropbox operante e Google Drive documentado como não operante (destino
  `appDataFolder`; ver `docs/backup-providers.md`).
- backup: formato de arquivo único `WTENC3` (scrypt `N=2¹⁷`, `r=8`, `p=1`)
  no lugar dos legados `WTENC1`/`WTENC2` e da função `encryptIfNeeded`.
- idioma: interface em português (Brasil) ou inglês, escolhido em
  Configurações e persistido em `language`; textos centralizados em
  `src/messages/` (ver `docs/messages.md`).
- configurações: botão **Fechar** no rodapé do modal.
- configurações: App key do Dropbox embutida no binário (em cliente PKCE a
  chave é pública por definição); `driveClientId` no `settings.json` passa a
  ser override opcional e a UI não pergunta mais a chave.

### Bug Fixes

- segurança: salt aleatório por cadeia no manifesto v2 de nomes do backup,
  em vez de derivar o mesmo salt fixo da senha.
- segurança: respostas da API do Dropbox passam por validação de forma
  (`parseJson` → `unknown` com guards) e `openExternalSafe` só abre `https:`.
- segurança: `build/postrm` usa o nome correto do pacote (casing) e as
  Actions do GitHub ficam fixadas por SHA.
- dev: os webfonts do FontAwesome deixam de ser recusados (HTTP 403) pelo
  servidor do Vite no `npm run dev` (`server.fs.allow` no renderer).

### Documentação

- `SECURITY.md` passa a registrar a política de segurança e os riscos
  aceitos (porta do callback OAuth, senha sem keyring e `braces` na landing);
  `api.md`/`dropbox.md`/`README.md` refletem a chave embutida e as URLs do
  repo APT flat da Release.

## [1.1.2](https://github.com/chronos-atalante/cronologia/compare/v1.1.1...v1.1.2) (2026-10-06)

### Bug Fixes

- embalagem: o `after-pack` não remove mais o `libffmpeg.so`, o binário do
  Electron o declara como `DT_NEEDED` e o 1.1.1 abria apenas o ícone,
  morrendo com "error while loading shared libraries: libffmpeg.so".

## [1.1.1](https://github.com/chronos-atalante/cronologia/compare/v1.1.0...v1.1.1) (2026-10-05)

### Bug Fixes

- detecta escopos faltantes no Dropbox e orienta a correção ([29f009f](https://github.com/chronos-atalante/cronologia/commit/29f009fc89b67f1024534afc2b69b038c252773d))

## [1.1.0](https://github.com/chronos-atalante/cronologia/compare/v1.0.2...v1.1.0) (2026-10-05)

### Features

- migra backup em nuvem do Google Drive para o Dropbox ([c55190e](https://github.com/chronos-atalante/cronologia/commit/c55190e62250866841bfcbf93c1d2bae2f8b020e))

### Bug Fixes

- corrige tipos do upload no Dropbox (autorename/mute booleanos) ([59454b5](https://github.com/chronos-atalante/cronologia/commit/59454b5b630231436e6f680df9ac69e2921dbfc1))

## [1.0.2] - 2026-10-05

### Adicionado

- Página **Atribuições**: botão ao lado da pílula do Drive abre os créditos
  das dependências em rolagem lenta e contínua (estilo pós-créditos de
  cinema), com pausar/continuar e respeito a `prefers-reduced-motion`
  (detalhes em `docs/atribuicoes.md`).
- Página **Doações**: botão **Doar** no cabeçalho abre a página de apoio ao
  projeto, com link do Mercado Pago (abre no navegador do sistema) e botão
  de copiar (detalhes em `docs/doacoes.md`).

## [1.0.1] - 2026-10-04

### Segurança

- Chaves OAuth do Google atualizadas (novo `client_id`/`client_secret`).
- Cifra do backup com scrypt explícito (`N=2¹⁶`, `r=8`, `p=1`) e formato
  `WTENC2`, mantendo leitura dos backups antigos `WTENC1`.
- Migração da pasta legada recifra arquivos em claro quando há senha
  configurada (sem dupla criptografia).
- OAuth: e-mail da conta via header `Authorization` (fora da URL) e validação
  da resposta de tokens antes de usar (falha fechada).
- Senha de backup no keyring do SO (`safeStorage`, com fallback `0600`) e
  nomes remotos opacos (HMAC-SHA256 + manifesto cifrado).

## [1.0.0] - 2026-10-04

Primeira versão pública do **Cronologia** (pacote `.deb` para Linux Mint).

### Adicionado

- Biblioteca em grade: capa, título, descrição, tipo (`webtoon`, `manhwa`,
  `manhua`, `mangá`, `livro`, `outro`), status e progresso com ajuste fino
  (`↑`/`↓`, `−10`/`+10`, concluir, zerar).
- Capas locais servidas pelo protocolo interno `cover://` (com cache e
  proteção anti path-traversal).
- Busca por título/descrição, filtros por status e estatísticas
  (contador + progresso médio do filtro + total da biblioteca).
- Backup manual no Google Drive: OAuth PKCE embutido, espaço oculto
  `appDataFolder`, arquivos sempre criptografados (AES-256-GCM + scrypt),
  restaurar com senha e migração automática da pasta legada.
- Janela nativa sem barra de menus (sem File/Edit/View), com encaixe
  (tiling) do gerenciador de janelas e `F11` para tela cheia.
- Scripts `clean`/`build`/`dist` (limpeza com rimraf) e empacotamento `.deb`.
- Documentação: referência da API interna em padrão Swagger
  (`docs/api.md` + `docs/openapi.yaml`), guia de backup
  (`docs/google-drive.md`) e arquivos de governança
  (`CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `LICENSE`).
