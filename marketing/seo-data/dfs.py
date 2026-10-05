"""DataForSEO pulls for the Muddy York SEO research. Reads credentials from
marketing/.env.seo (git-ignored); writes raw JSON next to this file."""
import base64, json, os, sys, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
env = dict(l.split("=", 1) for l in open(os.path.join(HERE, "..", ".env.seo")).read().splitlines() if "=" in l)
AUTH = "Basic " + base64.b64encode(f"{env['DATAFORSEO_LOGIN']}:{env['DATAFORSEO_PASSWORD']}".encode()).decode()

def post(path, payload, out):
    req = urllib.request.Request("https://api.dataforseo.com/v3/" + path, data=json.dumps(payload).encode(),
                                 headers={"Authorization": AUTH, "Content-Type": "application/json"})
    d = json.load(urllib.request.urlopen(req, timeout=300))
    json.dump(d, open(os.path.join(HERE, out), "w"), indent=1)
    errs = [t["status_message"] for t in d.get("tasks", []) if t["status_code"] != 20000]
    print(f"{path}: status {d['status_code']} cost ${d.get('cost')} tasks {len(d.get('tasks', []))} errors {errs[:3]}")
    return d
