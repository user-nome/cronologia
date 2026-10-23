import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { DriveStatus, Language, Work, WorkStatus } from '@zero/types';
import { messages } from '@zero/messages';
import {
  FILTER_OPTIONS,
  PROGRESS_SAVE_DEBOUNCE_MS,
  STATUS_COLORS,
  TOAST_TIMEOUT_MS,
  clampProgress,
  type StatusFilter,
} from '@zero/renderer/constants';
import { MessagesProvider } from '@zero/renderer/i18n';
import { ipcErrorMessage } from '@zero/renderer/errors';
import WorkCard from '@zero/renderer/components/WorkCard';
import WorkModal from '@zero/renderer/components/WorkModal';
import SettingsModal from '@zero/renderer/components/SettingsModal';
import AttributionsModal from '@zero/renderer/components/AttributionsModal';
import DonateModal from '@zero/renderer/components/DonateModal';
import VaultModal from '@zero/renderer/components/VaultModal';

interface EditingState {
  work: Work;
  isNew: boolean;
}

/** Aviso efêmero do rodapé: `error` só muda a cor. */
interface Toast {
  message: string;
  kind: 'info' | 'error';
}

interface Stats {
  total: number;
  reading: number;
  done: number;
  planned: number;
  paused: number;
  cancelled: number;
  average: number;
}

function blankWork(): Work {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: '',
    synopsis: '',
    type: 'webtoon',
    status: 'planejado',
    progress: 0,
    marker: '',
    createdAt: now,
    updatedAt: now,
  };
}

function summarize(list: Work[]): Stats {
  const total = list.length;
  const reading = list.filter((w) => w.status === 'lendo').length;
  const done = list.filter((w) => w.status === 'concluido').length;
  const planned = list.filter((w) => w.status === 'planejado').length;
  const paused = list.filter((w) => w.status === 'pausado').length;
  const cancelled = list.filter((w) => w.status === 'cancelado').length;
  const average = total !== 0 ? Math.round((done / total) * 100) : 0;
  return { total, reading, done, planned, paused, cancelled, average };
}

export default function App(): JSX.Element {
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('todos');
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAttributions, setShowAttributions] = useState(false);
  const [showDonate, setShowDonate] = useState(false);
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const [language, setLanguage] = useState<Language>('pt-BR');
  const [toast, setToast] = useState<Toast | null>(null);
  // Cofre fechado: `VaultModal` cobre a tela e nada do acervo é carregado.
  const [vaultPrompt, setVaultPrompt] = useState<'create' | 'unlock' | null>(null);

  const saveTimers = useRef<Map<string, number>>(new Map());
  /** Fila de gravação por obra: garante que a última intenção seja a última escrita. */
  const saveQueue = useRef<Map<string, Promise<Work[]>>>(new Map());
  const toastTimer = useRef<number | undefined>(undefined);

  const m = messages(language);
  // Extração de dependência dos hooks: o texto do erro de gravação é o mesmo
  // durante toda a sessão, e o `scheduleSave` só precisa da string, não do
  // bundle inteiro (que mudaria a cada troca de idioma).
  const saveErrorMessage = m.app.toastSaveError;

  const notify = useCallback((message: string, kind: Toast['kind'] = 'info'): void => {
    setToast({ message, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_TIMEOUT_MS);
  }, []);

  const reload = useCallback(async (): Promise<void> => {
    // O acervo é cifrado com a chave do cofre: sem cofre aberto não existe
    // biblioteca para carregar, e pedir os dados ao main só produziria
    // `vaultLocked`. A checagem vem antes de tudo.
    const vault = await window.api.vault.status();
    if (!vault.unlocked) {
      setWorks([]);
      setDrive(null);
      setVaultPrompt(vault.exists ? 'unlock' : 'create');
      setLoading(false);
      return;
    }
    try {
      const [library, status, settings] = await Promise.all([
        window.api.library.get(),
        window.api.drive.status(),
        window.api.settings.get(),
      ]);
      setWorks(library);
      setDrive(status);
      setLanguage(settings.language);
      setVaultPrompt(null);
      setLoading(false);
    } catch (error) {
      // O acervo ilegível (`libraryTampered`) não pode deixar a tela no
      // spinner para sempre: a grade some, o motivo aparece e o acervo
      // continua no disco (a falha é fechada, ninguém apagou nada).
      setWorks([]);
      setLoading(false);
      // Se o cofre fechou no meio do caminho, o que falta é a senha, não um
      // acervo quebrado: a tela volta a pedir a credencial.
      const agora = await window.api.vault.status();
      if (!agora.unlocked) {
        setVaultPrompt(agora.exists ? 'unlock' : 'create');
        return;
      }
      notify(ipcErrorMessage(error), 'error');
    }
  }, [notify]);

  useEffect(() => {
    void reload();
    const unsubscribe = window.api.drive.onStatus((status) => setDrive(status));
    return () => {
      unsubscribe();
    };
  }, [reload]);

  /**
   * O auto-lock mede ociosidade **real**: sem isto, o timer só correria quando
   * o main decifrava algo, e quem estava usando o app perdia o cofre no meio
   * do trabalho. O throttling é do lado main, então aqui é só enviar.
   */
  useEffect(() => {
    const signal = (): void => {
      void window.api.vault.touch();
    };
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'wheel'];
    for (const name of events) window.addEventListener(name, signal, { passive: true });
    return () => {
      for (const name of events) window.removeEventListener(name, signal);
    };
  }, []);

  // O auto-lock do cofre (5 min sem uso): o acervo some da tela e o app volta
  // a pedir a senha, porque sem chave a biblioteca não pode ser exibida.
  useEffect(() => {
    const unsubscribe = window.api.vault.onLocked((automatic) => {
      setWorks([]);
      // Só o auto-lock precisa de aviso: no bloqueio manual o usuário acabou de
      // apertar o botão, e dizer "fechou sozinho por inatividade" seria mentira.
      if (automatic) notify(m.vault.autoLocked, 'info');
      void window.api.vault
        .status()
        .then((status) => setVaultPrompt(status.exists ? 'unlock' : 'create'));
    });
    return () => {
      unsubscribe();
    };
  }, [notify, m]);

  const write = useCallback((id: string, task: () => Promise<Work[]>): Promise<Work[]> => {
    // Descarta o agendamento pendente da obra: um rascunho velho que ainda não
    // saiu não pode ser gravado depois da intenção mais recente.
    const pending = saveTimers.current.get(id);
    if (pending !== undefined) {
      window.clearTimeout(pending);
      saveTimers.current.delete(id);
    }
    const previous = saveQueue.current.get(id) ?? Promise.resolve<Work[]>([]);
    const next = previous.then(task);
    saveQueue.current.set(id, next);
    return next;
  }, []);

  const persist = useCallback(
    (work: Work): Promise<void> =>
      write(work.id, () => window.api.library.save(work)).then(setWorks),
    [write],
  );

  /**
   * O cartão agenda a gravação com atraso (`PROGRESS_SAVE_DEBOUNCE_MS`, para não
   * gravar a cada clique em "Aumentar 1") e o modal grava na hora. Sem a fila por
   * id, a gravação agendada do cartão sai **depois** do "Salvar" do modal e traz
   * o rascunho antigo de volta, para o disco e para a tela: o usuário edita o
   * título, clica em Salvar, e meio segundo depois o título volta ao anterior.
   */
  const scheduleSave = useCallback(
    (work: Work): void => {
      const timers = saveTimers.current;
      const existing = timers.get(work.id);
      if (existing !== undefined) window.clearTimeout(existing);
      const handle = window.setTimeout(() => {
        timers.delete(work.id);
        void persist(work).catch(() => notify(saveErrorMessage, 'error'));
      }, PROGRESS_SAVE_DEBOUNCE_MS);
      timers.set(work.id, handle);
    },
    [notify, persist, saveErrorMessage],
  );

  useEffect(() => {
    const timers = saveTimers.current;
    return () => {
      for (const handle of timers.values()) window.clearTimeout(handle);
      timers.clear();
    };
  }, []);

  const updateProgress = useCallback(
    (work: Work, rawProgress: number): void => {
      const progress = clampProgress(rawProgress);
      const next: Work = {
        ...work,
        progress,
        status: work.status === 'concluido' ? 'lendo' : work.status,
        updatedAt: new Date().toISOString(),
      };
      setWorks((current) => current.map((item) => (item.id === next.id ? next : item)));
      scheduleSave(next);
    },
    [scheduleSave],
  );

  const changeStatus = useCallback(
    (work: Work, status: WorkStatus): void => {
      const next: Work = { ...work, status, updatedAt: new Date().toISOString() };
      setWorks((current) => current.map((item) => (item.id === next.id ? next : item)));
      scheduleSave(next);
    },
    [scheduleSave],
  );

  const saveEdited = useCallback(
    async (work: Work): Promise<void> => {
      const saved = await write(work.id, () => window.api.library.save(work));
      setWorks(saved);
      notify(m.app.toastSaved);
    },
    [notify, m, write],
  );

  const deleteWork = useCallback(
    async (work: Work): Promise<void> => {
      // Mesmo caminho da gravação: uma exclusão não pode ser atropelada pela
      // gravação agendada do cartão, que ressuscitaria a obra apagada.
      const saved = await write(work.id, () => window.api.library.remove(work.id));
      setWorks(saved);
      notify(m.app.toastRemoved);
    },
    [notify, m, write],
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return works
      .filter((work) => (filter === 'todos' ? true : work.status === filter))
      .filter((work) =>
        term === ''
          ? true
          : work.title.toLowerCase().includes(term) ||
            work.synopsis.toLowerCase().includes(term) ||
            (work.category ?? '').toLowerCase().includes(term),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [works, query, filter]);

  const stats: Stats = useMemo(() => summarize(works), [works]);
  const visibleStats: Stats = useMemo(() => summarize(visible), [visible]);

  const driveSyncing = drive?.syncing === true;
  const driveConnected = drive?.connected === true;
  const driveDotClass = driveSyncing ? 'dot busy' : driveConnected ? 'dot on' : 'dot';
  const driveLabel = driveSyncing
    ? m.app.drivePill.syncing
    : driveConnected
      ? m.app.drivePill.connected
      : m.app.drivePill.off;
  const hasWorks = works.length !== 0;

  return (
    <MessagesProvider language={language}>
      <div className="app">
        <header className="header">
          <div className="brand">
            <div className="brand-logo">
              <i className="fa-solid fa-book-open" />
            </div>
            <div>
              <h1>Cronologia</h1>
              <small>{m.app.headerStats(visibleStats.total, visibleStats.average)}</small>
            </div>
          </div>

          <div className="search">
            <span>
              <i className="fa-solid fa-magnifying-glass" />
            </span>
            <input
              type="text"
              value={query}
              placeholder={m.app.searchPlaceholder}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="filters">
            {FILTER_OPTIONS.map((item) => (
              <button
                key={item}
                className={`chip${filter === item ? ' active' : ''}`}
                onClick={() => setFilter(item)}
              >
                {m.app.filters[item]}
              </button>
            ))}
          </div>

          <div className="header-actions">
            <button
              className="drive-pill"
              onClick={() => setShowSettings(true)}
              title={m.app.openSettingsTitle}
            >
              <span className={driveDotClass} />
              {driveLabel}
            </button>
            <button
              className="btn ghost"
              onClick={() => setShowAttributions(true)}
              title={m.app.openAttributionsTitle}
            >
              <i className="fa-solid fa-clapperboard" /> {m.app.attributionsLabel}
            </button>
            <button
              className="btn ghost"
              onClick={() => setShowDonate(true)}
              title={m.app.openDonateTitle}
            >
              <i className="fa-solid fa-heart" /> {m.app.donateLabel}
            </button>
            <button
              className="btn ghost icon-only"
              onClick={() => setShowSettings(true)}
              title={m.app.settingsTitle}
            >
              <i className="fa-solid fa-gear" />
            </button>
            <button
              className="btn primary"
              onClick={() => setEditing({ work: blankWork(), isNew: true })}
            >
              <i className="fa-solid fa-plus" /> {m.app.newWork}
            </button>
          </div>
        </header>

        <main className="content">
          <div className="summary">
            <div className="stat">
              <b>{stats.total}</b>
              <span>{m.app.stats.total}</span>
            </div>
            <div className="stat">
              <b style={{ color: STATUS_COLORS.lendo }}>{stats.reading}</b>
              <span>{m.app.stats.reading}</span>
            </div>
            <div className="stat">
              <b style={{ color: STATUS_COLORS.concluido }}>{stats.done}</b>
              <span>{m.app.stats.done}</span>
            </div>
            <div className="stat">
              <b style={{ color: STATUS_COLORS.planejado }}>{stats.planned}</b>
              <span>{m.app.stats.planned}</span>
            </div>
            <div className="stat">
              <b style={{ color: STATUS_COLORS.pausado }}>{stats.paused}</b>
              <span>{m.app.stats.paused}</span>
            </div>
            <div className="stat">
              <b style={{ color: STATUS_COLORS.cancelado }}>{stats.cancelled}</b>
              <span>{m.app.stats.cancelled}</span>
            </div>
            <div className="stat">
              <b>{stats.average}%</b>
              <span>{m.app.stats.average}</span>
            </div>
          </div>

          {loading ? (
            <div className="loading">
              <i className="fa-solid fa-spinner fa-spin" /> {m.app.loadingLibrary}
            </div>
          ) : visible.length === 0 ? (
            <div className="empty">
              <div className="icon">
                <i className="fa-solid fa-book-open" />
              </div>
              <h3>{hasWorks ? m.app.emptyFoundTitle : m.app.emptyLibraryTitle}</h3>
              <p>{hasWorks ? m.app.emptyFoundText : m.app.emptyLibraryText}</p>
              {!hasWorks ? (
                <button
                  className="btn primary"
                  onClick={() => setEditing({ work: blankWork(), isNew: true })}
                >
                  <i className="fa-solid fa-plus" /> {m.app.addFirstWork}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="grid">
              {visible.map((work) => (
                <WorkCard
                  key={work.id}
                  work={work}
                  onOpen={(item) => setEditing({ work: item, isNew: false })}
                  onProgress={updateProgress}
                  onStatus={changeStatus}
                />
              ))}
            </div>
          )}
        </main>

        {editing !== null ? (
          <WorkModal
            work={editing.work}
            isNew={editing.isNew}
            onClose={() => setEditing(null)}
            onSave={saveEdited}
            onDelete={deleteWork}
          />
        ) : null}

        {showSettings ? (
          <SettingsModal
            onClose={() => setShowSettings(false)}
            notify={notify}
            onLanguageChange={setLanguage}
            onLibraryChanged={() => {
              void reload();
            }}
            onVaultDestroyed={() => {
              setShowSettings(false);
              setVaultPrompt('create');
            }}
          />
        ) : null}

        {showAttributions ? <AttributionsModal onClose={() => setShowAttributions(false)} /> : null}

        {showDonate ? <DonateModal onClose={() => setShowDonate(false)} /> : null}

        {vaultPrompt !== null ? (
          <VaultModal
            mode={vaultPrompt}
            closable={false}
            onClose={() => setVaultPrompt(null)}
            onUnlocked={() => {
              void reload();
            }}
          />
        ) : null}

        {toast !== null ? (
          <div className={`toast${toast.kind === 'error' ? ' error' : ''}`}>{toast.message}</div>
        ) : null}
      </div>
    </MessagesProvider>
  );
}
