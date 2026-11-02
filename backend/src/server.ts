import cron from "node-cron";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { dispatchDueReminders } from "./services/reminderService.js";

const app = createApp();

// Render / cloud: bind 0.0.0.0:$PORT
app.listen(env.PORT, "0.0.0.0", () => {
  console.info(`FeeFlow API listening on 0.0.0.0:${env.PORT}`);
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
