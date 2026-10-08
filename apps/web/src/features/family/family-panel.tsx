"use client";

import { MessageCircle, Search, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { Toast } from "@/components/ui/toast";
import { ApiError } from "@/lib/api/errors";

import { searchFamilyUserByCode } from "./api";
import type { FamilyUser, FamilyUsersState } from "./types";

type FamilyPanelProps = {
  accessToken: string | null;
  currentMatrixUserId: string | null;
  isMatrixConnected: boolean;
  onCreateDirectChat: (user: FamilyUser) => Promise<boolean>;
  onCreateGroupChat: (users: FamilyUser[], name: string) => Promise<boolean>;
  onOpenFamilyChat: () => Promise<boolean>;
  onRenameUser?: (user: FamilyUser) => void;
  onRefresh: () => void;
  state: FamilyUsersState;
  userAliases?: Record<string, string>;
  userAvatars?: Record<string, string>;
  users: FamilyUser[];
};

function normalizeFamilyCode(value: string) {
  return value.trim().toUpperCase();
}

function isCurrentUser(user: FamilyUser, currentMatrixUserId: string | null) {
  return Boolean(currentMatrixUserId && user.matrixUserId === currentMatrixUserId);
}

function FamilyUserRow({
  avatarId,
  current,
  disabled,
  displayName,
  onMessage,
  onRename,
  selectable,
  selected,
  user,
  onSelectedChange,
}: {
  avatarId?: string;
  current: boolean;
  disabled: boolean;
  displayName?: string;
  onMessage: () => void;
  onRename?: () => void;
  selectable?: boolean;
  selected?: boolean;
  user: FamilyUser;
  onSelectedChange?: (selected: boolean) => void;
}) {
  return (
    <div className="rounded-lg border border-surface-line bg-surface-raised p-3">
      <div className="flex items-start gap-3">
        {selectable ? (
          <input
            aria-label={`Выбрать ${user.displayName}`}
            checked={Boolean(selected)}
            className="mt-3 h-4 w-4 accent-[rgb(var(--accent-teal))]"
            disabled={current}
            onChange={(event) => onSelectedChange?.(event.target.checked)}
            type="checkbox"
          />
        ) : null}
        <Avatar avatarId={avatarId} name={displayName ?? user.displayName} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-ink-primary">
              {displayName ?? user.displayName}
            </p>
            {current ? <Badge>Вы</Badge> : null}
          </div>
          <p className="truncate text-xs text-ink-muted">
            {displayName ? `${user.displayName} · ` : ""}@{user.username}
          </p>
          <p className="mt-1 text-xs font-semibold text-accent-amber">{user.familyCode}</p>
        </div>
        <div className="flex flex-col gap-1">
          <Button
            className="min-h-9 px-3 py-1 text-xs"
            disabled={disabled || current}
            onClick={onMessage}
            type="button"
            variant="secondary"
          >
            Написать
          </Button>
          {!current ? (
            <Button
              className="min-h-8 px-3 py-1 text-xs"
              onClick={onRename}
              type="button"
              variant="ghost"
            >
              Переименовать
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function FamilyPanel({
  accessToken,
  currentMatrixUserId,
  isMatrixConnected,
  onCreateDirectChat,
  onCreateGroupChat,
  onOpenFamilyChat,
  onRenameUser,
  onRefresh,
  state,
  userAliases = {},
  userAvatars = {},
  users,
}: FamilyPanelProps) {
  const [searchCode, setSearchCode] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<FamilyUser | null>(null);
  const [searchNotFound, setSearchNotFound] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [creating, setCreating] = useState<"direct" | "group" | "family" | null>(null);
  const [creationError, setCreationError] = useState(false);

  const otherUsers = useMemo(
    () => users.filter((user) => !isCurrentUser(user, currentMatrixUserId)),
    [currentMatrixUserId, users],
  );

  const selectedUsers = useMemo(
    () => users.filter((user) => selectedUserIds.includes(user.id)),
    [selectedUserIds, users],
  );

  async function runSearch() {
    if (!accessToken) {
      return;
    }
    const normalized = normalizeFamilyCode(searchCode);
    if (!normalized) {
      return;
    }

    setSearching(true);
    setSearchResult(null);
    setSearchNotFound(false);
    setSearchError(false);

    try {
      const result = await searchFamilyUserByCode(accessToken, normalized);
      setSearchResult(result);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setSearchNotFound(true);
      } else {
        setSearchError(true);
      }
    } finally {
      setSearching(false);
    }
  }

  async function createDirect(user: FamilyUser) {
    setCreating("direct");
    setCreationError(false);
    const ok = await onCreateDirectChat(user);
    setCreating(null);
    setCreationError(!ok);
  }

  async function createGroup() {
    if (selectedUsers.length < 2) {
      return;
    }
    setCreating("group");
    setCreationError(false);
    const ok = await onCreateGroupChat(selectedUsers, groupName);
    setCreating(null);
    setCreationError(!ok);
    if (ok) {
      setSelectedUserIds([]);
      setGroupName("");
    }
  }

  async function createFamilyRoom() {
    setCreating("family");
    setCreationError(false);
    const ok = await onOpenFamilyChat();
    setCreating(null);
    setCreationError(!ok);
  }

  function toggleSelected(user: FamilyUser, selected: boolean) {
    setSelectedUserIds((current) => {
      if (selected) {
        return current.includes(user.id) ? current : [...current, user.id];
      }
      return current.filter((id) => id !== user.id);
    });
  }

  const disabledForMatrix = !isMatrixConnected || creating !== null;
  const searchResultIsCurrent = searchResult
    ? isCurrentUser(searchResult, currentMatrixUserId)
    : false;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-primary">Участники семьи</h2>
          </div>
          <Button className="min-h-9 px-3 py-1 text-xs" onClick={onRefresh} variant="ghost">
            Обновить
          </Button>
        </div>

        {state === "loading" || state === "idle" ? (
          <LoadingState className="min-h-40" label="Загружаем семью" />
        ) : null}
        {state === "error" ? (
          <ErrorState message="Не удалось загрузить участников семьи. Попробуйте ещё раз." />
        ) : null}
        {state === "ready" && users.length === 0 ? (
          <EmptyState className="min-h-40" title="Участников семьи пока нет" />
        ) : null}
        {state === "ready" && users.length > 0 ? (
          <div className="space-y-2">
            {users.map((user) => (
              <FamilyUserRow
                current={isCurrentUser(user, currentMatrixUserId)}
                avatarId={userAvatars[user.matrixUserId]}
                disabled={disabledForMatrix}
                displayName={userAliases[user.matrixUserId]}
                key={user.id}
                onMessage={() => void createDirect(user)}
                onRename={() => onRenameUser?.(user)}
                user={user}
              />
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-lg border border-surface-line bg-surface-panel p-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
          <Search className="h-4 w-4" />
          Найти по семейному коду
        </h2>
        <div className="flex gap-2">
          <Input
            aria-label="Семейный код"
            className="uppercase"
            label="Семейный код"
            onChange={(event) => {
              setSearchCode(event.target.value.toUpperCase());
              setSearchNotFound(false);
              setSearchError(false);
            }}
            placeholder="TIM-1024"
            value={searchCode}
          />
          <Button
            className="mt-7"
            disabled={!accessToken || searching || normalizeFamilyCode(searchCode).length < 4}
            onClick={() => void runSearch()}
            type="button"
          >
            {searching ? "Ищем" : "Найти"}
          </Button>
        </div>
        {searchNotFound ? <Toast>Участник семьи не найден.</Toast> : null}
        {searchError ? <ErrorState message="Не удалось выполнить поиск. Попробуйте ещё раз." /> : null}
        {searchResult ? (
          <FamilyUserRow
            current={searchResultIsCurrent}
            avatarId={userAvatars[searchResult.matrixUserId]}
            disabled={disabledForMatrix}
            displayName={userAliases[searchResult.matrixUserId]}
            onMessage={() => void createDirect(searchResult)}
            onRename={() => onRenameUser?.(searchResult)}
            user={searchResult}
          />
        ) : null}
      </section>

      <section className="space-y-3 rounded-lg border border-surface-line bg-surface-panel p-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
          <UsersRound className="h-4 w-4" />
          Семейная группа
        </h2>
        <Input
          aria-label="Название группы"
          label="Название группы"
          maxLength={80}
          onChange={(event) => setGroupName(event.target.value)}
          placeholder="Планы на выходные"
          value={groupName}
        />
        <div className="space-y-2">
          {otherUsers.map((user) => (
            <FamilyUserRow
              current={false}
              avatarId={userAvatars[user.matrixUserId]}
              disabled={disabledForMatrix}
              displayName={userAliases[user.matrixUserId]}
              key={user.id}
              onMessage={() => void createDirect(user)}
              onRename={() => onRenameUser?.(user)}
              onSelectedChange={(selected) => toggleSelected(user, selected)}
              selectable
              selected={selectedUserIds.includes(user.id)}
              user={user}
            />
          ))}
        </div>
        {otherUsers.length === 0 ? (
          <EmptyState className="min-h-32" title="Нет других активных участников семьи" />
        ) : null}
        <Button
          className="w-full"
          disabled={disabledForMatrix || selectedUsers.length < 2}
          onClick={() => void createGroup()}
          type="button"
        >
          {creating === "group" ? "Создаём группу" : "Создать групповой чат"}
        </Button>
        {selectedUsers.length > 0 && selectedUsers.length < 2 ? (
          <p className="text-xs text-ink-muted">Выберите минимум двух участников семьи для группы.</p>
        ) : null}
      </section>

      <section className="space-y-3 rounded-lg border border-surface-line bg-surface-panel p-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
          <MessageCircle className="h-4 w-4" />
          Общий семейный чат
        </h2>
        <Button
          className="w-full"
          disabled={disabledForMatrix}
          onClick={() => void createFamilyRoom()}
          type="button"
          variant="secondary"
        >
          {creating === "family" ? "Открываем семейный чат" : "Открыть семейный чат"}
        </Button>
        <p className="text-xs leading-5 text-ink-muted">
          Общая комната создаётся через Family API. Если её ещё не видно, администратор может
          выполнить reconcile-команду для общей комнаты и обновить чаты.
        </p>
        <p className="text-xs leading-5 text-ink-muted">
          Новые общие комнаты создаются с Matrix-шифрованием. Старые комнаты показываются согласно
          их фактическому состоянию.
        </p>
      </section>

      {creationError ? (
        <ErrorState message="Не удалось открыть или создать чат. Попробуйте ещё раз после подключения." />
      ) : null}
      {!isMatrixConnected ? (
        <Toast className="text-ink-muted">Подключитесь к серверу чата перед созданием чатов.</Toast>
      ) : null}
    </div>
  );
}
