# Credenciais e segredos

Que segredos o app carrega, onde eles moram e o que acontece com eles ao longo
do tempo. O destino de todos é o **cofre** ([`cofre.md`](cofre.md)) em
`/var/lib/.cronologia/.vault`: sem cofre aberto não há segredo nenhum
(falha fechada). O app pergunta se você deseja criar um antes de continuar.

## O que é segredo

| Segredo                    | O que é                                     | Consumidor                           | Antes (legado descartado)      |
| -------------------------- | ------------------------------------------- | ------------------------------------ | ------------------------------ |
| `dropbox.tokens`           | access/refresh token da sessão OAuth (JSON) | `src/main/drive/state.ts`            | `dropbox-tokens.json` (`0600`) |
| `settings.drivePassphrase` | senha de criptografia do backup (scrypt)    | `drive/backup.ts`, `drive/crypto.ts` | `settings.json` (`enc:`/claro) |
| `settings.driveClientId`   | App key alternativa do Dropbox (override)   | `src/main/drive/state.ts`            | Cofre de segredos              |

Os nomes canônicos são a constante `VAULT_SECRET`
(`src/main/vault/secrets.ts`); nenhum consumidor usa string solta.

`DROPBOX_APP_KEY` e `GOOGLE_CLIENT_ID` são variáveis de build: os seus valores
são inseridos no bundle do processo main e não ficam em arquivos do código-fonte.
São identificadores públicos de clientes desktop, não segredos confidenciais.
O `GOOGLE_CLIENT_SECRET`, se configurado, também pode ser extraído do binário;
tokens de usuário e a senha do backup continuam protegidos pelo cofre.

**Não** são segredos do cofre no sentido de _guardados nele como texto_: a biblioteca (`library.enc`), as capas e o
conteúdo cifrado do backup na nuvem e as preferências comuns, inclusive o
`language`, que é o **único** campo persistido fora do cofre
(`settings.json`, `0600`, só idioma).

## Ciclo de vida

1. **Criar**: Configurações → _Criar cofre_ → senha mestra (24 caracteres) e PIN
   (8 dígitos) na primeira etapa, frase de recuperação (12+ palavras) na
   segunda. Há medidor de força na tela, mas a autoridade é o main, que recusa
   formato errado e valor degenerado **antes** de qualquer Argon2id. O cofre
   nasce **aberto**. Qualquer ação que precise de segredo sem cofre (Salvar
   configurações, Conectar, Backup, Restaurar, Desconectar) abre esse mesmo
   fluxo antes de seguir.
2. **Usar**: com o cofre aberto, ler e gravar segredos é transparente
   (`loadSettings`, tokens do Drive). Fechar (botão _Fechar cofre_), reiniciar
   ou ficar 5 minutos ocioso (`auto-lock`) derruba a sessão; aí `loadSettings`
   devolve `''`, `loadState` zera os tokens e gravar lança `vaultLocked`
   (nada é gravado às cegas).
3. **Desbloquear**: qualquer fluxo que precise de segredo (Conectar, Backup,
   Restaurar, Salvar configurações, Desconectar) pede o PIN (ou a senha mestra)
   quando o cofre existe fechado, e só então continua. Sem o PIN, o link
   "esqueci o PIN" redefine o PIN pela frase de recuperação. Sucesso recarrega
   o estado do Drive (os tokens vivem só no cofre).
4. **Rotacionar**: trocar a senha de backup nas Configurações regrava o
   segredo no cofre (com ele aberto). Desconectar apaga `dropbox.tokens` do
   cofre; sem desbloqueio o fluxo é interrompido antes (falha fechada: nada é
   apagado às cegas). Trocar a **senha mestra** ou o **PIN** é operação
   própria (Configurações → _Trocar a senha mestra_ / _Trocar o PIN_), exige o
   cofre aberto e a credencial atual, e só reescreve o embrulho da chave — o
   acervo em disco não é tocado.
5. **Reparo da pasta**: se `/var/lib/.cronologia/.vault` não puder ser
   escrita, a criação do cofre pede sudo pelo PolicyKit e tenta de novo
   (ver [`cofre.md`](cofre.md) § Criação e reparo da pasta).
6. **Sem keyring**: o cofre **não** depende do `safeStorage` do SO; a senha
   mestra protege tudo por conta própria. Não há mais caminho em claro
   nem `safeStorage` em nenhum fluxo.

## Força das credenciais

A régua é de `src/shared/strength.ts` e é a **mesma função** nos dois processos:
o renderer mostra a nota e o main recusa (`blocked`). Duas decisões separadas:

- o que é **trivial** recusa (só o degenerado): caractere repetido, sequência
  ±1, bloco repetido, PIN com cara de data, frase com poucas palavras distintas;
- o nível e os motivos são heurística para orientar quem digita, e nunca
  bloqueiam sozinhos.

| Credencial       | Formato       | Recusa quando...                                |
| ---------------- | ------------- | ----------------------------------------------- |
| Senha mestra     | 24 caracteres | fora do comprimento, ou `a…`/`abc…`/sequência   |
| PIN do dia a dia | 8 dígitos     | fora do formato, ou repetido/sequência/**data** |
| Frase            | 12+ palavras  | poucas palavras, ou quase tudo repetido         |

PIN com cara de data (`01012020`) recusa de propósito: é o primeiro palpite de
qualquer ataque a PIN de 8 dígitos, e não há motivo para o app aceitar o que o
atacante já tem na ponta da lista.

A trava exponencial (10 s até 24 h) protege as três da força bruta, e é
**compartilhada** entre elas: um contador por credencial daria ao atacante que
escolhe o método uma contagem maior que a do app.

## Sem cofre: falha fechada

- `loadSettings` devolve `driveClientId: ''`, `drivePassphrase: ''` e o
  `language` do disco; `saveSettings` lança `vaultLocked` **antes** de tocar
  no disco.
- `loadState` zera os tokens na memória; `persistState` lança `vaultLocked`
  (a desconexão, que só limpa, continua funcionando: `clearSecret` é melhor
  esforço).
- O app nunca quebra por causa disso: a UI abre o cria-cofre e o fluxo continua
  depois do desbloqueio.

## Legado: sem migração, e sem varredura

**Não existe migração.** Nada é importado de instalações antigas: o app não lê
o segredo antigo para colocá-lo no cofre.

Desde a 2.0 também não existe **varredura** de resíduo antigo. O container v1
do cofre não tem caminho de leitura (um arquivo de versão diferente é recusado
como `vaultTampered`), o manifesto v1 do backup é tratado como não aproveitável,
e nenhuma versão atual escreve token do Dropbox em claro (`dropbox-tokens.json`,
`drive-tokens.json`), nem campo `enc:` no `settings.json`, nem acervo sem o
sufixo `.enc`, nem pasta `.vault` em `~/.config`. Varrer arquivos que o app
não escreve é código que só promete uma proteção que ninguém precisa, e ele
saiu junto com a migração.

O que sobrou em `src/main/cleanup.ts` é a varredura de **`.tmp` órfão**, que
protege o app de hoje (escrita interrompida não tem outro dono) e vale para
qualquer versão. O `settings.json` vivo continua sendo regravo só com o idioma
(no primeiro salvamento posterior).

## Ver também

- [`cofre.md`](cofre.md) (formato, KDF, trava, sessão, reparo da pasta)
- [`api.md`](api.md) §6 (canais `vault:*` e códigos de erro)
- [`dropbox.md`](dropbox.md) (sessão OAuth e backup)
- [`telas.md`](telas.md) (Configurações: linha do cofre e botões)
