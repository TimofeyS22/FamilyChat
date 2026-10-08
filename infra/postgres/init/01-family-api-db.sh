#!/bin/sh
set -eu

: "${FAMILY_API_POSTGRES_DB:=familychat}"
: "${FAMILY_API_POSTGRES_USER:=familychat}"
: "${FAMILY_API_POSTGRES_PASSWORD:=change-me}"

role_exists="$(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v family_api_user="$FAMILY_API_POSTGRES_USER" \
  -tA <<'SQL'
SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'family_api_user';
SQL
)"

if [ "$role_exists" != "1" ]; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -v family_api_user="$FAMILY_API_POSTGRES_USER" \
    -v family_api_password="$FAMILY_API_POSTGRES_PASSWORD" <<'SQL'
CREATE ROLE :"family_api_user" LOGIN PASSWORD :'family_api_password';
SQL
fi

db_exists="$(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v family_api_db="$FAMILY_API_POSTGRES_DB" \
  -tA <<'SQL'
SELECT 1 FROM pg_database WHERE datname = :'family_api_db';
SQL
)"

if [ "$db_exists" != "1" ]; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -v family_api_db="$FAMILY_API_POSTGRES_DB" \
    -v family_api_user="$FAMILY_API_POSTGRES_USER" <<'SQL'
CREATE DATABASE :"family_api_db" OWNER :"family_api_user";
SQL
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v family_api_db="$FAMILY_API_POSTGRES_DB" \
  -v family_api_user="$FAMILY_API_POSTGRES_USER" <<'SQL'
GRANT ALL PRIVILEGES ON DATABASE :"family_api_db" TO :"family_api_user";
SQL
