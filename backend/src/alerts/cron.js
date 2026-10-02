import { runAlerts } from "./run.js";
import { sendAlertEmail } from "./mailer.js";
import { sendPushToUser } from "../push/sender.js";
import { fetchWeather } from "./weather.js";
import { prisma } from "../db.js";

// One-off run (npm run alerts:run). The server also runs this every hour on
// its own (see schedule.js), so a separate Render cron job is optional.
runAlerts({ fetchWeather, sendEmail: sendAlertEmail, sendPush: sendPushToUser })
  .then((r) => { console.log("alerts:", r); return prisma.$disconnect(); })
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
