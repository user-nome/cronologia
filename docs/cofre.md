# Cofre

O cofre é a **chave de tudo**. Sob uma senha mestra, com Argon2id +
AES-256-GCM, ele protege duas coisas:

1. os **segredos do próprio app**: tokens do Dropbox, senha de criptografia do
   backup e App key alternativa (tabela em [`credenciais.md`](credenciais.md));
2. o **acervo do usuário**: a biblioteca inteira e as capas, gravadas em disco
   já cifradas.

Desde a 1.9 o acervo só existe para o app com o cofre aberto. Abrir o app sem
a senha mestra mostra a tela de desbloqueio, não a biblioteca. É arquivo local
em `/var/lib`, fora de `~`, aberto só enquanto durar a sessão em memória. Não é
gerenciador de senhas do usuário.

## Consequência que vale explicar

O acervo não mora dentro do `vault.zkv`: mora em `library.enc` e
`covers/<nome>.enc`, cada um cifrado com uma chave derivada da chave-mestra por
HKDF-SHA512 (`src/main/store-crypto.ts`). Duas propriedades vêm desse desenho:

- **Cryptographic Erase**: destruir o cofre mata a chave-mestra, e com ela todo
  `.enc` vira ruído irrecuperável, sem precisar sobrescrever o acervo inteiro;
- os arquivos `.enc` não guardam chave, salt nem KDF: sozinhos são bytes inúteis.

Formato de cada `.enc` (cabeçalho de 37 bytes, big-endian):

| Offset | Tamanho | Campo                            |
| ------ | ------- | -------------------------------- |
| `0`    | 5       | magic `CLIB1` (ASCII)            |
| `5`    | 16      | IV da operação (nonce aleatório) |
| `21`   | 16      | tag de autenticação de 128 bits  |
| `37`   | `n`     | texto cifrado                    |

## Onde mora

| Item      | Caminho                                 | Permissão               |
| --------- | --------------------------------------- | ----------------------- |
| Raiz      | `/var/lib/.cronologia/`                 | `0711` `root:root`      |
| Diretório | `/var/lib/.cronologia/.vault/`          | `0700` (dono = usuário) |
| Container | `/var/lib/.cronologia/.vault/vault.zkv` | `0600`                  |

O cofre fica em `/var/lib`, **fora de `~`**, para sobreviver à limpeza do home
do usuário. A raiz é oculta e sem listagem: navegar ou excluir o topo da árvore
exige sudo. Escrita atômica (`vault.zkv.tmp` + `rename`) e leitura
**fail-closed**: forma inválida, truncamento, parâmetro fora da faixa ou byte a
mais no fim devolvem "adulterado", nunca conteúdo em claro.

## Criação e reparo da pasta

A árvore é criada com permissão de escrita no `/var/lib` só onde ela falta:

1. **Instalação** (`build/scripts/after-install.sh`, roda no `postinst`):
   `install -d -m 0711 root:root /var/lib/.cronologia` e
   `install -d -m 0700 <SUDO_UID|PKEXEC_UID> /var/lib/.cronologia/.vault`
   (se o instalador não for identificado, o dono sai como root e o app conserta
   no próximo uso).
2. **No app** (`ensureVaultStructure` em `src/main/vault/vault.ts`): gravações
   e criação chamam `ensureVaultStructure()` (`mkdir -p` + `chmod 0700`). Com
   `EACCES`/`EPERM`/`EROFS` o erro vira `vaultDirUnavailable`.
3. **Reparo** (`ensureVaultStructureWithSetup` + `src/main/vault/privilege.ts`):
   na criação do cofre, `vaultDirUnavailable` dispara
   `pkexec <process.resourcesPath>/cronologia-setup` (helper do `.deb`, só cria
   diretórios fixos, dono vindo de `PKEXEC_UID`) e tenta de novo. O diálogo é o
   do PolicyKit (ação `com.cronologia.setup-vault`); `pkexec 126`
   (dispensado) vira `vaultAuthCancelled` e o resto vira `vaultDirUnavailable`
   de novo. O app nunca vê a senha do sistema.

Com `CRONOLOGIA_VAULT_DIR`/`CRONOLOGIA_VAR_LIB` definidas (testes e `npm run dev`)
o pkexec **não dispara**: a sobrescrita já vem com permissão de escrita.

## Formato do container (`vault.zkv`)

Escrito e lido só por `src/main/vault/container.ts` (versão `1`, magic
`CHRONOS1`). Tabela de offsets do **cabeçalho** (45 bytes, big-endian):

| Offset | Tamanho | Campo                    |
| ------ | ------- | ------------------------ |
| `0`    | 8       | magic `CHRONOS1` (ASCII) |
| `8`    | 4       | versão (`1`)             |
| `12`   | 8       | `createdAt` (epoch ms)   |
| `20`   | 4       | KDF `memoryKiB`          |
| `24`   | 4       | KDF `iterations`         |
| `28`   | 4       | KDF `parallelism`        |
| `32`   | 4       | `attempts` (trava)       |
| `36`   | 8       | `lockUntil` (epoch ms)   |
| `44`   | 1       | flags (reservado, `0`)   |

Depois do cabeçalho vêm dois blocos selados (`salt/IV/tag/comprimento/dados`):

| Bloco     | Conteúdo                                                            |
| --------- | ------------------------------------------------------------------- |
| `wrap`    | salt do Argon2id (16 B) + IV (16 B) + tag (16 B) + **chave-mestra** |
| `payload` | IV (16 B) + tag (16 B) + JSON `{"version":1,"secrets":{...}}`       |

O `payload` é cifrado com a **chave de dados**, derivada da chave-mestra por
HKDF-SHA512 (contexto `cronologia/vault/data`), que separa o domínio
da mestra usado no `wrap`.

## Cifras e custo

| Etapa  | Algoritmo                           | Parâmetros                                     |
| ------ | ----------------------------------- | ---------------------------------------------- |
| KDF    | Argon2id (`hash-wasm`)              | padrão: 128 MiB, 3 iterações, paralelismo 4    |
| Cifra  | AES-256-GCM                         | IV aleatório de 16 B por operação, tag de 16 B |
| Chaves | mestra 32 B / KEK 32 B / dados 32 B | HKDF-SHA512 com salt por cofre                 |

A faixa aceita na leitura é limitada (`memoryKiB` 16 MiB a 1 GiB, `iterations`
1 a 8, `parallelism` 1 a 8): um container adulterado não consegue exigir CPU ou
memória ilimitadas; fora da faixa o arquivo é tratado como adulterado.

## Trava exponencial

Cada senha errada soma uma espera, persistida no próprio container
(`attempts`/`lockUntil`), portanto sobrevive a reinício. A trava é checada
**antes** do Argon2id, então esperar não gasta CPU:

| Falha         | Espera |
| ------------- | ------ |
| 1ª            | 10 s   |
| 2ª            | 30 s   |
| 3ª            | 1 min  |
| 4ª            | 1 h    |
| 5ª e seguinte | 24 h   |

Um desbloqueio bem-sucedido zera `attempts` e `lockUntil`.

## Sessão e auto-lock

A chave-mestra só existe na memória do processo main, dentro do Singleton
`VaultSessionManager` (`src/main/vault/session.ts`): `adopt` copia os bytes,
`wipe` zera antes de soltar, e o `before-quit` do Electron zera também. Sem
chave na sessão, `getSecret`/`setSecret` e todo acesso ao acervo falham com
`vaultLocked`.

- **Auto-lock**: 5 minutos de ociosidade (`IDLE_LOCK_MS`) derrubam a sessão e
  emitem o evento `vault:locked` para a interface, que some com o acervo da
  tela e volta a pedir a senha.
- O que conta como ociosidade é **uso da interface** (`pointerdown`, `keydown`,
  `wheel` no renderer, canal `vault:touch`, com throttle de 30 s do lado main).
  Ler a chave no main **não** conta: é o app decifrando para uso interno.
  Antes da 1.9 o timer só corria no acesso a segredo, o que dava o resultado
  oposto do que o nome promete.
- **Fechar manualmente**: `vault.lock()` (botão _Fechar cofre_ nas
  Configurações).
- Reabrir exige a senha mestra de novo (a trava vale, se houver falha).

## Destruição

Três operações destrutivas, todas com confirmação em duas etapas na interface
(componente `DangerZone`):

| Operação          | Canal           | O que faz                                                           |
| ----------------- | --------------- | ------------------------------------------------------------------- |
| Apagar biblioteca | `library:reset` | Sobrescreve e apaga `library.enc` e toda a pasta `covers/`          |
| Destruir cofre    | `vault:destroy` | Zera a chave, sobrescreve `vault.zkv` e o `.tmp`, e shreda as capas |
| Apagar backup     | `drive:purge`   | Apaga os blobs na conta de nuvem conectada                          |

Detalhes que valem saber:

- **o que o erase precisa apagar**: o `vault.zkv.tmp` importa tanto quanto o
  container, porque carrega os mesmos blobs de chave embrulhada;
- **nada recria o cofre depois**: `writeContainer` recusa com `vaultDestroyed`
  enquanto a marca estiver de pé, e só `createVault` a limpa. Sem isso, uma
  escrita acidental deixaria um container pela metade e o usuário leria
  "adulterado" em vez de "destruído";
- **falha parcial na nuvem é contada**: `drive:purge` devolve `deleted` e
  `failed`, e só desliga a sessão local quando `failed === 0`. Um "apagado" em
  falso é pior que um erro;
- as três **não** sobrescrevem por garantia em SSD: com wear leveling a escrita
  pode ir para outro bloco físico. Onde o arquivo já é cifrado, a proteção é a
  chave; onde não é mais (o `.enc` sem chave), o shred é o melhor esforço
  disponível.

### Provar o Cryptographic Erase com heap snapshot

A garantia de que destruir o cofre mata o acervo depende inteiramente de uma
afirmação sobre memória: **a chave-mestra não sobreviver depois do wipe**. Isso
não é teste de unidade — um teste passa com a chave intacta no heap e não diz
nada sobre o erase. A verificação honesta é um heap snapshot, e ela tem um
controle obrigatório.

> Um snapshot "não achei a chave" **não é evidência de nada** se a mesma busca
> também não a acha no snapshot de antes da destruição. O controle positivo é
> o que dá valor ao negativo.

Procedimento, todo em desenvolvimento (`npm run dev`, nunca no `.deb`):

1. `npm run dev:inspect` e anexe o depurador na porta `5858`.
2. Crie o cofre, desbloqueie e **use o app** (ler e salvar uma obra). Sem uso,
   a chave pode não ter Pages Materializadas e o teste não prova nada.
3. **Snapshot de controle (chave presente).** No painel do depurador do main:
   **Memory → Take heap snapshot**, salve como `/tmp/controle.heapsnapshot`.
4. **Obtenha os bytes da chave.** Ponha um breakpoint em
   `src/main/vault/session.ts`, na linha do `fill(0)` dentro de `wipe()`: ele
   dispara tanto no auto-lock quanto na destruição. Com o processo pausado
   **naquela linha**, o Console do depurador devolve os bytes reais, ainda não
   zerados:

   ```js
   this.masterKey.toString('hex');
   Array.from(this.masterKey).join(' '); // como o snapshot exibe um typed array
   ```

   Guarde a segunda forma. O snapshot guarda os elementos de typed array como
   decimais separados por espaço; essa é a string a buscar.

5. **Destrua** pela zona de risco (palavra `DESTRUIR`), que chama `destroyVault`
   → `wipe`. O breakpoint da etapa 4 pausa: **retome** (_Resume_) para a
   destruição completar.
6. **Snapshot pós-destruição.** **Memory → Take heap snapshot**, salve como
   `/tmp/depois.heapsnapshot`.
7. **Valide o método antes de concluir.** Abra `/tmp/controle.heapsnapshot` no
   DevTools (`Ctrl+Shift+F` na aba _Memory_) e procure os bytes da etapa 4. A
   busca **tem** de encontrar. Se não encontrar nem no controle, o formato está
   errado ou a chave não foi materializada — volte à etapa 2.
8. **Aí sim** procure a mesma string em `/tmp/depois.heapsnapshot`.

O que esperar, e o que **não** esperar:

- **esperado:** os bytes originais da chave-mestra não aparecem mais;
- **não é falha:** o snapshot mostra memória do processo com dado derivado
  (blobs do Argon2id, textos já decifrados exibidos na tela, `Buffer` antigo
  liberado mas não coletado, cópias intermediárias dentro do WebCrypto). Por
  isso o Cryptographic Erase é uma garantia de **chave**, não de higiene de
  memória;
- **o limite da garantia:** ela vale enquanto ninguém tiver um **dump de
  memória** do processo **e** a chave. Um dump feito _antes_ da destruição
  preserva a chave — é por isso que `--inspect` está desligado no binário
  instalado (fuse `enableNodeCliInspectArguments: false`) e que um dump é o
  principal vetor de ataque ao modelo, não o `vault.zkv`.

`v8.writeHeapSnapshot()` é a alternativa programática ao painel, mas cuidado:
no Console do processo main o `require` pode não existir (o Electron é ESM
nesse ponto), então use `await import('node:v8')`.

Se o snapshot pós-destruição mostrar os bytes originais, isso é **achado de
segurança**, não detalhe de documentação: registrar em `SECURITY.md` e corrigir
antes de qualquer release.

## Comportamento fail-closed

- Container ilegível/adulterado → `vaultTampered`; nenhum segredo é entregue.
- Cofre fechado → `vaultLocked`; `loadSettings` devolve `''` e `loadState`
  zera os tokens (falha fechada, nunca exceção fora do domínio).
- Pasta sem permissão → `vaultDirUnavailable`; caixinha do sistema em seguida
  (ver acima) e, se recusada, `vaultAuthCancelled`. A caixinha só aparece na
  **criação** do cofre: gravar um segredo num cofre cuja pasta perdeu a
  permissão falha direto com `vaultDirUnavailable`, sem diálogo.
- Os canais `vault:create`/`unlock`/`destroy` devolvem o envelope `VaultResult`
  com `code` + `retryInMs` (tabela em [`api.md`](api.md) §6) e o texto exibido
  é localizado no renderer; `vault:status` e `vault:lock` devolvem `VaultStatus`
  direto, e `settings:set` propaga como erro já localizado no main.

## Sem migração do legado

Nada é **importado** de instalações antigas: o cofre novo não herda segredo
nenhum do antigo. Em troca, o app **apaga** o que ficou em claro, senão
atualizar a instalação deixaria token e acervo legíveis no disco.

`runDiskCleanup` roda no boot e sobrescreve (shred) e remove, por existência e
sem nunca ler o conteúdo do segredo: `settings.json` com `enc:`/keyring,
`dropbox-tokens.json`, `drive-tokens.json`, o cofre antigo em
`~/.config/cronologia/.vault`, o acervo `library.json` em claro e as capas sem
`.enc`. O `settings.json` vivo e a pasta `.vault` nova nunca são tocados.
Lista completa em [`credenciais.md`](credenciais.md) ("Legado: sem migração,
mas varrido no boot").

## Variáveis de ambiente (testes e dev)

| Variável               | Efeito                                                                |
| ---------------------- | --------------------------------------------------------------------- |
| `CRONOLOGIA_VAULT_DIR` | sobrepõe o diretório do cofre (testes usam sandbox própria)           |
| `CRONOLOGIA_VAR_LIB`   | sobrepõe o `/var/lib` de base (testes e `npm run dev` usam o sandbox) |

Ambas desligam o pedido de sudo. Os testes também isolam
`HOME`/`XDG_CONFIG_HOME` (`tests/setup-env.ts`) e injetam KDF barato
(`createVault(senha, params)`), então nenhum teste roda Argon2id com custo de
produção.

## Arquivos do domínio

| Arquivo                       | Papel                                          |
| ----------------------------- | ---------------------------------------------- |
| `src/main/vault/crypto.ts`    | Argon2id, AES-256-GCM, HKDF, regra de senha    |
| `src/main/vault/container.ts` | encode/decode fail-closed do `vault.zkv`       |
| `src/main/vault/lockout.ts`   | espera exponencial                             |
| `src/main/vault/session.ts`   | chave em memória, auto-lock, wipe              |
| `src/main/vault/vault.ts`     | criar/desbloquear/travar e ler/gravar segredos |
| `src/main/vault/privilege.ts` | reparo da pasta via `pkexec` (PolicyKit)       |
| `src/main/vault/secrets.ts`   | mapa de nomes + helpers JSON                   |
| `src/main/vault/errors.ts`    | `VaultError` com `code`/`retryInMs`            |
| `src/main/vault/index.ts`     | barrel                                         |
| `src/main/store-crypto.ts`    | formato `CLIB1` e derivação de chave do acervo |
| `src/main/library.ts`         | acervo cifrado: obras, capas e `resetLibrary`  |
| `src/main/shred.ts`           | sobrescrita segura antes de apagar             |
| `src/main/cleanup.ts`         | legados em claro e `.tmp` órfãos no boot       |

## Ver também

- [`api.md`](api.md) §6 (canais `vault:*` e códigos de erro)
- [`credenciais.md`](credenciais.md) (o que é guardado e o ciclo de vida)
- [`arquitetura.md`](arquitetura.md) (camadas e ciclo de vida)
