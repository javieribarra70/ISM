# Infraestructura local

Postgres corriendo en Docker para uso del frontend Express y el backend Python.

## Bases de datos en esta instancia

Una sola instancia de Postgres alberga dos bases de datos lógicamente separadas, cada una para un sistema distinto que comparte la misma infraestructura:

| Base | Usada por | Propósito |
|---|---|---|
| `fism_db` | Repo `FISM` (`D:\Python\fismiro\FISM`) | Sistema FISM con paneles digitales sintéticos |
| `ism_db` | Repo `ISM` (este repo) | Plataforma colaborativa ISM (frontend Express + Drizzle) |

`fism_db` se crea automáticamente al inicializar el contenedor (vía `POSTGRES_DB` del compose). `ism_db` la crea el script `infra/init-db.sh` montado en `/docker-entrypoint-initdb.d/`. Ambos owners son el mismo usuario `fism_user`.

**Importante:** el script de init sólo corre la **primera vez** que Postgres arranca con un volumen vacío. Si modificas `init-db.sh` y necesitas que se vuelva a ejecutar, tienes que borrar el volumen (`docker compose down -v`) y rearrancar (`docker compose up -d`). Esto destruye los datos.

Cada repo tiene su propio `DATABASE_URL` apuntando a su base:

```bash
# .env del repo ISM (este)
DATABASE_URL=postgresql://fism_user:fism_dev_password@localhost:5433/ism_db?sslmode=disable

# .env del repo FISM
DATABASE_URL=postgresql://fism_user:fism_dev_password@localhost:5433/fism_db?sslmode=disable
```

### Conectarse con psql

```bash
# Conectarse a la base de FISM
docker exec -it fism_postgres psql -U fism_user -d fism_db

# Conectarse a la base de ISM
docker exec -it fism_postgres psql -U fism_user -d ism_db

# Listar todas las bases (psql contra la base de mantenimiento `postgres`)
docker exec -it fism_postgres psql -U fism_user -d postgres -c "\l"
```

Para salir de psql: `\q`.

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

## Conexión desde el frontend ISM

El connection string en `.env` (raíz de este repo) debe ser:

```
DATABASE_URL=postgresql://fism_user:fism_dev_password@localhost:5433/ism_db?sslmode=disable
```

> **Nota sobre el puerto:** usamos `5433` en lugar del `5432` estándar porque en Windows es común tener una instalación nativa de Postgres ocupando el `5432`. Dentro del contenedor Postgres sigue escuchando en `5432`; sólo el mapeo en el host cambia a `5433`.

El frontend (`frontend/server/db.ts`) lee `DATABASE_URL` desde `process.env` y lo usa para abrir el pool de conexiones que consume Drizzle. Tanto el servidor Express como el almacenamiento (`server/storage.ts`) y las sesiones (`connect-pg-simple`) comparten esa misma URL.

Si cambias `POSTGRES_PASSWORD` en `.env`, actualiza también la contraseña del `DATABASE_URL` para que coincidan; de lo contrario el contenedor inicia con la nueva password pero el frontend sigue intentando autenticarse con la vieja.

## Conexión desde el backend FISM (otro repo)

El backend Python del sistema FISM vive en otro repo (`D:\Python\fismiro\FISM`) y tiene su propio `.env` apuntando a `fism_db`:

```
DATABASE_URL=postgresql://fism_user:fism_dev_password@localhost:5433/fism_db?sslmode=disable
```

Ambos repos comparten esta misma instancia de Postgres (este `docker-compose.yml`), pero cada uno escribe en su propia base de datos.

## Troubleshooting

- **Puerto 5433 en uso**: por default mapeamos el host al `5433` para evitar el `5432` que suele ocupar Postgres nativo de Windows. Si tu host ya tiene algo en `5433`, cambia el binding en `docker-compose.yml` a otro puerto libre (por ejemplo `"127.0.0.1:5434:5432"`) y actualiza `DATABASE_URL` en `.env` con el mismo puerto.
- **El healthcheck no pasa**: revisa `docker compose logs postgres`. Suele ser permisos del volumen o una contraseña inconsistente entre el contenedor y el cliente.
- **Datos corruptos tras un apagón**: borra el volumen con `docker compose down -v` y arranca de nuevo. Como es desarrollo local, no hay riesgo.
