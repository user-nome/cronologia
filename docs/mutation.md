# Testes de mutação

Cobertura de linha responde "esta linha foi executada?". Teste de mutação
responde uma pergunta mais forte: "se esta linha fizesse outra coisa, a suíte
perceberia?". Cada mutante é uma troca pequena e deliberada no código de `src/`
(um `<` vira `<=`, um `&&` vira `||`, uma guarda de `if` some). O mutante é
aplicado, a suíte roda, e o veredito é binário: algum teste quebrou (o mutante
morreu) ou a suíte continua verde (o mutante sobreviveu, e existe um buraco de
teste). O **score** é a porcentagem de mutantes mortos.

Cobertura alta com score baixo é o caso comum de uma suíte que passa por cima da
lógica sem conferir as decisões. Neste repositório os dois números são
complementares: o limiar de 50% de cobertura é o piso, e o score de mutação é o
que diz se esse piso significa alguma coisa. É também o que deu origem aos dois
bugs que o E2E e a varredura acharam (ver o fim do arquivo).

## Como rodar

```bash
npm run test:mutation          # varredura completa
npm run test:mutation:plan     # só monta o plano e imprime, não executa
node tools/mutation/run.ts --help
```

O runner guarda os resultados em `mutation/results.json` e pula o que já foi
medido, então uma varredura interrompida continua de onde parou. Para remedir um
arquivo depois de escrever teste novo:

```bash
node tools/mutation/run.ts --file src/main/library.ts --fresh
```

`--fresh` descarta só os resultados dos arquivos selecionados, não os da
varredura inteira.

Plano atual de `src/` inteiro: **2.045 mutantes em 44 arquivos**, dos quais 37
ficam fora do denominador por estarem em linha sem cobertura. Nenhum arquivo de
`src/` está sem teste.

## Escopo

Entra todo arquivo `.ts`/`.tsx` de `src/` que tenha linha alcançada por algum
teste. Ficam de fora, cada um com o motivo em `tools/mutation/scope.ts`:

- `src/types/**`: só `interface`, `type` e união. Com
  `verbatimModuleSyntax` não emitem runtime, então não existe mutante.
- `src/messages/{pt-BR,en,ko,zh-CN,ja}.ts`: traduções são dado, e o operador
  `string-empty` já pula elemento de tabela com cinco ou mais entradas, que é
  quase toda linha de tradução. O registro de idiomas (`index.ts`) é medido.
- `src/main/drive/index.ts` e `src/main/vault/index.ts`: barrels puros de
  `reexport`; os módulos que eles reexportam são medidos.
- `src/renderer/src/main.tsx`: entry point que monta o React em `#root`. A suíte
  renderiza `<App/>` diretamente, então este arquivo nunca é importado por um
  teste, e a mutação dele mediria a montagem, que não tem decisão.
- `src/renderer/src/attributions.ts` e `donations.ts`: texto de licença e URL de
  doação. Dado, não decisão.
- `src/node.loader.ts`: roda só em processo filho, e o V8 não mede cobertura
  entre processos.

Mutante em linha que nenhum teste alcança também fica fora do denominador, e
aparece separado no relatório: esse é buraco de **cobertura**, não de teste, e
misturar os dois só faria o número cair sem dizer onde está o problema.

## Operadores

Doze operadores, escolhidos por mudarem uma decisão observável do código.
Mutante que só atrapalha leitura, ou que o TypeScript já rejeitaria, é ruído e
não entra.

| Operador            | Troca                                                 |
| ------------------- | ----------------------------------------------------- |
| `arithmetic`        | `+` ↔ `-`, `*` ↔ `/`                                  |
| `boundary`          | `<` ↔ `<=`, `>` ↔ `>=`                                |
| `equality`          | `===` ↔ `!==`                                         |
| `logical`           | `&&` ↔ `\|\|`                                         |
| `negation`          | `!x` → `x`, `-x` → `x`, `+x` → `x`                    |
| `boolean`           | `true` ↔ `false`                                      |
| `ternary-swap`      | `c ? a : b` → `c ? b : a`                             |
| `if-remove`         | `if (t) { corpo }` → `{ corpo }`                      |
| `if-swap`           | `if (t) { a } else { b }` → `if (t) { b } else { a }` |
| `numeric`           | inteiro de 0 a 1024 → `n + 1`                         |
| `string-empty`      | `'hex'` → `''`                                        |
| `optional-chaining` | `a?.b` → `a.b`                                        |

O operador `string-empty` não mexe em elemento de tabela com cinco ou mais
entradas (`CATEGORIES`, `COMMON_FRAGMENTS`, `TYPE_OPTIONS`, `STATUS_OPTIONS`):
mutar uma entrada mede se a suíte confere item por item o conjunto que o código
carrega, e não se o código que consome o conjunto funciona. (`TYPE_COLORS` e
`STATUS_COLORS` são objeto, não array, e ficam no denominador: o teste de
`constants.test.ts` exige `^#[0-9a-f]{6}$` em cada cor, então o mutante morre.)

Nem mexe em atributo de JSX de apresentação (`className`, `type`,
`autoComplete`, `inputMode`, `size`, `role`) nem em literal aninhado dentro do
valor de um desses atributos, por mais fundo que esteja (`cond ? 'a' : 'b'`,
template). A tabela de constantes entra junto quando o atributo a referencia
(`className={PROVIDER_ICONS[id]}`): o literal não está dentro do atributo, mas a
tabela só existe para alimentá-lo, e sem resolver a referência cada entrada dela
viraria sobrevivente. Uma lista de classes da folha de estilo é folha de estilo,
não decisão: matar esse mutante exigiria que a suíte conferisse o texto da
classe, que é testar o CSS e medir o componente por uma coisa que ele não decide.

O operador `numeric` também pula número em posição de tipo
(`Parameters<typeof f>[0]`), que some na compilação como o literal de tipo que o
`string-empty` já pula.

## Como a varredura fica barata

Uma execução da suíte inteira custa cerca de 100 s. Multiplicada por 2.045
mutantes, a varredura seria de dias. O que reduz isso:

- **Seleção por linha.** Uma matriz arquivo de teste → linhas de `src/`
  (`tools/mutation/matrix.ts`) diz quais testes passam pela linha mutada. Sem
  ela a seleção é por arquivo inteiro e `src/main/library.ts` puxa todos os
  arquivos de teste que o alcançam; com ela, só quem realmente lê a linha roda.
  A matriz é montada com uma execução da suíte por arquivo de teste (38
  execuções) e fica em cache (`mutation/matrix.json`), invalidada por uma
  impressão digital de `src/` e `tests/`. `--file-level` pula essa etapa, e é o
  modo para depurar: a seleção passa a ser por arquivo.
- **Barreiras nos barrels.** O grafo de módulos (`tools/mutation/graph.ts`)
  segue o nome importado até o arquivo que define a função. Quase todo mundo
  importa de `@zero/types`, então um grafo que para no barrel diria que
  `store-crypto.ts` é alcançado por todos os arquivos de teste.
- **`--bail=1` e ordem.** A execução para no primeiro teste que falha, e os
  testes saem na ordem do mais barato para o mais caro. O mutante morre no
  primeiro ou no segundo teste, não no último.
- **Doppelgänger do Argon2id.** A suíte de cofre deriva chaves com Argon2id e
  cria um cofre novo em quase cada teste de `vault/*`. Na config de mutação
  (`vitest.mutation.config.mts`), `hash-wasm` aponta para
  `tools/mutation/hash-wasm-stub.ts`, que troca a derivação por uma cadeia de
  PBKDF2-SHA512 com o número de iterações do próprio pedido: continua
  determinística e sensível à senha, ao salt e aos parâmetros, que é tudo que
  `tests/main/vault-crypto.test.ts` verifica, e some em milissegundos. O stub só
  existe na varredura; o `npm test` continua usando o Argon2id de verdade, e
  nenhum teste compara a saída com um vetor do Argon2id.
- **O doppelgänger não cobre o scrypt do backup, e tudo bem.** `drive/*` cifra de
  verdade com scrypt `N=2^17` e é o que pesa quando um mutante acaba puxando
  `drive-backup.test.ts` (mais de um minuto sozinho). Na varredura normal isso
  não acontece: a matriz de linhas escolhe os testes que passam pela linha
  mutada, e o `--file-level` (modo de depuração, sem matriz) é justamente onde
  um mutante pode herdar a suíte de backup inteira e estourar o teto de 240 s.
  Mutante estourado vira `timeout` e sai do denominador, então ele não baixa o
  score: só aparece na lista de `timeout` do relatório.
- **O doppelgänger não pode ser mais permissivo que a biblioteca.** O `hash-wasm`
  de verdade lança `Insupported output type` para qualquer `outputType` fora de
  `hex`, `binary` e `encoded`, e o stub faz o mesmo. Sem essa fidelidade, o
  `outputType: 'hex'` de `deriveKek` sobrevivia à varredura inteiro: o mutante
  trocado por `''` não mudava nada no doppelgänger, e a suíte via verde com um
  `crypto.ts` que a biblioteca real rejeitaria. É o mesmo princípio do teste de
  baseline, aplicado à fronteira de um módulo: um substituto mais tolerante
  esconde o mutante.
- **O `optional-chaining` só mexe no `?.` de verdade.** Em `a?.b.c` o Babel
  aninha um segundo `OptionalMemberExpression` para o `.c`, com `optional:
false`. Sem a checagem, esse nó geraria um mutante que troca `.` por `.`, que é
  o mesmo texto: um sobrevivente que não é buraco de teste, é ruído.

## Garantias

Três, e as três importam:

- **Baseline verde.** Antes de medir qualquer coisa, o runner roda a suíte sem
  mutante e aborta se ela ficar vermelha. Com o doppelgänger no lugar, um teste
  que passasse com a derivação real e falhasse com a de mentira não pode
  contaminar o placar. Use `--skip-baseline` só para depurar.
- **Cobertura da linha de base nova.** O passo zero do runner é `vitest run
--coverage`. Medir contra um `coverage/coverage-final.json` velho é medir
  errado, porque a linha pode ter saído do alcance de qualquer teste. Use
  `--skip-coverage` para reaproveitar o arquivo existente.
- **O mutante precisa entrar na execução.** Um veredito só significa alguma coisa
  se o texto mutado tiver rodado. O `fsModuleCache` do Vitest (ligado por
  padrão) quebrava essa garantia: ele guarda o módulo transformado em
  `node_modules/.vitest-cache`, indexado pelo id do arquivo, e essa chave não
  conhece o mutante injetado pelo plugin. O cache do mutante anterior era
  revalidado como válido, o mutante atual não entrava, a suíte passava rodando
  contra o texto errado e o veredito saía `survived`. Como só o primeiro mutante
  de cada arquivo era medido de verdade, o score caía sozinho conforme a
  varredura avançava. Por isso `fsModuleCache: false` está em
  `tools/mutation/vitest-options.ts` (e na flag do runner), e
  `tests/tools/mutation-runner.test.ts` trava a garantia.

## No CI

A varredura roda em `.github/workflows/quality.yml`, no job **Testes de
mutação**, em outro ritmo do resto do workflow:

| Quando dispara | Por quê                                          |
| -------------- | ------------------------------------------------ |
| disparo manual | remediar um arquivo específico sem esperar o mês |

Ela **não** roda em pull request nem em push para a `main`. A varredura leva
horas e o número que ela mede só muda quando alguém escreve teste novo; a única
coisa que ela faria por um PR é mudar de verde para vermelho sem dizer nada
sobre o PR. Reprova abaixo de **55%**.

> **O piso é provisório.** A varredura completa de `src/` ainda não foi
> medida: o único corte medido até aqui é `src/preload/index.ts` (100%, 26/26) e
> a fatia `jsonfile.ts` + `errors.ts` + `preload/index.ts` (85,2% antes do
> conserto dos canais). O primeiro disparo manual do job **Testes de mutação** no
> CI produz o número real, e o piso deve ser ajustado para ficar bem abaixo dele
> (a folga é de propósito: o score depende da máquina, porque mutante que estoura
> os 240 s vira `timeout` e sai do denominador).

| Input           | Efeito                                                      |
| --------------- | ----------------------------------------------------------- |
| `min_score`     | piso de reprovação (padrão `55`, o que o job usa sem input) |
| `mutation_file` | mede só esses arquivos de `src/`, separados por vírgula     |

O gating é um `if:` no **job**, não no `on:` do workflow, porque "Verificar
qualidade" e "Testes e cobertura" continuam no ritmo normal de push e PR. Job
pulado aparece como _Skipped_ na aba de checks, que é o esperado aqui: não é
status check obrigatório, ele informa e reprova sozinho.

O job tem **grupo de concorrência próprio** (`mutacao-...`), separado do
`qualidade-...` do workflow: no grupo do workflow, todo push cancelaria a
execução anterior, o que mataria uma varredura de horas no meio sem ninguém ter
tocado em nada.

## Arquivos

| Arquivo                            | O que é                                                         |
| ---------------------------------- | --------------------------------------------------------------- |
| `tools/mutation/run.ts`            | Runner: plano, paralelismo, veredito e relatório.               |
| `tools/mutation/vitest-options.ts` | Opções de Vitest da varredura, com o `fsModuleCache` desligado. |
| `tools/mutation/operators.ts`      | Os doze operadores, em cima da AST do Babel.                    |
| `tools/mutation/mutants.ts`        | Enumeração estável e aplicação por splicing de texto.           |
| `tools/mutation/ast.ts`            | Parser e percurso com pai, que é o que separa dado de valor.    |
| `tools/mutation/graph.ts`          | Grafo de módulos sensível a nomes, para escolher testes.        |
| `tools/mutation/matrix.ts`         | Matriz de linhas por arquivo de teste, com cache.               |
| `tools/mutation/coverage.ts`       | Leitura do relatório do V8 e filtro de linha alcançada.         |
| `tools/mutation/plugin.ts`         | Plugin do Vite que injeta o mutante no módulo alvo.             |
| `tools/mutation/scope.ts`          | O que entra e o que sai, com o motivo de cada exclusão.         |
| `tools/mutation/types.ts`          | O veredito do mutante e o formato do resultado gravado.         |
| `tools/mutation/hash-wasm-stub.ts` | Doppelgänger barato do Argon2id para a varredura.               |
| `vitest.mutation.config.mts`       | Config de Vitest da varredura.                                  |

Artefatos em `mutation/` (fora do git): `results.json` com o veredito de cada
mutante, `matrix.json` com a matriz de linhas, `cov/` com os relatórios
individuais e `report.md` com o resumo e a lista de sobreviventes.

## Limites conhecidos

- Mutante que não compila é contado como `compileError` e fica fora do score.
  São raros, porque a troca é só de texto.
- Mutante que estoura o tempo (240 s por padrão) fica `timeout`, também fora do
  score. Vale subir com `--timeout` antes de culpar a suíte.
- O operador `optional-chaining` gera mutante que estoura em `TypeError` quando
  o valor realmente é nulo. A suíte mata, e a mutação está certa, mas é um sinal
  mais fraco que os outros.
- O grafo de módulos é estático e segue `import()` só quando o especificador é
  literal (montado em tempo de execução, não há caminho estático). Cuidado com
  esse trecho: ele já esteve quebrado sem dar erro. `tests/preload/index.test.ts`
  alcança o preload por `await import(...)`, e quando o Babel 8 passou a emitir
  `ImportExpression` no lugar de `CallExpression` com `callee` do tipo `Import`,
  `src/preload/index.ts` saiu do grafo inteiro e deixou de ser medido, e a
  varredura seguiu como se estivesse tudo bem. Um motor que compara **nome de
  nó** falha em silêncio quando o nome muda, então
  `tests/tools/mutation-runner.test.ts` fixa os nomes de que o motor depende e
  afirma que nenhum órfão ficou de fora do escopo.

## O que a varredura já encontrou

O motor está aqui desde a introdução desta doc; o que segue é o que a pergunta
"se esta linha fizesse outra coisa, a suíte perceberia?" já respondeu sobre o
código atual, e vale como leitura de quanto a suíte segura:

- **A gravação atrasada do cartão atropelava o "Salvar" do modal.** O `&&`/`||`
  da fila por id em `App.tsx` é exatamente a decisão que separa "a última
  intenção é a última escrita" de "a gravação atrasada volta por cima": sem a
  fila, um mutante que troca a ordem de enfileirar faz o rascunho antigo voltar
  depois do Salvar, e nada na suíte unitária via, porque os testes exercitavam o
  debounce e o modal **em arquivos separados**, nunca na mesma sessão. O teste de
  regressão nasceu do E2E (`docs/e2e.md` § "O que o E2E já encontrou") e o
  operador de mutação é o que impede o conserto de voltar.
- **O bloqueio manual do cofre não derrubava a barreira.** A emissão de
  `vault:locked` só no caminho do auto-lock é um `if-remove` puro: sem o
  evento, as obras ficavam descifradas na grade. A suíte media a sessão
  (`vault:lock` fecha a sessão) e o auto-lock (evento depois de 5 min), mas
  ninguém juntou os dois.
- **Quatro canais de IPC sem dono no teste da ponte.** `string-empty` em
  `library:reset`, `drive:purge`, `vault:destroy` e `vault:touch` sobreviveram:
  `tests/preload/index.test.ts` conferia os outros canais do grupo, e o mock de
  `ipcRenderer.invoke` devolve o que quiser, então trocar o nome do canal por
  `''` não quebrava nada. Um canal digitado errado só falharia em runtime, no
  clique do usuário. O teste passou a conferir a lista **completa** de cada grupo,
  e `src/preload/index.ts` foi de 85% para **100%** (26/26 mutantes).
