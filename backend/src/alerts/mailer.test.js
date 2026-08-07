import { describe, it, expect, vi } from "vitest";
import { sendAlertEmail } from "./mailer.js";

const spot = { river: "Grand River", section: "Tailwater" };

describe("sendAlertEmail", () => {
  it("posts to resend and returns true on 200", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const fetchImpl = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const ok = await sendAlertEmail("a@b.com", spot, 82, { fetchImpl });
    expect(ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ method: "POST" }));
  });
  it("returns false (no throw) when no api key", async () => {
    process.env.RESEND_API_KEY = "";
    const ok = await sendAlertEmail("a@b.com", spot, 82, { fetchImpl: vi.fn() });
    expect(ok).toBe(false);
  });
});
