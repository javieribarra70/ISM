import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
import * as path from "path";

// Carga el .env único del monorepo (un nivel arriba de frontend/) para que
// `drizzle-kit push` y `drizzle-kit generate` puedan leer DATABASE_URL.
//
// Este archivo usa extensión .cts para forzar carga como CommonJS y evitar
// el conflicto entre "type": "module" del package.json y el cargador de
// drizzle-kit, que bundlea a CJS y reventaba con "require is not defined".
dotenv.config({ path: path.resolve(__dirname, "../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
