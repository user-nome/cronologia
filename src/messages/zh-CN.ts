import type { Messages } from '@zero/messages/pt-BR';

/** Mensagens em chinês simplificado. A forma é conferida contra `Messages` pelo TypeScript. */
export const zhCN: Messages = {
  common: {
    close: '关闭',
    cancel: '取消',
    save: '保存',
    saving: '保存中…',
    loading: '加载中…',
    select: '请选择',
    none: '无',
    notFound: '未找到',
    searchOptions: '输入以筛选…',
    clearSearch: '清除搜索',
    noOptionsFound: '没有找到选项',
    next: '下一步',
    back: '返回',
    invalidDate: (mask: string): string => `日期无效。请使用 ${mask} 格式。`,
  },

  dialogs: {
    pickCover: '选择封面图片',
    imageFilter: '图片',
  },

  app: {
    headerStats: (total: number, average: number): string =>
      `${total} 部作品 · 平均进度 ${average}%`,
    searchPlaceholder: '按标题搜索…',
    openSettingsTitle: 'Dropbox备份设置',
    openAttributionsTitle: '查看依赖项致谢与许可证',
    openDonateTitle: '捐赠以支持本项目',
    settingsTitle: '设置',
    attributionsLabel: '致谢',
    donateLabel: '捐赠',
    newWork: '新作品',
    filters: {
      todos: '全部',
      lendo: '在读',
      planejado: '计划',
      pausado: '已暂停',
      concluido: '已完结',
      cancelado: '已弃',
    },
    stats: {
      total: '作品总数',
      reading: '在读',
      done: '已完结',
      planned: '计划',
      paused: '已暂停',
      cancelled: '已弃',
      average: '平均进度',
    },
    loadingLibrary: '正在加载书库…',
    emptyFoundTitle: '没有找到作品',
    emptyFoundText: '换个筛选条件或搜索词试试。',
    emptyLibraryTitle: '书库是空的',
    emptyLibraryText: '为第一部作品添加封面和标题，并跟踪阅读进度。',
    addFirstWork: '添加第一部作品',
    drivePill: {
      syncing: '同步中…',
      connected: 'Dropbox已连接',
      off: 'Dropbox未连接',
    },
    toastSaveError: '无法保存作品。',
    toastSaved: '作品已保存。',
    toastRemoved: '作品已删除。',
    startupFailed: (detail: string): string => `无法启动 Cronologia。\n\n技术详情：${detail}`,
  },

  settings: {
    title: '设置',
    bannerTitle: (label: string): string => `${label}备份。`,
    bannerBodyDropbox:
      '书库保存在应用专属文件夹中（您账号下的`/Apps/`内）：通过API，只有本应用能看到' +
      '这个文件夹，Dropbox的其余部分对它完全不可见。该文件夹在您的账号内可见，所有文件都以' +
      '不可读的文件名和加密内容（AES-256-GCM）上传，因此请在首次备份前在下方设置加密密码。',
    bannerBodyGoogle:
      '此构建将书库保存在应用的隐藏文件夹中（Google Drive 的 `appDataFolder`）。该' +
      '文件夹不会出现在 Google Drive 的界面中，只有本应用能看到：请求的范围只有这一个。' +
      '所有文件都以不可读的文件名和加密内容（AES-256-GCM）上传，因此请在首次备份前在' +
      '下方设置加密密码。',
    languageLabel: '语言',
    providersLabel: '备份服务商',
    noOperationalProvider:
      '此版本没有可用的备份服务商：客户端密钥没有被嵌入二进制文件。' +
      '下面列出了各个服务商的原因。',
    hiddenFolder: '隐藏文件夹',
    operational: '可用',
    notOperational: '不可用',
    backupIn: (target: string): string => `备份至${target}`,
    passphraseLabel: '备份加密密码',
    passphrasePlaceholder: (label: string): string => `用于加密${label}中的备份`,
    connected: '已连接',
    disconnected: '未连接',
    accountFallback: (label: string): string => `${label}账号`,
    lastBackup: '上次备份',
    inBackup: (label: string): string => `${label}备份中`,
    worksInBackup: (works: number): string => `${works} 部作品`,
    syncingBanner: (label: string): string => `正在与${label}同步…`,
    disconnectTitle: (label: string): string => `断开本应用的${label}账号`,
    disconnectAction: '断开连接',
    authorizing: '授权中…',
    connectAction: (label: string): string => `连接${label}`,
    restoreTitle: (label: string): string => `下载${label}备份并替换当前书库`,
    restoreAction: '恢复',
    restoring: '恢复中…',
    backupAction: '立即备份',
    sending: '上传中…',
    toastSaved: '设置已保存。',
    toastAuthFailed: '授权失败。',
    toastConnected: (label: string): string => `${label}账号连接成功。`,
    toastBackupFailed: '备份失败。',
    toastBackupDone: (label: string): string => `已备份到${label}的应用文件夹。`,
    toastRestoreFailed: '恢复失败。',
    toastRestored: (works: number): string => `已恢复备份，共${works} 部作品。`,
    toastDisconnected: (label: string): string => `${label}账号已断开。`,
    toastPurgeFailed: '无法从云端删除备份。',
    providerSwitched: (label: string): string => `备份现在将前往${label}。`,
    providerSwitchFailed: '无法切换备份服务商。',
    translationNotice: {
      title: '翻译提示',
      text: '这些语言中只有葡萄牙语我会说，所有翻译都是由AI完成的。像世间万物一样，可能会有错误，请多包涵。',
      translationNotice2: '如果您想帮助改进翻译，请在项目仓库中提交 issue。',
    },
  },

  restore: {
    title: '备份密码',
    banner: (label: string): string =>
      `请输入**备份时**在${label}中使用的加密密码。解密下载的文件必须提供该密码。`,
    passphraseLabel: '加密密码',
    passphrasePlaceholder: '备份时使用的密码',
    action: '恢复',
  },

  workModal: {
    newTitle: '新作品',
    editTitle: '编辑作品',
    titleRequired: '请输入作品标题。',
    saveError: '保存失败。',
    coverAlt: '封面预览',
    coverHelp: '添加作品封面图片（JPG、PNG、WebP…）。图片将复制到本地书库。',
    chooseImage: '选择图片',
    removeCover: '移除封面',
    titleLabel: '标题',
    titlePlaceholder: '例如：我独自升级',
    synopsisLabel: '简介',
    synopsisPlaceholder: '写下作品简介…',
    typeLabel: '类型',
    statusLabel: '状态',
    categoryLabel: '分类',
    markerLabel: '标记（可选）',
    markerPlaceholder: '第45话 / 第3卷',
    progressLabel: '阅读进度',
    decreaseStep: (step: number): string => `减${step}`,
    increaseStep: (step: number): string => `加${step}`,
    progressValue: (progress: number): string => `第${progress}话`,
    startedAtLabel: '开始阅读日期',
    startedAtPlaceholder: 'YYYY/MM/DD',
    finishedAtLabel: '完成阅读日期',
    finishedAtPlaceholder: 'YYYY/MM/DD',
    finish: '完结',
    reset: '清零',
    confirmDelete: '确认删除？',
    deleteAction: '删除',
  },

  workCard: {
    coverOf: (title: string): string => `${title}的封面`,
    untitled: '无标题',
    progress: '进度',
    progressValue: (progress: number): string => `第${progress}话`,
    increase1: '加1',
    decrease1: '减1',
    reopen: '重开',
    resume: '继续',
    finish: '完结',
    pause: '暂停',
    cancel: '放弃',
  },

  attributions: {
    ariaLabel: '致谢',
    title: '致谢',
    bannerTitle: '项目致谢。',
    bannerBody:
      '以下是Cronologia使用的开源依赖，全部采用OSI认可的宽松许可证。确切版本见' +
      '`package.json` / `package-lock.json`。',
    pause: '暂停',
    resume: '继续',
    hoverHint: '将鼠标悬停在致谢名单上可暂停滚动。',
    creditsAria: '滚动致谢',
    creditsSubtitle: '感谢以下依赖项',
    creditsEnd: '完',
    creditsLoop: '致谢将循环重新开始',
  },

  donate: {
    ariaLabel: '捐赠',
    title: '支持本项目',
    banner: '如果每位读者请喝一杯咖啡，应用的正式审核就能在下一话之前通过。',
    text1:
      '本项目为御宅族社区而生：一个保存我们阅读记录的地方，即使失去喜爱的阅读平台的访问权限也不会迷失。',
    text2:
      '不管愿不愿意，我穷得叮当响，而云备份依赖外部服务：连接满50个账号后，它只有2周时间获批，否则就不再接受新用户。您的捐赠有助于让一切（和我的耐心）继续运转。',
    text3:
      '说实话，这个项目起初只是我个人的追更记录。因为您，和我一样的强迫症御宅族，懂得看着喜爱的平台倒闭、阅读进度全部丢失是什么滋味。',
    text4:
      '但如果奇迹发生、本项目真的收到捐赠，我会尽力把它做到最完善，让我们能安心睡觉，不用担心一觉醒来发现阅读器里的历史记录没了。',
    openTitle: '在浏览器中打开捐赠页面',
    donateNow: '立即捐赠',
    copyTitle: '复制捐赠链接',
    copyLink: '复制链接',
    copied: '已复制！',
    thanks: '感谢您让书库延续，阅读愉快！',
  },

  workTypes: {
    webtoon: 'Webtoon',
    manhwa: 'Manhwa',
    manhua: 'Manhua',
    manga: '漫画',
    livro: '书',
    outro: '其他',
  },

  workStatus: {
    planejado: '计划',
    lendo: '在读',
    pausado: '已暂停',
    concluido: '已完结',
    cancelado: '已弃',
  },

  providers: {
    dropboxStorageTarget: '/Apps/Cronologia（您账号中可见的文件夹）',
    googleStorageTarget: 'appDataFolder（隐藏文件夹，不显示在Google云端硬盘界面中）',
    googleNoCredentials:
      '此构建未包含 Google Drive 凭据：应用由一对在发布时写入二进制的密钥标识。' +
      '在该密钥对发布之前，备份使用 Dropbox。',
  },

  driveErrors: {
    notEncrypted: '不是加密备份。',
    truncated: '备份被截断或已损坏。',
    definePassphrase: '请在设置中设置备份加密密码。',
    needsPassphrase: '此备份已加密。请输入加密密码。',
    wrongPassphrase: '加密密码错误或备份已损坏。',
    invalidManifest: '备份清单无效。',
    syncInProgress: '同步已在进行中。',
    connectFirst: (provider: string): string => `请先连接${provider}账号。`,
    providerNotSelected: (provider: string): string =>
      `${provider}未被选为备份目的地。请连接所选目的地。`,
    emptyLibrary: '没有可备份的本地书库。请至少添加一部作品。',
    noBackupFound: (provider: string): string => `在${provider}的应用文件夹中没有找到备份。`,
    invalidLibrary: '备份无效（library.json已损坏）。',
    invalidListResponse: (provider: string): string =>
      `${provider} API 返回无效的响应（文件列表）。`,
    tokenTimeout: '等待授权超时。',
    authCancelled: '授权已取消。',
    csrfRejected: '授权回调来自其他来源，已拒绝连接。',
    tokenFailed: (status: number): string => `获取令牌失败（${status}）。`,
    invalidTokenResponse: (status: number): string => `令牌响应无效（${status}）。`,
    configureAppKey: '此构建没有 DROPBOX_APP_KEY。请设置该变量并重新构建。',
    sessionExpired: (provider: string): string => `会话已过期。请重新连接${provider}账号。`,
    refreshFailed: (provider: string): string => `无法刷新${provider}会话。`,
    noAccount: (provider: string): string => `未连接${provider}账号。`,
    permissionsUpdated: (provider: string): string =>
      `${provider}权限已更新。请重新连接${provider}账号。`,
    missingScopes: (provider: string): string =>
      `${provider}应用缺少权限。请在该应用的开发者控制台中勾选所有范围，然后断开并重新连接。`,
    missingScopesList: (provider: string, missing: string): string =>
      `${provider}应用缺少权限（${missing}）。请在该应用的开发者控制台中勾选所有范围，` +
      '然后重新连接。',
    providerHttp: (label: string, status: number, response: string): string =>
      response === ''
        ? `${label}错误（HTTP ${status}）。`
        : `${label}错误（HTTP ${status}）。响应：${response}`,
    restoreLocked: (seconds: number): string =>
      seconds < 60
        ? `恢复时密码错误尝试次数过多，请在 ${seconds} 秒后重试。`
        : `恢复时密码错误尝试次数过多，请在 ${Math.ceil(seconds / 60)} 分钟后重试。`,
    purgePartial: (deleted: number, failed: number): string =>
      `已在云端删除 ${deleted} 个文件，还有 ${failed} 个待处理。账户仍保持连接，请重试以删除剩余文件。`,
  },

  /** Zona de risco: ações destrutivas, todas com confirmação em 2 etapas. */
  danger: {
    zoneLabel: '危险区域',
    zoneBody: '这些操作不可撤销，删除文件前会先覆写其内容。',
    resetTitle: '删除书库（作品与封面）',
    resetAction: '删除书库',
    resetConfirm: '所有作品与封面都将被覆写并从本机删除。云端备份不受影响。',
    resetWord: '删除',
    purgeTitle: '删除云端备份',
    purgeAction: '删除备份',
    purgeConfirm: '备份中的所有文件都将从已连接的账户中删除。无法撤销：阅读历史无法恢复。',
    destroyTitle: '销毁密码库（同时删除书库与机密）',
    destroyAction: '销毁密码库',
    destroyConfirm: '密码库将被覆写并删除。书库与应用机密都会丢失。云端备份不受影响。',
    destroyWord: '销毁',
    typeLabel: (word: string): string => `请输入 ${word} 以确认。此步骤无法撤销。`,
    confirmAction: '确认',
    irreversible: '此操作无法撤销。',
    libraryReset: '书库已删除。',
    resetPartial: (shredded: number, failed: number): string =>
      `已覆写并删除 ${shredded} 个文件，但有 ${failed} 个无法删除。磁盘上可能残留数据，请重启应用后重试。`,
    destroyPartial: (shredded: number, failed: number): string =>
      `密码库已销毁，但有 ${failed} 个书库文件无法删除（已删除 ${shredded} 个）。磁盘上可能残留数据，请重启应用后手动删除书库。`,
    vaultDestroyed: '密码库已销毁。请创建一个新的以继续。',
    cloudPurged: '备份已从云端删除。',
    libraryLocked: '请解锁密码库以删除书库。',
  },

  /** Erros do domínio de obras (a UI só exibe a mensagem vinda do main). */
  libraryErrors: {
    invalidId: '作品标识符无效。',
  },

  /** 密码库：模态框、界面标识和领域错误。 */
  vault: {
    closeVault: '锁定密码库',
    autoLocked: '密码库因长时间无操作已自动锁定。',
    createHint: '创建一个密码库，用于保存加密的书库和应用机密。',
    badge: {
      open: '密码库已打开',
      closed: '密码库已锁定',
      none: '无密码库',
    },
    errors: {
      vaultExists: '此计算机上已存在密码库。',
      vaultMissing: '未找到密码库。',
      vaultLocked: '密码库已锁定。',
      vaultLockedOut: '尝试次数过多，请稍候再试。',
      vaultInvalidMaster: '主密码必须正好为 24 个字符。',
      vaultWeakMaster: '主密码过于常见（字符重复、连续或整块重复）。请换一个。',
      vaultWrongMaster: '主密码不正确。',
      vaultInvalidPin: 'PIN 必须正好为 8 位数字。',
      vaultWeakPin: 'PIN 过于常见（数字重复、连续或像日期）。请换一个。',
      vaultWrongPin: 'PIN 不正确。',
      vaultInvalidRecovery: '恢复短语至少需要 12 个词。',
      vaultWeakRecovery: '短语过于常见（不同的词太少或重复太多）。',
      vaultWrongRecovery: '恢复短语不匹配。',
      vaultTampered: '密码库已损坏或被篡改。',
      libraryTampered: '加密的书库已损坏或被篡改。没有数据被删除。',
      vaultDestroyed: '本次会话中密码库已被销毁。请创建一个新的以继续。',
      vaultDirUnavailable: '无法创建保管库文件夹，请检查权限。',
      vaultAuthCancelled: '已取消创建保管库文件夹。',
    },
  },

  /**
   * 密码库入口：三种凭据与四个创建步骤。它单独成块，因为这是整个应用里
   * 读得最多的文字（每次启动都会出现），而且要把
   * `MASTER_PASSWORD_LENGTH`/`PIN_LENGTH`/`RECOVERY_MIN_WORDS` 三个常量
   * 插进句子里。
   */
  auth: {
    createTitle: '创建密码库',
    createSubtitle:
      '主密码正好 **24 个字符**，它是包裹一切的密钥。' +
      '应用用它加密书库，保存在 `~/.local/share/cronologia/`，' +
      '机密保存在 `/var/lib/.cronologia/.vault/`。',
    masterLabel: '主密码（24 个字符）',
    masterPlaceholder: '例如：Kf7#mQ2!vZ9@pL4$xR8!nW3&',
    masterConfirmLabel: '再次输入主密码',
    masterMismatch: '两次输入的密码不一致。',
    masterLength: (needed: number, actual: number): string =>
      `主密码必须正好 ${needed} 个字符（你输入了 ${actual} 个）。`,
    pinLabel: 'PIN（8 位数字）',
    pinPlaceholder: '例如：49201733',
    pinSubtitle: '日常打开密码库用的就是它。',
    createAction: '创建密码库',
    creating: '正在创建密码库…',
    lockout: (time: string): string => `尝试次数过多，请在 ${time} 后重试。`,
    recoveryTitle: '恢复短语',
    recoverySubtitle:
      '用**你自己的话**写一句在忘记 PIN 时用来重置 PIN 的短语。' +
      '应用既不生成也不保存这句话：由你决定，并写到计算机之外。',
    recoveryLabel: '你的恢复短语',
    recoveryPlaceholder: '例如：冬天过后白马在集市吃掉了胡萝卜',
    recoveryConfirmLabel: '再次输入恢复短语',
    recoveryMismatch: '两次输入的短语不一致。',
    recoveryTooShort: (needed: number, actual: number): string =>
      `短语至少需要 ${needed} 个词（你写了 ${actual} 个）。`,
    recoveryHint: '单词的大小写会计入，核对时只忽略多余的空格。',
    unlockTitle: '密码库已锁定',
    unlockSubtitle: '输入 PIN 以解密书库并解锁机密。',
    tabPin: 'PIN',
    tabMaster: '主密码',
    masterAvailable: 'PIN 已错 3 次：现在也可以用主密码打开。',
    forgotPin: '我忘记 PIN 了',
    unlockAction: '打开密码库',
    unlocking: '正在打开…',
    resetTitle: '重置 PIN',
    resetSubtitle: '用创建密码库时**你自己**写的恢复短语来设定新 PIN。之后密码库会立即打开。',
    newPinLabel: '新 PIN（8 位数字）',
    newPinConfirmLabel: '再次输入新 PIN',
    pinMismatch: '两次输入的 PIN 不一致。',
    resetAction: '重置并打开',
    resetting: '正在重置…',
    backToPin: '返回 PIN',
    changeTitle: '更改密码库凭据',
    changeMasterTitle: '更改主密码',
    changeMasterSubtitle:
      '密码库打开期间，当前主密码继续有效。' +
      '更改**不会**重新加密书库，只会重写密钥封装，几秒钟完成。',
    changeMasterCurrent: '当前主密码',
    changeMasterNew: '新主密码（24 个字符）',
    changeMasterConfirm: '再次输入新主密码',
    changePinTitle: '更改 PIN',
    changePinSubtitle: '当前 PIN 继续有效。更改只会重写密钥封装，磁盘上的书库不受影响。',
    changePinCurrent: '当前 PIN',
    changePinNew: '新 PIN（8 位数字）',
    changePinConfirm: '再次输入新 PIN',
    changeAction: '更改',
    changing: '正在更改…',
  },

  /** 凭据强度表（等级与扣分原因）。 */
  strength: {
    hintMaster: '等级只是提示，应用只拒绝退化的值。',
    hintPin: '八位数字不会超过"一般"：真正保护 PIN 的是锁定机制。',
    hintPhrase: '用词多样、少重复，比用词更长更有价值。',
    levels: {
      veryWeak: '非常弱',
      weak: '弱',
      fair: '一般',
      strong: '强',
      veryStrong: '非常强',
    },
    reasons: {
      allSame: '同一字符重复',
      sequence: '字符连续',
      repeatedBlock: '整块重复',
      dateLike: '看起来像日期',
      fewKinds: '字符种类太少',
      lowVariety: '不同字符太少',
      commonWord: '含常见词',
      shortWords: '词太短',
      fewUniqueWords: '不同的词太少',
      repeatedWords: '同一个词重复太多次',
    },
  },

  /** OAuth回环在浏览器选项卡中显示的HTML页面。 */
  oauthPage: {
    deniedTitle: '授权被拒绝',
    doneTitle: '授权完成',
    deniedBody: '您可以关闭此选项卡。',
    doneBody: '可以关闭此选项卡并返回应用。',
  },

  /**
   * 穿过 IPC 边界的错误：主进程抛出，渲染进程收到被拒绝的 `Error`，用户
   * 在屏幕上读到它。
   *
   * 单独成块（不放进 `driveErrors`/`libraryErrors`）是因为它们的来源不是某个
   * 子系统，而是窗口边界。Drive 的错误属于 Drive；这条属于整个应用，放进
   * 任何一边都会让来源看起来比实际更窄。
   */
  errors: {
    /** 来源守卫：发送方不是应用页面。 */
    foreignFrame: 'IPC 已阻止：请求并非来自应用页面。',
  },
};
