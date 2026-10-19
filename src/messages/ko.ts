import type { Messages } from '@zero/messages/pt-BR';

/** Mensagens em coreano. A forma é conferida contra `Messages` pelo TypeScript. */
export const ko: Messages = {
  common: {
    close: '닫기',
    cancel: '취소',
    save: '저장',
    saving: '저장 중…',
    loading: '불러오는 중…',
    select: '선택',
    none: '없음',
    notFound: '찾을 수 없음',
    searchOptions: '입력하여 필터링…',
    clearSearch: '검색 지우기',
    noOptionsFound: '일치하는 항목 없음',
    next: '다음',
    back: '뒤로',
  },

  dialogs: {
    pickCover: '표지 이미지 선택',
    imageFilter: '이미지',
  },

  app: {
    headerStats: (total: number, average: number): string =>
      `${total}개 작품 · 평균 진행률 ${average}%`,
    searchPlaceholder: '제목으로 검색…',
    openSettingsTitle: 'Dropbox 백업 설정',
    openAttributionsTitle: '의존성 크레딧 및 라이선스 보기',
    openDonateTitle: '후원으로 프로젝트 지원하기',
    settingsTitle: '설정',
    attributionsLabel: '크레딧',
    donateLabel: '후원',
    newWork: '새 작품',
    filters: {
      todos: '전체',
      lendo: '읽는 중',
      planejado: '예정',
      pausado: '일시정지',
      concluido: '완독',
      cancelado: '중단',
    },
    stats: {
      total: '전체 작품',
      reading: '읽는 중',
      done: '완독',
      planned: '예정',
      paused: '일시정지',
      cancelled: '중단',
      average: '평균 진행률',
    },
    loadingLibrary: '라이브러리를 불러오는 중…',
    emptyFoundTitle: '작품을 찾을 수 없습니다',
    emptyFoundText: '다른 필터나 검색어로 시도해 보세요.',
    emptyLibraryTitle: '라이브러리가 비어 있습니다',
    emptyLibraryText: '첫 작품에 표지와 제목을 추가하고 진행률을 기록하세요.',
    addFirstWork: '첫 작품 추가하기',
    drivePill: {
      syncing: '동기화 중…',
      connected: 'Dropbox 연결됨',
      off: 'Dropbox 연결 해제됨',
    },
    toastSaveError: '작품을 저장할 수 없습니다.',
    toastSaved: '작품이 저장되었습니다.',
    toastRemoved: '작품이 삭제되었습니다.',
    startupFailed: (detail: string): string =>
      `Cronologia를 시작하지 못했습니다.\n\n기술 세부 정보: ${detail}`,
  },

  settings: {
    title: '설정',
    bannerTitle: (label: string): string => `${label} 백업.`,
    bannerBodyDropbox:
      '라이브러리는 앱 전용 폴더에 저장됩니다(계정의 `/Apps/` 안): API를 통해 이 ' +
      '앱만 그 폴더를 볼 수 있으며, 나머지 Dropbox는 이 앱에 보이지도 않습니다. 폴더는 ' +
      '계정에서 보이므로, 모든 파일은 알아볼 수 없는 이름과 암호화된 내용(AES-256-GCM)으로 ' +
      '업로드됩니다. 첫 백업 전에 아래에서 암호화 비밀번호를 설정하세요.',
    bannerBodyGoogle:
      '이 빌드는 라이브러리를 앱 전용 숨김 폴더(Google Drive의 `appDataFolder`)에 ' +
      '저장합니다. 이 폴더는 Google Drive 화면에 나타나지 않으며 이 앱만 볼 수 ' +
      '있습니다. 요청한 범위는 이 폴더 하나뿐입니다. 모든 파일은 알아볼 수 없는 이름과 ' +
      '암호화된 내용(AES-256-GCM)으로 업로드되므로 첫 백업 전에 아래에서 암호화 ' +
      '비밀번호를 설정하세요.',
    languageLabel: '언어',
    providersLabel: '백업 제공업체',
    noOperationalProvider:
      '이 빌드에서 사용할 수 있는 백업 제공업체가 없습니다: 클라이언트 키가 바이너리에 ' +
      '포함되지 않았습니다. 아래 목록에 각 제공업체의 이유가 있습니다.',
    hiddenFolder: '숨김 폴더',
    operational: '사용 가능',
    notOperational: '사용 불가',
    backupIn: (target: string): string => `${target}에 백업`,
    passphraseLabel: '백업 암호화 비밀번호',
    passphrasePlaceholder: (label: string): string => `${label} 백업 암호화에 사용`,
    connected: '연결됨',
    disconnected: '연결 해제됨',
    accountFallback: (label: string): string => `${label} 계정`,
    lastBackup: '마지막 백업',
    inBackup: (label: string): string => `${label} 백업 내`,
    worksInBackup: (works: number): string => `${works}개 작품`,
    syncingBanner: (label: string): string => `${label}와 동기화하는 중…`,
    disconnectTitle: (label: string): string => `이 앱에서 ${label} 계정 연결 해제`,
    disconnectAction: '연결 해제',
    authorizing: '인증 중…',
    connectAction: (label: string): string => `${label}에 연결`,
    restoreTitle: (label: string): string => `${label} 백업을 내려받아 현재 라이브러리를 교체`,
    restoreAction: '복원',
    restoring: '복원 중…',
    backupAction: '지금 백업하기',
    sending: '업로드 중…',
    toastSaved: '설정이 저장되었습니다.',
    toastAuthFailed: '인증에 실패했습니다.',
    toastConnected: (label: string): string => `${label} 계정이 연결되었습니다.`,
    toastBackupFailed: '백업에 실패했습니다.',
    toastBackupDone: (label: string): string => `${label} 앱 폴더에 백업이 완료되었습니다.`,
    toastRestoreFailed: '복원에 실패했습니다.',
    toastRestored: (works: number): string => `백업에서 ${works}개 작품을 복원했습니다.`,
    toastDisconnected: (label: string): string => `${label} 계정 연결이 해제되었습니다.`,
    toastPurgeFailed: '클라우드에서 백업을 삭제하지 못했습니다.',
    providerSwitched: (label: string): string => `이제 백업은 ${label}(으)로 갑니다.`,
    providerSwitchFailed: '백업 제공업체를 변경하지 못했습니다.',
    translationNotice: {
      title: '번역 안내',
      text: '이 언어들 중에서 포르투갈어를 제외하고는 할 줄 모릅니다. 모든 번역은 AI가 했습니다. 세상의 모든 것과 마찬가지로 오류가 있을 수 있으니 너그러운 양해 부탁드립니다.',
      translationNotice2: '번역 개선에 도움을 주고 싶다면 프로젝트 저장소에 이슈를 열어 주세요.',
    },
  },

  restore: {
    title: '백업 비밀번호',
    banner: (label: string): string =>
      `${label}에 **백업할 때** 사용한 암호화 비밀번호를 입력하세요. ` +
      '내려받은 파일의 암호를 푸는 데 필요합니다.',
    passphraseLabel: '암호화 비밀번호',
    passphrasePlaceholder: '백업에 사용한 비밀번호',
    action: '복원',
  },

  workModal: {
    newTitle: '새 작품',
    editTitle: '작품 편집',
    titleRequired: '작품 제목을 입력하세요.',
    saveError: '저장에 실패했습니다.',
    coverAlt: '표지 미리보기',
    coverHelp:
      '작품 표지 이미지를 추가하세요(JPG, PNG, WebP…). 이미지는 로컬 라이브러리에 복사됩니다.',
    chooseImage: '이미지 선택',
    removeCover: '표지 제거',
    titleLabel: '제목',
    titlePlaceholder: '예: 나 혼자만 레벨업',
    synopsisLabel: '설명',
    synopsisPlaceholder: '작품 설명을 작성하세요...',
    typeLabel: '종류',
    statusLabel: '상태',
    categoryLabel: '카테고리',
    markerLabel: '표시 (선택 사항)',
    markerPlaceholder: '45화 / 3권',
    progressLabel: '읽기 진행률',
    decreaseStep: (step: number): string => `${step} 감소`,
    increaseStep: (step: number): string => `${step} 증가`,
    progressValue: (progress: number): string => `${progress}화`,
    finish: '완독',
    reset: '초기화',
    confirmDelete: '삭제하시겠습니까?',
    deleteAction: '삭제',
  },

  workCard: {
    coverOf: (title: string): string => `${title} 표지`,
    untitled: '제목 없음',
    progress: '진행률',
    progressValue: (progress: number): string => `${progress}화`,
    increase1: '1 증가',
    decrease1: '1 감소',
    reopen: '다시 열기',
    resume: '계속 읽기',
    finish: '완독',
    pause: '일시정지',
    cancel: '취소',
  },

  attributions: {
    ariaLabel: '크레딧',
    title: '크레딧',
    bannerTitle: '프로젝트 크레딧.',
    bannerBody:
      'Cronologia에 사용된 오픈 소스 의존성 목록이며, 모두 OSI 승인 허용 ' +
      '라이선스입니다. 정확한 버전은 `package.json` / `package-lock.json`에 있습니다.',
    pause: '일시정지',
    resume: '계속',
    hoverHint: '크레딧 위에 마우스를 올리면 멈춥니다.',
    creditsAria: '스크롤 크레딧',
    creditsSubtitle: '다음 의존성에 감사드립니다',
    creditsEnd: '끝',
    creditsLoop: '크레딧이 반복됩니다',
  },

  donate: {
    ariaLabel: '후원',
    title: '프로젝트 후원하기',
    banner:
      '독자 한 분 한 분이 커피 한 잔 값을 내주신다면, Dropbox 앱의 정식 심사가 다음 ' +
      '화보다 먼저 끝날 텐데요.',
    text1:
      '이 프로젝트는 오타쿠 커뮤니티를 위해 태어났습니다: 좋아하는 읽기 플랫폼에 ' +
      '접근하지 못하게 되더라도 헤매지 않도록, 우리의 읽기를 저장하는 곳입니다.',
    text2:
      '좋든 싫든 저는 정말 빈털터리이고, 클라우드 백업은 Dropbox에 달려 있습니다: 앱이 ' +
      '정식 심사를 통과하기 전까지는 처음 50개 계정이 연결된 뒤 2주 안에 승인받지 못하면 ' +
      '신규 가입을 받지 못합니다. 여러분의 후원이 앱(과 제 인내심)을 유지하는 데 도움이 ' +
      '됩니다.',
    text3:
      '사실 이 프로젝트는 제 읽기를 기록하기 위한 개인 프로젝트입니다. 저처럼 단련된 ' +
      '오타쿠라면 아실 겁니다, 좋아하던 플랫폼이 망해서 읽기 기록을 몽땅 날려버리는 게 ' +
      '어떤 기분인지.',
    text4:
      '하지만 기적처럼 이 프로젝트에 후원이 들어온다면, 다음 날 아침에 일어나 리더 ' +
      '기록이 사라진 걸 보지 않고 편히 잠들 수 있도록, 최대한 완벽하게 만들겠습니다.',
    openTitle: '브라우저에서 후원 페이지 열기',
    donateNow: '지금 후원하기',
    copyTitle: '후원 링크 복사',
    copyLink: '링크 복사',
    copied: '복사됨!',
    thanks: '라이브러리를 살려주셔서 감사합니다. 즐거운 독서 되세요!',
  },

  workTypes: {
    webtoon: 'Webtoon',
    manhwa: 'Manhwa',
    manhua: 'Manhua',
    manga: 'Manga',
    livro: '책',
    outro: '기타',
  },

  workStatus: {
    planejado: '예정',
    lendo: '읽는 중',
    pausado: '일시정지',
    concluido: '완독',
    cancelado: '중단',
  },

  providers: {
    dropboxStorageTarget: '/Apps/Cronologia (계정에 보이는 폴더)',
    googleStorageTarget: 'appDataFolder (숨김 폴더, Google Drive 화면에 나타나지 않음)',
    googleNoCredentials:
      '이 빌드에는 Google Drive 자격 증명이 없습니다. 앱은 배포 시 바이너리에 들어가는 ' +
      '키 쌍으로 식별됩니다. 그 키 쌍이 공개되기 전까지 백업은 Dropbox를 사용합니다.',
  },

  driveErrors: {
    notEncrypted: '암호화된 백업이 아닙니다.',
    truncated: '백업이 잘렸거나 손상되었습니다.',
    definePassphrase: '설정에서 백업 암호화 비밀번호를 설정하세요.',
    needsPassphrase: '이 백업은 암호화되어 있습니다. 암호화 비밀번호를 입력하세요.',
    wrongPassphrase: '암호화 비밀번호가 틀렸거나 백업이 손상되었습니다.',
    invalidManifest: '백업 매니페스트가 유효하지 않습니다.',
    syncInProgress: '동기화가 이미 진행 중입니다.',
    connectFirst: (provider: string): string => `먼저 ${provider} 계정을 연결하세요.`,
    emptyLibrary: '백업할 로컬 라이브러리가 없습니다. 작품을 하나 이상 추가하세요.',
    noBackupFound: (provider: string): string =>
      `${provider}의 앱 폴더에서 백업을 찾을 수 없습니다.`,
    invalidLibrary: '백업이 유효하지 않습니다(library.json 손상).',
    invalidListResponse: (provider: string): string =>
      `${provider} API 응답이 유효하지 않습니다(파일 목록).`,
    tokenTimeout: '인증 대기 시간이 초과되었습니다.',
    authCancelled: '인증이 취소되었습니다.',
    csrfRejected: '다른 출처의 인증 콜백이었습니다. 연결을 거부했습니다.',
    tokenFailed: (status: number): string => `토큰을 가져오지 못했습니다(${status}).`,
    invalidTokenResponse: (status: number): string => `토큰 응답이 유효하지 않습니다(${status}).`,
    configureAppKey: '이 빌드에 DROPBOX_APP_KEY가 없습니다. 변수를 설정하고 다시 빌드하세요.',
    sessionExpired: (provider: string): string =>
      `세션이 만료되었습니다. ${provider} 계정을 다시 연결하세요.`,
    refreshFailed: (provider: string): string => `${provider} 세션을 새로고침할 수 없습니다.`,
    noAccount: (provider: string): string => `연결된 ${provider} 계정이 없습니다.`,
    permissionsUpdated: (provider: string): string =>
      `${provider} 권한이 업데이트되었습니다. ${provider} 계정을 다시 연결하세요.`,
    missingScopes: (provider: string): string =>
      `${provider} 앱에 권한이 부족합니다. 앱 개발자 콘솔에서 모든 범위를 ` +
      '선택한 뒤 연결 해제 후 다시 연결하세요.',
    missingScopesList: (provider: string, missing: string): string =>
      `${provider} 앱에 권한이 부족합니다(${missing}). 앱 개발자 콘솔에서 모든 범위를 ` +
      '선택한 뒤 다시 연결하세요.',
    providerHttp: (label: string, status: number, response: string): string =>
      response === ''
        ? `${label} 오류(HTTP ${status}).`
        : `${label} 오류(HTTP ${status}). 응답: ${response}`,
    restoreLocked: (seconds: number): string =>
      seconds < 60
        ? `잘못된 암호로 복원 시도가 너무 많습니다. ${seconds}초 후 다시 시도하세요.`
        : `잘못된 암호로 복원 시도가 너무 많습니다. ${Math.ceil(seconds / 60)}분 후 다시 시도하세요.`,
    purgePartial: (deleted: number, failed: number): string =>
      `클라우드에서 ${deleted}개 파일을 삭제하고 ${failed}개가 남아 있습니다. 계정이 계속 연결되어 있으니 다시 시도해 나머지를 삭제하세요.`,
  },

  /** Zona de risco: ações destrutivas, todas com confirmação em 2 etapas. */
  danger: {
    zoneLabel: '위험 구역',
    zoneBody: '이 작업은 되돌릴 수 없으며, 파일을 삭제하기 전에 덮어씁니다.',
    resetTitle: '라이브러리 삭제(작품과 표지)',
    resetAction: '라이브러리 삭제',
    resetConfirm:
      '모든 작품과 표지가 이 컴퓨터에서 덮어써진 뒤 삭제됩니다. 클라우드 백업은 변경되지 않습니다.',
    resetWord: '삭제',
    purgeTitle: '클라우드 백업 삭제',
    purgeAction: '백업 삭제',
    purgeConfirm:
      '백업의 모든 파일이 연결된 계정에서 삭제됩니다. 되돌릴 수 없으며 읽기 기록은 복구할 수 없습니다.',
    destroyTitle: '금고 파괴(라이브러리와 비밀 삭제)',
    destroyAction: '금고 파괴',
    destroyConfirm:
      '금고가 덮어써진 뒤 삭제됩니다. 라이브러리와 앱의 비밀을 잃게 됩니다. 클라우드 백업은 변경되지 않습니다.',
    destroyWord: '파괴',
    typeLabel: (word: string): string =>
      `${word}를 입력하여 확인하세요. 이 단계는 되돌릴 수 없습니다.`,
    confirmAction: '확인',
    irreversible: '이 작업은 되돌릴 수 없습니다.',
    libraryReset: '라이브러리가 삭제되었습니다.',
    resetPartial: (shredded: number, failed: number): string =>
      `${shredded}개 파일을 덮어쓰고 삭제했지만 ${failed}개는 삭제하지 못했습니다. 디스크에 잔여물이 남았을 수 있으니 앱을 다시 시작한 뒤 재시도하세요.`,
    vaultDestroyed: '금고가 파괴되었습니다. 계속하려면 새 금고를 만드세요.',
    cloudPurged: '백업이 클라우드에서 삭제되었습니다.',
    libraryLocked: '라이브러리를 삭제하려면 금고를 잠금 해제하세요.',
  },

  /** Erros do domínio de obras (a UI só exibe a mensagem vinda do main). */
  libraryErrors: {
    invalidId: '잘못된 작품 식별자입니다.',
  },

  /** 비밀 금고: 모달, UI 배지, 도메인 오류. */
  vault: {
    closeVault: '금고 닫기',
    autoLocked: '비밀 금고가 비활성 상태라 자동으로 잠겼습니다.',
    createHint: '암호화된 라이브러리와 앱 비밀을 보관할 금고를 만드세요.',
    badge: {
      open: '금고 열림',
      closed: '금고 잠김',
      none: '금고 없음',
    },
    errors: {
      vaultExists: '이 컴퓨터에 이미 금고가 있습니다.',
      vaultMissing: '금고를 찾을 수 없습니다.',
      vaultLocked: '금고가 잠겨 있습니다.',
      vaultLockedOut: '시도가 너무 많습니다. 잠시 후 다시 시도하세요.',
      vaultInvalidMaster: '마스터 비밀번호는 정확히 24자여야 합니다.',
      vaultWeakMaster:
        '예측하기 쉬운 마스터 비밀번호입니다(반복 문자, 연속, 반복 블록). 다른 것을 쓰세요.',
      vaultWrongMaster: '마스터 비밀번호가 올바르지 않습니다.',
      vaultInvalidPin: 'PIN은 정확히 8자리 숫자여야 합니다.',
      vaultWeakPin: '예측하기 쉬운 PIN입니다(반복 숫자, 연속, 날짜 형태). 다른 것을 쓰세요.',
      vaultWrongPin: 'PIN이 올바르지 않습니다.',
      vaultInvalidRecovery: '복구 문장은 최소 12단어여야 합니다.',
      vaultWeakRecovery: '예측하기 쉬운 문장입니다(서로 다른 단어가 적거나 반복이 많음).',
      vaultWrongRecovery: '복구 문장이 일치하지 않습니다.',
      vaultTampered: '금고가 손상되었거나 변경되었습니다.',
      libraryTampered:
        '암호화된 라이브러리가 손상되었거나 변경되었습니다. 데이터는 삭제되지 않았습니다.',
      vaultDestroyed: '이 세션에서 금고가 파괴되었습니다. 계속하려면 새 금고를 만드세요.',
      vaultDirUnavailable: '보관함 폴더를 만들 수 없습니다. 권한을 확인하세요.',
      vaultAuthCancelled: '보관함 폴더 만들기가 취소되었습니다.',
    },
  },

  /**
   * 금고 진입: 세 가지 자격 증명과 네 단계 생성. 앱에서 가장 많이 읽히는
   * 문안(실행할 때마다 나타나는 진입 화면)이므로 별도 블록에 두고,
   * `MASTER_PASSWORD_LENGTH`/`PIN_LENGTH`/`RECOVERY_MIN_WORDS` 상수를 문장에
   * 넣습니다.
   */
  auth: {
    createTitle: '금고 만들기',
    createSubtitle:
      '마스터 비밀번호는 정확히 **24자**이며 모든 것을 감싸는 키입니다. ' +
      '앱은 이 키로 라이브러리를 암호화해 `~/.local/share/cronologia/`에, ' +
      '비밀은 `/var/lib/.cronologia/.vault/`에 보관합니다.',
    masterLabel: '마스터 비밀번호 (24자)',
    masterPlaceholder: '예: Kf7#mQ2!vZ9@pL4$xR8!nW3&',
    masterConfirmLabel: '마스터 비밀번호 다시 입력',
    masterMismatch: '비밀번호가 일치하지 않습니다.',
    masterLength: (needed: number, actual: number): string =>
      `마스터 비밀번호는 정확히 ${needed}자여야 합니다(입력 ${actual}자).`,
    pinLabel: 'PIN (8자리)',
    pinPlaceholder: '예: 49201733',
    pinSubtitle: '매일 금고를 열 때 사용합니다.',
    createAction: '금고 만들기',
    creating: '금고 만드는 중…',
    lockout: (time: string): string => `시도가 너무 많습니다. ${time} 후에 다시 시도하세요.`,
    recoveryTitle: '복구 문장',
    recoverySubtitle:
      'PIN을 잊었을 때 PIN을 초기화할 문장을 **직접 작성하세요**. ' +
      '앱은 이 문장을 만들지도 저장하지도 않습니다: 직접 정해 컴퓨터 밖에 적어 두세요.',
    recoveryLabel: '복구 문장',
    recoveryPlaceholder: '예: 겨울 지나서 목마가 시내에서 당근을 먹었다',
    recoveryConfirmLabel: '복구 문장 다시 입력',
    recoveryMismatch: '문장이 일치하지 않습니다.',
    recoveryTooShort: (needed: number, actual: number): string =>
      `문장은 최소 ${needed}단어여야 합니다(${actual}단어 입력).`,
    recoveryHint: '단어의 대소문자는 구분하며, 여분의 공백만 확인할 때 무시됩니다.',
    unlockTitle: '금고 잠김',
    unlockSubtitle: '라이브러리를 복호화하고 비밀을 쓰려면 PIN을 입력하세요.',
    tabPin: 'PIN',
    tabMaster: '마스터 비밀번호',
    masterAvailable: 'PIN이 3번 틀렸습니다: 이제 마스터 비밀번호로도 열 수 있습니다.',
    forgotPin: 'PIN을 잊었어요',
    unlockAction: '금고 열기',
    unlocking: '여는 중…',
    resetTitle: 'PIN 초기화',
    resetSubtitle:
      '금고를 만들 때 **직접** 적어 둔 복구 문장으로 새 PIN을 정하세요. 금고는 바로 열립니다.',
    newPinLabel: '새 PIN (8자리)',
    newPinConfirmLabel: '새 PIN 다시 입력',
    pinMismatch: 'PIN이 일치하지 않습니다.',
    resetAction: '초기화하고 열기',
    resetting: '초기화 중…',
    backToPin: 'PIN으로 돌아가기',
    changeTitle: '금고 자격 증명 변경',
    changeMasterTitle: '마스터 비밀번호 바꾸기',
    changeMasterSubtitle:
      '금고가 열려 있는 동안 오늘의 마스터 비밀번호는 그대로 동작합니다. ' +
      '변경은 라이브러리를 다시 암호화하지 **않고** 키 랩만 다시 씁니다(수 초).',
    changeMasterCurrent: '현재 마스터 비밀번호',
    changeMasterNew: '새 마스터 비밀번호 (24자)',
    changeMasterConfirm: '새 마스터 비밀번호 다시 입력',
    changePinTitle: 'PIN 바꾸기',
    changePinSubtitle:
      '오늘의 PIN은 그대로 동작합니다. 변경은 키 랩만 다시 쓰므로 ' +
      '디스크의 라이브러리는 그대로 유지됩니다.',
    changePinCurrent: '현재 PIN',
    changePinNew: '새 PIN (8자리)',
    changePinConfirm: '새 PIN 다시 입력',
    changeAction: '변경',
    changing: '변경 중…',
  },

  /** 자격 증명 강도 표시줄(등급과 그 이유). */
  strength: {
    hintMaster: '등급은 안내용이며, 앱은 퇴화한 값만 거절합니다.',
    hintPin: '여덟 자리 숫자는 "보통"을 넘지 못합니다: PIN을 지키는 것은 잠금 장치입니다.',
    hintPhrase: '길이보다 서로 다르고 반복이 없는 단어가 값어치가 큽니다.',
    levels: {
      veryWeak: '매우 약함',
      weak: '약함',
      fair: '보통',
      strong: '강함',
      veryStrong: '매우 강함',
    },
    reasons: {
      allSame: '같은 문자 반복',
      sequence: '문자 연속',
      repeatedBlock: '블록 반복',
      dateLike: '날짜처럼 보임',
      fewKinds: '문자 종류가 부족',
      lowVariety: '서로 다른 문자가 부족',
      commonWord: '흔한 단어 포함',
      shortWords: '단어가 너무 짧음',
      fewUniqueWords: '서로 다른 단어가 부족',
      repeatedWords: '단어가 너무 많이 반복됨',
    },
  },

  /** HTML page the OAuth loopback shows in the browser tab. */
  oauthPage: {
    deniedTitle: '인증 거부됨',
    doneTitle: '인증 완료',
    deniedBody: '이 탭을 닫으셔도 됩니다.',
    doneBody: '이 탭을 닫고 앱으로 돌아가세요.',
  },

  /**
   * IPC 경계를 통과하는 오류: 메인이 던지고 렌더러가 거부된 `Error`로 받아
   * 사용자가 화면에서 읽는다.
   *
   * `driveErrors`/`libraryErrors` 안이 아니라 별도 블록인 이유는 발생지가
   * 하위 시스템이 아니라 창 경계이기 때문이다. Drive 오류는 Drive의 것이고
   * 이건 앱 전체의 것이므로, 둘 중 어디에 넣어도 발생지가 실제보다 좁아 보인다.
   */
  errors: {
    /** 출처 가드: 발신자가 앱 페이지가 아니다. */
    foreignFrame: 'IPC 차단: 요청이 앱 페이지에서 오지 않았습니다.',
  },
};
