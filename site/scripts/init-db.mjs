import "dotenv/config";
import { closeSync, existsSync, openSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
if (!databaseUrl.startsWith("file:")) throw new Error("db:init est réservé au développement SQLite local.");

const value = databaseUrl.slice("file:".length);
const databasePath = value.startsWith("./") ? resolve("prisma", value.slice(2)) : resolve(value);

if (!existsSync(databasePath)) closeSync(openSync(databasePath, "a"));

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

const useShell = process.platform === "win32";
const migrate = spawnSync(npx, ["prisma", "migrate", "deploy"], { stdio: "inherit", shell: useShell });
if (migrate.status !== 0) process.exit(migrate.status ?? 1);

const seed = spawnSync(npm, ["run", "db:seed"], { stdio: "inherit", shell: useShell });
process.exit(seed.status ?? 1);
