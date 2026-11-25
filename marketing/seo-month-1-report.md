# Month 1 build: report back

Paste this and `seo-month-1-report.json` (39 change records with exact before and after values) into the strategy session.

Status of every change: committed in `e926a8c`, **not deployed yet**. The JSON says "committed, not deployed"; switch it to "deployed" once pushed.

## The answers the plan asked for

- **LCP element named:** the `/fishing/` hero, `SECTION.mh` with the background `/img/site/elora-gorge.jpg`. It finished at 6.5 s mostly because the 428 KB logo and two off-screen photos (291 KB and 195 KB) were downloading at the same time.
- **New mobile LCP figure:** not measured yet. The PageSpeed Insights API had used up its free daily quota. With headless Chrome at PageSpeed's mobile throttling, the live page measured 6.6 to 6.8 s (3 runs). After the fix, the hero finishes at 1.36 s locally. A fresh PSI run is needed after deploy.
- **Test `sign_up` and `subscribe` in GA4:** not confirmed. `sign_up` was confirmed on the dataLayer with `landing_page` filled in. GA4 itself can't show either event until the steps under "Needs the owner" are done.
- **Which Grand River page gets the salmon queries:** not found. The Ahrefs account has no project for this site, so there was no Search Console data to check.

## Not done, and why

- **6.13 Grand River section:** skipped. It needs the page Search Console credits those queries to, and the honest answer about salmon in the Grand needs checking against a source. Writing that answer without one would break the "don't invent content" rule.
- **New `/fishing-spots/bowmanville/` (task 259):** not created. It would compete with the existing `/fishing-spots/oshawa-bowmanville/`, which now leads with Bowmanville instead (owner approved).
- **New `/fishing-spots/barrie/` (task 260):** not created, because it already exists. It was retitled. Its body copy was not changed.
- **"Live flow and clarity" wording:** not used. No salmon-run page has a gauge, and no page shows measured clarity. The "right now" block says water and flow are estimated from live weather.
- **"Fresh fish moving" status lines:** not used, because there's no data on fish movement. The block shows the score, the estimated water temperature and flow, recent rain and the season. Salmon-run pages keep their member run status.
- **The plan's GA4 shape, changed to fit the business:**
  - Every checkout starts a 7-day free trial, so the checkout webhook sends `start_trial` ($0).
  - `subscribe` fires on the first real charge, and `renewal` fires after that.
  - The plans are monthly and yearly, not "monthly / early".

## Also fixed along the way

- **Alert scorer:** the "feeding window" used the server's clock, which may be UTC, instead of Toronto time.
- **Privacy policy (dated November 25, 2026):** it now says sign-ups, trials and payments are reported to Google Analytics, without name or email.

## Needs the owner

1. **Add `GA4_MEASUREMENT_ID` and `GA4_API_SECRET` on Render.** The secret is created in GA4 under Admin › Data streams › Measurement Protocol API secrets.
2. **Set up Google Tag Manager:**
   - Add a GA4 event tag named `sign_up`, triggered by the custom event `sign_up`.
   - Send the data-layer variables `method`, `landing_page` and `referrer_source` as event parameters.
   - Publish the container.
3. **Set up GA4:**
   - Mark `sign_up`, `start_trial` and `subscribe` as key events.
   - Create event-scoped custom dimensions `landing_page`, `referrer_source` and `plan`.
4. **Test both events after deploy:**
   - Do a test sign-up.
   - Do a Stripe test-mode checkout, then trigger the first invoice by ending the trial early in Stripe test mode.
   - Watch GA4 Realtime for both events.
5. **Re-submit sitemaps in Search Console:** `sitemap.xml` and the new `regs-sitemap.xml`.
6. **Run PageSpeed Insights on `/fishing/`** and record the new mobile LCP.
7. **Check the security reports after a week** (Admin › Integrations) before enforcing the policy.
