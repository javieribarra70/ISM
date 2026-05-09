#!/bin/bash
set -e

# Este script se ejecuta SOLO la primera vez que Postgres arranca con un
# volumen vacio. Crea la base secundaria ism_db con el mismo owner que
# fism_db (que es la base principal creada por POSTGRES_DB).

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE ism_db OWNER $POSTGRES_USER;
EOSQL

echo "Database ism_db created successfully"
