# Backup

This document defines what must be backed up, but does not add automated backup jobs yet. Stage 14 deployment preparation does not implement Stage 15 backup/restore automation.

## Data to protect

Current infrastructure data:

- PostgreSQL database used by Synapse.
- PostgreSQL database used by Family API.
- Synapse `/data`, especially:
  - signing key;
  - media store;
  - generated private configuration if used.
- Private `.env` stored outside Git.
- Reverse proxy config if changed for a deployment.

Future data:

- Web Push keys.
- LiveKit config, if local state is introduced.

## Manual PostgreSQL dump

From the repository root:

```bash
mkdir -p infra/backups/local
docker compose -f infra/docker-compose.yml --env-file .env exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > infra/backups/local/synapse-postgres.sql
```

Family API database dump:

```bash
mkdir -p infra/backups/local
docker compose -f infra/docker-compose.yml --env-file .env exec -T postgres \
  sh -c 'pg_dump -U "$FAMILY_API_POSTGRES_USER" "$FAMILY_API_POSTGRES_DB"' \
  > infra/backups/local/family-api-postgres.sql
```

Use a private `.env` with real values. Do not commit backup files. The documented
`infra/backups/local` output path is ignored by Git as a last-resort safety net,
but backups still need protected storage outside the repository.

## Manual Synapse data archive

The default Compose project name is `familychat`, so the Synapse data volume is usually `familychat_synapse_data`.

```bash
mkdir -p infra/backups/local
docker run --rm \
  -v familychat_synapse_data:/data:ro \
  -v "$PWD/infra/backups/local:/backup" \
  busybox tar -czf /backup/synapse-data.tgz -C /data .
```

This archive may contain real secrets and private media. Store it only in a protected location.

## Restore outline

High-level restore flow:

1. Stop services.
2. Restore the PostgreSQL dump into a fresh PostgreSQL volume.
3. Restore Synapse `/data` into the Synapse data volume.
4. Restore the matching private `.env`.
5. Start `postgres`, then `synapse`, then `family-api`, `frontend`, `livekit`
   if calls are used, and `nginx`.
6. Check Synapse health, Family API health, frontend route, and Matrix client
   versions endpoint.

Do not test restore on top of the only existing copy of data. Use a separate environment.

## Future automation

Later stages should add:

- scripted backup and restore commands;
- retention policy;
- encrypted offsite storage;
- integrity checks;
- restore drill documentation.
