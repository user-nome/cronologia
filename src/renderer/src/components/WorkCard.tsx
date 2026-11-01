import { useState } from 'react';
import type { JSX } from 'react';
import type { Work, WorkStatus } from '@zero/types';
import { STATUS_COLORS, TYPE_COLORS, coverUrl, formatDate } from '@zero/renderer/constants';
import { useLanguage, useMessages } from '@zero/renderer/i18n';
import { formatDateText } from '@zero/shared/date';
import AppIcon from '@zero/renderer/components/AppIcon';

interface WorkCardProps {
  work: Work;
  onOpen: (work: Work) => void;
  onProgress: (work: Work, progress: number) => void;
  onStatus: (work: Work, status: WorkStatus) => void;
}

export default function WorkCard({
  work,
  onOpen,
  onProgress,
  onStatus,
}: WorkCardProps): JSX.Element {
  const m = useMessages();
  const language = useLanguage();
  const [noteIndex, setNoteIndex] = useState<number | null>(null);
  const url = coverUrl(work.coverFile);
  const notes = work.readingNotes ?? [];
  const activeNoteIndex = Math.min(noteIndex ?? notes.length - 1, notes.length - 1);
  const activeNote = notes[activeNoteIndex];
  const done = work.status === 'concluido';
  const paused = work.status === 'pausado';
  const cancelled = work.status === 'cancelado';
  const reading = work.status === 'lendo';
  const planned = work.status === 'planejado';
  const marker = work.marker;

  const getBarClass = (): string => {
    if (done) return 'bar-fill done';
    if (reading) return 'bar-fill reading';
    if (paused) return 'bar-fill paused';
    if (cancelled) return 'bar-fill cancelled';
    return 'bar-fill planned';
  };

  const getBarStyle = (): React.CSSProperties => {
    if (done) return { width: '100%' };
    if (planned) return { width: '0%' };
    return { width: `${Math.min(100, Math.max(0, work.progress))}%` };
  };

  return (
    <article className="card" onClick={() => onOpen(work)}>
      <div className="cover">
        {url !== null ? (
          <img src={url} alt={m.workCard.coverOf(work.title)} draggable={false} />
        ) : (
          <div className="cover-placeholder">
            <AppIcon name="bookOpen" />
          </div>
        )}
        <span className="cover-badge" style={{ color: TYPE_COLORS[work.type] }}>
          {m.workTypes[work.type]}
        </span>
        <span className="cover-status" style={{ color: STATUS_COLORS[work.status] }}>
          {m.workStatus[work.status]}
        </span>
      </div>

      <div className="card-body">
        <div className="card-title">{work.title !== '' ? work.title : m.workCard.untitled}</div>
        {marker !== undefined && marker !== '' ? <div className="card-marker">{marker}</div> : null}
        {work.category !== undefined && work.category !== '' ? (
          <div className="card-category">{work.category}</div>
        ) : null}
        {work.startedAt !== undefined && work.startedAt !== '' ? (
          <div className="card-date">
            <AppIcon name="calendarDays" /> {m.workModal.startedAtLabel}:{' '}
            {formatDateText(work.startedAt, language)}
          </div>
        ) : null}
        {work.finishedAt !== undefined && work.finishedAt !== '' ? (
          <div className="card-date">
            <AppIcon name="calendarCheck" /> {m.workModal.finishedAtLabel}:{' '}
            {formatDateText(work.finishedAt, language)}
          </div>
        ) : null}

        <div className="progress-row">
          <span>{m.workCard.progress}</span>
          <b>{done ? '100%' : m.workCard.progressValue(work.progress)}</b>
        </div>
        <div className="bar">
          <div data-testid="progress-bar-fill" className={getBarClass()} style={getBarStyle()} />
        </div>

        <div className="card-actions" onClick={(event) => event.stopPropagation()}>
          <div className="step-buttons">
            <button
              className="btn small icon-only"
              title={m.workCard.increase1}
              onClick={() => onProgress(work, work.progress + 1)}
            >
              <AppIcon name="arrowUp" />
            </button>
            <button
              className="btn small icon-only"
              title={m.workCard.decrease1}
              onClick={() => onProgress(work, work.progress - 1)}
            >
              <AppIcon name="arrowDown" />
            </button>
          </div>
          {done ? (
            <button
              className="btn small ghost icon-only"
              title={m.workCard.reopen}
              onClick={() => onStatus(work, 'lendo')}
            >
              <AppIcon name="rotate" />
            </button>
          ) : cancelled ? (
            <button
              className="btn small ghost icon-only"
              title={m.workCard.resume}
              onClick={() => onStatus(work, 'lendo')}
            >
              <AppIcon name="play" />
            </button>
          ) : (
            <>
              <button
                className="btn small success icon-only"
                title={m.workCard.finish}
                onClick={() => onStatus(work, 'concluido')}
              >
                <AppIcon name="check" />
              </button>
              {paused ? (
                <button
                  className="btn small icon-only"
                  title={m.workCard.resume}
                  onClick={() => onStatus(work, 'lendo')}
                >
                  <AppIcon name="play" />
                </button>
              ) : (
                <button
                  className="btn small icon-only"
                  title={m.workCard.pause}
                  onClick={() => onStatus(work, 'pausado')}
                >
                  <AppIcon name="pause" />
                </button>
              )}
              <button
                className="btn small danger icon-only"
                title={m.workCard.cancel}
                onClick={() => onStatus(work, 'cancelado')}
              >
                <AppIcon name="ban" />
              </button>
            </>
          )}
        </div>

        {notes.length > 0 ? (
          <div className="reading-note-deck" onClick={(event) => event.stopPropagation()}>
            <button
              className="reading-note-toggle"
              aria-expanded={noteIndex !== null}
              onClick={() =>
                setNoteIndex((current) => (current === null ? notes.length - 1 : null))
              }
            >
              <AppIcon name="layers" />
              {noteIndex === null
                ? m.workCard.showReadingNotes(notes.length)
                : m.workCard.hideReadingNotes}
            </button>
            {noteIndex !== null && activeNote !== undefined ? (
              <div className="reading-note-card" aria-live="polite">
                <div className="reading-note-meta">
                  <span>{m.workCard.readingNoteProgress(activeNote.progress)}</span>
                  <time>{formatDate(activeNote.createdAt, language)}</time>
                </div>
                <p>{activeNote.summary}</p>
                <div className="reading-note-controls">
                  <button
                    className="reading-note-arrow"
                    title={m.workCard.previousReadingNote}
                    aria-label={m.workCard.previousReadingNote}
                    onClick={() =>
                      setNoteIndex((activeNoteIndex - 1 + notes.length) % notes.length)
                    }
                  >
                    <AppIcon name="chevronLeft" />
                  </button>
                  <span>{m.workCard.readingNoteCount(activeNoteIndex + 1, notes.length)}</span>
                  <button
                    className="reading-note-arrow"
                    title={m.workCard.nextReadingNote}
                    aria-label={m.workCard.nextReadingNote}
                    onClick={() => setNoteIndex((activeNoteIndex + 1) % notes.length)}
                  >
                    <AppIcon name="chevronRight" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
