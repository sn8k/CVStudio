import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const prismaCli = fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url));

export function deployMigrationsOnCopy(root, databasePath) {
  const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: `file:${databasePath.replaceAll("\\", "/")}` },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`Échec de prisma migrate deploy sur la copie de test.\n${result.stdout}\n${result.stderr}`);
  }
}
