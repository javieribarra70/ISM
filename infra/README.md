# Infraestructura local

Postgres corriendo en Docker para uso del frontend Express y el backend Python.

## Arrancar Postgres

Desde la raíz del repo:

```bash
cd infra
docker compose up -d
```

El flag `-d` corre Postgres en segundo plano. Tarda 5-10 segundos en estar listo la primera vez (descarga la imagen).

## Verificar que está corriendo

```bash
docker ps
```

Debe aparecer un contenedor llamado `fism_postgres` con estado healthy o starting.

Para ver los logs:

```bash
cd infra
docker compose logs -f postgres
```

Ctrl+C cierra los logs (no para Postgres).

## Conectarse a la base con psql

Desde dentro del contenedor:

```bash
docker exec -it fism_postgres psql -U fism_user -d fism_db
```

Para salir de psql: `\q`

## Parar Postgres

```bash
cd infra
docker compose down
```

Los datos se preservan en el volumen Docker `fism_postgres_data`. Levantar de nuevo con `docker compose up -d` los recupera intactos.

## Borrar todos los datos (ATENCIÓN: irreversible)

```bash
cd infra
docker compose down -v
```

El flag `-v` borra también el volumen. Útil para empezar desde cero.

## Conexión desde el frontend

El connection string en `.env` (raíz del repo) debe ser:

```
DATABASE_URL=postgresql://fism_user:fism_dev_password@localhost:5433/fism_db
```

> **Nota sobre el puerto:** usamos `5433` en lugar del `5432` estándar porque en Windows es común tener una instalación nativa de Postgres ocupando el `5432`. Dentro del contenedor Postgres sigue escuchando en `5432`; sólo el mapeo en el host cambia a `5433`.

El frontend (`frontend/server/db.ts`) lee `DATABASE_URL` desde `process.env` y lo usa para abrir el pool de conexiones que consume Drizzle. Tanto el servidor Express como el almacenamiento (`server/storage.ts`) y las sesiones (`connect-pg-simple`) comparten esa misma URL.

Si cambias `POSTGRES_PASSWORD` en `.env`, actualiza también la contraseña del `DATABASE_URL` para que coincidan; de lo contrario el contenedor inicia con la nueva password pero el frontend sigue intentando autenticarse con la vieja.

## Conexión desde el backend Python

Cuando el backend Python esté en su sitio (carpeta `backend/`), también leerá `DATABASE_URL` desde el mismo `.env` raíz. La misma cadena sirve para ambos servicios; no es necesario duplicar configuración.

## Troubleshooting

- **Puerto 5433 en uso**: por default mapeamos el host al `5433` para evitar el `5432` que suele ocupar Postgres nativo de Windows. Si tu host ya tiene algo en `5433`, cambia el binding en `docker-compose.yml` a otro puerto libre (por ejemplo `"127.0.0.1:5434:5432"`) y actualiza `DATABASE_URL` en `.env` con el mismo puerto.
- **El healthcheck no pasa**: revisa `docker compose logs postgres`. Suele ser permisos del volumen o una contraseña inconsistente entre el contenedor y el cliente.
- **Datos corruptos tras un apagón**: borra el volumen con `docker compose down -v` y arranca de nuevo. Como es desarrollo local, no hay riesgo.
