import { config } from "../config.js";
import { validateSession } from "./session.js";
export async function getCurrentUser(req) {
  const token = req.cookies?.[config.cookieName];
  if (!token) return null;
  const res = await validateSession(token);
  return res ? res.user : null;
}
