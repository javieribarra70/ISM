import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Carga el .env único del monorepo, ubicado en la raíz del repo
// (dos niveles arriba de este archivo).
//
// Rutas resultantes:
//   dev  -> frontend/server/load-env.ts -> __dirname = frontend/server
//   prod -> frontend/dist/index.js      -> __dirname = frontend/dist
// En ambos casos, "../../.env" resuelve a la raíz del repo.
//
// Este módulo debe importarse como PRIMERA línea de server/index.ts para
// garantizar que dotenv corra antes que cualquier import que lea
// process.env en su top-level (por ejemplo server/db.ts).

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
