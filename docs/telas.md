# Telas e componentes

O estado fica no topo (`App.tsx`) e as telas são controladas: o app abre a
grade e mostra os modais por cima (obra, configurações, atribuições, doações).
Todo texto vem do contexto de idioma (`useMessages()`), nunca embutido no JSX.

## Componentes (`src/renderer/src/`)

| Componente                            | Papel                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------- |
| `App.tsx`                             | Carrega biblioteca/status/config, busca, filtros, estatísticas e modais    |
| `components/WorkCard.tsx`             | Card da obra: capa, badges, barra e ações de progresso/status              |
| `components/WorkModal.tsx`            | Criar/editar obra (capa, campos, progresso, excluir com confirmação)       |
| `components/SettingsModal.tsx`        | Configurações: idioma, cofre, provedores, senha de backup e ações do Drive |
| `components/VaultModal.tsx`           | Escolhe o fluxo do cofre: criação ou abertura                              |
| `components/VaultCreateSteps.tsx`     | Criar o cofre em duas etapas (senha mestra + PIN, depois a frase)          |
| `components/VaultUnlockSteps.tsx`     | Abrir pelo PIN/senha mestra, com "esqueci o PIN" pela frase                |
| `components/CredentialModal.tsx`      | Trocar a senha mestra ou o PIN com o cofre aberto                          |
| `components/VaultShell.tsx`           | Casca dos modais de cofre (cabeçalho, ações, botão com spinner)            |
| `components/StrengthMeter.tsx`        | Medidor de força da credencial (nota + motivo)                             |
| `components/VaultBanners.tsx`         | Aviso de erro, aviso de trava com contagem e atalho de Enter               |
| `components/RestorePasswordModal.tsx` | Pede a senha de criptografia para restaurar o backup                       |
| `components/AttributionsModal.tsx`    | Créditos das dependências em rolagem (pós-créditos)                        |
| `components/DonateModal.tsx`          | Página de doação (Mercado Pago: abrir e copiar o link)                     |
| `components/Select.tsx`               | Select custom acessível (teclado, `aria`, busca opcional)                  |
| `components/DateField.tsx`            | Data digitada à mão: números livres com máscara do idioma, sem calendário  |
| `i18n.tsx`                            | `MessagesProvider`, `useMessages()`, `useLanguage()`, `richText()`         |
| `constants.ts`                        | Opções de filtro/tipo/status, cores, `clampProgress`, `coverUrl`           |
| `donations.ts`                        | Constantes do link de doação (`DONATION_URL`)                              |
| `attributions.ts`                     | Fonte de verdade dos créditos (`ATTRIBUTIONS`)                             |

## Cabeçalho

| Elemento        | Comportamento                                                               |
| --------------- | --------------------------------------------------------------------------- |
| Busca           | Filtra por título, sinopse ou categoria, instantaneamente                   |
| Chips de filtro | Todos, Lendo, Planejados, Pausados, Concluídos, Cancelados                  |
| Pílula do Drive | Estado do backup (ponto `on`/`busy`/vazio + rótulo); **abre Configurações** |
| **Atribuições** | Abre `AttributionsModal`                                                    |
| **Doar**        | Abre `DonateModal`                                                          |
| Engrenagem      | Abre `SettingsModal`                                                        |
| **Nova obra**   | Abre `WorkModal` em modo de criação                                         |

A linha de estatísticas (total, por status e % médio) acompanha **o que está
sendo exibido** (busca + filtro); o restante continua com o total da
biblioteca.

## Estados da grade

1. **Carregando**: spinner com texto de carregamento.
2. **Biblioteca vazia**: título, texto e botão **Adicionar a primeira obra**.
3. **Sem resultado para a busca**: título/texto diferentes (a biblioteca tem
   obras, mas nada bate com o termo/filtro).
4. **Grade**: `WorkCard` ordenado pela última atualização (mais recente
   primeiro).

## WorkCard

- Capa servida por `cover://` (ou placeholder), badges de tipo e status.
- Marcador (`Cap. 45`) e categoria, quando preenchidos.
- Barra de progresso (obra `concluída` mostra 100%).
- Ações (com `stopPropagation`: clicar aqui não abre o modal):
  - `↑` / `↓`: progresso ±1 (mínimo 0);
  - obra `concluída` → só **Reabrir**; `cancelada` → só **Retomar**;
  - demais → **Concluir**, **Pausar**/**Retomar** e **Cancelar**.
- Clicar no card abre o `WorkModal` de edição.

## WorkModal

- Capa: prévia + **Escolher imagem** (diálogo nativo, `cover:pick`) e
  **Remover capa**.
- Campos: título (obrigatório; erro em banner), sinopse, tipo, status,
  categoria (select pesquisável) e marcador.
- Datas de início e término (`DateField`): a pessoa digita os números como
  quiser (`10022026`, `10/02/2026`, `5/6/26`) e o campo mostra a máscara do
  idioma (`10/02/2026`, `DD/MM/AAAA`); o calendário do navegador não aparece. O
  que fica gravado é sempre ISO (`YYYY-MM-DD`), e o card mostra a data no mesmo
  formato do campo. Data que não existe (31 de fevereiro) ou pela metade
  avisa no campo e **bloqueia o salvamento** — a data guardada continua sendo a
  última válida.
- Progresso: campo numérico, `−10`/`+10`, percentual, **Concluir** e **Zerar**
  (volta para 0 e `planejado`).
- Exclusão só em modo de edição, com confirmação em dois cliques no próprio
  botão. `Escape` ou clique fora fecha.

## SettingsModal

- **Idioma**: select que persiste em `settings.json` e troca a UI na hora.
- **Provedores de backup**: catálogo com selo operante/não operante, destino
  (pasta oculta) e motivo da indisponibilidade (`docs/backup-providers.md`).
- **Senha de criptografia do backup**: campo de senha ligado ao
  `drivePassphrase`, gravado **no cofre** (nada fica em claro no disco; não há
  banner de keyring: o cofre não depende do `safeStorage` do SO).
- **Cofre**: linha com o estado (Aberto/Fechado/Sem cofre) e o botão
  _Criar cofre_ / _Desbloquear_ / _Fechar cofre_, que abre o `VaultModal`.
  Todo fluxo que precisa de segredo (Salvar, Conectar, Backup, Restaurar,
  Desconectar) passa por `ensureVault`: sem cofre abre a **criação**, com ele
  fechado abre o **desbloqueio**, e a ação só roda depois com o cofre aberto
  (`docs/credenciais.md`).
- **Zona de risco** (`DangerZone`): as três ações destrutivas, cada uma com
  **confirmação em duas etapas** (o botão abre o aviso e um campo exige a
  palavra `APAGAR`, ou `DESTRUIR` no caso do cofre). Apagar backup só aparece
  habilitado com conta conectada.
- **Meta do Drive**: conexão, último backup e obras no backup.
- **Rodapé**: Desconectar, Salvar, Conectar (OAuth), Restaurar (abre
  `RestorePasswordModal`) e Fazer backup agora; ações ocupadas mostram
  spinner e travam o resto.

O botão **Conectar ao `<provedor>`** acompanha o provedor escolhido no seletor
logo acima, ícone incluso. Isso não é cosmético: `drive.auth` do main autoriza
o provedor **ativo**, e o destino só muda quando `drive:setProvider` é aplicado.
Um rótulo que não acompanhasse a escolha faria a pessoa autorizar a conta
certa na conta errada.

### Seletor de provedor e build sem chave

O seletor só lista os provedores que **este build** consegue usar
(`operational`, que vem de `hasGoogleCredentials()`/`appKey()` no main). Não é
filtro de UI arbitrário: sem a chave embutida no binário, o OAuth falharia na
hora de autorizar, e oferecer a escolha seria pior que não oferecer.

Com nenhum provedor operante o seletor fica desabilitado **e explica o motivo**
(`m.settings.noOperationalProvider`, em `.help.warn`), porque um controle
desabilitado sem nenhuma linha embaixo lê como interface quebrada. O motivo
específico de cada provedor segue na lista do catálogo, com o texto que o main
devolveu.

Ver `docs/backup-providers.md` para onde cadastrar as chaves (`.env` local ou
Secrets and variables → Actions no CI) e `docs/build.md` para a conferência que
o `publish.yml` faz antes de publicar.

## VaultModal

Abre em dois contextos:

- **tela inteira** (`App.tsx`): o acervo é cifrado com a chave do cofre, então
  abrir o app sem ele mostra o modal **sem botão de fechar**. Sem a senha
  mestra não há biblioteca para mostrar, e o acervo que ficava na tela some
  quando o auto-lock fecha a sessão.
- **acionado pelas Configurações**: com fechar e cancelar, para criar,
  desbloquear ou fechar o cofre sem sair da tela.

## Erros e avisos

- Toasts de sucesso/erro (3,5 s) vindo do `notify` do `App.tsx` ou do próprio
  modal; erros de operação aparecem em `banner error` dentro do modal afetado.
- As mensagens de erro do processo main chegam **já localizadas** no idioma
  corrente, então o idioma escolhido em Configurações vale também para elas.
- Marcos ricos (`**negrito**` e `` `código` ``) são renderizados por
  `richText()` (`docs/messages.md`).
