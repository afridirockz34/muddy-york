import { buildApp } from "./app.js";
import { scheduleRegsSync } from "./regs/sync.js";
import { scheduleAlerts } from "./alerts/schedule.js";
import { seedBlogPosts } from "./blog/seed-posts.js";
import { scheduleTileWarmer } from "./discovery/tiles.js";
import { scheduleTripReminders } from "./reports/reminders.js";
import { scheduleNurture } from "./nurture/run.js";
import { backfillUsernames } from "./auth/username.js";
import { fetchWeather } from "./alerts/weather.js";
import { sendPushToUser } from "./push/sender.js";
import { prisma } from "./db.js";

const app = buildApp();
const port = Number(process.env.PORT) || 3000;
app.listen({ port, host: "0.0.0.0" })
  .then(() => { scheduleRegsSync(app.log); scheduleAlerts(app.log); seedBlogPosts(prisma, app.log).catch(() => {});
    scheduleTripReminders(app.log);
    backfillUsernames(app.log).catch(() => {});
    if (process.env.NODE_ENV !== "test") scheduleNurture({ fetchWeather, sendPush: sendPushToUser, log: app.log });
    if (process.env.NODE_ENV !== "test") scheduleTileWarmer(app.log); })
  .catch((e) => {
    app.log.error(e);
    process.exit(1);
  });
