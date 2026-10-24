import type { Messages } from '@zero/messages/pt-BR';

/** 日本語メッセージ。型は `Messages` で担保し、各文字列は pt-BR と対応する。 */
export const ja: Messages = {
  common: {
    close: '閉じる',
    cancel: 'キャンセル',
    save: '保存',
    saving: '保存中…',
    loading: '読み込み中…',
    select: '選択',
    none: 'なし',
    notFound: '見つかりません',
    searchOptions: '入力して絞り込み…',
    clearSearch: '検索をクリア',
    noOptionsFound: '該当する選択肢がありません',
    next: '次へ',
    back: '戻る',
    invalidDate: (mask: string): string => `日付が無効です。${mask} 形式を使用してください。`,
  },

  dialogs: {
    pickCover: 'カバー画像を選択',
    imageFilter: '画像',
  },

  app: {
    headerStats: (total: number, average: number): string => `${total} 件 · 平均進捗 ${average}%`,
    searchPlaceholder: 'タイトルで検索…',
    openSettingsTitle: 'Dropbox バックアップ設定',
    openAttributionsTitle: '依存ライブラリの帰属表示とライセンスを見る',
    openDonateTitle: 'プロジェクトを寄付で支援',
    settingsTitle: '設定',
    attributionsLabel: '帰属表示',
    donateLabel: '寄付',
    newWork: '新しい作品',
    filters: {
      todos: 'すべて',
      lendo: '読書中',
      planejado: '予定',
      pausado: '一時停止',
      concluido: '完了',
      cancelado: 'キャンセル',
    },
    stats: {
      total: '作品数',
      reading: '読書中',
      done: '完了',
      planned: '予定',
      paused: '一時停止',
      cancelled: 'キャンセル',
      average: '平均進捗',
    },
    loadingLibrary: 'ライブラリを読み込み中…',
    emptyFoundTitle: '作品が見つかりません',
    emptyFoundText: '別のフィルターや検索語をお試しください。',
    emptyLibraryTitle: 'ライブラリは空です',
    emptyLibraryText: '最初の作品を追加しましょう。カバー、タイトル、進捗を記録できます。',
    addFirstWork: '最初の作品を追加',
    drivePill: {
      syncing: '同期中…',
      connected: 'Dropbox 接続済み',
      off: 'Dropbox 切断',
    },
    toastSaveError: '作品を保存できませんでした。',
    toastSaved: '作品を保存しました。',
    toastRemoved: '作品を削除しました。',
    startupFailed: (detail: string): string =>
      `Cronologia を起動できませんでした。\n\n技術的な詳細: ${detail}`,
  },

  settings: {
    title: '設定',
    bannerTitle: (label: string): string => `${label} バックアップ。`,
    bannerBodyDropbox:
      'ライブラリはアプリ専用フォルダに保存されます（Dropbox の `/Apps/` 以下）。' +
      'API としてはこのアプリだけがそのフォルダを読み書きでき、他の領域は表示されません。' +
      'フォルダはあなたのアカウント内に見えるので、すべてのファイルは解読不能な名前と ' +
      '暗号化された内容でアップロードされます (AES-256-GCM)。最初のバックアップ前に ' +
      '以下の暗号化パスフレーズを設定してください。',
    bannerBodyGoogle:
      'このビルドはライブラリをアプリ専用の隠しフォルダ（Google Drive の ' +
      '`appDataFolder`）に保存します。このフォルダは Google Drive の画面には現れず、' +
      'このアプリだけが読み書きできます。要求するスコープはこのフォルダだけです。' +
      'すべてのファイルは解読不能な名前と暗号化された内容 (AES-256-GCM) でアップロード' +
      'されるため、最初のバックアップ前に以下の暗号化パスフレーズを設定してください。',
    languageLabel: '言語',
    providersLabel: 'バックアップ先',
    noOperationalProvider:
      'このビルドで利用できるバックアップ先がありません: クライアントキーがバイナリに ' +
      '埋め込まれていません。下のリストに各々の理由があります。',
    hiddenFolder: '非公開フォルダ',
    operational: '利用可能',
    notOperational: '未対応',
    backupIn: (target: string): string => `${target} にバックアップ`,
    passphraseLabel: 'バックアップ暗号化パスフレーズ',
    passphrasePlaceholder: (label: string): string => `${label} バックアップの暗号化に使用`,
    connected: '接続済み',
    disconnected: '切断',
    accountFallback: (label: string): string => `${label} アカウント`,
    lastBackup: '最終バックアップ',
    inBackup: (label: string): string => `${label} バックアップ内`,
    translationNotice: {
      title: '翻訳のお知らせ',
      text: 'これらの言語の中でポルトガル語以外は話せません。すべての翻訳はAIによって行われています。世の中のすべてと同じように、間違いがあるかもしれません。少しの寛容をお願いいたします。',
      translationNotice2:
        '翻訳の改善にご協力いただける場合は、プロジェクトのリポジトリで Issue を作成してください。',
    },
    providerSwitched: (label: string): string => `バックアップ先は ${label} になりました。`,
    providerSwitchFailed: 'バックアップ先を変更できませんでした。',
    worksInBackup: (works: number): string => `${works} 件`,
    syncingBanner: (label: string): string => `${label} と同期中…`,
    disconnectTitle: (label: string): string =>
      `このアプリから ${label} アカウントの接続を解除します`,
    disconnectAction: '切断',
    authorizing: '認証中…',
    connectAction: (label: string): string => `${label} に接続`,
    restoreTitle: (label: string): string =>
      `${label} のバックアップをダウンロードし、現在のライブラリを置き換えます`,
    restoreAction: '復元',
    restoring: '復元中…',
    backupAction: '今すぐバックアップ',
    sending: '送信中…',
    toastSaved: '設定を保存しました。',
    toastAuthFailed: '認証に失敗しました。',
    toastConnected: (label: string): string => `${label} アカウントに接続しました。`,
    toastBackupFailed: 'バックアップに失敗しました。',
    toastBackupDone: (label: string): string =>
      `${label} のアプリフォルダにバックアップを完了しました。`,
    toastRestoreFailed: '復元に失敗しました。',
    toastRestored: (works: number): string => `${works} 件の作品を復元しました。`,
    toastDisconnected: (label: string): string => `${label} アカウントの接続を解除しました。`,
    toastPurgeFailed: 'クラウドからバックアップを削除できませんでした。',
  },

  restore: {
    title: 'バックアップパスフレーズ',
    banner: (label: string): string =>
      `${label} で**バックアップを作成**したときに使った暗号化パスフレーズを入力してください。` +
      'ダウンロードしたファイルを復元するには必須です。',
    passphraseLabel: '暗号化パスフレーズ',
    passphrasePlaceholder: 'バックアップ時に使用したパスフレーズ',
    action: '復元',
  },

  workModal: {
    newTitle: '新しい作品',
    editTitle: '作品を編集',
    titleRequired: '作品のタイトルを入力してください。',
    saveError: '保存に失敗しました。',
    coverAlt: 'カバーのプレビュー',
    coverHelp:
      '作品のカバー画像 (JPG, PNG, WebP など) を追加してください。画像はアプリの ' +
      'ローカルライブラリにコピーされます。',
    chooseImage: '画像を選択',
    removeCover: 'カバーを削除',
    titleLabel: 'タイトル',
    titlePlaceholder: '例: Solo Leveling',
    synopsisLabel: '概要',
    synopsisPlaceholder: '作品の概要を書いてください…',
    typeLabel: '種類',
    statusLabel: '状態',
    categoryLabel: 'カテゴリ',
    markerLabel: '位置メモ (任意)',
    markerPlaceholder: '第45話 / 第3巻',
    progressLabel: '読書進捗',
    decreaseStep: (step: number): string => `${step} 減らす`,
    increaseStep: (step: number): string => `${step} 増やす`,
    progressValue: (progress: number): string => `第${progress}話`,
    startedAtLabel: '読書開始日',
    startedAtPlaceholder: 'YYYY-MM-DD',
    finishedAtLabel: '読書完了日',
    finishedAtPlaceholder: 'YYYY-MM-DD',
    finish: '完了にする',
    reset: 'リセット',
    confirmDelete: '削除を確認しますか？',
    deleteAction: '削除',
  },

  workCard: {
    coverOf: (title: string): string => `${title} のカバー`,
    untitled: 'タイトルなし',
    progress: '進捗',
    progressValue: (progress: number): string => `第${progress}話`,
    increase1: '1 増やす',
    decrease1: '1 減らす',
    reopen: '未完了に戻す',
    resume: '再開',
    finish: '完了にする',
    pause: '一時停止',
    cancel: 'キャンセル',
  },

  attributions: {
    ariaLabel: 'ライセンス帰属',
    title: 'ライセンス帰属',
    bannerTitle: 'プロジェクトのクレジット。',
    bannerBody:
      'Cronologia で使用しているオープンソース依存の一覧です。すべて OSI 承認の ' +
      '許可リストライセンスです。具体的なバージョンは `package.json` / `package-lock.json` ' +
      'を参照してください。',
    pause: '一時停止',
    resume: '再開',
    hoverHint: 'クレジットにマウスを重ねると一時停止します。',
    creditsAria: 'スクロールするクレジット',
    creditsSubtitle: 'がこれらの依存に感謝しています',
    creditsEnd: '終わり',
    creditsLoop: 'クレジットはループで再生されます',
  },

  workTypes: {
    webtoon: 'Webtoon',
    manhwa: 'マンファ',
    manhua: 'マンホア',
    manga: '漫画',
    livro: '書籍',
    outro: 'その他',
  },

  workStatus: {
    planejado: '予定',
    lendo: '読書中',
    pausado: '一時停止',
    concluido: '完了',
    cancelado: 'キャンセル',
  },

  providers: {
    dropboxStorageTarget: '/Apps/Cronologia (アカウント内で見えるフォルダ)',
    googleStorageTarget: 'appDataFolder (非公開フォルダ。Google ドライブの UI には表示されません)',
    googleNoCredentials:
      'このビルドには Google Drive の資格情報が含まれていません。アプリは公開時に' +
      'バイナリへ埋め込まれるキーの組で識別されます。それが公開されるまで、' +
      'バックアップは Dropbox を使います。',
  },

  driveErrors: {
    notEncrypted: '暗号化されたバックアップではありません。',
    truncated: 'バックアップが切れているか壊れています。',
    definePassphrase: '設定でバックアップ用の暗号化パスフレーズを設定してください。',
    needsPassphrase: 'このバックアップは暗号化されています。暗号化パスフレーズを入力してください。',
    wrongPassphrase: '暗号化パスフレーズが違うか、バックアップが壊れています。',
    invalidManifest: 'バックアップのマニフェストが無効です。',
    syncInProgress: '同期がすでに進行中です。',
    connectFirst: (provider: string): string => `先に ${provider} アカウントを接続してください。`,
    providerNotSelected: (provider: string): string =>
      `${provider} はバックアップ先として選択されていません。選択中のバックアップ先を接続してください。`,
    emptyLibrary:
      'バックアップ対象のローカルライブラリがありません。少なくとも 1 件追加してください。',
    noBackupFound: (provider: string): string =>
      `${provider} のアプリフォルダにバックアップが見つかりません。`,
    invalidLibrary: 'バックアップが壊れています (library.json が不正)。',
    invalidListResponse: (provider: string): string =>
      `${provider} API の応答が不正です (ファイル一覧)。`,
    tokenTimeout: '認証の待機がタイムアウトしました。',
    authCancelled: '認証がキャンセルされました。',
    csrfRejected: '別オリジンからの認証コールバックだったため、接続を拒否しました。',
    tokenFailed: (status: number): string => `トークンの取得に失敗しました (${status})。`,
    invalidTokenResponse: (status: number): string => `トークン応答が不正です (${status})。`,
    configureAppKey:
      'このビルドには DROPBOX_APP_KEY がありません。変数を設定して再ビルドしてください。',
    sessionExpired: (provider: string): string =>
      `セッションが期限切れです。${provider} アカウントを再接続してください。`,
    refreshFailed: (provider: string): string => `${provider} セッションを更新できませんでした。`,
    noAccount: (provider: string): string => `${provider} アカウントが接続されていません。`,
    permissionsUpdated: (provider: string): string =>
      `${provider} の権限が更新されました。${provider} アカウントを再接続してください。`,
    missingScopes: (provider: string): string =>
      `${provider} アプリの権限が不足しています。アプリの開発者コンソールで全スコープを` +
      '有効にし、切断してから接続し直してください。',
    missingScopesList: (provider: string, missing: string): string =>
      `${provider} アプリの権限が不足しています (${missing})。アプリの開発者コンソールで` +
      '全スコープを有効にし、再接続してください。',
    providerHttp: (label: string, status: number, response: string): string =>
      response === ''
        ? `${label} エラー (HTTP ${status})。`
        : `${label} エラー (HTTP ${status})。応答: ${response}`,
    restoreLocked: (seconds: number): string =>
      seconds < 60
        ? `パスフレーズ誤りの復元試行が多すぎます。${seconds} 秒後に再試行してください。`
        : `パスフレーズ誤りの復元試行が多すぎます。${Math.ceil(seconds / 60)} 分後に再試行してください。`,
    purgePartial: (deleted: number, failed: number): string =>
      `クラウドで ${deleted} 件のファイルを削除し、${failed} 件が残っています。アカウントは接続したままです。再試行して残りを削除してください。`,
  },

  /** Zona de risco: ações destrutivas, todas com confirmação em 2 etapas. */
  danger: {
    zoneLabel: '危険ゾーン',
    zoneBody: 'これらの操作は取り消せません。ファイルを削除する前に内容を上書きします。',
    resetTitle: 'ライブラリを削除(作品とカバー)',
    resetAction: 'ライブラリを削除',
    resetConfirm:
      'すべての作品とカバーがこのコンピューターで上書きされて削除されます。クラウドのバックアップは変更されません。',
    resetWord: '削除',
    purgeTitle: 'クラウドのバックアップを削除',
    purgeAction: 'バックアップを削除',
    purgeConfirm:
      'バックアップのすべてのファイルが接続中のアカウントから削除されます。元に戻せず、読書履歴は復元できません。',
    destroyTitle: '金庫を破棄(ライブラリと秘密情報を削除)',
    destroyAction: '金庫を破棄',
    destroyConfirm:
      '金庫は上書きされて削除されます。ライブラリとアプリの秘密情報は失われます。クラウドのバックアップは変更されません.',
    destroyWord: '破棄',
    typeLabel: (word: string): string =>
      `確認のため ${word} を入力してください。この手順は取り消せません。`,
    confirmAction: '確認',
    irreversible: 'この操作は取り消せません。',
    libraryReset: 'ライブラリを削除しました。',
    resetPartial: (shredded: number, failed: number): string =>
      `${shredded} 件のファイルを上書きして削除しましたが、${failed} 件は削除できませんでした。ディスクにデータが残る可能性があります。アプリを再起動して再試行してください。`,
    destroyPartial: (shredded: number, failed: number): string =>
      `金庫は破棄しましたが、ライブラリファイル ${failed} 件を削除できませんでした（${shredded} 件は削除済み）。ディスクにデータが残る可能性があります。アプリを再起動してライブラリを手動で削除してください。`,
    vaultDestroyed: '金庫を破棄しました。続行するには新しい金庫を作成してください。',
    cloudPurged: 'バックアップをクラウドから削除しました。',
    libraryLocked: 'ライブラリを削除するには金庫のロックを解除してください。',
  },

  /** Erros do domínio de obras (a UI só exibe a mensagem vinda do main). */
  libraryErrors: {
    invalidId: '作品の ID が無効です。',
  },

  /** シークレット金庫: モーダル、UI バッジ、ドメインエラー。 */
  vault: {
    closeVault: '金庫をロック',
    autoLocked: 'しばらく操作がなかったため、金庫は自動的にロックされました。',
    createHint: '暗号化されたライブラリとアプリの秘密情報を保管する金庫を作成します。',
    badge: {
      open: '金庫を開いている',
      closed: '金庫はロック中',
      none: '金庫なし',
    },
    errors: {
      vaultExists: 'このコンピュータにはすでに金庫があります。',
      vaultMissing: '金庫が見つかりません。',
      vaultLocked: '金庫はロックされています。',
      vaultLockedOut: '試行が多すぎます。しばらく待ってから再試行してください。',
      vaultInvalidMaster: 'マスターパスワードはちょうど 24 文字である必要があります。',
      vaultWeakMaster:
        '推測しやすいマスターパスワードです(同じ文字の繰り返し、連続、ブロックの繰り返し)。別のものにしてください。',
      vaultWrongMaster: 'マスターパスワードが正しくありません。',
      vaultInvalidPin: 'PIN はちょうど 8 桁の数字である必要があります。',
      vaultWeakPin:
        '推測しやすい PIN です(数字の繰り返し、連続、日付っぽい並び)。別のものにしてください。',
      vaultWrongPin: 'PIN が正しくありません。',
      vaultInvalidRecovery: '復元フレーズは 12 語以上である必要があります。',
      vaultWeakRecovery: '推測しやすいフレーズです(異なる語が少ない、または繰り返しが过多)。',
      vaultWrongRecovery: '復元フレーズが一致しません。',
      vaultTampered: '金庫が破損するか改ざんされています。',
      libraryTampered:
        '暗号化されたライブラリが破損するか改ざんされています。データは削除されていません。',
      vaultDestroyed:
        'このセッションで金庫は破棄されました。続行するには新しい金庫を作成してください。',
      vaultDirUnavailable: '保管庫フォルダーを作成できません。権限を確認してください。',
      vaultAuthCancelled: '保管庫フォルダーの作成をキャンセルしました。',
    },
  },

  /**
   * 金庫の入口: 3 つの資格情報と 4 つの作成ステップ。アプリで最も読まれる
   * 文言(起動のたびに現れる画面)なので独立したブロックに置き、
   * `MASTER_PASSWORD_LENGTH`/`PIN_LENGTH`/`RECOVERY_MIN_WORDS` を文中に
   * 埋め込みます。
   */
  auth: {
    createTitle: '金庫を作成',
    createSubtitle:
      'マスターパスワードはちょうど **24 文字**で、すべてを包む鍵です。' +
      'アプリはこれを使ってライブラリを暗号化し、`~/.local/share/cronologia/` に、' +
      '秘密情報を `/var/lib/.cronologia/.vault/` に保管します。',
    masterLabel: 'マスターパスワード(24 文字)',
    masterPlaceholder: '例: Kf7#mQ2!vZ9@pL4$xR8!nW3&',
    masterConfirmLabel: 'マスターパスワードをもう一度',
    masterMismatch: 'パスワードが一致しません。',
    masterLength: (needed: number, actual: number): string =>
      `マスターパスワードはちょうど ${needed} 文字である必要があります(入力は ${actual} 文字)。`,
    pinLabel: 'PIN(8 桁)',
    pinPlaceholder: '例: 49201733',
    pinSubtitle: '日常的に金庫を開くのはこの PIN です。',
    createAction: '金庫を作成',
    creating: '金庫を作成しています…',
    lockout: (time: string): string => `試行が多すぎます。${time} 後に再試行してください。`,
    recoveryTitle: '復元フレーズ',
    recoverySubtitle:
      'PIN を忘れたときに PIN をリセットするフレーズを、**あなたの言葉で**書いてください。' +
      'アプリはこの文を生成も保存もしません: 自分で決めて、コンピュータの外に書き留めてください。',
    recoveryLabel: 'あなたの復元フレーズ',
    recoveryPlaceholder: '例: 冬が明けた日の市場で馬が人参を食べた',
    recoveryConfirmLabel: '復元フレーズをもう一度',
    recoveryMismatch: 'フレーズが一致しません。',
    recoveryTooShort: (needed: number, actual: number): string =>
      `フレーズは ${needed} 語以上である必要があります(${actual} 語を入力)。`,
    recoveryHint: '単語の大文字小文字は区別され、確認時は余分な空白だけ無視します。',
    unlockTitle: '金庫はロック中です',
    unlockSubtitle: 'ライブラリを復号して秘密情報を開くには PIN を入力してください。',
    tabPin: 'PIN',
    tabMaster: 'マスターパスワード',
    masterAvailable: 'PIN を 3 回間違えました: マスターパスワードでも開けます。',
    forgotPin: 'PIN を忘れた',
    unlockAction: '金庫を開く',
    unlocking: '開いています…',
    resetTitle: 'PIN をリセット',
    resetSubtitle:
      '金庫を作ったときに**自分で**書いた復元フレーズで新しい PIN を決めます。' +
      'そのあと金庫が開きます。',
    newPinLabel: '新しい PIN(8 桁)',
    newPinConfirmLabel: '新しい PIN をもう一度',
    pinMismatch: 'PIN が一致しません。',
    resetAction: 'リセットして開く',
    resetting: 'リセットしています…',
    backToPin: 'PIN に戻る',
    changeTitle: '金庫の資格情報を変更',
    changeMasterTitle: 'マスターパスワードを変更',
    changeMasterSubtitle:
      '金庫が開いている間、今のマスターパスワードはそのまま使えます。' +
      '変更はライブラリを**再暗号化しません**: 鍵のラップを書き直すだけなので数秒で終わります。',
    changeMasterCurrent: '現在のマスターパスワード',
    changeMasterNew: '新しいマスターパスワード(24 文字)',
    changeMasterConfirm: '新しいマスターパスワードをもう一度',
    changePinTitle: 'PIN を変更',
    changePinSubtitle:
      '現在の PIN はそのまま使えます。変更は鍵のラップを書き直すだけなので、' +
      'ディスク上のライブラリには触れません。',
    changePinCurrent: '現在の PIN',
    changePinNew: '新しい PIN(8 桁)',
    changePinConfirm: '新しい PIN をもう一度',
    changeAction: '変更',
    changing: '変更しています…',
  },

  /** 資格情報の強度メーター(等級と減点理由)。 */
  strength: {
    hintMaster: '等級は目安です。アプリが拒むのは退化した値だけです。',
    hintPin: '8 桁は「ふつう」を超えません: PIN を守るのはロックアウトです。',
    hintPhrase: '長く繰り返すより、ばらばらで繰り返さない語の方が価値があります。',
    levels: {
      veryWeak: '非常に弱い',
      weak: '弱い',
      fair: 'ふつう',
      strong: '強い',
      veryStrong: '非常に強い',
    },
    reasons: {
      allSame: '同じ文字の繰り返し',
      sequence: '文字の連続',
      repeatedBlock: 'ブロックの繰り返し',
      dateLike: '日付っぽい並び',
      fewKinds: '文字の種類が少ない',
      lowVariety: '異なる文字が少ない',
      commonWord: 'よく使う語を含む',
      shortWords: '語が短すぎる',
      fewUniqueWords: '異なる語が少ない',
      repeatedWords: '同じ語を繰り返しすぎている',
    },
  },

  /** Página HTML que o loopback do OAuth mostra na aba do navegador. */
  oauthPage: {
    deniedTitle: '認証が拒否されました',
    doneTitle: '認証が完了しました',
    deniedBody: 'このタブは閉じて構いません。',
    doneBody: 'このタブを閉じて、アプリケーションに戻ってください。',
  },

  /**
   * IPC 境界を越えるエラー: main が投げ、renderer が拒否された `Error` として
   * 受け取り、ユーザーが画面上で読む。
   *
   * `driveErrors`/`libraryErrors` の中ではなく独立したブロックなのは、発生源が
   * サブシステムではなくウィンドウ境界だから。Drive のエラーは Drive のもので、
   * これはアプリ全体のもの。どちらに入れても発生源が実際より狭く見える。
   */
  errors: {
    /** 発生源ガード: 送信者がアプリページではない。 */
    foreignFrame: 'IPC ブロック：リクエストがアプリのページからではありません。',
  },
};
