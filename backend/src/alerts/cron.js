import { runAlerts } from "./run.js";
import { sendAlertEmail } from "./mailer.js";
import { sendPushToUser } from "../push/sender.js";
import { prisma } from "../db.js";

async function fetchWeather(lat, lon) {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=wind_speed_10m,pressure_msl,cloud_cover&daily=temperature_2m_max,temperature_2m_min,precipitation_sum` +
    `&past_days=5&forecast_days=1&timezone=America%2FToronto`;
  const r = await fetch(u); if (!r.ok) throw new Error("wx");
  const d = await r.json();
  const dm = d.daily, n = dm.time.length;
  let sum = 0, c = 0;
  for (let i = Math.max(0, n - 3); i < n; i++) { sum += (dm.temperature_2m_max[i] + dm.temperature_2m_min[i]) / 2; c++; }
  const airMean = c ? sum / c : 15;
  let days = null;
  for (let i = n - 1; i >= 0; i--) { if ((dm.precipitation_sum[i] || 0) > 2) { days = n - 1 - i; break; } }
  if (days == null) days = n + 1;
  const p48 = (dm.precipitation_sum[n - 1] || 0) + (dm.precipitation_sum[n - 2] || 0);
  const flow = p48 >= 35 ? "Blown out" : p48 >= 12 ? "High / stained" : days >= 6 ? "Low / clear" : "Normal";
  return { airMean, days, flow, wind: d.current?.wind_speed_10m, cloud: d.current?.cloud_cover, pressureTrend: null };
}

runAlerts({ fetchWeather, sendEmail: sendAlertEmail, sendPush: sendPushToUser })
  .then((r) => { console.log("alerts:", r); return prisma.$disconnect(); })
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
