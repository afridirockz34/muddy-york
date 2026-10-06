import { runAlerts } from "./run.js";
import { sendAlertEmail } from "./mailer.js";
import { sendPushToUser } from "../push/sender.js";
import { fetchWeather } from "./weather.js";

// Check every saved river once an hour and alert (push + email) when one
// crosses its owner's threshold. Alerts are edge-triggered (see decide.js):
// once per crossing, at most twice a week per river, one message per user per 12 h.
export function scheduleAlerts(log = console) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runAlerts({ fetchWeather, sendEmail: sendAlertEmail, sendPush: sendPushToUser });
      log.info?.({ alerts: r }, "condition alerts");
    } catch (e) {
      log.error?.({ err: e }, "condition alerts failed");
    } finally { running = false; }
  };
  setTimeout(run, 60_000);
  return setInterval(run, 60 * 60 * 1000);
}
