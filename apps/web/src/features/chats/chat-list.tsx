"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import type { MatrixRoomSummary } from "@/features/matrix/types";
import { motionSurface } from "@/lib/motion/classes";
import { cn } from "@/lib/utils/cn";

import { ChatListItem } from "./chat-list-item";

type ChatListProps = {
  isLoading?: boolean;
  onHideRoom?: (room: MatrixRoomSummary) => void;
  rooms: MatrixRoomSummary[];
  selectedId: string;
  onSelect: (room: MatrixRoomSummary) => void;
};

function ChatListSkeleton() {
  return (
    <div aria-label="Загрузка списка чатов" className="space-y-2">
      {[0, 1, 2].map((item) => (
        <div
          className="flex min-h-16 items-center gap-3 rounded-lg bg-surface-raised/60 px-3 py-2"
          key={item}
        >
          <div className="h-10 w-10 animate-pulse rounded-full bg-surface-line" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-2/3 animate-pulse rounded-full bg-surface-line" />
            <div className="h-3 w-1/2 animate-pulse rounded-full bg-surface-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChatList({ isLoading = false, onHideRoom, onSelect, rooms, selectedId }: ChatListProps) {
  const [query, setQuery] = useState("");
  const visibleRooms = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return rooms;
    }
    return rooms.filter((room) => room.name.toLowerCase().includes(normalized));
  }, [rooms, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <label className={cn("relative block rounded-[1.65rem] bg-white/92 p-1.5 shadow-sm shadow-sky-950/5", motionSurface)}>
        <span className="sr-only">Поиск по чатам</span>
        <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500" />
        <input
          aria-label="Поиск по чатам"
          className="min-h-11 w-full rounded-[1.35rem] bg-sky-50/72 pl-10 pr-4 text-sm font-medium text-ink-primary outline-none transition-[background-color,box-shadow] duration-micro ease-standard placeholder:text-ink-muted focus:bg-white"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти чат"
          value={query}
        />
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {isLoading && rooms.length === 0 ? <ChatListSkeleton /> : null}
        {visibleRooms.map((room, index) => (
          <ChatListItem
            key={room.id}
            onHide={() => onHideRoom?.(room)}
            onSelect={() => onSelect(room)}
            room={room}
            separated={index < visibleRooms.length - 1}
            selected={selectedId === room.id}
          />
        ))}
        {!isLoading && rooms.length === 0 ? (
          <EmptyState
            className="min-h-56"
            description="Для этого аккаунта пока нет доступных чатов."
            title="Чатов пока нет"
          />
        ) : null}
        {rooms.length > 0 && visibleRooms.length === 0 ? (
          <EmptyState className="min-h-56" title="Ничего не найдено" />
        ) : null}
      </div>
    </div>
  );
}
