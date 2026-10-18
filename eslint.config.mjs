import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

/**
 * A fronteira que o AGENTS.md escreve é "o renderer não toca disco, rede nem
 * Node direto". No Cronologia ela vira regra: `fs`, `electron` e
 * `child_process` não entram em `src/renderer/**`, e no preload só o próprio
 * `electron` (a ponte é CommonJS e sandboxed por isso).
 *
 * No `src/main/**` o `fs` é concedido: o processo main **é** a camada Node do
 * app (persistência em `library.ts`/`settings.ts`, cifragem em `store-crypto.ts`,
 * pasta do cofre em `vault/`). O que continua nomeado é o resto: `electron` só
 * nos três módulos que usam a superfície do Electron por natureza (janela/IPC,
 * scheme, abertura externa) e `child_process` só em `vault/privilege.ts`, que é
 * o único que fala com o PolicyKit (ver `docs/cofre.md`).
 */

const RENDERER_MESSAGE =
  'O renderer não toca disco, rede nem Node: ele só conhece `window.api` e os bundles de `@zero/messages`.';

const ELECTRON_MESSAGE =
  'A superfície do Electron fica com o entrypoint e com os módulos que a usam por natureza (janela/IPC, scheme, abertura externa). Um módulo de domínio que precisa de Electron é sinal de que a fronteira mudou.';

const SPAWN_MESSAGE =
  'Só `vault/privilege.ts` fala com o PolicyKit (pkexec). Qualquer outro módulo que queira elevar privilégio passa por ele.';

const FS_MESSAGE =
  'I/O de disco só no processo main: o renderer e o preload não tocam o sistema de arquivos.';

const OWNER_MESSAGE = {
  fs: FS_MESSAGE,
  electron: ELECTRON_MESSAGE,
  spawn: SPAWN_MESSAGE,
};

/** Módulos de sistema, por capacidade. */
const CAPABILITIES = {
  fs: ['fs', 'node:fs', 'fs/promises', 'fs-extra'],
  electron: ['electron', 'node:electron'],
  spawn: ['child_process', 'node:child_process'],
};

/** Sintaxe banida no repositório inteiro. */
const BANNED_SYNTAX = [
  { selector: 'ForInStatement', message: 'Evite for-in: use Object.entries()/Object.keys().' },
  { selector: 'LabeledStatement', message: 'Labels não são permitidos.' },
  { selector: 'WithStatement', message: 'With não é permitido.' },
];

/**
 * Guarda de ambiente: as duas variáveis que movem o cofre são lidas em
 * `vault/vault.ts` e `vault/privilege.ts`, e `ELECTRON_RENDERER_URL` decide o que
 * a janela carrega. Qualquer outro módulo lendo-as seria um caminho de
 * redirecionamento do cofre (ou do bundle servido), e é por isso que o dono é
 * nomeado em vez de a regra valer para todo o `src/`.
 */
const ENV_GUARD = [
  {
    selector:
      'MemberExpression[computed=false][property.name=/^(CRONOLOGIA_VAR_LIB|CRONOLOGIA_VAULT_DIR|ELECTRON_RENDERER_URL)$/]',
    message:
      'As variáveis que movem o cofre são lidas em vault/store.ts (e vault/privilege.ts); ELECTRON_RENDERER_URL, em main/index.ts. Em outro módulo, isto é um caminho de redirecionamento.',
  },
];

const VAULT_ENV_OWNERS = [
  'src/main/vault/store.ts',
  'src/main/vault/privilege.ts',
  'src/main/index.ts',
];

/** Módulos do `main` que usam a superfície do Electron por natureza. */
const ELECTRON_OWNERS = ['src/main/index.ts', 'src/main/protocols.ts', 'src/main/external.ts'];

/**
 * Aliases que cada camada pode usar, e os que não pode. É a matriz de camadas
 * do AGENTS.md (o renderer só com `window.api` e `@zero/messages`, o preload
 * só com `@zero/types`), transformada em regra.
 */
const LAYERS = {
  'src/types/**/*.ts': {
    allow: ['@zero/types'],
    deny: [
      '@zero/messages',
      '@zero/shared/*',
      '@zero/main/*',
      '@zero/preload/*',
      '@zero/renderer/*',
    ],
    granted: [],
  },
  'src/messages/**/*.ts': {
    allow: ['@zero/messages', '@zero/types'],
    deny: ['@zero/shared/*', '@zero/main/*', '@zero/preload/*', '@zero/renderer/*'],
    granted: [],
  },
  // Camada de regras puras: o renderer valida o que está sendo digitado e o
  // main valida de novo antes de gravar, então as duas precisam das mesmas
  // funções. Sem Node e sem DOM, para rodar nos dois processos.
  'src/shared/**/*.ts': {
    allow: ['@zero/shared/*', '@zero/types'],
    deny: ['@zero/messages', '@zero/main/*', '@zero/preload/*', '@zero/renderer/*'],
    granted: [],
  },
  'src/main/**/*.ts': {
    allow: ['@zero/main/*', '@zero/messages', '@zero/shared/*', '@zero/types'],
    deny: ['@zero/preload/*', '@zero/renderer/*'],
    // O `fs` é a natureza da camada main; `electron` e `spawn` são nomeados
    // por arquivo, logo abaixo.
    granted: ['fs'],
  },
  'src/preload/**/*.ts': {
    allow: ['@zero/types', '@zero/shared/*'],
    deny: ['@zero/main/*', '@zero/messages', '@zero/renderer/*'],
    granted: ['electron'],
    messages: { fs: RENDERER_MESSAGE, spawn: RENDERER_MESSAGE },
  },
  'src/renderer/**/*.{ts,tsx}': {
    allow: ['@zero/renderer/*', '@zero/messages', '@zero/shared/*', '@zero/types'],
    deny: ['@zero/main/*', '@zero/preload/*'],
    granted: [],
    messages: { fs: RENDERER_MESSAGE, spawn: RENDERER_MESSAGE, electron: RENDERER_MESSAGE },
  },
};

/**
 * `no-restricted-imports` de uma camada: barra caminho relativo, barra os
 * aliases das outras camadas e barra os módulos de sistema que a camada não
 * recebeu por `granted`.
 */
const layerImports = (label, { allow, deny, granted, messages = {} }) => [
  'error',
  {
    patterns: [
      {
        group: ['../*', '../../*', '../../../*', '../../../../*'],
        message:
          'Dentro de src/ só os aliases @zero/* (AGENTS.md): nada de caminho relativo entre pastas.',
      },
      ...deny.map((name) => ({
        group: [name],
        message: `Fronteira de camada: ${label} só importa ${allow.join(', ')}. O grafo de camadas do AGENTS.md é contrato, não sugestão.`,
      })),
    ],
    paths: Object.entries(CAPABILITIES)
      .filter(([capability]) => !granted.includes(capability))
      .flatMap(([capability, modules]) =>
        modules.map((name) => ({
          name,
          message: messages[capability] ?? OWNER_MESSAGE[capability],
        })),
      ),
  },
];

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'release/**',
      'node_modules/**',
      'build/**',
      'coverage/**',
      // Artefatos da varredura de mutação (`.gitignore` também tira, mas o
      // ESLint não lê o `.gitignore`).
      'mutation/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ----- type-safety máximo -----
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      'no-restricted-syntax': ['error', ...BANNED_SYNTAX],
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unnecessary-template-expression': 'error',
      '@typescript-eslint/no-array-delete': 'error',
      '@typescript-eslint/no-duplicate-type-constituents': 'error',
      '@typescript-eslint/no-implied-eval': 'error',
      '@typescript-eslint/no-base-to-string': 'error',
      '@typescript-eslint/restrict-plus-operands': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/unbound-method': 'error',
      '@typescript-eslint/require-await': 'error',
      '@typescript-eslint/prefer-find': 'error',
      '@typescript-eslint/prefer-includes': 'error',
      '@typescript-eslint/prefer-string-starts-ends-with': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/no-meaningless-void-operator': 'error',
      '@typescript-eslint/return-await': ['error', 'in-try-catch'],
      '@typescript-eslint/no-deprecated': 'error',
      '@typescript-eslint/no-unnecessary-type-parameters': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowDirectConstAssertionInArrowFunctions: true,
        },
      ],
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        { accessibility: 'explicit', overrides: { constructors: 'no-public' } },
      ],
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowString: false,
          allowNumber: false,
          allowNullableObject: false,
          allowNullableBoolean: false,
          allowNullableString: false,
          allowNullableNumber: false,
          allowAny: false,
        },
      ],
      '@typescript-eslint/no-unused-expressions': [
        'error',
        { allowShortCircuit: true, allowTernary: true, allowTaggedTemplates: false },
      ],

      // ----- escapes de type-safety que ninguém deve usar -----
      // `@ts-ignore` cala o compilador inteiro; `@ts-expect-error` é a forma
      // honesta porque some sozinho quando o tipo deixa de divergir.
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/prefer-ts-expect-error': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
          disallowTypeAnnotations: false,
        },
      ],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/no-var-requires': 'error',
      '@typescript-eslint/no-invalid-void-type': 'error',
      '@typescript-eslint/no-wrapper-object-types': 'error',
      '@typescript-eslint/no-unsafe-declaration-merging': 'error',
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
      '@typescript-eslint/no-confusing-non-null-assertion': 'error',
      '@typescript-eslint/no-duplicate-enum-values': 'error',
      '@typescript-eslint/no-loss-of-precision': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
      '@typescript-eslint/no-unnecessary-parameter-property-assignment': 'error',
      '@typescript-eslint/no-unnecessary-qualifier': 'error',
      '@typescript-eslint/prefer-return-this-type': 'error',
      '@typescript-eslint/no-unused-private-class-members': 'error',
      '@typescript-eslint/no-useless-default-assignment': 'error',
      '@typescript-eslint/no-useless-empty-export': 'error',
      '@typescript-eslint/no-mixed-enums': 'error',
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: false }],
      '@typescript-eslint/no-empty-object-type': 'error',
      '@typescript-eslint/no-restricted-types': [
        'error',
        {
          types: {
            String: 'Tipo objeto String: use o primitivo string.',
            Number: 'Tipo objeto Number: use o primitivo number.',
            Boolean: 'Tipo objeto Boolean: use o primitivo boolean.',
            Symbol: 'Tipo objeto Symbol: use o primitivo symbol.',
            Function: 'Function é sem tipo: descreva a assinatura.',
            Object: 'Object não é o mesmo que unknown: use unknown.',
          },
        },
      ],

      // ----- o que se lança -----
      // `no-throw-literal` barra o literal, mas deixa passar `throw objeto`.
      // `only-throw-error` fecha esse buraco: em `src/` vale nas opções mais
      // duras, e quem tem o privilégio de lançar valor não-Erro é o bloco dos
      // testes, com o motivo escrito lá.
      '@typescript-eslint/only-throw-error': 'error',

      // ----- boas práticas gerais -----
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-wrappers': 'error',
      'no-throw-literal': 'error',
      'no-void': ['error', { allowAsStatement: true }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': ['error', 'properties'],
      'prefer-template': 'error',
      'prefer-arrow-callback': 'error',
      curly: ['error', 'all'],
      'dot-notation': 'error',
      'no-implicit-coercion': ['error', { boolean: false, number: false, string: false }],
      'no-lonely-if': 'error',
      'no-unneeded-ternary': 'error',
      'no-useless-rename': 'error',
      'no-duplicate-imports': 'off',

      // ----- armadilhas clássicas: aqui o bug é silencioso -----
      'accessor-pairs': 'error',
      'array-callback-return': ['error', { allowImplicit: true }],
      'block-scoped-var': 'error',
      'default-case': 'error',
      'default-case-last': 'error',
      'func-name-matching': 'error',
      'getter-return': 'error',
      'guard-for-in': 'error',
      'grouped-accessor-pairs': 'error',
      'no-array-constructor': 'error',
      'no-const-assign': 'error',
      'no-constructor-return': 'error',
      'no-dupe-args': 'error',
      'no-dupe-class-members': 'error',
      'no-dupe-keys': 'error',
      'no-empty-function': ['error', { allow: ['arrowFunctions', 'functions', 'methods'] }],
      'no-extend-native': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-invalid-this': 'error',
      'no-iterator': 'error',
      'no-label-var': 'error',
      'no-loop-func': 'error',
      'no-lone-blocks': 'error',
      'no-misleading-character-class': 'error',
      'no-multi-assign': 'error',
      'no-new-func': 'error',
      'no-new-native-nonconstructor': 'error',
      'no-new-object': 'error',
      'no-new-symbol': 'error',
      'no-object-constructor': 'error',
      'no-octal-escape': 'error',
      'no-path-concat': 'error',
      'no-proto': 'error',
      'no-return-assign': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-setter-return': 'error',
      'no-underscore-dangle': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unreachable-loop': 'error',
      'no-unsafe-negation': 'error',
      'no-useless-catch': 'error',
      'no-useless-computed-key': 'error',
      'no-useless-concat': 'error',
      'no-useless-constructor': 'error',
      'no-useless-return': 'error',
      'prefer-exponentiation-operator': 'error',
      'prefer-object-spread': 'error',
      'prefer-promise-reject-errors': 'error',
      'prefer-regex-literals': 'error',
      radix: 'error',
      'require-yield': 'error',
      'symbol-description': 'error',

      // ----- limites estruturais: teto de tamanho e de aninhamento -----
      'max-depth': ['error', 4],
      'max-nested-callbacks': ['error', 4],
      'max-params': ['error', 5],
      'default-param-last': 'error',
      'no-else-return': 'error',
      '@typescript-eslint/require-array-sort-compare': ['error', { ignoreStringArrays: true }],
    },
  },
  /*
   * Fronteiras do `src/`, que valem para todas as camadas.
   */
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      // O teto de ~500 linhas do AGENTS.md, medido em código (sem linha em
      // branco nem comentário), com folga: um módulo acima disso já tem duas
      // tarefas e o próximo passo é extrair.
      'max-lines': ['error', { max: 520, skipBlankLines: true, skipComments: true }],
      'no-restricted-syntax': ['error', ...BANNED_SYNTAX, ...ENV_GUARD],
      '@typescript-eslint/no-shadow': 'error',
      'no-process-exit': 'error',
      'no-script-url': 'error',
      'no-restricted-globals': [
        'error',
        { name: 'eval', message: 'eval é execução de código arbitrário.' },
        { name: 'Function', message: 'Construtor Function é eval disfarçado.' },
        { name: 'WebAssembly', message: 'WASM não faz parte do app empacotado.' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'binding',
          message: 'API interna de Node, sem aviso de remoção.',
        },
        {
          object: 'process',
          property: 'dlopen',
          message: 'API interna de Node, sem aviso de remoção.',
        },
      ],
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat['recommended-latest'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // As regras do compilador que o `recommended-latest` não traz: efeito com
      // dependências incompletas, memo com dependências erradas e a
      // supressão de qualquer regra de hook por `eslint-disable`.
      'react-hooks/exhaustive-effect-dependencies': 'error',
      'react-hooks/memo-dependencies': 'error',
      'react-hooks/memoized-effect-dependencies': 'error',
      'react-hooks/no-deriving-state-in-effects': 'error',
      'react-hooks/rule-suppression': 'error',
      'react-hooks/invariant': 'error',
    },
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'electron.vite.config.mts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // `vault/vault.ts`, `vault/privilege.ts` e `main/index.ts` são os donos do
  // ambiente, então o guarda de `CRONOLOGIA_*`/`ELECTRON_RENDERER_URL` não vale
  // para eles (o resto do `src/` continua valendo).
  {
    files: VAULT_ENV_OWNERS,
    rules: {
      'no-restricted-syntax': ['error', ...BANNED_SYNTAX],
    },
  },
  // Matriz de camadas: cada entrada declara o que a camada concede, então quem
  // pertence a dois grupos (`index.ts`, Electron e `fs`) é listado por último e
  // vale a concessão maior.
  ...Object.entries(LAYERS).map(([files, spec]) => ({
    files: [files],
    rules: { 'no-restricted-imports': layerImports(files, spec) },
  })),
  {
    files: ELECTRON_OWNERS,
    rules: {
      'no-restricted-imports': layerImports('src/main', {
        ...LAYERS['src/main/**/*.ts'],
        granted: ['fs', 'electron'],
      }),
    },
  },
  {
    files: ['src/main/vault/privilege.ts'],
    rules: {
      'no-restricted-imports': layerImports('src/main', {
        ...LAYERS['src/main/**/*.ts'],
        granted: ['fs', 'spawn'],
      }),
    },
  },
  {
    // `no-throw-literal` cede lugar à variante tipada nos testes, porque lá o
    // valor lançado é parte do que se está testando: boa parte das defesas do
    // main só existe porque o valor lançado **não** é um `Error`, e o jeito
    // honesto de expressar "isto é desconhecido em tempo de compilação" é o
    // tipo `unknown`. `any` e literal continuam barrados.
    files: ['tests/**/*.{ts,tsx}', 'e2e/**/*.ts', 'tools/**/*.ts'],
    rules: {
      'no-throw-literal': 'off',
      '@typescript-eslint/only-throw-error': [
        'error',
        { allowThrowingAny: false, allowThrowingUnknown: true },
      ],
    },
  },
  {
    // O teto de tamanho vale para os módulos do app (bloco do `src/`). Fora
    // dele a folga é maior porque teste e ferramenta de mutação são tabelas de
    // caso e um runner: quebrar a 500 linhas não melhora o desenho, e o teto
    // continua existindo para pegar crescimento sem fim.
    files: ['tests/**/*.{ts,tsx}', 'e2e/**/*.ts', 'tools/**/*.ts'],
    rules: {
      'max-lines': ['error', { max: 750, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['*.mjs', '*.js'],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      // O config em si é JavaScript puro: não há tipo para anotar, e
      // `explicit-function-return-type` continua valendo em `src/`.
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
  prettier,
);
