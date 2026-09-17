import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { createApp } from "./app.js";
import { log } from "./logger.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
loadEnv({ path: path.join(repoRoot, ".env") });

const port = Number.parseInt(process.env.API_PORT ?? "3001", 10);

if (!Number.isFinite(port) || port <= 0) {
  throw new Error("API_PORT must be a positive integer");
}

const app = createApp();

app.listen(port, () => {
  log("info", "api listening", { port });
});
