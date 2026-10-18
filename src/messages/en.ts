import type { Messages } from '@zero/messages/pt-BR';

/** Mensagens em inglês. A forma é conferida contra `Messages` pelo TypeScript. */
export const en: Messages = {
  common: {
    close: 'Close',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving…',
    loading: 'Loading…',
    select: 'Select',
    none: 'None',
    notFound: 'Not found',
    searchOptions: 'Type to filter…',
    clearSearch: 'Clear search',
    noOptionsFound: 'No options found',
    next: 'Next',
    back: 'Back',
  },

  dialogs: {
    pickCover: 'Choose cover image',
    imageFilter: 'Images',
  },

  app: {
    headerStats: (total: number, average: number): string =>
      `${total} work(s) · average progress ${average}%`,
    searchPlaceholder: 'Search by title…',
    openSettingsTitle: 'Dropbox backup settings',
    openAttributionsTitle: 'View dependency credits and licenses',
    openDonateTitle: 'Support the project with a donation',
    settingsTitle: 'Settings',
    attributionsLabel: 'Attributions',
    donateLabel: 'Donate',
    newWork: 'New work',
    filters: {
      todos: 'All',
      lendo: 'Reading',
      planejado: 'Planned',
      pausado: 'Paused',
      concluido: 'Completed',
      cancelado: 'Cancelled',
    },
    stats: {
      total: 'Total works',
      reading: 'Reading',
      done: 'Completed',
      planned: 'Planned',
      paused: 'Paused',
      cancelled: 'Cancelled',
      average: 'Average progress',
    },
    loadingLibrary: 'Loading library…',
    emptyFoundTitle: 'No works found',
    emptyFoundText: 'Try another filter or search term.',
    emptyLibraryTitle: 'Your library is empty',
    emptyLibraryText: 'Add your first work with a cover and title, and track your progress.',
    addFirstWork: 'Add your first work',
    drivePill: {
      syncing: 'Syncing…',
      connected: 'Dropbox connected',
      off: 'Dropbox disconnected',
    },
    toastSaveError: 'Could not save the work.',
    toastSaved: 'Work saved.',
    toastRemoved: 'Work removed.',
    startupFailed: (detail: string): string =>
      `Could not start Cronologia.\n\nTechnical details: ${detail}`,
  },

  settings: {
    title: 'Settings',
    bannerTitle: (label: string): string => `${label} backup.`,
    bannerBodyDropbox:
      'Your library is written to the app’s reserved folder (inside `/Apps/` in your ' +
      'account): through the API, only this application can see that folder, and the rest ' +
      'of your Dropbox is not even visible to it. Since the folder is visible to you, every ' +
      'file is uploaded with an unreadable name and encrypted content (AES-256-GCM), so set ' +
      'the encryption password below before the first backup.',
    bannerBodyGoogle:
      'This build keeps your library in the hidden folder that belongs to the app (the ' +
      'Google Drive `appDataFolder`), which does not show up in the Google Drive ' +
      'interface and which this app sees on its own: the only scope requested is that ' +
      'folder. Every file is uploaded with an unreadable name and encrypted content ' +
      '(AES-256-GCM), so set the encryption password below before the first backup.',
    languageLabel: 'Language',
    providersLabel: 'Backup providers',
    noOperationalProvider:
      'No backup provider is available in this build: the client keys were not ' +
      'embedded in the binary. The reason for each one is in the list below.',
    hiddenFolder: 'Hidden folder',
    operational: 'Operational',
    notOperational: 'Not operational',
    backupIn: (target: string): string => `Backup in ${target}`,
    passphraseLabel: 'Backup encryption password',
    passphrasePlaceholder: (label: string): string => `Used to encrypt the backup on ${label}`,
    connected: 'Connected',
    disconnected: 'Disconnected',
    accountFallback: (label: string): string => `${label} account`,
    lastBackup: 'Last backup',
    inBackup: (label: string): string => `In the ${label} backup`,
    worksInBackup: (works: number): string => `${works} work(s)`,
    syncingBanner: (label: string): string => `Syncing with ${label}…`,
    disconnectTitle: (label: string): string =>
      `Disconnects the ${label} account from this application`,
    disconnectAction: 'Disconnect',
    authorizing: 'Authorizing…',
    connectAction: (label: string): string => `Connect to ${label}`,
    restoreTitle: (label: string): string =>
      `Downloads the ${label} backup and replaces the current library`,
    restoreAction: 'Restore',
    restoring: 'Restoring…',
    backupAction: 'Back up now',
    sending: 'Uploading…',
    toastSaved: 'Settings saved.',
    toastAuthFailed: 'Authorization failed.',
    toastConnected: (label: string): string => `${label} account connected successfully.`,
    toastBackupFailed: 'Backup failed.',
    toastBackupDone: (label: string): string => `Backup finished in the app folder on ${label}.`,
    toastRestoreFailed: 'Restore failed.',
    toastRestored: (works: number): string => `Backup restored: ${works} work(s).`,
    toastDisconnected: (label: string): string => `${label} account disconnected.`,
    toastPurgeFailed: 'Could not delete the backup from the cloud.',
    providerSwitched: (label: string): string => `Backup now goes to ${label}.`,
    providerSwitchFailed: 'Could not switch the backup provider.',
    translationNotice: {
      title: 'Translation notice',
      text: "I don't speak any of these languages except Portuguese, and all translations are done by AI. Like everything in this world, there may be errors, so please have a little patience.",
      translationNotice2:
        'If you would like to help improve the translation, please open an issue on the project repository.',
    },
  },

  restore: {
    title: 'Backup password',
    banner: (label: string): string =>
      `Enter the encryption password used when you **backed up** to ${label}. ` +
      'It is required to decrypt the downloaded files.',
    passphraseLabel: 'Encryption password',
    passphrasePlaceholder: 'Password used in the backup',
    action: 'Restore',
  },

  workModal: {
    newTitle: 'New work',
    editTitle: 'Edit work',
    titleRequired: 'Enter the work title.',
    saveError: 'Failed to save.',
    coverAlt: 'Cover preview',
    coverHelp:
      'Add the work cover image (JPG, PNG, WebP…). The image is copied to the local library.',
    chooseImage: 'Choose image',
    removeCover: 'Remove cover',
    titleLabel: 'Title',
    titlePlaceholder: 'e.g. Solo Leveling',
    synopsisLabel: 'Description',
    synopsisPlaceholder: 'Write the work description…',
    typeLabel: 'Type',
    statusLabel: 'Status',
    categoryLabel: 'Category',
    markerLabel: 'Marker (optional)',
    markerPlaceholder: 'Ch. 45 / Vol. 3',
    progressLabel: 'Reading progress',
    decreaseStep: (step: number): string => `Decrease ${step}`,
    increaseStep: (step: number): string => `Increase ${step}`,
    progressValue: (progress: number): string => `Ch. ${progress}`,
    finish: 'Complete',
    reset: 'Reset',
    confirmDelete: 'Confirm deletion?',
    deleteAction: 'Delete',
  },

  workCard: {
    coverOf: (title: string): string => `Cover of ${title}`,
    untitled: 'Untitled',
    progress: 'Progress',
    progressValue: (progress: number): string => `Ch. ${progress}`,
    increase1: 'Increase 1',
    decrease1: 'Decrease 1',
    reopen: 'Reopen',
    resume: 'Resume',
    finish: 'Complete',
    pause: 'Pause',
    cancel: 'Cancel',
  },

  attributions: {
    ariaLabel: 'Attributions',
    title: 'Attributions',
    bannerTitle: 'Project credits.',
    bannerBody:
      'These are the open source dependencies used in Cronologia, all under ' +
      'OSI-approved permissive licenses. Exact versions are in ' +
      '`package.json` / `package-lock.json`.',
    pause: 'Pause',
    resume: 'Resume',
    hoverHint: 'Hover over the credits to pause.',
    creditsAria: 'Scrolling credits',
    creditsSubtitle: 'thanks these dependencies',
    creditsEnd: 'End',
    creditsLoop: 'the credits restart in a loop',
  },

  donate: {
    ariaLabel: 'Donations',
    title: 'Support the project',
    banner:
      'If every reader bought a small coffee, the production review of the app on Dropbox ' +
      'would land before the next chapter.',
    text1:
      'This project was born for the otaku community: a place to save our readings and not ' +
      'get lost if we lose access to our favorite reading platforms.',
    text2:
      'Like it or not, I am more broke than week-old rice and cloud backup depends on ' +
      'Dropbox: until the app passes production review, after the first 50 connected ' +
      'accounts it gets a 2-week clock to be approved or it stops accepting new people. ' +
      'Your donation helps keep the app (and my patience) up.',
    text3:
      'The truth is this project is personal, for me to track my own readings. Because you, ' +
      'a hardened otaku like me, know what it is to watch your favorite platform go down ' +
      'the drain and lose every bit of your reading progress.',
    text4:
      'But if by some miracle this project ever receives donations, I will do my best to ' +
      'make it as complete as possible so we can sleep soundly, without fear of waking up ' +
      'the next day and finding that your reader history went down the drain.',
    openTitle: 'Opens the donation page in the browser',
    donateNow: 'Donate now',
    copyTitle: 'Copies the donation link',
    copyLink: 'Copy link',
    copied: 'Copied!',
    thanks: 'Thanks for keeping the library alive, happy reading!',
  },

  workTypes: {
    webtoon: 'Webtoon',
    manhwa: 'Manhwa',
    manhua: 'Manhua',
    manga: 'Manga',
    livro: 'Book',
    outro: 'Other',
  },

  workStatus: {
    planejado: 'Planned',
    lendo: 'Reading',
    pausado: 'Paused',
    concluido: 'Completed',
    cancelado: 'Cancelled',
  },

  providers: {
    dropboxStorageTarget: '/Apps/Cronologia (folder visible in your account)',
    googleStorageTarget:
      'appDataFolder (hidden folder, does not appear in the Google Drive interface)',
    googleNoCredentials:
      'This build carries no Google Drive credential: the app is identified by a key ' +
      'pair that goes into the binary at release time. Until that pair is published, ' +
      'the backup uses Dropbox.',
  },

  driveErrors: {
    notEncrypted: 'This is not an encrypted backup.',
    truncated: 'Backup truncated or corrupted.',
    definePassphrase: 'Set a backup encryption password in Settings.',
    needsPassphrase: 'This backup is encrypted. Enter the encryption password.',
    wrongPassphrase: 'Incorrect encryption password or corrupted backup.',
    invalidManifest: 'Invalid backup manifest.',
    syncInProgress: 'Sync already in progress.',
    connectFirst: (provider: string): string => `Connect the ${provider} account first.`,
    emptyLibrary: 'No local library to back up. Add at least one work.',
    noBackupFound: (provider: string): string =>
      `No backup found in the app folder on ${provider}.`,
    invalidLibrary: 'Invalid backup (library.json corrupted).',
    invalidListResponse: (provider: string): string =>
      `Invalid ${provider} API response (file listing).`,
    tokenTimeout: 'Timed out waiting for authorization.',
    authCancelled: 'Authorization cancelled.',
    csrfRejected: 'Authorization callback from another origin; the connection was refused.',
    tokenFailed: (status: number): string => `Failed to obtain tokens (${status}).`,
    invalidTokenResponse: (status: number): string => `Invalid token response (${status}).`,
    configureAppKey: 'This build has no DROPBOX_APP_KEY. Set the variable and rebuild.',
    sessionExpired: (provider: string): string =>
      `Session expired. Connect the ${provider} account again.`,
    refreshFailed: (provider: string): string => `Could not refresh the ${provider} session.`,
    noAccount: (provider: string): string => `No ${provider} account connected.`,
    permissionsUpdated: (provider: string): string =>
      `${provider} permissions updated. Reconnect the ${provider} account.`,
    missingScopes: (provider: string): string =>
      `Permissions are missing in the ${provider} app. Check every scope in the app ` +
      'developer panel, then disconnect and reconnect.',
    missingScopesList: (provider: string, missing: string): string =>
      `Permissions are missing in the ${provider} app (${missing}). Check every scope in ` +
      'the app developer panel and reconnect.',
    providerHttp: (label: string, status: number, response: string): string =>
      response === ''
        ? `${label} error (HTTP ${status}).`
        : `${label} error (HTTP ${status}). Response: ${response}`,
    restoreLocked: (seconds: number): string =>
      seconds < 60
        ? `Too many failed restore attempts with the wrong password. Try again in ${seconds} seconds.`
        : `Too many failed restore attempts with the wrong password. Try again in ${Math.ceil(seconds / 60)} minutes.`,
    purgePartial: (deleted: number, failed: number): string =>
      `${deleted} file(s) deleted from the cloud and ${failed} pending. The account is still connected; try again to delete what is left.`,
  },

  /** Zona de risco: ações destrutivas, todas com confirmação em 2 etapas. */
  danger: {
    zoneLabel: 'Danger zone',
    zoneBody: 'These actions are irreversible and overwrite the files before deleting them.',
    resetTitle: 'Delete the library (works and covers)',
    resetAction: 'Delete library',
    resetConfirm:
      'All works and covers will be overwritten and deleted from this computer. The cloud backup is not affected.',
    resetWord: 'DELETE',
    purgeTitle: 'Delete the cloud backup',
    purgeAction: 'Delete backup',
    purgeConfirm:
      'Every file of the backup will be deleted from the connected account. There is no going back: the reading history cannot be recovered.',
    destroyTitle: 'Destroy the vault (deletes library and secrets)',
    destroyAction: 'Destroy vault',
    destroyConfirm:
      'The vault will be overwritten and deleted. The library and the app secrets will be lost. The cloud backup is not affected.',
    destroyWord: 'DESTROY',
    typeLabel: (word: string): string => `Type ${word} to confirm. This step cannot be undone.`,
    confirmAction: 'Confirm',
    irreversible: 'This action cannot be undone.',
    libraryReset: 'Library deleted.',
    resetPartial: (shredded: number, failed: number): string =>
      `${shredded} file(s) overwritten and deleted, but ${failed} could not be deleted. Leftovers may remain on disk; restart the app and try again.`,
    vaultDestroyed: 'Vault destroyed. Create a new one to continue.',
    cloudPurged: 'Backup deleted from the cloud.',
    libraryLocked: 'Unlock the vault to delete the library.',
  },

  /** Erros do domínio de obras (a UI só exibe a mensagem vinda do main). */
  libraryErrors: {
    invalidId: 'Invalid work identifier.',
  },

  /** Vault: entry barrier (create, unlock, recover) and management in the UI. */
  vault: {
    closeVault: 'Lock vault',
    autoLocked: 'The vault locked itself after a period of inactivity.',
    createHint: 'Create a vault to store the encrypted library and the app secrets.',
    badge: {
      open: 'Vault open',
      closed: 'Vault locked',
      none: 'No vault',
    },
    errors: {
      vaultExists: 'A vault already exists on this computer.',
      vaultMissing: 'No vault found.',
      vaultLocked: 'The vault is locked.',
      vaultLockedOut: 'Too many attempts. Wait before trying again.',
      vaultInvalidMaster: 'The master password must be exactly 24 characters long.',
      vaultWeakMaster:
        'Predictable master password (repeated character, sequence or repeated block). Choose another one.',
      vaultWrongMaster: 'Incorrect master password.',
      vaultInvalidPin: 'The PIN must be exactly 8 digits.',
      vaultWeakPin: 'Predictable PIN (repeated digits, sequence or date). Choose another one.',
      vaultWrongPin: 'Incorrect PIN.',
      vaultInvalidRecovery: 'The recovery phrase must have at least 12 words.',
      vaultWeakRecovery: 'Predictable phrase (too few distinct words or too many repetitions).',
      vaultWrongRecovery: 'The recovery phrase does not match.',
      vaultTampered: 'The vault is damaged or was altered.',
      libraryTampered: 'The encrypted library is damaged or was altered. No data was deleted.',
      vaultDestroyed: 'The vault was destroyed in this session. Create a new one to continue.',
      vaultDirUnavailable: 'Could not create the vault folder. Check the permissions.',
      vaultAuthCancelled: 'Creating the vault folder was cancelled.',
    },
  },

  /**
   * Vault entry: the three credentials and the four creation steps. They live in
   * their own block because this is the most-read text in the app (the barrier
   * shows on every launch) and because it needs the constants from
   * `MASTER_PASSWORD_LENGTH`/`PIN_LENGTH`/`RECOVERY_MIN_WORDS` interpolated.
   */
  auth: {
    createTitle: 'Create the vault',
    createSubtitle:
      'The master password is exactly **24 characters** and is the key that wraps everything. ' +
      'The app keeps the library and the secrets encrypted with it, in `/var/lib/.cronologia/.vault/`.',
    masterLabel: 'Master password (24 characters)',
    masterPlaceholder: 'e.g. Kf7#mQ2!vZ9@pL4$xR8!nW3&',
    masterConfirmLabel: 'Repeat the master password',
    masterMismatch: 'The passwords do not match.',
    masterLength: (needed: number, actual: number): string =>
      `The master password must be exactly ${needed} characters (you typed ${actual}).`,
    pinLabel: 'PIN (8 digits)',
    pinPlaceholder: 'e.g. 49201733',
    pinSubtitle: 'This is what you use to open the vault every day.',
    createAction: 'Create vault',
    creating: 'Creating vault…',
    lockout: (time: string): string => `Too many attempts. Try again in ${time}.`,
    recoveryTitle: 'Recovery phrase',
    recoverySubtitle:
      'Write **in your own words** the phrase that will reset the PIN if you forget it. ' +
      'The app neither generates nor stores this text: you decide it and write it down outside the computer.',
    recoveryLabel: 'Your recovery phrase',
    recoveryPlaceholder: 'e.g. the horse ate the carrot at the fair after winter',
    recoveryConfirmLabel: 'Repeat the recovery phrase',
    recoveryMismatch: 'The phrases do not match.',
    recoveryTooShort: (needed: number, actual: number): string =>
      `The phrase needs at least ${needed} words (you wrote ${actual}).`,
    recoveryHint: 'Capitalisation counts. Only extra spaces are ignored when checking.',
    unlockTitle: 'Vault locked',
    unlockSubtitle: 'Enter the PIN to decrypt the library and unlock the secrets.',
    tabPin: 'PIN',
    tabMaster: 'Master password',
    masterAvailable: 'Wrong PIN 3 times: the master password can open the vault too.',
    forgotPin: 'I forgot the PIN',
    unlockAction: 'Open vault',
    unlocking: 'Opening…',
    resetTitle: 'Reset the PIN',
    resetSubtitle:
      'Use the recovery phrase **you** wrote when creating the vault to choose a new PIN. ' +
      'The vault opens right after.',
    newPinLabel: 'New PIN (8 digits)',
    newPinConfirmLabel: 'Repeat the new PIN',
    pinMismatch: 'The PINs do not match.',
    resetAction: 'Reset and open',
    resetting: 'Resetting…',
    backToPin: 'Back to the PIN',
    changeTitle: 'Change the vault credential',
    changeMasterTitle: 'Change the master password',
    changeMasterSubtitle:
      "Today's master password keeps working while the vault is open. " +
      'The change **does not** re-encrypt the library: it only rewrites the key wrap, in seconds.',
    changeMasterCurrent: 'Current master password',
    changeMasterNew: 'New master password (24 characters)',
    changeMasterConfirm: 'Repeat the new master password',
    changePinTitle: 'Change the PIN',
    changePinSubtitle:
      "Today's PIN keeps working. The change only rewrites the key wrap, " +
      'so the library on disk is left untouched.',
    changePinCurrent: 'Current PIN',
    changePinNew: 'New PIN (8 digits)',
    changePinConfirm: 'Repeat the new PIN',
    changeAction: 'Change',
    changing: 'Changing…',
  },

  /** Credential strength meter (label and reason for the grade). */
  strength: {
    hintMaster: 'The grade guides you; the app only rejects what is degenerate.',
    hintPin: 'Eight digits never get past "fair": what protects the PIN is the lockout.',
    hintPhrase: 'Varied, non-repeated words are worth more than long ones.',
    levels: {
      veryWeak: 'Very weak',
      weak: 'Weak',
      fair: 'Fair',
      strong: 'Strong',
      veryStrong: 'Very strong',
    },
    reasons: {
      allSame: 'the same character repeated',
      sequence: 'a character sequence',
      repeatedBlock: 'a repeated block',
      dateLike: 'looks like a date',
      fewKinds: 'too few character kinds',
      lowVariety: 'too few distinct characters',
      commonWord: 'contains a common word',
      shortWords: 'words too short',
      fewUniqueWords: 'too few distinct words',
      repeatedWords: 'a word repeated too many times',
    },
  },

  /** HTML page the OAuth loopback shows in the browser tab. */
  oauthPage: {
    deniedTitle: 'Authorization denied',
    doneTitle: 'Authorization complete',
    deniedBody: 'You can close this tab.',
    doneBody: 'You can close this tab and return to the application.',
  },

  /**
   * Errors that **cross the IPC boundary**: the main throws, the renderer
   * receives the rejected `Error` and the person reads it on screen.
   *
   * In a block of its own (not inside `driveErrors`/`libraryErrors`) because
   * their origin is not a subsystem, it is the window boundary. A Drive error
   * belongs to Drive; this one belongs to the whole app, and filing it under
   * either would make the origin look narrower than it is.
   */
  errors: {
    /** Origin guard: the emitter is not the app page. */
    foreignFrame: 'IPC blocked: the request did not come from the app page.',
  },
};
