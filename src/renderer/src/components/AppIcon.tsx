import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Ban,
  Book,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Clock3,
  Cloud,
  CloudUpload,
  Eraser,
  HardDrive,
  Hash,
  History,
  Image,
  Info,
  KeyRound,
  Layers3,
  Link2Off,
  LoaderCircle,
  Lock,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings,
  Trash2,
  TriangleAlert,
  Unlock,
  Vault,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { JSX } from 'react';

const ICONS = {
  alert: TriangleAlert,
  arrowDown: ArrowDown,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  arrowUp: ArrowUp,
  ban: Ban,
  book: Book,
  bookOpen: BookOpen,
  calendarCheck: CalendarCheck,
  calendarDays: CalendarDays,
  check: Check,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  clapperboard: Clapperboard,
  clock: Clock3,
  cloud: Cloud,
  cloudUpload: CloudUpload,
  drive: HardDrive,
  eraser: Eraser,
  hash: Hash,
  history: History,
  image: Image,
  info: Info,
  key: KeyRound,
  layers: Layers3,
  linkOff: Link2Off,
  loader: LoaderCircle,
  lock: Lock,
  minus: Minus,
  pause: Pause,
  play: Play,
  plus: Plus,
  rotate: RotateCcw,
  save: Save,
  search: Search,
  settings: Settings,
  trash: Trash2,
  unlock: Unlock,
  vault: Vault,
  x: X,
} satisfies Record<string, LucideIcon>;

export type AppIconName = keyof typeof ICONS;

interface AppIconProps {
  name: AppIconName;
  className?: string;
  color?: string;
}

export default function AppIcon({ name, className, color }: AppIconProps): JSX.Element {
  const Icon = ICONS[name];
  return (
    <Icon
      className={className}
      color={color}
      size="1em"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
    />
  );
}
