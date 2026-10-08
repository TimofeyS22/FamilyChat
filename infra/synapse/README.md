# Synapse infrastructure notes

This directory contains the Stage 1 Synapse configuration for FamilyChat.

## Important limits

- `homeserver.yaml` is a static template. Synapse does not expand `.env` values inside YAML at runtime.
- The committed secrets are placeholders only. Replace them in a private generated config before creating real accounts.
- Public registration is disabled with `enable_registration: false`.
- Federation is configured as closed family mode: no federation listener is exposed by the listener config, Nginx proxies only client endpoints, and `federation_domain_whitelist` is empty.
- PostgreSQL is used; SQLite is not configured.

## Local config check

From the repository root:

```bash
docker compose -f infra/docker-compose.yml --env-file .env.example config
docker compose -f infra/docker-compose.yml --env-file .env.example up -d postgres synapse nginx
docker compose -f infra/docker-compose.yml --env-file .env.example ps
curl http://localhost:8080/_matrix/client/versions
docker compose -f infra/docker-compose.yml --env-file .env.example down
```

## Generating a fresh Synapse config

The official Synapse Docker image supports generating a static configuration file with the `generate` command. Use this when preparing a private environment, then copy only safe template changes back into the repo:

```bash
docker run -it --rm \
  --mount type=volume,src=familychat_synapse_data,dst=/data \
  -e SYNAPSE_SERVER_NAME=familychat.local \
  -e SYNAPSE_REPORT_STATS=no \
  matrixdotorg/synapse:latest generate
```

After generation, update the generated private `/data/homeserver.yaml` to use PostgreSQL, keep `enable_registration: false`, and keep the server name stable. Do not commit generated signing keys or real secrets.
