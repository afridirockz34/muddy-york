import { buildApp } from "./app.js";
import { scheduleRegsSync } from "./regs/sync.js";
import { scheduleAlerts } from "./alerts/schedule.js";
import { seedBlogPosts } from "./blog/seed-posts.js";
import { scheduleTileWarmer } from "./discovery/tiles.js";
import { prisma } from "./db.js";

const app = buildApp();
const port = Number(process.env.PORT) || 3000;
app.listen({ port, host: "0.0.0.0" })
  .then(() => { scheduleRegsSync(app.log); scheduleAlerts(app.log); seedBlogPosts(prisma, app.log).catch(() => {});
    if (process.env.NODE_ENV !== "test") scheduleTileWarmer(app.log); })
  .catch((e) => {
    app.log.error(e);
    process.exit(1);
  });
