# FamilyChat Roadmap

## 1. Цель дорожной карты

Этот документ описывает поэтапный план разработки FamilyChat: приватного семейного веб-мессенджера поверх Matrix Synapse.

Главный принцип разработки: каждый этап должен завершаться рабочим состоянием проекта. Нельзя накапливать большой незавершенный пласт кода, который невозможно запустить, проверить или безопасно продолжить.

FamilyChat не реализует собственный протокол сообщений. За сообщения, комнаты, синхронизацию, медиа и E2EE отвечает Matrix Synapse. Собственные части проекта отвечают за семейную логику, закрытый доступ, UX, админ-панель, уведомления, звонки и деплой.

## 2. Целевой результат MVP

MVP считается готовым, когда пользователь может:

- зарегистрироваться только по invite-коду;
- войти в аккаунт;
- видеть только членов семьи;
- открыть общий семейный чат;
- создать или открыть личный чат с членом семьи;
- отправлять и получать текстовые сообщения;
- отправлять фото и файлы;
- записывать и отправлять голосовые сообщения;
- получать приватные Web Push уведомления;
- совершать аудио- и видеозвонки 1 на 1;
- пользоваться приложением на телефоне и компьютере;
- установить приложение как PWA;
- использовать E2EE-чаты так, чтобы администратор сервера не мог читать содержимое сообщений;
- развернуть весь стек через Docker Compose;
- восстановить данные из резервных копий.

## 3. Архитектурные решения

### 3.1. Основные сервисы

- `apps/web` - Next.js frontend.
- `services/family-api` - FastAPI backend для семейной логики.
- `infra/synapse` - конфигурация Matrix Synapse.
- `infra/postgres` - PostgreSQL для Synapse и Family API.
- `infra/livekit` - LiveKit Server для звонков.
- `infra/nginx` или `infra/caddy` - reverse proxy и HTTPS.
- `infra/backups` - скрипты и инструкции резервного копирования.
- `docs` - документация по запуску, безопасности, деплою и эксплуатации.

### 3.2. Почему Matrix

Matrix нужен для:

- хранения сообщений;
- личных и групповых комнат;
- синхронизации между устройствами;
- доставки событий;
- media API;
- E2EE;
- совместимости с существующим протоколом.

Собственный backend не должен хранить содержимое сообщений и не должен пытаться дублировать Matrix-логику.

### 3.3. Зона ответственности Family API

Family API отвечает за:

- invite-коды;
- семейные коды пользователей, например `TIM-1024`;
- список членов семьи;
- поиск только внутри семейного пространства;
- связь локального профиля с Matrix ID;
- админские операции;
- push subscriptions;
- генерацию LiveKit-токенов;
- технический статус сервиса.

Family API не отвечает за:

- хранение переписки;
- расшифровку сообщений;
- собственную доставку сообщений;
- публичный поиск пользователей;
- публичную регистрацию.

## 4. Предлагаемая структура репозитория

```text
familychat/
  apps/
    web/
      src/
        app/
        components/
        features/
          auth/
          chats/
          calls/
          media/
          voice/
          notifications/
          settings/
          admin/
        lib/
          api/
          matrix/
          livekit/
          pwa/
        styles/
      public/
      tests/
  services/
    family-api/
      app/
        api/
        core/
        db/
        models/
        schemas/
        services/
        security/
        integrations/
        workers/
      tests/
  infra/
    docker-compose.yml
    nginx/
    synapse/
    livekit/
    postgres/
    backups/
  docs/
    roadmap.md
    setup.md
    security.md
    backup.md
    deployment.md
    operations.md
  .env.example
  README.md
```

## 5. Глобальные правила разработки

### 5.1. Правила безопасности

- Никогда не коммитить реальные секреты.
- Все секреты хранить в `.env`.
- В репозитории держать только `.env.example`.
- Не отключать E2EE ради упрощения разработки.
- Не делать публичную регистрацию.
- Не хранить пароли в открытом виде.
- Использовать Argon2 или bcrypt для паролей Family API, если они нужны отдельно от Matrix.
- Ограничивать попытки login/register.
- Не показывать полный текст сообщений в push-уведомлениях по умолчанию.
- Не добавлять админке возможность читать сообщения.
- Проверять, что Synapse registration закрыт для внешних пользователей.

### 5.2. Правила реализации

- Не писать весь проект одним файлом.
- Каждый модуль должен иметь понятную ответственность.
- Сначала инфраструктура, затем API, затем UI, затем E2EE и расширенные функции.
- Любая крупная функция должна иметь минимальную проверку работоспособности.
- После каждого этапа обновлять README или соответствующий файл в `docs`.
- Не добавлять функции вне MVP без отдельного решения.

### 5.3. Правила UX

- Основной экран - `/chats`.
- Desktop: слева список чатов, справа активный чат.
- Mobile: сначала список чатов, затем экран переписки.
- Темная тема по умолчанию.
- Интерфейс должен быть спокойным, быстрым и не перегруженным.
- Состояния загрузки, ошибки и пустые состояния обязательны.
- UI должен быть удобным для семейного использования, а не выглядеть как техническая админка.

## 6. Этап 0. Подготовка репозитория

### Цель

Создать основу проекта, чтобы следующие этапы было удобно реализовывать и проверять.

### Задачи

- Создать структуру папок.
- Добавить корневой `README.md`.
- Добавить `.env.example`.
- Добавить базовую документацию:
  - `docs/setup.md`;
  - `docs/security.md`;
  - `docs/backup.md`;
  - `docs/deployment.md`;
  - `docs/operations.md`.
- Выбрать package manager для frontend:
  - предпочтительно `pnpm`;
  - допустимо `npm`, если нужен самый простой старт.
- Добавить базовый `.gitignore`.
- Добавить соглашение по именованию env-переменных.
- Описать локальные домены:
  - `web.familychat.local`;
  - `api.familychat.local`;
  - `matrix.familychat.local`;
  - `livekit.familychat.local`.

### Проверка готовности

- В репозитории есть понятная структура.
- README объясняет, как устроен проект.
- `.env.example` не содержит реальных секретов.
- Следующий разработчик может понять порядок запуска.

### Результат

Проект готов к созданию инфраструктуры.

## 7. Этап 1. Инфраструктура Matrix

### Цель

Поднять локально Matrix Synapse, PostgreSQL и reverse proxy через Docker Compose.

### Сервисы

- `postgres`;
- `synapse`;
- `reverse-proxy`;
- опционально `redis`, если он понадобится позже.

### Задачи

- Создать `infra/docker-compose.yml`.
- Создать конфигурацию PostgreSQL.
- Создать конфигурацию Synapse.
- Настроить persistent volumes:
  - база Synapse;
  - media store Synapse;
  - конфигурация Synapse.
- Запретить публичную регистрацию в Synapse.
- Настроить server name Matrix.
- Настроить reverse proxy для Matrix endpoints.
- Добавить healthchecks.
- Добавить локальный `.env.example` для инфраструктуры.
- Добавить команды первичной генерации Synapse config.

### Важные настройки Synapse

- `enable_registration: false`;
- публичная регистрация выключена;
- media store вынесен в volume;
- база данных PostgreSQL, не SQLite;
- server name фиксирован и не меняется после запуска;
- HTTPS должен быть предусмотрен для production;
- federation можно отключить для семейного закрытого сервера, если внешняя Matrix-федерация не нужна.

### Проверка готовности

- `docker compose up` поднимает PostgreSQL и Synapse.
- Synapse отвечает на health endpoint.
- Нельзя зарегистрироваться напрямую через публичную регистрацию.
- Администратор может создать служебного пользователя через безопасную процедуру.
- Логи контейнеров не содержат критических ошибок.

### Результат

Локальный Matrix-сервер работает и готов к интеграции с Family API.

## 8. Этап 2. Базовый Family API

### Цель

Создать FastAPI-сервис, который управляет закрытой регистрацией, invite-кодами и семейными профилями.

### Технологии

- FastAPI;
- SQLAlchemy или SQLModel;
- Alembic;
- PostgreSQL;
- Pydantic settings;
- pytest;
- httpx для интеграционных тестов.

### Основные модули

- `core/config.py` - настройки;
- `db/session.py` - подключение к базе;
- `models/user.py`;
- `models/invite.py`;
- `models/push_subscription.py`;
- `models/audit_log.py`;
- `services/invites.py`;
- `services/family_users.py`;
- `services/matrix_admin.py`;
- `services/livekit_tokens.py`;
- `security/passwords.py`;
- `security/rate_limit.py`;
- `api/routes/auth.py`;
- `api/routes/invites.py`;
- `api/routes/family.py`;
- `api/routes/admin.py`;
- `api/routes/push.py`;
- `api/routes/calls.py`.

### Модели данных

#### User

Поля:

- `id`;
- `matrix_user_id`;
- `username`;
- `display_name`;
- `family_code`;
- `role`;
- `is_active`;
- `avatar_url`;
- `created_at`;
- `updated_at`;

#### InviteCode

Поля:

- `id`;
- `code_hash`;
- `label`;
- `bound_display_name`;
- `expires_at`;
- `max_uses`;
- `used_count`;
- `created_by_user_id`;
- `disabled_at`;
- `created_at`;
- `used_at`.

Важно: хранить не сам invite-код, а хеш, если это не мешает UX админки.

#### PushSubscription

Поля:

- `id`;
- `user_id`;
- `endpoint`;
- `p256dh`;
- `auth`;
- `user_agent`;
- `created_at`;
- `last_used_at`;
- `disabled_at`.

#### AuditLog

Поля:

- `id`;
- `actor_user_id`;
- `action`;
- `target_type`;
- `target_id`;
- `metadata`;
- `created_at`.

### API MVP

#### `POST /api/auth/register`

Создает Matrix-пользователя через invite-код и локальный профиль.

Вход:

```json
{
  "displayName": "Тимофей",
  "username": "timofey",
  "password": "secure-password",
  "inviteCode": "MAMA-8F2K"
}
```

Выход:

```json
{
  "success": true,
  "userId": "timofey",
  "matrixUserId": "@timofey:familychat.local",
  "familyCode": "TIM-1024"
}
```

#### `GET /api/family/users`

Возвращает только активных членов семьи.

#### `GET /api/family/users/search?code=TIM-1024`

Ищет пользователя только внутри семейного пространства.

#### `POST /api/invites`

Создает одноразовый invite-код. Только admin.

#### `GET /api/admin/users`

Возвращает список пользователей. Только admin.

#### `POST /api/admin/users/{admin_ref}/deactivate`

Деактивирует пользователя по opaque admin ref. Только admin.

### Интеграция с Synapse

Family API должен использовать Synapse admin API для:

- создания Matrix-пользователя;
- установки display name;
- деактивации пользователя;
- возможно, первичного добавления пользователя в общий семейный чат.

### Проверка готовности

- API запускается локально.
- Alembic миграции применяются.
- Invite-код можно создать.
- По invite-коду можно зарегистрировать пользователя.
- Повторное использование одноразового кода невозможно.
- Неверный invite-код не раскрывает, какие коды существуют.
- Rate limit работает на register.
- Тесты покрывают регистрацию, invite-коды и поиск пользователей.

### Результат

Семейная закрытая регистрация работает через Family API.

## 9. Этап 3. Frontend-основа

### Цель

Создать Next.js приложение с базовым маршрутом, дизайн-системой, авторизацией и главным layout чатов.

### Технологии

- Next.js App Router;
- React;
- TypeScript;
- Tailwind CSS;
- Zustand для локального состояния;
- Matrix JS SDK;
- React Hook Form;
- Zod;
- TanStack Query или собственный тонкий API слой.

### Страницы

- `/login`;
- `/register`;
- `/chats`;
- `/settings`;
- `/admin`.

### Дизайн-система

Базовые компоненты:

- `Button`;
- `IconButton`;
- `Input`;
- `Textarea`;
- `Avatar`;
- `Dialog`;
- `Sheet`;
- `DropdownMenu`;
- `Toast`;
- `Tabs`;
- `Switch`;
- `Badge`;
- `Skeleton`;
- `EmptyState`;
- `ErrorState`.

### Auth UI

`/login`:

- логин;
- пароль;
- вход;
- понятная ошибка;
- состояние загрузки.

`/register`:

- имя;
- логин;
- пароль;
- повтор пароля;
- invite-код;
- проверка совпадения паролей;
- переход к входу после успешной регистрации.

### Chats shell

`/chats` должен иметь:

- desktop split view;
- mobile navigation между списком и чатом;
- левую панель со списком чатов;
- правую область выбранного чата;
- заглушки до подключения Matrix;
- responsive layout.

### Проверка готовности

- Frontend запускается локально.
- `/login`, `/register`, `/chats` доступны.
- Формы валидируются.
- Ошибки API отображаются понятно.
- Mobile layout не ломается.
- UI выглядит как основа реального продукта, а не технический прототип.

### Результат

Есть рабочий frontend-каркас с авторизацией и главным экраном.

## 10. Этап 4. Matrix login и текстовые чаты

### Цель

Подключить frontend к Matrix JS SDK и реализовать текстовые сообщения.

### Задачи

- Создать Matrix client wrapper.
- Реализовать login в Matrix.
- Безопасно хранить Matrix access token на клиенте.
- Настроить sync lifecycle:
  - старт синхронизации;
  - восстановление после reload;
  - обработка ошибок;
  - logout.
- Получать список комнат.
- Отображать список чатов.
- Отображать timeline активной комнаты.
- Отправлять текстовое сообщение.
- Показывать статусы:
  - отправляется;
  - отправлено;
  - ошибка.
- Реализовать общий семейный чат.
- Реализовать открытие личного чата с членом семьи.

### Компоненты чатов

- `ChatList`;
- `ChatListItem`;
- `ChatHeader`;
- `MessageTimeline`;
- `MessageBubble`;
- `Composer`;
- `TypingArea`;
- `AttachmentButton`;
- `VoiceButton`;
- `CallButtons`.

### UX состояния

- нет выбранного чата;
- чат загружается;
- пустой чат;
- ошибка отправки;
- нет соединения;
- идет повторная синхронизация.

### Проверка готовности

- Пользователь входит и видит Matrix-комнаты.
- Можно открыть общий чат.
- Можно отправить текст.
- Второй пользователь получает сообщение.
- После reload история восстанавливается.
- Ошибка сети отображается в UI.

### Результат

Можно переписываться текстом через Matrix.

## 11. Этап 5. Семейная логика в интерфейсе

### Цель

Связать Matrix-чаты с семейными пользователями из Family API.

### Задачи

- Получать список членов семьи из `GET /api/family/users`.
- Показывать семейные профили в UI.
- Добавить короткий family ID в профиль.
- Реализовать поиск по family ID.
- Запретить поиск вне семьи.
- Реализовать создание личного чата с выбранным членом семьи.
- Реализовать создание группового чата с выбранными участниками.
- Автоматически добавлять новых пользователей в общий семейный чат.
- Добавить базовые настройки профиля:
  - display name;
  - avatar.

### Проверка готовности

- Пользователь видит только членов семьи.
- Поиск работает только по семейному коду.
- Нельзя найти внешнего Matrix-пользователя через UI.
- Личный чат создается только с членом семьи.
- Групповой чат создается только из членов семьи.

### Результат

Приложение ощущается как закрытый семейный мессенджер, а не общий Matrix-клиент.

## 12. Этап 6. E2EE

### Цель

Включить end-to-end encryption для личных и групповых чатов.

### Задачи

- Включить поддержку E2EE в Matrix JS SDK.
- Подключить crypto store.
- Обеспечить работу ключей после reload.
- Включать encryption для новых личных комнат.
- Включать encryption для групповых комнат.
- Отобразить состояние шифрования в UI.
- Обработать неподтвержденные устройства.
- Добавить понятный UX для восстановления сессии.
- Проверить, что сервер не хранит plaintext-сообщения.

### Важные вопросы

- Где хранить crypto store в браузере.
- Как объяснять пользователю восстановление ключей.
- Нужен ли security phrase/passphrase в MVP.
- Как обрабатывать вход с нового устройства.

### Проверка готовности

- Новые личные комнаты создаются с E2EE.
- Новые групповые комнаты создаются с E2EE.
- После reload сообщения расшифровываются.
- При входе с нового устройства UX не выглядит сломанным.
- В базе Synapse нельзя прочитать текст сообщений.
- Админка не имеет доступа к содержимому сообщений.

### Результат

Новые личные, групповые и заново provisioned общие семейные чаты создаются с Matrix E2EE, а UI честно показывает статус шифрования.

Примечание Stage 6: общий `Family Chat` создается и reconciled server-side через Family API. Новый provisioning добавляет Matrix encryption state без передачи ключей или recovery-материалов на сервер. Старые локальные common rooms, созданные до этого изменения, не должны молча помечаться как E2EE.

## 13. Этап 7. Медиа и файлы

### Цель

Добавить отправку изображений, видео и файлов через Matrix media API.

### Поддерживаемые типы

- изображения;
- видео;
- PDF;
- документы;
- архивы;
- аудио;
- другие файлы до лимита MVP.

### Ограничения MVP

- максимальный размер файла: 100 MB;
- максимальный размер видео: 100 MB;
- предпросмотр изображений обязателен;
- предпросмотр видео желателен;
- сжатие изображений желательно.

### Задачи

- Добавить file picker.
- Проверять размер файла до загрузки.
- Загружать файл через Matrix media API.
- Отображать upload progress.
- Отправлять событие сообщения с media content.
- Рендерить изображения в timeline.
- Рендерить видео в timeline.
- Рендерить файл как карточку с названием, размером и кнопкой скачивания.
- Добавить lightbox для изображений.
- Добавить обработку ошибок загрузки.
- Добавить повтор загрузки при ошибке, если возможно.

### E2EE для медиа

Если комната зашифрована, медиа тоже должно отправляться в соответствии с Matrix E2EE-механикой, чтобы сервер не видел содержимое файла в открытом виде.

### Проверка готовности

- Можно отправить фото.
- Получатель видит фото.
- Можно отправить PDF или архив.
- Файл больше 100 MB блокируется до отправки.
- Ошибка загрузки отображается.
- В зашифрованной комнате медиа не доступно серверу в открытом виде.

### Результат

Семья может обмениваться фото и файлами.

Примечание Stage 7: frontend загружает медиа напрямую через Matrix media API. В зашифрованных комнатах attachment bytes шифруются в браузере до upload, событие отправляется с Matrix encrypted `file` metadata без plaintext `url`, а thumbnails в текущей реализации не загружаются. Family API не получает, не проксирует и не хранит media bytes или message bodies. Stage 7 остается PARTIAL до завершения browser file-picker live smoke в среде, где браузер может открыть локальное приложение и OS file picker. Stage 9 Web Push не меняет media path, а звонки остаются Stage 10.

## 14. Этап 8. Голосовые сообщения

### Цель

Добавить запись, отправку и прослушивание голосовых сообщений.

### Задачи

- Запрашивать доступ к микрофону.
- Записывать аудио через MediaRecorder.
- Показывать таймер записи.
- Позволять отменить запись.
- Позволять отправить запись.
- Загружать запись как media file.
- Отправлять Matrix-сообщение с metadata:
  - duration;
  - mime type;
  - size.
- Рендерить voice bubble.
- Добавить player:
  - play;
  - pause;
  - progress;
  - duration.
- Обработать отказ доступа к микрофону.

### Форматы

- MVP: `audio/webm` или `audio/ogg`;
- позже: `mp3` или `m4a`, если потребуется совместимость.

### Проверка готовности

- Пользователь может записать голосовое.
- Пользователь может отменить запись.
- Пользователь может отправить запись.
- Получатель может прослушать запись.
- Длительность отображается корректно.
- Отказ доступа к микрофону не ломает UI.

### Результат

Голосовые сообщения работают в браузере.

Примечание Stage 8: голосовые сообщения реализованы как Matrix `m.audio` media messages, а не как звонки. Запись выполняется в браузере через `MediaRecorder` после пользовательского действия, поддерживаются `audio/webm` и `audio/ogg`, есть cancel/send, metadata duration/mime/size и voice bubble player. В зашифрованных комнатах voice bytes используют тот же client-side encrypted attachment path, что и Stage 7 media: Matrix event содержит encrypted `file` metadata без plaintext media `url`, Family API не получает, не проксирует, не расшифровывает и не хранит voice bytes. Stage 8 остается PARTIAL до реального browser microphone record/send/play smoke. Stage 9 Web Push/PWA не является звонками, а Stage 10 LiveKit/calls остается отдельным PARTIAL этапом до своего live smoke.

## 15. Этап 9. PWA и Web Push

### Цель

Сделать приложение устанавливаемым и добавить приватные push-уведомления.

### PWA задачи

- Добавить `manifest.json`.
- Добавить иконки.
- Добавить service worker.
- Добавить offline fallback.
- Проверить установку на mobile.
- Проверить базовую работу после reload.

### Web Push задачи

- Сгенерировать VAPID keys.
- Добавить endpoint `POST /api/push/subscribe`.
- Сохранять push subscription в Family API.
- Добавить UI запроса разрешения.
- Добавить настройку приватности уведомлений:
  - только факт нового сообщения;
  - показывать имя отправителя;
  - показывать текст сообщения, если пользователь явно включил.
- Отправлять push при новом сообщении.
- Отправлять push при входящем звонке. `Deferred to Stage 10: calls are out of Stage 9 scope.`
- Обрабатывать невалидные subscriptions.

### Приватность уведомлений

По умолчанию уведомление:

```text
Новое сообщение
```

Нельзя по умолчанию показывать текст сообщения на заблокированном экране.

### Проверка готовности

- Приложение устанавливается как PWA.
- Пользователь может включить уведомления.
- Push subscription сохраняется.
- Уведомление приходит при новом сообщении.
- Уведомление не содержит полный текст сообщения по умолчанию.
- Невалидная подписка отключается.

### Результат

FamilyChat работает как мобильное веб-приложение с уведомлениями.

Примечание Stage 9: добавлены PWA manifest/icons/service worker/offline fallback, Web Push subscription storage в Family API, настройки приватности уведомлений, Matrix HTTP push gateway для new-message notifications и отключение invalid subscriptions. По умолчанию notification body остается fact-only: `Новое сообщение`. Текст E2EE-сообщений не показывается server-side. Family API не хранит Matrix message bodies, room IDs или event IDs. Push при входящем звонке намеренно не реализован и перенесен в Stage 10 вместе с LiveKit/WebRTC calls. Stage 9 остается PARTIAL до live browser Web Push delivery smoke с локальными VAPID keys.

## 16. Этап 10. LiveKit звонки 1 на 1

### Цель

Добавить аудио- и видеозвонки через LiveKit.

### Сервисы

- LiveKit Server;
- Family API endpoint для токенов;
- frontend LiveKit client.

### Backend задачи

- Добавить LiveKit env-переменные:
  - `LIVEKIT_URL`;
  - `LIVEKIT_API_KEY`;
  - `LIVEKIT_API_SECRET`.
- Реализовать `POST /api/calls/token`.
- Проверять, что пользователь имеет право звонить выбранному члену семьи.
- Генерировать комнату звонка.
- Создавать короткоживущий token.
- Логировать техническое событие звонка без содержимого разговора.

### Frontend задачи

- Добавить кнопки аудио- и видеозвонка.
- Реализовать outgoing call screen.
- Реализовать incoming call screen.
- Реализовать accept/reject.
- Реализовать завершение звонка.
- Добавить mute/unmute microphone.
- Добавить camera on/off.
- Показывать локальное и удаленное видео.
- Показывать состояние подключения.
- Обработать отказ доступа к микрофону или камере.

### Сигналинг входящего звонка

Нужно выбрать механизм:

- Matrix-события для уведомления о звонке;
- push-уведомление через Family API;
- комбинированный вариант.

Для MVP разумно использовать Matrix-событие плюс Web Push для фонового уведомления.

### Проверка готовности

- Пользователь A может позвонить пользователю B.
- B видит входящий звонок.
- B может принять звонок.
- Работает звук.
- Работает видео.
- Можно выключить микрофон.
- Можно выключить камеру.
- Любая сторона может завершить звонок.
- При отказе доступа к камере или микрофону UI показывает понятную ошибку.

### Результат

Работают аудио- и видеозвонки 1 на 1.

Примечание Stage 10: добавлены локальная LiveKit-инфраструктура в Compose, серверная выдача короткоживущих LiveKit-токенов через Family API, Matrix custom-event signaling для direct room, frontend UI для исходящего/входящего 1:1 audio/video call, accept/reject/hangup, mute/unmute, camera on/off, local/remote video и safe permission/error states. Family API не получает и не хранит media bytes, не логирует токены/секреты/raw LiveKit room names, а frontend не добавляет group calls, common-room calls, screen sharing, recording или transcription. Call push не реализован. Stage 10 остается PARTIAL до реального local browser LiveKit audio/video smoke по `docs/runbooks/stage-10-livekit-calls-smoke.md`. Stage 7, Stage 8 и Stage 9 остаются PARTIAL по своим live-smoke blocker notes.

## 17. Этап 11. Админ-панель

### Цель

Добавить минимальную админ-панель без доступа к содержимому сообщений.

### Страница `/admin`

Разделы:

- пользователи;
- invite-коды;
- технический статус;
- базовый audit log.

### Функции администратора

- видеть список пользователей;
- создавать invite-код;
- отключать invite-код;
- видеть использованные invite-коды;
- деактивировать пользователя;
- видеть технический статус сервисов.

### Запрещено

Админ-панель не должна:

- показывать содержимое сообщений;
- показывать приватные файлы;
- расшифровывать E2EE-сообщения;
- давать доступ к чужим комнатам;
- иметь скрытый режим чтения переписки.

### Проверка готовности

- Только admin может открыть `/admin`.
- Обычный пользователь получает отказ.
- Админ может создать invite-код.
- Использованный код виден как использованный.
- Пользователя можно деактивировать.
- Содержимое сообщений нигде не отображается.

### Результат

Семейный администратор может управлять доступом без нарушения приватности.

Примечание Stage 11: добавлена минимальная `/admin` панель и backend admin API только для управления доступом: безопасный список пользователей, деактивация с защитой self/last-admin, создание invite-кода с одноразовым показом plaintext, список/отключение invite-кодов по opaque admin ref, безопасный technical status и sanitized audit log. Админка не читает сообщения, не показывает media/files, Matrix room/event/device IDs, Matrix access tokens, invite hashes/peppers, LiveKit tokens/secrets, Web Push secrets, E2EE keys/recovery material, не проксирует Synapse admin browser и не добавляет impersonation/login-as. Stage 11 остается PARTIAL до live admin smoke по `docs/runbooks/stage-11-admin-panel-smoke.md`. Stage 7, Stage 8, Stage 9 и Stage 10 остаются PARTIAL по своим live-smoke blocker notes.

## 18. Этап 12. Настройки пользователя

### Цель

Добавить пользовательские настройки.

### Функции

- изменить display name;
- изменить аватар;
- настроить уведомления;
- настроить приватность уведомлений;
- посмотреть свой family ID;
- выйти из аккаунта;
- увидеть состояние E2EE-сессии;
- опционально - управление устройствами.

### Проверка готовности

- Имя меняется и отображается в чатах.
- Аватар загружается и отображается.
- Пользователь может выключить уведомления.
- Пользователь может выйти из аккаунта.
- Family ID легко найти и отправить родственнику.

### Результат

Пользователь может настроить базовый профиль и приватность.

Примечание Stage 12: добавлены user-owned settings без расширения админского доступа: `/settings` требует Family API auth, показывает текущий профиль через `GET /api/profile/me`, позволяет обновить только свой trimmed display name через строгий `PATCH /api/profile/me`, синхронизирует display name через Matrix service layer перед local commit, показывает/copy family code, переиспользует Stage 9 Web Push controls и privacy preference, показывает честное informational состояние browser-side Matrix E2EE/session без проверки crypto readiness, recovery/key export/import/storage, и использует существующий logout. Matrix timeline теперь использует display name из Matrix room member state, когда он доступен, вместо generic `Family member`. Backend profile response не возвращает password hash, Matrix access/admin tokens, Matrix room/event/device IDs, LiveKit tokens, push subscription endpoints/keys, invite hashes/peppers, DB URL/JWT secret, message bodies, media bytes или E2EE key material. Avatar upload/change намеренно не активирован: UI показывает initials, не рендерит stored remote avatar URLs и не добавляет Family API media proxy. Stage 12 остается PARTIAL до live settings smoke по `docs/runbooks/stage-12-settings-smoke.md` и до отдельного безопасного avatar flow. Stage 7, Stage 8, Stage 9, Stage 10 и Stage 11 остаются PARTIAL по своим live-smoke blocker notes. production/MVP/security approval не заявлены.

## 19. Этап 13. Полировка UX

### Цель

Довести приложение до приятного ежедневного использования.

### UI задачи

- Улучшить responsive layout.
- Добавить skeleton loading.
- Добавить аккуратные empty states.
- Добавить toast notifications.
- Добавить плавные анимации.
- Улучшить message bubbles.
- Улучшить composer.
- Добавить drag-and-drop файлов на desktop.
- Добавить mobile-friendly media picker.
- Добавить индикатор offline/online.
- Добавить retry для ошибок отправки.
- Добавить контекстное меню сообщения.

### Действия с сообщением в MVP

- скопировать текст;
- удалить у себя;
- повторить отправку при ошибке.

### Проверка готовности

- Приложением удобно пользоваться на телефоне.
- Приложением удобно пользоваться на desktop.
- Ошибки не выглядят как технические stack traces.
- Длинные имена и длинные сообщения не ломают верстку.
- Empty states помогают понять, что происходит.

### Результат

FamilyChat ощущается как законченный семейный продукт.

Примечание Stage 13: добавлена UX-полировка существующего web chat без расширения privacy boundary: responsive refinements для chat shell/sidebar/timeline/composer, skeleton loading для chat list/timeline, empty/offline/error states без raw stack traces, safe toast notifications, улучшенные message bubbles с wrapping/status/timestamps, desktop drag-and-drop через существующий Matrix media send path, mobile-friendly file picker affordance, browser offline/online indicator, local-only retry для failed outgoing sends и context menu actions: copy text, hide locally for this browser only, retry failed send. Local hide не является Matrix redaction и не удаляет сообщение для других пользователей или с сервера. Retry не гарантирует доставку и не сохраняет failed content в Family API/backend storage. Stage 13 не добавляет backend media proxy, avatar upload/change, password reset, device management, E2EE recovery/verification management, room browser, message search, admin message/media moderation, impersonation/login-as, data export, backup/restore UI, production deployment, backups или monitoring. Stage 7, Stage 8, Stage 9, Stage 10, Stage 11 и Stage 12 остаются PARTIAL по своим live-smoke/avatar blocker notes. Stage 15 не начат; production/MVP/security approval не заявлены.

## 20. Этап 14. Production deployment

### Цель

Подготовить проект к развертыванию на VPS.

### Инфраструктура

- VPS 2-4 GB RAM на старте;
- Docker Compose;
- HTTPS через Let's Encrypt;
- domain routing;
- persistent volumes;
- firewall;
- fail2ban;
- автоматические обновления security patches;
- мониторинг диска;
- логирование.

### Reverse proxy

Нужно настроить маршруты:

- `https://familychat.example.com` -> frontend;
- `https://api.familychat.example.com` -> Family API;
- `https://matrix.familychat.example.com` -> Synapse;
- `https://livekit.familychat.example.com` -> LiveKit.

Или единый домен с path-based routing, если это удобнее:

- `/` -> frontend;
- `/api` -> Family API;
- `/_matrix` -> Synapse;
- `/_synapse/client` -> Synapse client endpoints;
- `/_synapse/admin` -> не public; только внутренний trusted ops context, не browser route.

### Security hardening

- HTTPS обязателен.
- HSTS после проверки.
- Rate limit на login/register.
- Ограничение размера body.
- Безопасные headers.
- Закрытые admin endpoints.
- Отдельные сервисные секреты.
- Регулярная ротация secrets по инструкции.

### Проверка готовности

- Приложение открывается по HTTPS.
- Регистрация возможна только по invite-коду.
- Matrix endpoints работают.
- WebSocket/live sync работает.
- LiveKit работает через production domain.
- Push уведомления работают на реальном домене.
- После перезапуска контейнеров данные сохраняются.

### Результат

FamilyChat можно использовать на реальном сервере.

Примечание Stage 14: добавлен production deployment scaffold без заявления production readiness: `infra/docker-compose.prod.yml` для production-like Compose override, frontend container build, host-based Nginx routing template для web/API/Matrix/LiveKit, `/_synapse/admin` public denial, body size limit 100M, WebSocket proxy headers, basic security headers, placeholder-only `.env.production.example`, `.gitignore` protection for real production env files, deployment/security/operations/setup docs и `docs/runbooks/stage-14-production-deployment-smoke.md`. Family API CORS теперь включает существующий authenticated `PATCH` frontend flow для `/api/profile/me` production origin. Stage 14 не добавляет Stage 15 backup/restore automation, backup scripts, restore scripts, cron/systemd timers, retention implementation, monitoring dashboard, room browser, message search, impersonation/login-as, admin message/media access, Synapse admin browser/proxy, E2EE recovery/device management или изменения Matrix message/media/E2EE protocol behavior. Stage 7, Stage 8, Stage 9, Stage 10, Stage 11, Stage 12 и Stage 13 остаются PARTIAL по своим live-smoke/avatar blocker notes. Stage 14 остается PARTIAL до real VPS/domain/HTTPS smoke по runbook; production/MVP/security approval не заявлены.

## 21. Этап 15. Бэкапы и восстановление

### Цель

Обеспечить восстановление после сбоя.

### Что нужно бэкапить

- PostgreSQL Synapse;
- PostgreSQL Family API;
- Synapse media store;
- `.env` и production secrets в защищенном внешнем хранилище;
- конфигурации reverse proxy;
- LiveKit config, если есть локальные важные настройки.

### Задачи

- Добавить backup scripts.
- Добавить restore scripts.
- Добавить cron/systemd timer инструкцию.
- Добавить retention policy.
- Добавить проверку целостности архива.
- Добавить тест восстановления на чистом окружении.

### Политика хранения

Базовый вариант:

- daily backups за последние 7 дней;
- weekly backups за последние 4 недели;
- monthly backups за последние 6 месяцев.

### Проверка готовности

- Бэкап создается вручную одной командой.
- Бэкап можно восстановить на чистой машине.
- Документация описывает процесс восстановления.
- Проверено, что media files не потеряны.

### Результат

Данные можно восстановить после сбоя VPS или ошибки эксплуатации.

## 22. Этап 16. Мониторинг и эксплуатация

### Цель

Сделать поддержку семейного сервера простой и предсказуемой.

### Минимальный мониторинг

- healthcheck frontend;
- healthcheck Family API;
- healthcheck Synapse;
- healthcheck PostgreSQL;
- disk usage;
- memory usage;
- container restart count;
- backup status.

### Логи

- логи Family API;
- логи Synapse;
- логи reverse proxy;
- логи backup jobs.

Важно: логи не должны содержать пароли, invite-коды в открытом виде или содержимое сообщений.

### Документация

Добавить `docs/operations.md`:

- как перезапустить сервисы;
- как посмотреть логи;
- как создать invite-код;
- как деактивировать пользователя;
- как проверить бэкап;
- как обновить контейнеры;
- что делать, если закончился диск;
- что делать, если пользователь потерял доступ к E2EE-сессии.

### Проверка готовности

- Есть понятные команды диагностики.
- Администратор может понять, какой сервис упал.
- Есть инструкция восстановления.

### Результат

Сервер можно поддерживать без постоянной разработки.

## 23. Тестовая стратегия

### Family API

Обязательные тесты:

- создание invite-кода;
- регистрация по invite-коду;
- запрет повторного использования одноразового кода;
- запрет регистрации по неверному коду;
- создание family ID;
- поиск пользователя по family ID;
- запрет доступа обычного пользователя к admin endpoints;
- rate limit на register/login;
- генерация LiveKit token только для членов семьи;
- сохранение push subscription.

### Frontend

Обязательные проверки:

- login form;
- register form;
- chats layout desktop;
- chats layout mobile;
- отправка текстового сообщения;
- ошибка отправки;
- загрузка файла;
- запись голосового;
- настройки уведомлений;
- admin guard.

### Интеграционные проверки

- регистрация пользователя через Family API создает Matrix user;
- новый пользователь попадает в общий семейный чат;
- личный чат создается только между членами семьи;
- E2EE включается для новых комнат;
- push приходит при новом сообщении;
- LiveKit token позволяет войти в комнату звонка.

### Manual QA перед MVP

- Chrome desktop;
- Safari desktop;
- Firefox desktop;
- iOS Safari;
- Android Chrome;
- установка PWA;
- работа при нестабильной сети;
- reload во время активной сессии;
- logout/login;
- вход с нового устройства.

## 24. Основные риски

### E2EE в браузере

Риск: сложный UX восстановления ключей и входа с нового устройства.

Что сделать:

- заложить отдельный этап;
- не оставлять E2EE на самый конец;
- тестировать на двух пользователях и двух устройствах;
- документировать ограничения MVP.

### Push для E2EE-сообщений

Риск: backend не может прочитать текст E2EE-сообщения, а значит не должен формировать уведомления с содержимым.

Что сделать:

- по умолчанию отправлять приватное уведомление без текста;
- опциональный показ текста включать только там, где это безопасно и явно разрешено пользователем;
- не нарушать принцип "сервер не читает сообщения".

### LiveKit на мобильных браузерах

Риск: отличия iOS Safari и Android Chrome.

Что сделать:

- тестировать рано;
- обрабатывать отказ permissions;
- добавить fallback-состояния;
- не обещать групповые звонки в MVP.

### Synapse configuration

Риск: server name трудно менять после запуска.

Что сделать:

- выбрать server name до production;
- явно описать это в setup/deployment docs;
- не использовать временный production domain без понимания последствий.

### Media storage

Риск: быстро растущий объем медиа.

Что сделать:

- лимит 100 MB в MVP;
- мониторинг диска;
- бэкап media store;
- позже рассмотреть S3-compatible storage.

## 25. Приоритеты MVP

### Must have

- Docker Compose;
- Synapse + PostgreSQL;
- Family API;
- закрытая регистрация по invite-коду;
- login/register UI;
- главный экран чатов;
- Matrix login;
- список семейных пользователей;
- общий семейный чат;
- личные чаты;
- текстовые сообщения;
- E2EE;
- фото и файлы;
- голосовые;
- PWA;
- Web Push;
- LiveKit звонки 1 на 1;
- базовая админ-панель;
- production HTTPS;
- бэкапы.

### Should have

- предпросмотр видео;
- сжатие изображений;
- skeleton loading;
- drag-and-drop файлов;
- настройки приватности уведомлений;
- audit log админских действий;
- мониторинг места на диске.

### Could have после MVP

- реакции;
- редактирование сообщений;
- ответ на сообщение;
- удалить у всех;
- групповые звонки;
- демонстрация экрана;
- поиск по сообщениям;
- улучшенное управление устройствами E2EE;
- S3-compatible хранилище;
- desktop push улучшения;
- расширенная аналитика технического состояния.

### Won't have в MVP

- сторис;
- каналы;
- публичные группы;
- боты;
- стикеры;
- мини-приложения;
- платежи;
- публичная регистрация;
- федеративный поиск внешних пользователей.

## 26. Порядок первых практических задач

Рекомендуемый порядок начала реализации:

1. Создать структуру репозитория.
2. Добавить `.gitignore`, `.env.example`, README.
3. Поднять `postgres` и `synapse` через Docker Compose.
4. Запретить публичную регистрацию Synapse.
5. Создать FastAPI skeleton.
6. Подключить Family API к PostgreSQL.
7. Добавить миграции Alembic.
8. Реализовать invite-коды.
9. Реализовать регистрацию через Synapse admin API.
10. Создать Next.js приложение.
11. Сделать `/login`, `/register`, `/chats`.
12. Подключить Matrix JS SDK.
13. Реализовать текстовую переписку.
14. Включить семейную логику.
15. Включить E2EE.

## 27. Definition of Done для каждого этапа

Этап считается завершенным только если:

- код запускается локально;
- нет известных критических ошибок;
- есть минимальная проверка или тест;
- документация обновлена;
- переменные окружения отражены в `.env.example`;
- не добавлены реальные секреты;
- следующий этап можно начинать без переписывания предыдущего;
- пользовательский сценарий этапа можно пройти вручную.

## 28. Документы, которые нужно поддерживать

- `README.md` - быстрый старт и обзор проекта.
- `docs/setup.md` - локальный запуск.
- `docs/security.md` - модель безопасности и ограничения.
- `docs/backup.md` - бэкап и восстановление.
- `docs/deployment.md` - production deployment.
- `docs/operations.md` - эксплуатация и диагностика.
- `docs/roadmap.md` - текущая дорожная карта.

## 29. Итоговая стратегия

Разработка должна идти от надежного фундамента к удобному интерфейсу:

1. Сначала поднять Matrix и инфраструктуру.
2. Затем сделать закрытую регистрацию и семейную модель.
3. Затем подключить frontend и текстовые сообщения.
4. Затем включить E2EE и проверить приватность.
5. Затем добавить медиа, голосовые, уведомления и звонки.
6. Затем отполировать UX.
7. Затем подготовить production, бэкапы и эксплуатацию.

Такой порядок снижает риск построить красивый интерфейс поверх небезопасной или нестабильной основы.
