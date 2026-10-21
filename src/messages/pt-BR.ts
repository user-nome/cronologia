/**
 * Mensagens em português (Brasil): canônico de todas as chaves e assinaturas.
 *
 * Cada idioma é um objeto com a mesma forma (`Messages = typeof ptBR`); o
 * TypeScript aponta qualquer chave ou parâmetro faltando no `en.ts`. Strings
 * com parâmetro são funções. Marcadores de formatação rica (só na UI):
 * `**negrito**` e `` `código` ``. Regras e mais detalhes: `docs/messages.md`.
 */
export const ptBR = {
  common: {
    close: 'Fechar',
    cancel: 'Cancelar',
    save: 'Salvar',
    saving: 'Salvando…',
    loading: 'Carregando…',
    select: 'Selecione',
    none: 'Nenhuma',
    notFound: 'Não encontrado',
    searchOptions: 'Digite para filtrar…',
    clearSearch: 'Limpar busca',
    noOptionsFound: 'Nenhuma opção encontrada',
    next: 'Avançar',
    back: 'Voltar',
    invalidDate: (mask: string): string => `Data inválida. Use o formato ${mask}.`,
  },

  dialogs: {
    pickCover: 'Escolher imagem da capa',
    imageFilter: 'Imagens',
  },

  app: {
    headerStats: (total: number, average: number): string =>
      `${total} obra(s) · progresso médio ${average}%`,
    searchPlaceholder: 'Buscar por título…',
    openSettingsTitle: 'Configurações do backup no Dropbox',
    openAttributionsTitle: 'Ver atribuições e licenças das dependências',
    openDonateTitle: 'Apoie o projeto com uma doação',
    settingsTitle: 'Configurações',
    attributionsLabel: 'Atribuições',
    donateLabel: 'Doar',
    newWork: 'Nova obra',
    filters: {
      todos: 'Todos',
      lendo: 'Lendo',
      planejado: 'Planejados',
      pausado: 'Pausados',
      concluido: 'Concluídos',
      cancelado: 'Cancelados',
    },
    stats: {
      total: 'Total de obras',
      reading: 'Lendo',
      done: 'Concluídas',
      planned: 'Planejadas',
      paused: 'Pausadas',
      cancelled: 'Canceladas',
      average: 'Progresso médio',
    },
    loadingLibrary: 'Carregando biblioteca…',
    emptyFoundTitle: 'Nenhuma obra encontrada',
    emptyFoundText: 'Tente outro filtro ou termo de busca.',
    emptyLibraryTitle: 'Sua biblioteca está vazia',
    emptyLibraryText: 'Adicione a sua primeira obra com capa e título e acompanhe o progresso.',
    addFirstWork: 'Adicionar primeira obra',
    drivePill: {
      syncing: 'Sincronizando…',
      connected: 'Dropbox conectado',
      off: 'Dropbox desconectado',
    },
    toastSaveError: 'Não foi possível salvar a obra.',
    toastSaved: 'Obra salva.',
    toastRemoved: 'Obra removida.',
    startupFailed: (detail: string): string =>
      `Não foi possível iniciar o Cronologia.\n\nDetalhes técnicos: ${detail}`,
  },

  settings: {
    title: 'Configurações',
    bannerTitle: (label: string): string => `Backup no ${label}.`,
    bannerBodyDropbox:
      'Sua biblioteca é gravada na pasta reservada do app (dentro de `/Apps/` na sua conta): ' +
      'pela API, só este aplicativo enxerga essa pasta, e o resto do seu Dropbox nem aparece ' +
      'para ele. Como a pasta é visível para você, todo arquivo sobe com nome ilegível e ' +
      'conteúdo criptografado (AES-256-GCM), então defina a senha de criptografia abaixo ' +
      'antes do primeiro backup.',
    bannerBodyGoogle:
      'Este build guarda sua biblioteca na pasta oculta do app (o `appDataFolder` do ' +
      'Google Drive), que **não aparece** na interface do Google Drive e que este app ' +
      'enxerga sozinho: o único escopo pedido é o dessa pasta. Todo arquivo sobe com ' +
      'nome ilegível e conteúdo criptografado (AES-256-GCM), então defina a senha de ' +
      'criptografia abaixo antes do primeiro backup.',
    languageLabel: 'Idioma',
    providersLabel: 'Provedores de backup',
    noOperationalProvider:
      'Nenhum provedor de backup está disponível neste build: as chaves do cliente ' +
      'não foram embutidas no binário. O motivo de cada um está na lista abaixo.',
    hiddenFolder: 'Pasta oculta',
    operational: 'Operante',
    notOperational: 'Não operante',
    backupIn: (target: string): string => `Backup em ${target}`,
    passphraseLabel: 'Senha de criptografia do backup',
    passphrasePlaceholder: (label: string): string =>
      `Usada para criptografar o backup no ${label}`,
    connected: 'Conectado',
    disconnected: 'Desconectado',
    accountFallback: (label: string): string => `Conta ${label}`,
    lastBackup: 'Último backup',
    inBackup: (label: string): string => `No backup do ${label}`,
    worksInBackup: (works: number): string => `${works} obra(s)`,
    syncingBanner: (label: string): string => `Sincronizando com o ${label}…`,
    disconnectTitle: (label: string): string => `Desconecta a conta ${label} deste aplicativo`,
    disconnectAction: 'Desconectar',
    authorizing: 'Autorizando…',
    connectAction: (label: string): string => `Conectar ao ${label}`,
    restoreTitle: (label: string): string =>
      `Baixa o backup do ${label} e substitui a biblioteca atual`,
    restoreAction: 'Restaurar',
    restoring: 'Restaurando…',
    backupAction: 'Fazer backup agora',
    sending: 'Enviando…',
    toastSaved: 'Configurações salvas.',
    toastAuthFailed: 'Falha na autorização.',
    toastConnected: (label: string): string => `Conta ${label} conectada com sucesso.`,
    toastBackupFailed: 'Falha no backup.',
    toastBackupDone: (label: string): string => `Backup concluído na pasta do app no ${label}.`,
    toastRestoreFailed: 'Falha ao restaurar.',
    toastRestored: (works: number): string => `Backup restaurado com ${works} obra(s).`,
    toastDisconnected: (label: string): string => `Conta ${label} desconectada.`,
    toastPurgeFailed: 'Não foi possível apagar o backup na nuvem.',
    providerSwitched: (label: string): string => `Backup agora vai para o ${label}.`,
    providerSwitchFailed: 'Não foi possível trocar o provedor de backup.',
    translationNotice: {
      title: 'Aviso sobre traduções',
      text: 'Eu não falo nenhum desses idiomas com exceção do português, e toda a tradução é feita por IA. Como tudo nesse mundo, pode haver falhas, então peço um pouco de paciência.',
      translationNotice2:
        'Se você quiser ajudar a melhorar a tradução, abra uma issue no repositório do projeto.',
    },
  },

  restore: {
    title: 'Senha do backup',
    banner: (label: string): string =>
      `Informe a senha de criptografia usada ao **fazer o backup** no ${label}. ` +
      'Ela é obrigatória para decifrar os arquivos baixados.',
    passphraseLabel: 'Senha de criptografia',
    passphrasePlaceholder: 'Senha usada no backup',
    action: 'Restaurar',
  },

  workModal: {
    newTitle: 'Nova obra',
    editTitle: 'Editar obra',
    titleRequired: 'Informe o título da obra.',
    saveError: 'Falha ao salvar.',
    coverAlt: 'Prévia da capa',
    coverHelp:
      'Adicione a imagem da capa da obra (JPG, PNG, WebP…). A imagem é copiada para a ' +
      'biblioteca local.',
    chooseImage: 'Escolher imagem',
    removeCover: 'Remover capa',
    titleLabel: 'Título',
    titlePlaceholder: 'Ex.: Solo Leveling',
    synopsisLabel: 'Descrição',
    synopsisPlaceholder: 'Escreva a descrição da obra…',
    typeLabel: 'Tipo',
    statusLabel: 'Status',
    categoryLabel: 'Categoria',
    markerLabel: 'Marcação (opcional)',
    markerPlaceholder: 'Cap. 45 / Vol. 3',
    progressLabel: 'Progresso da leitura',
    decreaseStep: (step: number): string => `Diminuir ${step}`,
    increaseStep: (step: number): string => `Aumentar ${step}`,
    progressValue: (progress: number): string => `Cap. ${progress}`,
    startedAtLabel: 'Início da leitura',
    startedAtPlaceholder: 'DD/MM/AAAA',
    finishedAtLabel: 'Término da leitura',
    finishedAtPlaceholder: 'DD/MM/AAAA',
    finish: 'Concluir',
    reset: 'Zerar',
    confirmDelete: 'Confirmar exclusão?',
    deleteAction: 'Excluir',
  },

  workCard: {
    coverOf: (title: string): string => `Capa de ${title}`,
    untitled: 'Sem título',
    progress: 'Progresso',
    progressValue: (progress: number): string => `Cap. ${progress}`,
    increase1: 'Aumentar 1',
    decrease1: 'Diminuir 1',
    reopen: 'Reabrir',
    resume: 'Retomar',
    finish: 'Concluir',
    pause: 'Pausar',
    cancel: 'Cancelar',
  },

  attributions: {
    ariaLabel: 'Atribuições',
    title: 'Atribuições',
    bannerTitle: 'Créditos do projeto.',
    bannerBody:
      'Estas são as dependências de código aberto usadas no Cronologia, todas com ' +
      'licenças permissivas aprovadas pela OSI. As versões exatas estão em ' +
      '`package.json` / `package-lock.json`.',
    pause: 'Pausar',
    resume: 'Continuar',
    hoverHint: 'Passe o mouse sobre os créditos para pausar.',
    creditsAria: 'Créditos em rolagem',
    creditsSubtitle: 'agradece a estas dependências',
    creditsEnd: 'Fim',
    creditsLoop: 'os créditos recomeçam em loop',
  },

  donate: {
    ariaLabel: 'Doações',
    title: 'Apoie o projeto',
    banner:
      'Com um cafezinho por leitor, a revisão de produção do app saía antes do próximo capítulo.',
    text1:
      'O projeto nasceu pra comunidade otaku: um lugar pra guardar nossas leituras e não ' +
      'perder tudo se perdermos acesso às plataformas favoritas.',
    text2:
      'E eu tô mais quebrado que arroz de quinta: o backup em nuvem depende de um serviço ' +
      'externo e, depois das primeiras 50 contas conectadas, o app tem só 2 semanas pra ser ' +
      'aprovado, senão para de aceitar gente nova. Sua doação ajuda a manter tudo (e a minha ' +
      'paciência) no ar.',
    text3:
      'Na real, o projeto é pessoal: é pra eu acompanhar minhas leituras. E você, otaku ' +
      'compulsivo como eu, sabe o que é ver a plataforma favorita ir de Vasco e perder todo ' +
      'o progresso.',
    text4:
      'Mas se por milagre aparecer doação, faço o possível pra deixar tudo o mais completo ' +
      'possível, aí a gente dorme tranquilo, sem medo de acordar com o histórico de leitura ' +
      'indo de Vasco.',
    openTitle: 'Abre a página de doação no navegador',
    donateNow: 'Doar agora',
    copyTitle: 'Copia o link de doação',
    copyLink: 'Copiar link',
    copied: 'Copiado!',
    thanks: 'Valeu por manter a biblioteca viva e boa leitura!',
  },

  workTypes: {
    webtoon: 'Webtoon',
    manhwa: 'Manhwa',
    manhua: 'Manhua',
    manga: 'Mangá',
    livro: 'Livro',
    outro: 'Outro',
  },

  workStatus: {
    planejado: 'Planejado',
    lendo: 'Lendo',
    pausado: 'Pausado',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
  },

  providers: {
    dropboxStorageTarget: '/Apps/Cronologia (pasta visível na sua conta)',
    googleStorageTarget: 'appDataFolder (pasta oculta, não aparece na interface do Google Drive)',
    googleNoCredentials:
      'Este build não traz credencial do Google Drive: o app é identificado por um par ' +
      'de chaves que entra no binário na publicação. Enquanto esse par não for ' +
      'publicado, o backup usa o Dropbox.',
  },

  driveErrors: {
    notEncrypted: 'Não é um backup criptografado.',
    truncated: 'Backup truncado ou corrompido.',
    definePassphrase: 'Defina uma senha de criptografia do backup nas configurações.',
    needsPassphrase: 'Este backup está criptografado. Informe a senha de criptografia.',
    wrongPassphrase: 'Senha de criptografia incorreta ou backup corrompido.',
    invalidManifest: 'Manifesto do backup inválido.',
    syncInProgress: 'Sincronização já em andamento.',
    connectFirst: (provider: string): string => `Conecte a conta ${provider} primeiro.`,
    providerNotSelected: (provider: string): string =>
      `${provider} não está escolhido como destino do backup. Conecte o destino selecionado.`,
    emptyLibrary: 'Nenhuma biblioteca local para backup. Adicione ao menos uma obra.',
    noBackupFound: (provider: string): string =>
      `Nenhum backup encontrado na pasta do app no ${provider}.`,
    invalidLibrary: 'Backup inválido (library.json corrompido).',
    invalidListResponse: (provider: string): string =>
      `Resposta inválida da API do ${provider} (listagem de arquivos).`,
    tokenTimeout: 'Tempo esgotado aguardando autorização.',
    authCancelled: 'Autorização cancelada.',
    csrfRejected: 'Callback de autorização vindo de outra origem; a conexão foi recusada.',
    tokenFailed: (status: number): string => `Falha ao obter tokens (${status}).`,
    invalidTokenResponse: (status: number): string => `Resposta de tokens inválida (${status}).`,
    configureAppKey: 'Este build não tem DROPBOX_APP_KEY. Configure a variável e recompile.',
    sessionExpired: (provider: string): string =>
      `Sessão expirada. Conecte a conta ${provider} novamente.`,
    refreshFailed: (provider: string): string =>
      `Não foi possível renovar a sessão do ${provider}.`,
    noAccount: (provider: string): string => `Nenhuma conta ${provider} conectada.`,
    permissionsUpdated: (provider: string): string =>
      `Permissões do ${provider} atualizadas. Reconecte a conta ${provider}.`,
    missingScopes: (provider: string): string =>
      `Faltam permissões no app ${provider}. Confira todos os escopos no painel do ` +
      'aplicativo, desconecte e conecte de novo.',
    missingScopesList: (provider: string, missing: string): string =>
      `Faltam permissões no app ${provider} (${missing}). Confira todos os escopos no ` +
      'painel do aplicativo e conecte de novo.',
    providerHttp: (label: string, status: number, response: string): string =>
      response === ''
        ? `Erro do ${label} (HTTP ${status}).`
        : `Erro do ${label} (HTTP ${status}). Resposta: ${response}`,
    restoreLocked: (seconds: number): string =>
      seconds < 60
        ? `Muitas tentativas de restauração com senha errada. Tente novamente em ${seconds} segundos.`
        : `Muitas tentativas de restauração com senha errada. Tente novamente em ${Math.ceil(seconds / 60)} minutos.`,
    purgePartial: (deleted: number, failed: number): string =>
      `${deleted} arquivo(s) apagado(s) na nuvem e ${failed} pendente(s). A conta continua conectada; tente de novo para apagar o que faltou.`,
  },

  /** Zona de risco: ações destrutivas, todas com confirmação em 2 etapas. */
  danger: {
    zoneLabel: 'Zona de risco',
    zoneBody: 'Estas ações são irreversíveis e sobrescrevem os arquivos antes de apagá-los.',
    resetTitle: 'Apagar a biblioteca (obras e capas)',
    resetAction: 'Apagar biblioteca',
    resetConfirm:
      'Todas as obras e capas serão sobrescritas e apagadas deste computador. O backup na nuvem não é alterado.',
    resetWord: 'APAGAR',
    purgeTitle: 'Apagar o backup na nuvem',
    purgeAction: 'Apagar backup',
    purgeConfirm:
      'Todos os arquivos do backup serão apagados na conta conectada. Sem volta: o histórico de leitura não pode ser recuperado.',
    destroyTitle: 'Destruir o cofre (apaga biblioteca e segredos)',
    destroyAction: 'Destruir cofre',
    destroyConfirm:
      'O cofre será sobrescrito e apagado. A biblioteca e os segredos do app serão perdidos. O backup na nuvem não é alterado.',
    destroyWord: 'DESTRUIR',
    typeLabel: (word: string): string =>
      `Digite ${word} para confirmar. Este passo não pode ser desfeito.`,
    confirmAction: 'Confirmar',
    irreversible: 'Não há como desfazer esta ação.',
    libraryReset: 'Biblioteca apagada.',
    resetPartial: (shredded: number, failed: number): string =>
      `${shredded} arquivo(s) sobrescrito(s) e apagado(s), mas ${failed} não puderam ser apagados. Pode ter sobrado resíduo no disco; feche e abra o app e tente de novo.`,
    destroyPartial: (shredded: number, failed: number): string =>
      `Cofre destruído, mas ${failed} arquivo(s) do acervo não puderam ser apagados (${shredded} foram). Pode ter sobrado resíduo no disco; feche e abra o app e apague a biblioteca à mão.`,
    vaultDestroyed: 'Cofre destruído. Crie um novo para continuar.',
    cloudPurged: 'Backup apagado da nuvem.',
    libraryLocked: 'Abra o cofre para apagar a biblioteca.',
  },

  /** Erros do domínio de obras (a UI só exibe a mensagem vinda do main). */
  libraryErrors: {
    invalidId: 'Identificador de obra inválido.',
  },

  /** Cofre: barreira de entrada (criar, abrir, recuperar) e gestão na tela. */
  vault: {
    closeVault: 'Fechar cofre',
    autoLocked: 'O cofre fechou sozinho por inatividade.',
    createHint: 'Crie um cofre para guardar a biblioteca cifrada e os segredos do app.',
    badge: {
      open: 'Cofre aberto',
      closed: 'Cofre fechado',
      none: 'Sem cofre',
    },
    errors: {
      vaultExists: 'Já existe um cofre neste computador.',
      vaultMissing: 'Nenhum cofre encontrado.',
      vaultLocked: 'O cofre está fechado.',
      vaultLockedOut: 'Muitas tentativas. Aguarde antes de tentar de novo.',
      vaultInvalidMaster: 'A senha mestra precisa ter exatamente 24 caracteres.',
      vaultWeakMaster:
        'Senha mestra previsível (caractere repetido, sequência ou bloco repetido). Escolha outra.',
      vaultWrongMaster: 'Senha mestra incorreta.',
      vaultInvalidPin: 'O PIN precisa ter exatamente 8 dígitos.',
      vaultWeakPin: 'PIN previsível (dígitos repetidos, sequência ou data). Escolha outro.',
      vaultWrongPin: 'PIN incorreto.',
      vaultInvalidRecovery: 'A frase de recuperação precisa ter pelo menos 12 palavras.',
      vaultWeakRecovery: 'Frase previsível (poucas palavras distintas ou muitas repetidas).',
      vaultWrongRecovery: 'A frase de recuperação não confere.',
      vaultTampered: 'O cofre está danificado ou foi alterado.',
      libraryTampered:
        'A biblioteca cifrada está danificada ou foi alterada. Nenhum dado foi apagado.',
      vaultDestroyed: 'O cofre foi destruído nesta sessão. Crie um novo para continuar.',
      vaultDirUnavailable: 'Não foi possível criar a pasta do cofre. Verifique as permissões.',
      vaultAuthCancelled: 'A criação da pasta do cofre foi cancelada.',
    },
  },

  /**
   * Entrada do cofre: as três credenciais e os quatro passos de criação. Ficam
   * em bloco próprio porque é o texto mais escrito do app (a barreira aparece
   * em toda abertura de app) e porque precisa das constantes de
   * `MASTER_PASSWORD_LENGTH`/`PIN_LENGTH`/`RECOVERY_MIN_WORDS` interpoladas.
   */
  auth: {
    createTitle: 'Criar o cofre',
    createSubtitle:
      'A senha mestra tem exatamente **24 caracteres** e é a chave que embrulha tudo. ' +
      'O app guarda a biblioteca cifrada com a chave do cofre, em ' +
      '`~/.local/share/cronologia/`, e os segredos em `/var/lib/.cronologia/.vault/`.',
    masterLabel: 'Senha mestra (24 caracteres)',
    masterPlaceholder: 'Ex.: Kf7#mQ2!vZ9@pL4$xR8!nW3&',
    masterConfirmLabel: 'Repita a senha mestra',
    masterMismatch: 'As senhas não coincidem.',
    masterLength: (needed: number, actual: number): string =>
      `A senha mestra precisa ter exatamente ${needed} caracteres (você digitou ${actual}).`,
    pinLabel: 'PIN (8 dígitos)',
    pinPlaceholder: 'Ex.: 49201733',
    pinSubtitle: 'É com ele que você abre o cofre no dia a dia.',
    createAction: 'Criar cofre',
    creating: 'Criando cofre…',
    lockout: (time: string): string => `Muitas tentativas. Tente de novo em ${time}.`,
    recoveryTitle: 'Frase de recuperação',
    recoverySubtitle:
      'Escreva **com as suas palavras** a frase que vai redefinir o PIN se você o esquecer. ' +
      'O app não gera nem guarda esse texto: você decide e anota fora do computador.',
    recoveryLabel: 'Sua frase de recuperação',
    recoveryPlaceholder: 'Ex.: o cavalo comeu cenoura na feira depois do inverno',
    recoveryConfirmLabel: 'Repita a frase de recuperação',
    recoveryMismatch: 'As frases não coincidem.',
    recoveryTooShort: (needed: number, actual: number): string =>
      `A frase precisa de pelo menos ${needed} palavras (você escreveu ${actual}).`,
    recoveryHint: 'A caixa das palavras conta. Só o espaço a mais é ignorado ao conferir.',
    unlockTitle: 'Cofre bloqueado',
    unlockSubtitle: 'Informe o PIN para decifrar a biblioteca e liberar os segredos.',
    tabPin: 'PIN',
    tabMaster: 'Senha mestra',
    masterAvailable: 'PIN incorreto 3 vezes: agora a senha mestra também pode abrir o cofre.',
    forgotPin: 'Esqueci o PIN',
    unlockAction: 'Abrir cofre',
    unlocking: 'Abrindo…',
    resetTitle: 'Redefinir o PIN',
    resetSubtitle:
      'Use a frase de recuperação que **você** escreveu na criação do cofre para escolher ' +
      'um PIN novo. O cofre abre em seguida.',
    newPinLabel: 'Novo PIN (8 dígitos)',
    newPinConfirmLabel: 'Repita o novo PIN',
    pinMismatch: 'Os PINs não coincidem.',
    resetAction: 'Redefinir e abrir',
    resetting: 'Redefinindo…',
    backToPin: 'Voltar para o PIN',
    changeTitle: 'Trocar a credencial do cofre',
    changeMasterTitle: 'Trocar a senha mestra',
    changeMasterSubtitle:
      'A senha mestra de hoje continua valendo enquanto o cofre estiver aberto. ' +
      'A troca **não** recifra a biblioteca: só reescreve o embrulho da chave, em segundos.',
    changeMasterCurrent: 'Senha mestra atual',
    changeMasterNew: 'Nova senha mestra (24 caracteres)',
    changeMasterConfirm: 'Repita a nova senha mestra',
    changePinTitle: 'Trocar o PIN',
    changePinSubtitle:
      'O PIN de hoje continua valendo. A troca só reescreve o embrulho da chave, ' +
      'então o acervo em disco não é tocado.',
    changePinCurrent: 'PIN atual',
    changePinNew: 'Novo PIN (8 dígitos)',
    changePinConfirm: 'Repita o novo PIN',
    changeAction: 'Trocar',
    changing: 'Trocando…',
  },

  /** Medidor de força das credenciais do cofre (rótulo e motivo da nota). */
  strength: {
    hintMaster: 'A nota orienta; o app recusa só o que é degenerado.',
    hintPin: 'Oito dígitos nunca passam de "razoável": o que protege o PIN é a trava.',
    hintPhrase: 'Palavras varieties e sem repetição valem mais que palavras longas.',
    levels: {
      veryWeak: 'Muito fraca',
      weak: 'Fraca',
      fair: 'Razoável',
      strong: 'Forte',
      veryStrong: 'Muito forte',
    },
    reasons: {
      allSame: 'o mesmo caractere repetido',
      sequence: 'sequência de caracteres',
      repeatedBlock: 'bloco repetido',
      dateLike: 'parece uma data',
      fewKinds: 'poucos tipos de caractere',
      lowVariety: 'poucos caracteres distintos',
      commonWord: 'contém palavra comum',
      shortWords: 'palavras curtas demais',
      fewUniqueWords: 'poucas palavras distintas',
      repeatedWords: 'palavra repetida muitas vezes',
    },
  },

  /** Página HTML que o loopback do OAuth mostra na aba do navegador. */
  oauthPage: {
    deniedTitle: 'Autorização recusada',
    doneTitle: 'Autorização concluída',
    deniedBody: 'Você pode fechar esta aba.',
    doneBody: 'Pode fechar esta aba e voltar para o aplicativo.',
  },

  /**
   * Erros que **atravessam o IPC**: o main lança, o renderer recebe o `Error`
   * rejeitado e a pessoa lê a mensagem na tela.
   *
   * Ficam num bloco próprio (e não dentro de `driveErrors`/`libraryErrors`) porque
   * a origem delas não é um subsistema, é a fronteira da janela. Um erro do
   * Drive é do Drive; este é do app inteiro, e localizá-lo num dos dois faria a
   * origem parecer mais específica do que é.
   */
  errors: {
    /** Guarda de origem do IPC: o emissor não é a página oficial do app. */
    foreignFrame: 'IPC bloqueado: a requisição não veio da página do app.',
  },
};

/** Forma canônica: todo idioma deve ter exatamente estas chaves e assinaturas. */
export type Messages = typeof ptBR;
