import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DATA_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "regulations.json");

// Serve the Ontario fishing-season data the app overlays on its bundled copy.
// Public + cacheable: it's the same for everyone and changes rarely. Editing
// backend/src/data/regulations.json + redeploying updates every client.
export default async function regulationsRoutes(app) {
  app.get("/api/regulations", async (req, reply) => {
    try {
      const raw = await readFile(DATA_PATH, "utf8");
      const json = JSON.parse(raw);
      reply.header("Cache-Control", "public, max-age=3600");
      return json;
    } catch (e) {
      req.log?.error?.({ err: e }, "failed to read regulations.json");
      // The app falls back to its bundled defaults on any non-object response.
      return reply.code(200).send({});
    }
  });
}
