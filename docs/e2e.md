# Testes ponta a ponta (E2E)

A suíte de `tests/**` verifica cada módulo isolado, com o `electron` trocado por
um dublê. O E2E faz o caminho oposto: sobe o **app de verdade**, compilado ou
empacotado, abre a janela e dirige a interface como um usuário faria. É o único
lugar onde o bundle compilado, o `cronologia://`, o IPC real, o Argon2id real e o
React montado aparecem juntos.

O motor é o [Playwright](https://playwright.dev) (`playwright-core`, sem
download de navegador: o navegador aqui é o próprio Electron) rodando sob o
Vitest, para o projeto continuar com um runner só. Os fluxos moram em
`e2e/support/`.

## Como rodar

O E2E **não** entra no `npm test` nem no `npm run check`: ele abre janelas,
sobe uma porta de depuração e paga Argon2id de produção a cada criação ou
desbloqueio do cofre. É sob demanda e no CI.

O app precisa estar compilado antes:

```bash
npm run build        # para o alvo compilado (out/)
npm run dist:dir     # para o alvo empacotado (release/, gera o .deb)
```

Depois:

| Comando                     | O que roda                                      |
| --------------------------- | ----------------------------------------------- |
| `npm run test:e2e`          | Jornada compilada e fumaça do payload do `.deb` |
| `npm run test:e2e:bundled`  | Só o app compilado (`out/`)                     |
| `npm run test:e2e:packaged` | Só o payload do `.deb`                          |

O `typecheck` inclui `e2e/tsconfig.json`: os fluxos são TypeScript tipado contra
o mesmo `tsconfig.base.json` do resto do repositório, e os textos vêm de
`@zero/messages` (a mesma fonte da tela), então um seletor nunca vira uma
segunda cópia da mensagem.

Não há seletor por classe CSS: os testes casam por papel acessível
(`getByRole`, `getByLabel`), por `placeholder` e por `title`.

## Os dois alvos

| Alvo                | O que é                                             | Como sobe                        |
| ------------------- | --------------------------------------------------- | -------------------------------- |
| Compilado (`out/`)  | O que sai do `electron-vite build`, antes do pacote | `_electron.launch` do Playwright |
| Empacotado (`.deb`) | O payload que o usuário instala                     | `--remote-debugging-port` + CDP  |

O alvo compilado cobre os fluxos visíveis da aplicação: criar o cofre recusando
confirmação divergente e senha previsível; cadastrar obra com tipo, status,
categoria e marcação; acompanhar progresso e status pelo cartão; buscar por
categoria e editar; cadastrar e excluir com confirmação em duas etapas; filtrar
pelos chips de status; abrir Atribuições e Doações; trocar o idioma e voltar;
recusar a ação destrutiva sem a palavra exata; fechar e reabrir o cofre
(recusando a senha errada); apagar a biblioteca; e destruir o cofre.

O alvo empacotado continua sendo fumaça de instalação: criar o cofre, cadastrar
uma obra e incrementar o progresso. Não repete a jornada da variante compilada;
prova que o artefato instalado abre e executa os caminhos essenciais.
`test:e2e` exige que os dois alvos existam: gere-os com `npm run dist:dir`. A
suíte não marca um alvo ausente como skip silencioso.

### Por que o `.deb` não sobe pelo Playwright

O pacote liga o fusível `enableNodeCliInspectArguments: false` (`package.json`,
chave `electronFuses`): o Electron passa a ignorar `--inspect`, e é por ele que
o Playwright se anexa à main. Sem isso, o `_electron.launch` espera para sempre.
Por isso o alvo empacotado sobe como processo comum, com
`--remote-debugging-port`, e o runner conecta por CDP
(`chromium.connectOverCDP`). O CDP só enxerga o renderer, então nesse alvo não dá
para ler o clipboard do main nem a main em si: a verificação fica no que a tela
mostra.

### Por que o CI extrai o `.deb` em vez de instalar

O perfil AppArmor que o `postinst` instala nega rede. O CDP é uma conexão TCP em
`127.0.0.1`, e um perfil em _enforce_ a bloquearia: o app instalado abriria, mas
o runner não conseguiria falar com ele. Então a suíte empacotada extrai o payload
com `dpkg-deb -x` e roda o binário de dentro da extração. É byte a byte o que o
`.deb` entrega, sem instalar nada e sem AppArmor. Para apontar a suíte para outro
binário (por exemplo, o `/opt/Cronologia/cronologia` de uma instalação real com o
perfil em _complain_), use `CRONOLOGIA_E2E_APP=/caminho/para/cronologia`.

## Isolamento

Cada app lançado recebe um `HOME` próprio, com os três diretórios XDG,
`CRONOLOGIA_VAR_LIB` e `CRONOLOGIA_VAULT_DIR` apontados para dentro do
temporário (`e2e/support/env.ts`): a biblioteca cifrada, o cofre, o
`settings.json` e o cache do Chromium nunca tocam `/var/lib/.cronologia` nem o
perfil do usuário. `ELECTRON_RENDERER_URL` é removido para o entrypoint servir a
SPA compilada por `cronologia://`, e não o dev server.

Há um worker só e sem paralelismo entre arquivos (`vitest.e2e.config.mts`): os
dois alvos disputam o lock de instância única do Electron e portas de depuração.

A remoção do temporário espera o app morrer. O alvo empacotado sobe como
processo comum e o `SIGTERM` é dado ao **grupo** de processos (o app é líder do
grupo, com `detached: true`), porque o Chromium tem zygote, GPU e crashpad:
sinalizar só o líder deixaria auxiliares escrevendo no `HOME` enquanto a árvore é
apagada. A promessa do `close()` só resolve no `exit` do líder, e o `rmSync` vai
com repetição. Sem essa espera a limpeza dá `ENOTEMPTY` de forma intermitente.

## O que o E2E já encontrou

Os dois bugs abaixo não eram hipótese: a jornada parou neles, e cada um tem teste
de regressão na suíte unitária.

- **A gravação atrasada do cartão atropelava o "Salvar" do modal.** O cartão
  agenda a gravação com 450 ms de atraso e o modal grava na hora. Sem serializar
  as duas pela mesma obra, a gravação atrasada saía depois e trazia o rascunho
  antigo de volta: o usuário editava o título, clicava em Salvar, e meio segundo
  depois o título voltava ao anterior — na tela e no disco. A correção é a fila
  por id em `App.tsx` (`write`), com o agendamento pendente descartado a cada
  gravação; o teste é `tests/renderer/src/App.test.tsx` § "o Salvar do modal não é
  atropelado...".
- **O bloqueio manual do cofre não derrubava a barreira.** O `vault:locked`
  saía só do auto-lock, então um "Fechar cofre" pedido pelo usuário zerava a
  chave em disco mas deixava as obras descifradas na grade. O evento passou a
  ser emitido também por `vault:lock`, com um booleano que distingue as duas
  causas (o aviso de "fechou sozinho por inatividade" só sai no auto-lock);
  testes em `tests/main/index-vault.test.ts` e em `tests/renderer/src/App.test.tsx`.

## CI

O job "Testes E2E" de `.github/workflows/quality.yml` compila (`npm run
dist:dir`), roda os dois alvos sob `xvfb` e, em seguida, instala o `.deb` de
verdade (`apt-get install ./release/*.deb`) para conferir que o pacote resolve as
dependências e deixa o binário e o `cronologia-setup` no lugar. Os testes não
dependem dessa instalação: ela é a checagem do pacote, e o E2E roda sobre o
payload extraído.

## Ver também

- [`testes.md`](testes.md) (suíte unitária e convenções)
- [`mutacao.md`](mutacao.md) (o outro sinal de qualidade da suíte)
- [`api.md`](api.md) (o contrato `window.api` que o E2E dirige pela tela)
