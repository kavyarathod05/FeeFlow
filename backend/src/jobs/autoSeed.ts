import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../config/prisma.js";

/**
 * Free Render cannot run one-off jobs/SSH on all accounts.
 * If the database has no users, run the deterministic demo seed once at boot.
 */
export async function autoSeedIfEmpty(): Promise<void> {
  if (process.env.AUTO_SEED === "false") return;

  const users = await prisma.user.count();
  if (users > 0) {
    console.info("[seed] data present — skipping auto-seed");
    return;
  }

  console.info("[seed] empty database — running demo seed");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const backendRoot = path.resolve(here, "../..");
  const seedFile = path.join(backendRoot, "prisma/seed.ts");

  await new Promise<void>((resolve, reject) => {
    const child = spawn("npx", ["tsx", seedFile], {
      cwd: backendRoot,
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`auto-seed exited with code ${code}`));
    });
    child.on("error", reject);
  });
}
