# Frontend Auth + Paywall UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Header account button + modal (sign in/up, Google, upgrade, manage, alert prefs, sign out) and a soft paywall around premium features — active only when a backend is configured.

**Architecture:** New pure helpers in `lib/entitlement-ui.js`; new React components + auth state in `source-app.jsx`; a small backend cookie fix for cross-site prod. `proxyJSON` (credentials + method/body) already exists.

**Tech Stack:** React (esbuild), Fastify backend, Vitest.

## Global Constraints

- All auth/paywall UI renders only when `API_BASE` is set; otherwise the app is unchanged.
- `/auth/me` failure → treat as signed-out/free; never blank-screen.
- Session cookie: `sameSite: isProd ? "none" : "lax"`, `secure: isProd`.

---

### Task 0: Backend cross-site session cookie

**Files:** Modify `backend/src/routes/auth.js`, `backend/src/routes/google.js`

- [ ] **Step 1:** In `auth.js` `setSessionCookie`, change options to `{ httpOnly:true, sameSite: config.isProd ? "none" : "lax", secure: config.isProd, path:"/", expires: expiresAt }`.
- [ ] **Step 2:** In `google.js` callback cookie set, apply the same `sameSite`/`secure`.
- [ ] **Step 3:** `cd backend && npm test` — all still green (tests use inject, unaffected).
- [ ] **Step 4:** Commit: `git commit -m "fix(backend): cross-site session cookie in production"`

---

### Task 1: Entitlement UI helpers (pure, TDD)

**Files:** Create `lib/entitlement-ui.js`, `lib/entitlement-ui.test.js`

**Interfaces:** `entitlementLabel(me) => string`; `isPremiumMe(me) => boolean`; `planPrice(plan) => string`.

- [ ] **Step 1: Failing test** `lib/entitlement-ui.test.js`:
```js
import { describe, it, expect } from "vitest";
import { entitlementLabel, isPremiumMe, planPrice } from "./entitlement-ui.js";
describe("entitlement-ui", () => {
  it("labels states", () => {
    expect(entitlementLabel(null)).toBe("Sign in");
    expect(entitlementLabel({ entitlement: "active" })).toBe("Member");
    expect(entitlementLabel({ entitlement: "trialing" })).toBe("Trial");
    expect(entitlementLabel({ entitlement: "free" })).toBe("Free");
  });
  it("premium check", () => {
    expect(isPremiumMe({ entitlement: "trialing" })).toBe(true);
    expect(isPremiumMe({ entitlement: "free" })).toBe(false);
    expect(isPremiumMe(null)).toBe(false);
  });
  it("plan price", () => {
    expect(planPrice("annual")).toContain("59.99");
    expect(planPrice("monthly")).toContain("9.99");
  });
});
```
- [ ] **Step 2:** Run: `npx vitest run lib/entitlement-ui.test.js` → FAIL.
- [ ] **Step 3: Implement** `lib/entitlement-ui.js`:
```js
export function isPremiumMe(me) { return !!me && (me.entitlement === "active" || me.entitlement === "trialing"); }
export function entitlementLabel(me) {
  if (!me || !me.user) return "Sign in";
  if (me.entitlement === "active") return "Member";
  if (me.entitlement === "trialing") return "Trial";
  return "Free";
}
export function planPrice(plan) { return plan === "annual" ? "$59.99/yr" : "$9.99/mo"; }
```
- [ ] **Step 4:** Run → PASS (3 tests).
- [ ] **Step 5:** Commit: `git commit -m "feat(frontend): entitlement UI helpers"`

---

### Task 2: Auth state + AccountButton + AuthModal

**Files:** Modify `source-app.jsx` (imports; App state; header; new components)

**Interfaces:** App holds `me`, `refreshMe()`, `isPremium`. `AccountButton` opens `AuthModal`.

- [ ] **Step 1:** Import helpers at top: `import { entitlementLabel, isPremiumMe, planPrice } from "./lib/entitlement-ui.js";`
- [ ] **Step 2:** In `App`, add state + effect:
```js
const [me,setMe]=useState(null);
const [authOpen,setAuthOpen]=useState(false);
const refreshMe=useCallback(async()=>{ if(!API_BASE) return; try{ setMe(await proxyJSON("/auth/me")); }catch{ setMe({user:null,entitlement:"free"}); } },[]);
useEffect(()=>{ refreshMe(); },[refreshMe]);
const isPremium = !API_BASE || isPremiumMe(me); // standalone (no backend) = everything open
```
- [ ] **Step 3:** In the header (next to the status span), add `{API_BASE && <AccountButton me={me} onClick={()=>setAuthOpen(true)}/>}`.
- [ ] **Step 4:** Render the modal near the root return: `{authOpen && <AuthModal me={me} onClose={()=>setAuthOpen(false)} onAuth={refreshMe}/>}`.
- [ ] **Step 5:** Add the components (near other sub-components):
```js
function AccountButton({me,onClick}){
  const label=entitlementLabel(me);
  return (<button onClick={onClick} style={{fontFamily:sans,fontSize:10,fontWeight:700,letterSpacing:0.4,padding:"5px 10px",borderRadius:6,cursor:"pointer",border:`1px solid ${C.brass}`,background:"transparent",color:C.brass}}>{me&&me.user?`◉ ${label}`:"Sign in"}</button>);
}
function AuthModal({me,onClose,onAuth}){
  const signedIn=me&&me.user;
  const [mode,setMode]=useState("signin"); // signin|signup
  const [email,setEmail]=useState(""),[pw,setPw]=useState(""),[err,setErr]=useState(""),[busy,setBusy]=useState(false);
  const inp={width:"100%",padding:"10px 12px",borderRadius:6,border:`1px solid ${C.line}`,background:C.bone,color:C.text,fontFamily:sans,fontSize:14,marginTop:8};
  const submit=async()=>{ setErr(""); setBusy(true);
    try{ await proxyJSON(mode==="signup"?"/auth/signup":"/auth/login",{method:"POST",body:{email:email.trim(),password:pw}});
      await onAuth(); onClose(); }
    catch(e){ setErr(mode==="signup"?"That email may already be registered, or the password is too short (8+).":"Email or password incorrect."); }
    finally{ setBusy(false); } };
  const logout=async()=>{ try{ await proxyJSON("/auth/logout",{method:"POST"}); }catch{} await onAuth(); onClose(); };
  const checkout=async(plan)=>{ try{ const {url}=await proxyJSON("/billing/checkout",{method:"POST",body:{plan}}); if(url) window.location=url; }catch{ setErr("Couldn't start checkout — try again."); } };
  const portal=async()=>{ try{ const {url}=await proxyJSON("/billing/portal",{method:"POST"}); if(url) window.location=url; }catch{ setErr("Couldn't open billing — try again."); } };
  return (<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(20,26,20,.55)",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center",padding:18}}>
    <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:380,background:C.panel,border:`1px solid ${C.line}`,borderRadius:14,padding:20,boxShadow:"0 12px 40px rgba(0,0,0,.35)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontFamily:serif,fontSize:19,fontWeight:700,color:C.pine}}>{signedIn?"Your account":mode==="signup"?"Create account":"Sign in"}</div>
        <button onClick={onClose} aria-label="Close" style={{background:"none",border:"none",cursor:"pointer",color:C.textDim,fontSize:20}}>✕</button>
      </div>
      {err&&<div style={{marginTop:10,fontSize:12,color:C.brick}}>{err}</div>}
      {signedIn ? (<div style={{marginTop:12}}>
        <div style={{fontSize:13,color:C.text}}>{me.user.email}</div>
        <div style={{fontFamily:sans,fontSize:10,letterSpacing:1,textTransform:"uppercase",fontWeight:700,color:C.brass,marginTop:4}}>{entitlementLabel(me)}</div>
        {me.entitlement!=="active" ? (<div style={{marginTop:14}}>
          <div style={{fontSize:12,color:C.textDim,marginBottom:8}}>Unlock the full ranked list, discovery, the fly advisor, and routes.</div>
          <button onClick={()=>checkout("annual")} style={{...btn,borderColor:C.brick,background:C.brick,color:C.bone,width:"100%",padding:"10px"}}>Go annual — {planPrice("annual")}</button>
          <button onClick={()=>checkout("monthly")} style={{...btn,borderColor:C.line,color:C.pine,width:"100%",padding:"9px",marginTop:8}}>Monthly — {planPrice("monthly")}</button>
        </div>) : (<button onClick={portal} style={{...btn,borderColor:C.line,color:C.pine,width:"100%",padding:"9px",marginTop:14}}>Manage subscription</button>)}
        <AlertPrefs/>
        <button onClick={logout} style={{...btn,borderColor:C.line,color:C.textDim,width:"100%",padding:"9px",marginTop:14}}>Sign out</button>
      </div>) : (<div style={{marginTop:12}}>
        <a href={`${API_BASE}/auth/google`} style={{...btn,borderColor:C.pine,color:C.pine,width:"100%",padding:"10px",display:"block",textAlign:"center",textDecoration:"none"}}>Continue with Google</a>
        <div style={{textAlign:"center",fontSize:11,color:C.textFaint,margin:"12px 0"}}>or with email</div>
        <input style={inp} type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/>
        <input style={inp} type="password" placeholder="password (8+ characters)" value={pw} onChange={e=>setPw(e.target.value)}/>
        <button disabled={busy} onClick={submit} style={{...btn,borderColor:C.brick,background:C.brick,color:C.bone,width:"100%",padding:"11px",marginTop:12,opacity:busy?0.6:1}}>{busy?"…":mode==="signup"?"Create account & start trial":"Sign in"}</button>
        <div style={{textAlign:"center",marginTop:12,fontSize:12,color:C.textDim}}>
          {mode==="signup"?"Already have an account? ":"New here? "}
          <button onClick={()=>{setMode(mode==="signup"?"signin":"signup");setErr("");}} style={{background:"none",border:"none",color:C.brick,cursor:"pointer",textDecoration:"underline",fontSize:12}}>{mode==="signup"?"Sign in":"Create one — 14-day free trial"}</button>
        </div>
      </div>)}
    </div>
  </div>);
}
```
- [ ] **Step 6:** Build: `npm run build`. Commit: `git commit -m "feat(frontend): account button + auth modal"`

---

### Task 3: AlertPrefs component

**Files:** Modify `source-app.jsx`

- [ ] **Step 1:** Add:
```js
function AlertPrefs(){
  const [p,setP]=useState(null);
  useEffect(()=>{ let live=true; proxyJSON("/alert-prefs").then(d=>{ if(live) setP(d); }).catch(()=>{}); return ()=>{live=false;}; },[]);
  if(!p) return null;
  const save=(next)=>{ setP(next); proxyJSON("/alert-prefs",{method:"PUT",body:next}).catch(()=>{}); };
  return (<div style={{marginTop:16,paddingTop:14,borderTop:`2px dotted ${C.line}`}}>
    <div style={{fontFamily:sans,fontSize:10,letterSpacing:1,textTransform:"uppercase",fontWeight:700,color:C.brass,marginBottom:8}}>Condition alerts</div>
    <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:C.text,cursor:"pointer"}}>
      <input type="checkbox" checked={p.alertEmail} onChange={e=>save({...p,alertEmail:e.target.checked})}/> Email me when my water hits prime
    </label>
    <div style={{marginTop:10,fontSize:11,color:C.textDim,display:"flex",justifyContent:"space-between"}}><span>Alert threshold</span><span style={{fontFamily:mono,color:C.text}}>{p.alertThreshold}/100</span></div>
    <input type="range" min="50" max="95" value={p.alertThreshold} style={{width:"100%",marginTop:6}} onChange={e=>save({...p,alertThreshold:+e.target.value})}/>
  </div>);
}
```
- [ ] **Step 2:** Build. Commit: `git commit -m "feat(frontend): alert preferences in account modal"`

---

### Task 4: Locked wrapper + apply the soft gate

**Files:** Modify `source-app.jsx`

**Interfaces:** `<Locked premium onUpgrade>{children}</Locked>` — blurs + overlays CTA when `!premium`.

- [ ] **Step 1:** Add the component:
```js
function Locked({premium,onUpgrade,children,label="Upgrade to unlock"}){
  if(premium) return children;
  return (<div style={{position:"relative"}}>
    <div style={{filter:"blur(4px)",pointerEvents:"none",userSelect:"none",opacity:0.7}} aria-hidden="true">{children}</div>
    <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <button onClick={onUpgrade} style={{...btn,borderColor:C.brick,background:C.brick,color:C.bone,padding:"9px 16px",boxShadow:"0 3px 12px rgba(0,0,0,.25)"}}>🔒 {label}</button>
    </div>
  </div>);
}
```
- [ ] **Step 2:** Gate the **fly advisor**: in `Advisor`, wrap the expandable body so the toggle is visible but the content is locked. Simplest: pass `premium`/`onUpgrade` to `Advisor` and wrap its `{open && (...)}` content in `<Locked premium onUpgrade>`. `Advisor` receives `premium`/`onUpgrade` from `RecCard`/callers; `RecCard` receives them from the Report render. Wire `premium={isPremium}` and `onUpgrade={()=>setAuthOpen(true)}` down through `RecCard` and the database/map advisor usages.
- [ ] **Step 3:** Gate the **ranked list** on Report: free users see `top3.slice(0,1)` as full `RecCard`, then wrap the remaining top picks + honourable list in `<Locked>`. Keep basic conditions visible.
- [ ] **Step 4:** Gate **discovery**: when `!isPremium`, the "Find water near me" button calls `onUpgrade` instead of discovering; discovered markers/list only for premium.
- [ ] **Step 5:** Gate **routes**: wrap the "Parking & route" panel body in `MapView` with `<Locked>` when `!isPremium` (pass `premium`/`onUpgrade` into `MapView`).
- [ ] **Step 6:** Build: `npm run build && npm test` (24/24). Commit: `git commit -m "feat(frontend): soft paywall gating (advisor, list, discovery, routes)"`

---

### Task 5: Live browser verification + wrap

- [ ] **Step 1:** Start backend (`cd backend && npm run dev`) and frontend (`python3 -m http.server 8000`); set `window.MUDDY_API_BASE="http://localhost:3000"` (or a small dev shim). Verify: sign up → "Trial" badge; advisor unlocks (trial = premium); sign out → advisor shows lock; Upgrade opens Stripe (needs test keys) or errors gracefully.
- [ ] **Step 2:** Confirm no-backend mode: without `API_BASE`, no account button, everything open, 24/24 tests pass.
- [ ] **Step 3:** Tag: `git commit --allow-empty -m "chore: frontend auth + paywall UI complete"`

## Self-Review

**Spec coverage:** header account button + modal (Task 2), Google + email auth (2), upgrade/manage (2), alert prefs (3), soft gate via `Locked` (4), backend cross-site cookie (0), entitlement helpers (1), no-backend passthrough (2 `isPremium` default, 5). **Placeholders:** none. **Consistency:** `isPremium`/`onUpgrade`(`setAuthOpen(true)`) threaded into `RecCard`/`Advisor`/`MapView`; `proxyJSON(path,{method,body})` + credentials from B phase 3/5; `me` shape `{user,entitlement}` matches `/auth/me`.
