import { buildApp } from "./app.js";
import { scheduleRegsSync } from "./regs/sync.js";
import { scheduleAlerts } from "./alerts/schedule.js";

const app = buildApp();
const port = Number(process.env.PORT) || 3000;
app.listen({ port, host: "0.0.0.0" })
  .then(() => { scheduleRegsSync(app.log); scheduleAlerts(app.log); })
  .catch((e) => {
    app.log.error(e);
    process.exit(1);
  });
