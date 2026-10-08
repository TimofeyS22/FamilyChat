import { ArrowLeft, ChevronDown, ChevronUp, Pin, Search, ShieldAlert, ShieldCheck, ShieldQuestion, ShieldX, UserPlus } from "lucide-react";
import type { ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";
import type { MatrixMessage, MatrixRoomEncryptionState, MatrixRoomSummary } from "@/features/matrix/types";

type ChatHeaderProps = {
  callControls?: ReactNode;
  onBack?: () => void;
  onAddMembers?: () => void;
  onJumpToPinned?: () => void;
  onSearchChange?: (query: string) => void;
  onSearchNext?: () => void;
  onSearchPrevious?: () => void;
  pinnedMessage?: MatrixMessage | null;
  peerPresenceLabel?: string | null;
  room: MatrixRoomSummary;
  searchQuery?: string;
  searchResultLabel?: string | null;
  statusLabel?: string | null;
};

function encryptionCopy(state: MatrixRoomEncryptionState) {
  switch (state) {
    case "encrypted":
      return {
        className: "border-accent-teal/40 bg-accent-teal/10 text-accent-teal",
        icon: <ShieldCheck className="h-4 w-4" />,
        label: "Шифрование включено",
        shortLabel: "Защищено",
      };
    case "not_encrypted":
      return {
        className: "border-accent-amber/40 bg-accent-amber/10 text-accent-amber",
        icon: <ShieldX className="h-4 w-4" />,
        label: "Шифрование выключено",
        shortLabel: "Без шифрования",
      };
    case "recovery_needed":
      return {
        className: "border-accent-amber/40 bg-accent-amber/10 text-accent-amber",
        icon: <ShieldAlert className="h-4 w-4" />,
        label: "Шифрование включено. На этом устройстве нужна настройка восстановления.",
        shortLabel: "Нужна настройка",
      };
    case "unknown":
    default:
      return {
        className: "border-surface-line bg-surface-raised text-ink-secondary",
        icon: <ShieldQuestion className="h-4 w-4" />,
        label: "Проверяем шифрование",
        shortLabel: "Проверяем",
      };
  }
}

export function ChatHeader({
  callControls,
  onAddMembers,
  onBack,
  onJumpToPinned,
  onSearchChange,
  onSearchNext,
  onSearchPrevious,
  peerPresenceLabel,
  pinnedMessage,
  room,
  searchQuery = "",
  searchResultLabel,
  statusLabel,
}: ChatHeaderProps) {
  const encryption = encryptionCopy(room.encryptionState);

  return (
    <header className="border-b border-white/70 bg-white/80 px-4 py-2 backdrop-blur-xl">
      <div className="flex min-h-12 items-center gap-3">
        {onBack ? (
          <button
            aria-label="Назад к списку чатов"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-ink-secondary shadow-sm transition hover:bg-sky-100 hover:text-ink-primary focus:outline-none focus-visible:shadow-focus md:hidden"
            onClick={onBack}
            type="button"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : null}
        <Avatar avatarId={room.avatarId} className="h-9 w-9" name={room.name} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-ink-primary">{room.name}</h1>
          <p className="truncate text-xs text-ink-muted">
            {statusLabel ?? peerPresenceLabel ?? encryption.label}
          </p>
        </div>
        <div
          className={`hidden min-h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold md:inline-flex ${encryption.className}`}
        >
          {encryption.icon}
          <span>{encryption.shortLabel}</span>
        </div>
        {onAddMembers ? (
          <button
            aria-label="Добавить участников"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-50 text-ink-secondary shadow-sm transition hover:bg-sky-100 hover:text-ink-primary focus:outline-none focus-visible:shadow-focus"
            onClick={onAddMembers}
            title="Добавить участников"
            type="button"
          >
            <UserPlus className="h-4 w-4" />
          </button>
        ) : null}
        {callControls}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {pinnedMessage ? (
          <button
            className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-left text-sm text-ink-primary ring-1 ring-amber-100"
            onClick={onJumpToPinned}
            type="button"
          >
            <Pin className="h-4 w-4 flex-none text-amber-600" />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-bold text-amber-700">Закреплено:</span> {pinnedMessage.body}
            </span>
          </button>
        ) : null}
        {onSearchChange ? (
          <div className="flex min-w-[14rem] flex-1 items-center gap-1 rounded-2xl bg-sky-50 px-3 py-2 ring-1 ring-sky-100">
            <Search className="h-4 w-4 text-sky-600" />
            <input
              aria-label="Поиск в чате"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-muted"
              onChange={(event) => onSearchChange(event.currentTarget.value)}
              placeholder="Поиск"
              value={searchQuery}
            />
            {searchResultLabel ? <span className="text-xs font-semibold text-sky-700">{searchResultLabel}</span> : null}
            <button aria-label="Предыдущий результат" className="rounded-full p-1 hover:bg-white" onClick={onSearchPrevious} type="button">
              <ChevronUp className="h-4 w-4" />
            </button>
            <button aria-label="Следующий результат" className="rounded-full p-1 hover:bg-white" onClick={onSearchNext} type="button">
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
