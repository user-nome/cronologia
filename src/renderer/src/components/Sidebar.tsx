import type { JSX } from 'react';
import type { WorkType } from '@zero/types';
import { TYPE_COLORS } from '@zero/renderer/constants';
import { useMessages } from '@zero/renderer/i18n';
import AppIcon from '@zero/renderer/components/AppIcon';

const READER_TYPES: readonly WorkType[] = ['webtoon', 'manhwa', 'manhua', 'manga'];

interface SidebarProps {
  selectedType: WorkType | null;
  onTypeChange: (type: WorkType | null) => void;
  onNewWork: () => void;
  onAttributions: () => void;
  onSettings: () => void;
}

export default function Sidebar({
  selectedType,
  onTypeChange,
  onNewWork,
  onAttributions,
  onSettings,
}: SidebarProps): JSX.Element {
  const m = useMessages();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-logo">
          <AppIcon name="bookOpen" />
        </div>
        <div className="sidebar-brand-copy">
          <h1>Cronologia</h1>
          <small>{m.app.sidebarSubtitle}</small>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label={m.app.libraryNavigation}>
        <button
          className="sidebar-link sidebar-new"
          onClick={onNewWork}
          title={m.app.newWork}
          aria-label={m.app.newWork}
        >
          <AppIcon name="plus" />
          <span>{m.app.newWork}</span>
        </button>
        <div className="sidebar-divider" />
        {READER_TYPES.map((type) => (
          <button
            key={type}
            className={`sidebar-link${selectedType === type ? ' active' : ''}`}
            onClick={() => onTypeChange(type)}
            title={m.workTypes[type]}
            aria-label={m.workTypes[type]}
            aria-current={selectedType === type ? 'page' : undefined}
          >
            <AppIcon name="book" {...(selectedType === type ? { color: TYPE_COLORS[type] } : {})} />
            <span>{m.workTypes[type]}</span>
          </button>
        ))}
        <div className="sidebar-divider" />
        <button
          className={`sidebar-link${selectedType === null ? ' active' : ''}`}
          onClick={() => onTypeChange(null)}
          title={m.app.allWorks}
          aria-label={m.app.allWorks}
          aria-current={selectedType === null ? 'page' : undefined}
        >
          <AppIcon name="layers" />
          <span>{m.app.allWorks}</span>
        </button>
      </nav>

      <div className="sidebar-bottom">
        <button
          className="sidebar-link"
          onClick={onAttributions}
          title={m.app.openAttributionsTitle}
          aria-label={m.app.attributionsLabel}
        >
          <AppIcon name="clapperboard" />
          <span>{m.app.attributionsLabel}</span>
        </button>
        <button
          className="sidebar-link"
          onClick={onSettings}
          title={m.app.settingsTitle}
          aria-label={m.app.settingsTitle}
        >
          <AppIcon name="settings" />
          <span>{m.app.settingsTitle}</span>
        </button>
      </div>
    </aside>
  );
}
