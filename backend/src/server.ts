import cron from "node-cron";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { dispatchDueReminders } from "./services/reminderService.js";
import { autoSeedIfEmpty } from "./jobs/autoSeed.js";

const app = createApp();

// Render / cloud: bind 0.0.0.0:$PORT
app.listen(env.PORT, "0.0.0.0", () => {
  console.info(`FeeFlow API listening on 0.0.0.0:${env.PORT}`);
  void autoSeedIfEmpty().catch((err) => {
    console.error("[seed] auto-seed failed", err);
  });
});

// In-process reminder dispatcher (mock delivery). ASSUMPTION: cron every 15 min IST window.
cron.schedule("*/15 * * * *", async () => {
  try {
    const results = await dispatchDueReminders();
    if (results.length) {
      console.info(`[reminders] mock-dispatched ${results.length}`);
    }
  } catch (err) {
    console.error("[reminders] dispatch failed", err);
  }
});
