import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const connectionString = process.env.DATABASE_URL;

// SSL condicional: deshabilitado contra Postgres local en Docker; activo
// contra cloud DBs (Neon, Supabase, RDS, etc.). Misma heuristica que
// server/storage.ts.
const isLocalDb = /@(localhost|127\.0\.0\.1)\b/.test(connectionString);

const queryClient = postgres(connectionString, {
  ssl: isLocalDb ? false : "require",
  connect_timeout: 10,
  idle_timeout: 30,
});

export const db = drizzle(queryClient, { schema });
