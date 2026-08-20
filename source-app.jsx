import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { buildOverpassQuery, parseOverpassSpots, nearGreatLakeKm } from "./lib/discovery.js";
import { elevations } from "./lib/terrain.js";
import { inferSpecies } from "./lib/species-inference.js";
import { deriveHabitat } from "./lib/habitat-proxy.js";
import { fetchWithFallback } from "./lib/http.js";
import { applySourcePenalty, sourceBadge } from "./lib/scoring-extra.js";
import { gmapsDirections, directionsUrl, gmapsPin, gImages } from "./lib/deeplinks.js";
import { entitlementLabel, isPremiumMe, planPrice } from "./lib/entitlement-ui.js";
import { Crest, Icon } from "./lib/brand.jsx";
import { RADIUS_PRESETS, radiusLabel } from "./lib/radius.js";
import { newNote, hasPin, gmapsPinUrl } from "./lib/notes-model.js";
import { syncNotes } from "./lib/notes-sync.js";
import { mergeFeed } from "./lib/feed-merge.js";
import { applyBlocks } from "./lib/blocks.js";
import { holdingWater } from "./lib/holding-water.js";
import { estimateFish } from "./lib/fish-estimate.js";
import { catchNudge } from "./lib/catch-nudge.js";

/* When a backend proxy is configured (window.MUDDY_API_BASE), discovery,
   parking and routing flow through it (cached + rate-limit-hardened). With no
   API base set, the app calls the public APIs directly, exactly as before. */
const API_BASE = (typeof window !== "undefined" && window.MUDDY_API_BASE) || "";
async function proxyJSON(path, opts){ const o = opts||{};
  const init = { credentials:"include", headers:{} };
  if(o.method) init.method = o.method;
  if(o.body!=null){ init.headers["Content-Type"]="application/json"; init.body = JSON.stringify(o.body); }
  const r = await fetch(API_BASE + path, init); if(!r.ok) throw new Error("proxy "+r.status); return r.json(); }

/* ---- Usage telemetry: batch interaction events and flush to the backend ---- */
const evQueue=[]; let evTimer=null;
function flushEvents(){
  if(evTimer){ clearTimeout(evTimer); evTimer=null; }
  if(!API_BASE || !evQueue.length) return;
  const events=evQueue.splice(0,50);
  try{ fetch(API_BASE+"/api/events",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({events}),keepalive:true}).catch(()=>{}); }catch{}
}
function logEvent(type,ref,meta){
  if(!API_BASE||!type) return;
  evQueue.push({type,ref:ref||null,meta:meta||undefined});
  if(evQueue.length>=20) flushEvents();
  else if(!evTimer) evTimer=setTimeout(flushEvents,10000);
}
if(typeof window!=="undefined") window.addEventListener("pagehide",flushEvents);

/* ---- Web Push (prime-condition alerts) ---- */
function pushSupported(){ return typeof navigator!=="undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
function urlB64ToU8(base64){
  const pad="=".repeat((4-base64.length%4)%4);
  const b64=(base64+pad).replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(b64); const out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i);
  return out;
}
async function enablePush(){
  if(!pushSupported()) throw new Error("unsupported");
  const {publicKey,configured}=await proxyJSON("/push/config");
  if(!configured||!publicKey) throw new Error("unconfigured");
  const perm=await Notification.requestPermission();
  if(perm!=="granted") throw new Error("denied");
  const reg=await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlB64ToU8(publicKey)});
  await proxyJSON("/push/subscribe",{method:"POST",body:sub.toJSON()});
  return true;
}
async function disablePush(){
  if(!pushSupported()) return;
  const reg=await navigator.serviceWorker.ready;
  const sub=await reg.pushManager.getSubscription();
  if(sub){ try{ await proxyJSON("/push/unsubscribe",{method:"POST",body:{endpoint:sub.endpoint}}); }catch{} try{ await sub.unsubscribe(); }catch{} }
}

/* =============================================================================
   ONTARIO TROUT & SALMON RIVER INTELLIGENCE SYSTEM  —  LIVE EDITION
   Coverage: rivers within ~2 hrs driving of Jarvis St & College St, Toronto

   DATA  /  ENGINE  /  LIVE LAYER  /  UI  are kept separate.

   LIVE LAYER (what's actually fetched vs modeled):
     • Air temp + rainfall : LIVE per-river from Open-Meteo (free, keyless, CORS-ok)
     • Current time/season  : LIVE from device, recomputed on a timer
     • Water temperature    : MODELED from live multi-day air temp damped by each
                              section's cold-water retention (no public real-time
                              temp gauge exists for these reaches)
     • Flow / clarity       : ESTIMATED from recent live rainfall (true Water
                              Survey of Canada gauge data needs a backend proxy —
                              browsers block it via CORS)
   Auto-refreshes weather every 30 min and the clock every minute. Falls back to
   a seasonal climate model if the network is unavailable.
   ============================================================================= */

/* ------------------------------- PALETTE ---------------------------------- */
/* ------- PALETTE — Muddy York Fishing (heritage / Canvas Bone) -------- */
const C = {
  ink:"#F4EFE6",   ink2:"#2C4C3B",  panel:"#FBF8F0", panelHi:"#F1E8D6",
  line:"#D8CBB3",  lineSoft:"#E5DAC4", text:"#2A2A2A", textDim:"#6E6253",
  textFaint:"#9C8E78",
  // signal tokens keep their roles: good=Pine, medium=Brass, low=Brick
  cyan:"#2C4C3B",  cyanDeep:"#1F3A2C", amber:"#D4AF37", amberDeep:"#A8862A",
  red:"#8B3A3A",   white:"#22311F",
  // explicit brand tokens
  pine:"#2C4C3B",  brick:"#8B3A3A", brass:"#D4AF37", bone:"#F4EFE6", iron:"#2A2A2A",
  brickDeep:"#6F2E2E", headText:"#EFE9DB", headDim:"#AEBCA8", headFaint:"#7C8E78",
};
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CLIMO  = [-5,-4,1,8,15,20,23,22,17,10,4,-2]; // S. Ontario monthly mean air °C (fallback)

/* --------------------------- ON-DEVICE STORAGE ---------------------------- */
/* Stores the seed database, last weather pull, saved location and an analysis
   log in the device's own IndexedDB. Everything stays local to the phone. */
const DB_NAME="river-intel-db", STORE="kv";
function openDB(){ return new Promise((res,rej)=>{ try{ const r=indexedDB.open(DB_NAME,1);
  r.onupgradeneeded=()=>r.result.createObjectStore(STORE);
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }catch(e){ rej(e); } }); }
async function dbGet(k){ try{ const db=await openDB(); return await new Promise((res,rej)=>{
  const q=db.transaction(STORE,"readonly").objectStore(STORE).get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); }); }catch(e){ return undefined; } }
async function dbSet(k,v){ try{ const db=await openDB(); return await new Promise((res,rej)=>{
  const q=db.transaction(STORE,"readwrite").objectStore(STORE).put(v,k); q.onsuccess=()=>res(true); q.onerror=()=>rej(q.error); }); }catch(e){ return false; } }
function haversineKm(a,b,c,d){ const R=6371,toR=x=>x*Math.PI/180; const dLa=toR(c-a),dLo=toR(d-b);
  const s=Math.sin(dLa/2)**2+Math.cos(toR(a))*Math.cos(toR(c))*Math.sin(dLo/2)**2;
  return Math.round(R*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s))); }

/* ------------------------------- SPECIES ---------------------------------- */
const SPECIES = {
  STL:{name:"Steelhead",short:"STL",mode:"run",color:C.cyan,
    a:[0.50,0.55,0.85,1.00,0.55,0.10,0.05,0.05,0.35,0.70,0.85,0.60]},
  CHN:{name:"Chinook salmon",short:"CHN",mode:"run",color:C.amber,
    a:[0.00,0.00,0.00,0.00,0.00,0.00,0.05,0.55,1.00,0.70,0.15,0.00]},
  COH:{name:"Coho salmon",short:"COH",mode:"run",color:C.amber,
    a:[0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.10,0.30,0.90,0.70,0.10]},
  BNTr:{name:"Brown trout (lake-run)",short:"BNT-run",mode:"run",color:C.amber,
    a:[0.15,0.15,0.20,0.25,0.15,0.05,0.05,0.10,0.40,0.90,0.80,0.30]},
  BNT:{name:"Brown trout (resident)",short:"BNT",mode:"resident",color:C.amber,
    a:[0.40,0.40,0.60,0.80,0.90,0.85,0.70,0.65,0.85,0.90,0.60,0.45]},
  RBT:{name:"Rainbow trout (resident)",short:"RBT",mode:"resident",color:C.cyan,
    a:[0.30,0.30,0.55,0.80,0.85,0.75,0.60,0.55,0.80,0.85,0.55,0.35]},
  BKT:{name:"Brook trout",short:"BKT",mode:"resident",color:C.cyan,
    a:[0.10,0.10,0.10,0.70,0.95,0.90,0.75,0.70,0.85,0.15,0.10,0.10]},
  ATS:{name:"Atlantic salmon (restoration)",short:"ATS",mode:"run",color:C.cyan,
    a:[0.05,0.05,0.05,0.05,0.20,0.40,0.50,0.55,0.60,0.40,0.10,0.05]},
  LAT:{name:"Lake trout",short:"LAT",mode:"resident",color:C.cyan,
    a:[0.70,0.65,0.70,0.60,0.30,0.15,0.10,0.10,0.25,0.55,0.75,0.75]},
  SMB:{name:"Smallmouth bass",short:"SMB",mode:"resident",color:C.amber,
    a:[0.05,0.05,0.10,0.35,0.75,0.95,0.90,0.85,0.75,0.55,0.20,0.08]},
  NP:{name:"Northern pike",short:"NP",mode:"resident",color:C.cyan,
    a:[0.35,0.35,0.55,0.85,0.80,0.60,0.50,0.50,0.65,0.80,0.70,0.45]},
  WAL:{name:"Walleye",short:"WAL",mode:"resident",color:C.amber,
    a:[0.30,0.30,0.55,0.80,0.70,0.60,0.55,0.55,0.70,0.80,0.60,0.40]},
  PAN:{name:"Panfish",short:"PAN",mode:"resident",color:C.cyan,
    a:[0.15,0.15,0.30,0.60,0.85,0.95,0.90,0.85,0.75,0.55,0.30,0.18]},
};

/* ------------------------------ DATA LAYER -------------------------------- */
/* lat/lon = representative point used for the live weather query             */
const RIVERS = [
  { id:"grand-tw", river:"Grand River", section:"Tailwater — Shand Dam to West Montrose",
    region:"Grand / inland tailwater", zone:"FMZ 16", water:"Bottom-draw tailwater",
    species:["BNT","RBT"], lat:43.71, lon:-80.37,
    h:{hold:88,struct:80,spawn:70,cold:95,ox:86,gw:60}, history:90, report:80, reportAge:2, conf:88,
    note:"Cold bottom-draw release from Belwood keeps this reach trout-cold through summer. Ontario's premier resident brown-trout water and effectively a year-round fishery." },
  { id:"grand-lower", river:"Grand River", section:"Lower — Caledonia to Lake Erie (Dunnville)",
    region:"Lake Erie tributary", zone:"FMZ 16", water:"Large warm-tempered river",
    species:["STL","BNTr"], lat:43.00, lon:-79.95,
    h:{hold:80,struct:74,spawn:66,cold:40,ox:74,gw:35}, history:78, report:70, reportAge:3, conf:78,
    note:"Lake Erie steelhead push in fall and again early spring. Warms hard in summer — a cold-season fishery only." },
  { id:"credit-lower", river:"Credit River", section:"Lower — mouth to Streetsville",
    region:"Lake Ontario tributary", zone:"FMZ 16", water:"Mid-size tributary",
    species:["STL","CHN","BNTr","ATS"], lat:43.58, lon:-79.71,
    h:{hold:76,struct:72,spawn:72,cold:46,ox:76,gw:45}, history:84, report:82, reportAge:1, conf:84,
    note:"Heavy chinook run late Aug–Sep, strong spring steelhead, and an active Atlantic-salmon restoration. Lower reach warms and thins out in mid-summer." },
  { id:"credit-upper", river:"Credit River", section:"Upper — Forks of the Credit / Belfountain",
    region:"Inland cold-water", zone:"FMZ 16", water:"Forested freestone + spring input",
    species:["BKT","BNT"], lat:43.78, lon:-80.00,
    h:{hold:70,struct:80,spawn:80,cold:80,ox:86,gw:75}, history:74, report:55, reportAge:4, conf:78,
    note:"Shaded, spring-influenced headwaters holding wild brook and brown trout. A genuine summer cold-water option while the lower river sleeps." },
  { id:"ganaraska", river:"Ganaraska River", section:"Lower — Port Hope below the fishway",
    region:"Lake Ontario tributary", zone:"FMZ 17", water:"Classic steelhead tributary",
    species:["STL","CHN"], lat:43.95, lon:-78.29,
    h:{hold:80,struct:70,spawn:86,cold:50,ox:78,gw:50}, history:92, report:85, reportAge:1, conf:86,
    note:"One of Ontario's great steelhead factories — exceptional spring and late-fall runs. Migratory-driven, so out of season it goes quiet." },
  { id:"notty-main", river:"Nottawasaga River", section:"Main stem — Angus to Wasaga",
    region:"Georgian Bay tributary", zone:"FMZ 16 / mouth 14", water:"Large tributary, soft bottom",
    species:["STL","CHN"], lat:44.32, lon:-79.88,
    h:{hold:78,struct:70,spawn:72,cold:42,ox:72,gw:40}, history:86, report:78, reportAge:2, conf:82,
    note:"Big spring steelhead push and a notable fall chinook run. Lower-gradient and warm in summer." },
  { id:"notty-tribs", river:"Nottawasaga tributaries", section:"Mad / Boyne / Pine Rivers (cold tribs)",
    region:"Inland cold-water", zone:"FMZ 16", water:"Spring-fed cold creeks",
    species:["BKT","BNT"], lat:44.32, lon:-80.10,
    h:{hold:68,struct:82,spawn:84,cold:86,ox:88,gw:82}, history:76, report:48, reportAge:6, conf:74,
    note:"Spring-fed feeders that stay cold through July. Strong wild brook-trout habitat that almost never appears in public spot reports." },
  { id:"beaver-lower", river:"Beaver River", section:"Lower — Thornbury below the dam/fishway",
    region:"Georgian Bay tributary", zone:"FMZ 14", water:"Tributary with fishway",
    species:["STL","CHN"], lat:44.56, lon:-80.45,
    h:{hold:82,struct:78,spawn:76,cold:60,ox:80,gw:55}, history:85, report:72, reportAge:3, conf:80,
    note:"Famous Georgian Bay steelhead water with a concentrated run at the Thornbury fishway. Spring and fall are the windows." },
  { id:"twelve-mile", river:"Twelve Mile Creek", section:"St. Catharines / Short Hills cold reach",
    region:"Niagara / inland", zone:"FMZ 17 — check exceptions", water:"Spring-fed wild trout stream",
    species:["BKT","BNT"], lat:43.13, lon:-79.25,
    h:{hold:78,struct:82,spawn:78,cold:92,ox:88,gw:90}, history:80, report:50, reportAge:5, conf:76,
    note:"Niagara's only cold-water stream — self-sustaining wild brook trout plus naturalized brown trout. Cold, spring-fed, holds through summer. Heavily protected; special regulations and sanctuary closures apply." },
  { id:"bronte", river:"Bronte Creek", section:"Lower — Oakville to the lake",
    region:"Lake Ontario tributary", zone:"FMZ 16", water:"Small-mid tributary",
    species:["STL","CHN","BNTr"], lat:43.39, lon:-79.71,
    h:{hold:72,struct:72,spawn:74,cold:48,ox:74,gw:45}, history:78, report:74, reportAge:2, conf:80,
    note:"Reliable fall chinook and brown run plus spring steelhead. Low summer flows; cold-season fishery." },
  { id:"sixteen", river:"Sixteen Mile Creek", section:"Lower — Oakville to the lake",
    region:"Lake Ontario tributary", zone:"FMZ 16", water:"Small-mid tributary",
    species:["STL","CHN","BNTr"], lat:43.45, lon:-79.70,
    h:{hold:72,struct:70,spawn:72,cold:46,ox:72,gw:42}, history:76, report:72, reportAge:2, conf:78,
    note:"Sister system to Bronte with a similar fall salmon / spring steelhead rhythm." },
  { id:"duffins", river:"Duffins Creek", section:"Lower — Ajax / Pickering",
    region:"Lake Ontario tributary", zone:"FMZ 17", water:"Small-mid tributary",
    species:["STL","CHN","ATS"], lat:43.85, lon:-79.04,
    h:{hold:74,struct:72,spawn:76,cold:50,ox:76,gw:48}, history:80, report:76, reportAge:1, conf:80,
    note:"Strong, accessible run-fishery and an Atlantic-salmon restoration stream. Spring and fall carry it." },
  { id:"wilmot", river:"Wilmot Creek", section:"Lower — Newcastle",
    region:"Lake Ontario tributary", zone:"FMZ 17", water:"Small cold-leaning tributary",
    species:["STL","CHN","ATS","BNTr"], lat:43.91, lon:-78.59,
    h:{hold:74,struct:74,spawn:80,cold:58,ox:80,gw:60}, history:82, report:68, reportAge:3, conf:80,
    note:"Historic native Atlantic-salmon stream and a key restoration site, with quality steelhead and salmon runs. Holds cold better than most lakeshore creeks." },
  { id:"niagara-lower", river:"Niagara River", section:"Lower — Whirlpool / Devil's Hole drifts",
    region:"Niagara", zone:"FMZ 17", water:"Massive cold tailrace from Lake Erie",
    species:["STL","BNT","LAT"], lat:43.15, lon:-79.05,
    h:{hold:90,struct:86,spawn:58,cold:70,ox:90,gw:40}, history:88, report:80, reportAge:1, conf:84,
    note:"Enormous, oxygen-rich cold river holding steelhead, big browns and lake trout. Peaks late fall through spring; deep and fishable but slower in high summer." },
  { id:"saugeen-denny", river:"Saugeen River", section:"Lower — Denny's Dam to the mouth (Southampton)",
    region:"Lake Huron tributary", zone:"FMZ 13", water:"Large tributary below a dam/fishway",
    species:["STL","CHN","BNTr"], lat:44.48, lon:-81.35,
    h:{hold:84,struct:78,spawn:78,cold:52,ox:80,gw:48}, history:88, report:78, reportAge:2, conf:82,
    note:"One of Lake Huron's premier steelhead rivers. Big spring and fall runs stack below Denny's Dam and the fishway; large, deep holding pools." },
  { id:"maitland-lower", river:"Maitland River", section:"Lower — Benmiller to Goderich",
    region:"Lake Huron tributary", zone:"FMZ 13", water:"Mid-large tributary",
    species:["STL","CHN","RBT"], lat:43.72, lon:-81.65,
    h:{hold:78,struct:76,spawn:74,cold:56,ox:78,gw:52}, history:80, report:66, reportAge:4, conf:78,
    note:"Strong Lake Huron steelhead plus fall chinook and coho runs, with resident rainbow and long, deep holding water; browns are an incidental catch. Fishes best spring and fall; warms in mid-summer." },
  { id:"beaver-upper", river:"Beaver River", section:"Upper — Kimberley to below Eugenia",
    region:"Inland cold-water", zone:"FMZ 14", water:"Spring-fed valley river",
    species:["BNT","BKT","RBT"], lat:44.42, lon:-80.55,
    h:{hold:74,struct:80,spawn:80,cold:82,ox:86,gw:78}, history:76, report:52, reportAge:6, conf:76,
    note:"Cold, spring-fed upper Beaver holds wild brook and brown trout through summer — a genuine warm-season option well above the Thornbury runs." },
  { id:"boyne", river:"Boyne River", section:"Primrose / Boyne valley cold headwaters",
    region:"Inland cold-water", zone:"FMZ 16", water:"Small spring-fed brook-trout stream",
    species:["BKT","BNT"], lat:44.15, lon:-80.05,
    h:{hold:66,struct:82,spawn:84,cold:88,ox:88,gw:84}, history:72, report:44, reportAge:7, conf:72,
    note:"Tiny, cold, spring-fed Nottawasaga feeder holding wild brook trout that stays fishable through July. Rarely appears in public spot reports." },
  { id:"credit-mid", river:"Credit River", section:"Middle — Norval to Glen Williams",
    region:"Lake Ontario tributary", zone:"FMZ 16", water:"Mid-size tributary with deeper runs",
    species:["BNT","RBT","STL"], lat:43.65, lon:-79.92,
    h:{hold:76,struct:78,spawn:72,cold:62,ox:78,gw:58}, history:80, report:70, reportAge:2, conf:80,
    note:"A deeper middle stretch that holds resident browns year-round and stages migratory fish spring and fall; good pool-and-run water between the lower and upper reaches." },
  { id:"humber-lower", river:"Humber River", section:"Lower — Old Mill to the mouth (Toronto)",
    region:"Lake Ontario tributary", zone:"FMZ 16", water:"Large urban tributary",
    species:["STL","CHN","ATS"], lat:43.650, lon:-79.494,
    h:{hold:74,struct:70,spawn:74,cold:46,ox:74,gw:44}, history:82, report:78, reportAge:2, conf:80,
    note:"Toronto's own salmon-and-steelhead river — a strong fall chinook run and spring/fall steelhead, plus a small stocked Atlantic-salmon component. Warms in summer; a cold-season fishery in the lower reaches." },
  { id:"conestogo-tw", river:"Conestogo River", section:"Tailwater — below Conestogo Dam",
    region:"Grand / inland tailwater", zone:"FMZ 16", water:"Bottom-draw tailwater",
    species:["BNT","RBT"], lat:43.66, lon:-80.66,
    h:{hold:82,struct:76,spawn:66,cold:92,ox:84,gw:58}, history:80, report:58, reportAge:3, conf:82,
    note:"Cold bottom-draw release below Conestogo Dam, stocked heavily with brown trout — a Grand-system sister to the Belwood tailwater that stays trout-cold roughly 15 km downstream through summer." },
  { id:"bighead", river:"Bighead River", section:"Lower — Meaford to Georgian Bay",
    region:"Georgian Bay tributary", zone:"FMZ 14", water:"Clear limestone tributary",
    species:["STL","CHN"], lat:44.605, lon:-80.593,
    h:{hold:78,struct:74,spawn:80,cold:56,ox:80,gw:55}, history:84, report:70, reportAge:3, conf:80,
    note:"Clear limestone Georgian Bay steelhead river at Meaford with naturalized, self-sustaining runs — spring and fall lake-run rainbows plus a fall chinook push. No stocking; wild fish." },
  { id:"sydenham-os", river:"Sydenham River", section:"Lower — Owen Sound below the dam",
    region:"Georgian Bay tributary", zone:"FMZ 14", water:"Tributary with a dam/year-round reach",
    species:["STL","CHN"], lat:44.567, lon:-80.943,
    h:{hold:76,struct:72,spawn:74,cold:52,ox:78,gw:50}, history:80, report:66, reportAge:3, conf:78,
    note:"Georgian Bay river through Owen Sound with a year-round section below the dam — spring and fall steelhead and a fall chinook run, plus resident smallmouth." },
  { id:"rouge-lower", river:"Rouge River", section:"Lower — Twyn Rivers to the mouth (Toronto)",
    region:"Lake Ontario tributary", zone:"FMZ 16", water:"Mid-size urban tributary",
    species:["STL","CHN","BNTr"], lat:43.803, lon:-79.140,
    h:{hold:72,struct:70,spawn:74,cold:46,ox:74,gw:44}, history:78, report:74, reportAge:2, conf:78,
    note:"East-GTA Lake Ontario tributary with spring and fall steelhead, a strong fall chinook run, and lake-run browns. Fishes best a day or two after rain; warms and thins in high summer." },
  { id:"bowmanville", river:"Bowmanville Creek", section:"Lower — Bowmanville to the lake",
    region:"Lake Ontario tributary", zone:"FMZ 17", water:"Small-mid tributary",
    species:["STL","CHN"], lat:43.905, lon:-78.688,
    h:{hold:74,struct:72,spawn:78,cold:54,ox:78,gw:52}, history:80, report:70, reportAge:3, conf:78,
    note:"Accessible east-Durham steelhead-and-salmon creek — strong spring steelhead and a fall chinook run. Low summer flows; a cold-season fishery." },
  { id:"sauble", river:"Sauble River", section:"Sauble Falls to the mouth",
    region:"Lake Huron tributary", zone:"FMZ 13", water:"Tributary with a falls barrier",
    species:["STL","CHN"], lat:44.660, lon:-81.253,
    h:{hold:76,struct:74,spawn:80,cold:54,ox:78,gw:50}, history:82, report:72, reportAge:3, conf:80,
    note:"Lake Huron steelhead river centred on Sauble Falls — strong spring and fall lake-run rainbows and a smaller fall chinook run, with pike and bass through summer." },
];

const W = { habitat:0.25, seasonal:0.20, current:0.20, history:0.15, report:0.10, water:0.10 };

/* ============================ ENGINE (pure) ================================ */
function seasonOf(m){ if(m<=1||m===11) return "Winter"; if(m<=4) return "Spring"; if(m<=7) return "Summer"; return "Fall"; }
function habitatComposite(h){ return Math.round(0.26*h.cold+0.22*h.hold+0.16*h.struct+0.14*h.ox+0.12*h.spawn+0.10*h.gw); }
function bestSpecies(sec,m){ let best=null,val=-1; sec.species.forEach(k=>{const v=SPECIES[k].a[m]; if(v>val){val=v;best=k;}}); return {key:best,activity:val}; }
function seasonalComponent(sec,m){ return Math.round(100*bestSpecies(sec,m).activity); }

/* water-temperature model: live multi-day air mean, damped toward a
   groundwater base by the reach's cold-water retention */
function modelStreamTemp(sec, airMean){
  const cold = sec.h.cold;
  const gwBase = 8 + (1 - cold/100)*4.5;     // 8.0 (very cold) .. 12.5 (warm)
  const track  = 0.34 + 0.56*(1 - cold/100); // 0.37 .. 0.79
  const t = gwBase + track*(airMean - gwBase);
  return Math.max(2, Math.min(27, t));
}
function thermalFactor(t){
  if(t<=15) return 1.0;
  if(t<=18) return 1 - (t-15)*0.10;
  if(t<=21) return 0.70 - (t-18)*0.16;
  return Math.max(0.08, 0.22 - (t-21)*0.05);
}
function flowFit(flow,mode){
  const tb={ "Low / clear":{resident:0.85,run:0.55}, "Normal":{resident:1.00,run:0.85},
    "High / stained":{resident:0.70,run:1.00}, "Blown out":{resident:0.25,run:0.30} };
  return tb[flow][mode];
}
function freshnessFactor(days,mode){ if(mode!=="run") return 1; if(days<=1) return 0.7; if(days<=4) return 1.0; if(days<=8) return 0.8; return 0.55; }
function waterComponent(flow){ return ({ "Low / clear":68,"Normal":90,"High / stained":80,"Blown out":24 })[flow]; }
function reportComponent(sec){ return Math.round(sec.report*Math.max(0.35,1-sec.reportAge/24)); }
function confidence(sec,live){ const recency=Math.max(0.6,1-sec.reportAge/30); return Math.round(sec.conf*recency*(live?1:0.9)); }
function overallRiverScore(sec){ const hab=habitatComposite(sec.h); let peak=0; for(let m=0;m<12;m++) peak=Math.max(peak,seasonalComponent(sec,m)); return Math.round(0.60*hab+0.25*sec.history+0.15*peak); }

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const clamp100=v=>clamp(v,0,100);

function windFactor(w,g){ if(w==null) return 1; let f= w<12?1.0 : w<25?0.92 : w<40?0.70 : 0.45; if(g!=null&&g>45) f*=0.85; return clamp(f,0.4,1.0); }
function pressureFactor(p,tr){ if(tr==null) return 1; const a=Math.abs(tr); if(a<1.5) return 1.0; if(tr<0) return tr>-4?1.08:0.95; return tr<4?0.90:0.80; }
function cloudFactor(c,flow){ if(c==null) return 1; if(c>70) return 1.08; if(c<30) return flow==="Low / clear"?0.85:0.95; return 1.0; }
function feedingWindow(now,sr,ss,season){
  if(!sr||!ss){ const h=now.getHours(); if((h>=5&&h<8)||(h>=19&&h<22)) return 1.10; if(season==="Summer"&&h>=11&&h<16) return 0.80; return 0.95; }
  const t=now.getTime(), R=new Date(sr).getTime(), S=new Date(ss).getTime(), W=75*60000;
  if(Math.abs(t-R)<=W || Math.abs(t-S)<=W) return 1.12;          // dawn / dusk feeding window
  if(t<R-W || t>S+W) return 0.55;                                 // night
  const noon=(R+S)/2; if(Math.abs(t-noon)<=2*3600000) return 0.80;// midday lull
  return 0.92;
}
function confidence2(sec,cond){
  let c=confidence(sec,cond.live);
  if(cond.live && cond.wind!=null && cond.pressure!=null && cond.sunrise) c=Math.min(98,c+5);
  return c;
}

function evaluate(sec,m,cond,now){
  const habitat=habitatComposite(sec.h);
  const seasonal=seasonalComponent(sec,m);
  const bs=bestSpecies(sec,m), key=bs.key, mode=SPECIES[key].mode;
  const thermal=thermalFactor(cond.temp);
  const flow=flowFit(cond.flow,mode);
  const fresh=freshnessFactor(cond.days,mode);
  const wind=windFactor(cond.wind,cond.gust);
  const press=pressureFactor(cond.pressure,cond.pressureTrend);
  const sky=cloudFactor(cond.cloud,cond.flow);
  const feed=feedingWindow(now,cond.sunrise,cond.sunset,seasonOf(m));
  const water=clamp100(100*thermal*flow*fresh);
  const weather=clamp100(100*wind*press*sky);
  const time=clamp100(100*feed);
  const report=reportComponent(sec);
  let opp = 0.20*habitat + 0.20*seasonal + 0.22*water + 0.18*weather + 0.08*time + 0.07*sec.history + 0.05*report;
  const warmStress = cond.temp>=20;
  if(warmStress) opp*=0.5;
  opp=Math.round(clamp100(opp));
  const detail={thermal,flow,fresh,wind,press,sky,feed,mode};
  const parts={weather:Math.round(weather),water:Math.round(water),seasonal,time:Math.round(time),habitat};
  return {
    sec, cond, target:key, targetActivity:SPECIES[key].a[m],
    opportunity:opp, overall:overallRiverScore(sec), confidence:confidence2(sec,cond),
    warmStress, parts, detail,
    explanation: explainScore(opp,cond,detail,seasonal,key,feed,warmStress),
  };
}

function explainScore(opp,cond,detail,seasonal,key,feed,warmStress){
  const q = opp>=80?"Excellent conditions":opp>=65?"A good window":opp>=50?"Fair — workable":opp>=35?"Tough going":"Poor — likely off";
  const cl=[];
  cl.push(({"Low / clear":"low, clear water","Normal":"moderate flow","High / stained":"high, stained flow","Blown out":"blown-out, dirty water"})[cond.flow]||"moderate flow");
  const t=cond.temp;
  cl.push(t>=20?`warm water (${t.toFixed(0)}°C)`:t<8?`cold water (${t.toFixed(0)}°C)`:t<=18?`water in the trout band (${t.toFixed(0)}°C)`:`mild water (${t.toFixed(0)}°C)`);
  if(cond.pressureTrend!=null){ const pt=cond.pressureTrend; cl.push(Math.abs(pt)<1.5?"stable pressure":pt<0?"falling pressure":"rising pressure"); }
  if(cond.cloud!=null) cl.push(cond.cloud>70?"overcast skies":cond.cloud<30?"bright skies":"broken cloud");
  if(cond.wind!=null && cond.wind>=25) cl.push("strong wind");
  if(feed>=1.08) cl.push("an active feeding window right now");
  else if(feed<=0.85) cl.push("a midday lull");
  if(seasonal>=75) cl.push(`${SPECIES[key].name.toLowerCase()} near their peak`);
  else if(seasonal<=20) cl.push(`${SPECIES[key].name.toLowerCase()} well off-peak`);
  let s=`Score: ${opp}/100. ${q}. `+cl.slice(0,4).join(", ")+".";
  if(warmStress) s+=" Warm-water flag — consider resting the trout today.";
  return s;
}

/* ============================== LIVE LAYER ================================= */
function buildWeatherURL(){
  const lats=RIVERS.map(r=>r.lat).join(",");
  const lons=RIVERS.map(r=>r.lon).join(",");
  return `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}`
    +`&current=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,cloud_cover`
    +`&hourly=pressure_msl`
    +`&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset`
    +`&past_days=5&forecast_days=3&timezone=America%2FToronto`;
}
function deriveFlow(p48,days){ if(p48>=35) return "Blown out"; if(p48>=12) return "High / stained"; if(days>=6) return "Low / clear"; return "Normal"; }
function parseStation(st){
  const d=st.daily; if(!d||!d.time) return null;
  const cur=st.current||{};
  const times=d.time, todayStr=(cur.time||"").slice(0,10);
  let ti=times.indexOf(todayStr); if(ti<0) ti=Math.min(5,times.length-1);
  const mid=i=>((d.temperature_2m_max[i]+d.temperature_2m_min[i])/2);
  let sum=0,n=0; for(let i=Math.max(0,ti-2);i<=ti;i++){ if(d.temperature_2m_max[i]!=null){sum+=mid(i);n++;} }
  const airMean = n? sum/n : (cur.temperature_2m!=null? cur.temperature_2m : 15);
  let days=null; for(let i=ti;i>=0;i--){ if((d.precipitation_sum[i]||0)>2){ days=ti-i; break; } }
  if(days==null) days=ti+2;
  const p48=(d.precipitation_sum[ti]||0)+(ti-1>=0?(d.precipitation_sum[ti-1]||0):0);
  // pressure trend: now vs ~6h ago from hourly series
  let pressureTrend=null;
  const h=st.hourly;
  if(h&&h.time&&h.pressure_msl){
    const hk=(cur.time||"").slice(0,13);
    let hi=h.time.findIndex(x=>x.slice(0,13)===hk);
    if(hi<0) hi=h.time.length-1;
    if(hi-6>=0 && h.pressure_msl[hi]!=null && h.pressure_msl[hi-6]!=null) pressureTrend=+(h.pressure_msl[hi]-h.pressure_msl[hi-6]).toFixed(1);
  }
  const forecast=[]; for(let i=ti+1;i<=ti+2 && i<times.length;i++) forecast.push({date:times[i],max:d.temperature_2m_max[i],precip:d.precipitation_sum[i]});
  return {
    airNow: cur.temperature_2m!=null?cur.temperature_2m:airMean, code: cur.weather_code!=null?cur.weather_code:0,
    airMean, days, flow:deriveFlow(p48,days), p48, forecast,
    wind: cur.wind_speed_10m!=null?cur.wind_speed_10m:null,
    gust: cur.wind_gusts_10m!=null?cur.wind_gusts_10m:null,
    windDir: cur.wind_direction_10m!=null?cur.wind_direction_10m:null,
    pressure: cur.pressure_msl!=null?cur.pressure_msl:null, pressureTrend,
    cloud: cur.cloud_cover!=null?cur.cloud_cover:null,
    sunrise: d.sunrise?d.sunrise[ti]:null, sunset: d.sunset?d.sunset[ti]:null,
  };
}
const WX_CODE = c => c==null?"" : c===0?"Clear" : c<=3?"Cloud" : c<=48?"Fog" : c<=67?"Rain" : c<=77?"Snow" : c<=82?"Showers" : c<=99?"Storm":"";

/* ---- parking (Overpass / OpenStreetMap) + routing (OSRM), client-side ---- */
function distM(a,b,c,d){ const R=6371000,toR=x=>x*Math.PI/180; const dLa=toR(c-a),dLo=toR(d-b);
  const s=Math.sin(dLa/2)**2+Math.cos(toR(a))*Math.cos(toR(c))*Math.sin(dLo/2)**2; return R*2*Math.atan2(Math.sqrt(s),Math.sqrt(1-s)); }
function walkEst(a){ const min=Math.max(1,Math.round(a/83.3)); return {m:Math.round(a), km:+(a/1000).toFixed(2), min}; } // ~5 km/h

async function fetchParking(lat,lon){
  const key=`parking:${lat.toFixed(3)},${lon.toFixed(3)}`;
  try{ const c=await dbGet(key); if(c&&Date.now()-c.ts<7*864e5) return c.list; }catch(e){}
  const q=`[out:json][timeout:20];(node["amenity"="parking"](around:1500,${lat},${lon});way["amenity"="parking"](around:1500,${lat},${lon});node["leisure"="slipway"](around:1500,${lat},${lon}););out center 25;`;
  // Query Overpass straight from the browser. The user's IP isn't rate-limited the
  // way Render's shared server IP is (which 502s), so this is the reliable path;
  // try a couple of mirrors with a timeout.
  const directParking=async()=>{
    for(const h of ["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"]){
      try{ const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),15000);
        const r=await fetch(h,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"data="+encodeURIComponent(q),signal:ctrl.signal});
        clearTimeout(t); if(r.ok) return r.json();
      }catch(e){}
    }
    throw new Error("overpass unavailable");
  };
  try{
    let d;
    // Browser-direct first; fall back to the backend proxy only if that fails.
    try{ d = await directParking(); }
    catch(e){ if(!API_BASE) throw e; d = await proxyJSON(`/api/parking?lat=${lat}&lon=${lon}`); }
    const list=(d.elements||[]).map(e=>{
      const la=e.lat!=null?e.lat:(e.center&&e.center.lat), lo=e.lon!=null?e.lon:(e.center&&e.center.lon);
      if(la==null) return null; const tg=e.tags||{};
      const type = tg.leisure==="slipway"?"Boat launch":(tg.parking?tg.parking.replace(/_/g," "):"parking");
      return {id:""+e.type+e.id, lat:la, lon:lo, name:tg.name||null, type, fee:tg.fee||null, access:tg.access||null};
    }).filter(Boolean);
    try{ await dbSet(key,{ts:Date.now(),list}); }catch(e){}
    return list;
  }catch(e){ return null; }
}
async function osrmRoute(profile,from,to,decimals){
  const directOSRM=async()=>{ const u=`https://router.project-osrm.org/route/v1/${profile}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`; const r=await fetch(u); if(!r.ok) throw 0; return r.json(); };
  let d;
  try{ d = API_BASE ? await proxyJSON(`/api/route?profile=${profile}&from=${from.lon},${from.lat}&to=${to.lon},${to.lat}`) : await directOSRM(); }
  catch(e){ try{ d=await directOSRM(); }catch(e2){ return null; } }
  const rt=d.routes&&d.routes[0]; if(!rt) return null;
  return { coords: rt.geometry.coordinates.map(c=>[c[1],c[0]]), distKm:+(rt.distance/1000).toFixed(decimals), durMin:Math.round(rt.duration/60) };
}
async function fetchDriveRoute(from,to){ return osrmRoute("driving",from,to,1); }
async function fetchFootRoute(from,to){ return osrmRoute("foot",from,to,2); }

/* --------- dynamic spot discovery: OSM water -> curated-shaped secs -------- */
const OVERPASS_HOSTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
function sectionLabel(s){ return s.kind==="slipway"?"Boat launch":s.kind==="access"?"Fishing access":s.isTailwater?"Tailwater reach":"River reach"; }
function waterLabel(s){ return s.waterType==="lake"?"Lake / launch":s.waterType==="stream"?"Named stream":"Named river"; }
function discoveredNote(s, t){ return `Auto-discovered from OpenStreetMap${t.isTailwater?" below a dam (likely cold tailwater)":""}. Habitat and species are estimated from terrain — confirm access, regulations and seasons before fishing.`; }

async function discoverSecs(loc, radiusM){
  const key=`disco:${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}:${radiusM}`;
  try{ const c=await dbGet(key); if(c&&Date.now()-c.ts<7*864e5) return {list:c.list, wxUrl:c.wxUrl||null}; }catch(e){}
  const body="data="+encodeURIComponent(buildOverpassQuery(loc.lat,loc.lon,radiusM));
  let json;
  const directOverpass=async()=>{ const res=await fetchWithFallback(OVERPASS_HOSTS,
      {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body},{retries:1}); return res.json(); };
  try{
    json = API_BASE ? await proxyJSON(`/api/discover?lat=${loc.lat}&lon=${loc.lon}&radiusM=${radiusM}`) : await directOverpass();
  }catch(e){
    try{ json=await directOverpass(); }catch(e2){ return null; }
  }
  const spots=parseOverpassSpots(json,loc);
  const elev=await elevations(spots.map(s=>({lat:s.lat,lon:s.lon})));
  const list=spots.map((s,i)=>{
    const traits={waterType:s.waterType, elevationM:elev[i],
      nearGreatLakeKm:nearGreatLakeKm(s.lat,s.lon), isTailwater:s.isTailwater};
    const species=inferSpecies(traits);
    const h=deriveHabitat(traits);
    return { id:"auto-"+s.id, river:s.name, section:sectionLabel(s), region:"Discovered",
      zone:"Check regs", water:waterLabel(s), species, lat:s.lat, lon:s.lon, h,
      history:55, report:0, reportAge:24, conf:60, note:discoveredNote(s,traits), source:"auto" };
  });
  const wxUrl="https://api.open-meteo.com/v1/forecast?latitude="+
    list.map(s=>s.lat).join(",")+"&longitude="+list.map(s=>s.lon).join(",")+
    "&current=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl,cloud_cover"+
    "&hourly=pressure_msl&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset&past_days=5&forecast_days=3&timezone=America%2FToronto";
  try{ await dbSet(key,{ts:Date.now(),list,wxUrl}); }catch(e){}
  return { list, wxUrl };
}

/* ============================== UI HELPERS ================================= */
/* ===================== FLY & SPECIES STRATEGY ADVISOR =====================
   Pure rules engine: turns the live read (water temp, flow/clarity, season,
   target species) into techniques, a recommended fly box, and species tactics. */
function clarityOf(flow){ return ({"Blown out":"very murky","High / stained":"stained","Normal":"moderate clarity","Low / clear":"clear, low water"})[flow]||"moderate clarity"; }
function advise(ev,m){
  const t=ev.cond.temp, flow=ev.cond.flow, key=ev.target, sp=SPECIES[key];
  const run=sp.mode==="run", season=seasonOf(m), clarity=clarityOf(flow);
  const cold=t<8, cool=t>=8&&t<14, prime=t>=14&&t<=18, warm=t>18;
  const tech=[];
  if(flow==="Blown out"){ tech.push("Wait for levels to drop, or work soft edges with heavy streamers"); }
  else if(run && season!=="Summer"){
    if(flow==="High / stained") tech.push("Indicator nymphing with eggs & stoneflies","Heavy streamers on the swing");
    else tech.push("Swinging flies through runs & tailouts","Indicator nymphing the seams");
    tech.push("Float / centre-pin drifts where legal");
  } else if(cold){ tech.push("Deep nymphing with split-shot","Euro / tight-line nymphing","Slow streamers along the bottom"); }
  else if(cool){ tech.push("Euro / tight-line nymphing","Swinging wet flies","Dry-dropper on the seams"); }
  else if(prime){ tech.push("Dry fly to rising fish","Dry-dropper","Nymphing the runs","Streamers at first & last light"); }
  else { tech.push("First-light & evening only, light presentations","Work riffles & oxygenated water"); }

  const flies=[]; const add=(name,size,color,reason)=>flies.push({name,size,color,reason});
  if(run && season!=="Summer"){
    add("Egg pattern / Sucker Spawn","#10–14",flow==="Low / clear"?"pale / natural":"chartreuse / orange","Migratory fish key on eggs through the run.");
    add(flow==="Low / clear"?"Zebra Midge":"Pat's Rubber Legs",flow==="Low / clear"?"#16–18":"#6–10",flow==="Low / clear"?"black / red":"black / coffee","Anchor nymph matched to the water clarity.");
    add("Woolly Bugger / Intruder","#4–8",flow==="High / stained"?"black / white":"olive / black","Swung streamer to provoke aggressive takes.");
  } else if(cold||cool){
    add("Pheasant Tail Nymph","#14–18","natural","Everyday mayfly nymph; works in "+clarity+".");
    add(flow==="Low / clear"?"Zebra Midge":"Hare's Ear",flow==="Low / clear"?"#16–20":"#12–16",flow==="Low / clear"?"black / silver":"natural / olive","Subsurface staple sized to the water.");
    add("Woolly Bugger","#6–10",flow==="High / stained"?"black":"olive / brown","Slow streamer for cold, sluggish fish.");
  } else if(prime){
    add(season==="Summer"?"Elk Hair Caddis":"Adams","#14–16","tan / grey","Searching dry for surface-active fish.");
    add("Blue-Winged Olive","#16–20","olive / dun","On overcast, cool spells BWOs bring fish up.");
    add("Pheasant Tail dropper","#16","natural","Dropped under the dry to cover both columns.");
    if(flow!=="Low / clear") add("Muddler / sculpin","#6–8","brown","Low-light streamer for bigger browns.");
  } else {
    add("Foam hopper / attractor dry","#10–14","tan","A low-light surface option when it's hot.");
    add("Small sparse nymph","#18–20","natural","Downsize and fish stealthy in warm, clear water.");
  }
  if(clarity==="very murky"){ flies.length=Math.min(flies.length,2); add("San Juan Worm","#10","red / pink","High, dirty water — worms drift well and show up."); }

  const strat=[]; const row=(label,text)=>strat.push({label,text});
  if(["BNT","RBT","BKT"].includes(key)){
    row("Presentation depth", cold||cool?"Drift dead-on-bottom; add weight until you tick gravel.":prime?"Surface to mid-column — follow the hatch; a dry-dropper covers both.":"Keep it shallow, and only at first and last light.");
    row("Fly selection","Match the hatch in "+clarity+"; switch to attractors when nothing's rising.");
    row("Retrieve","Dead-drift nymphs and dries; strip streamers slow with pauses, a touch faster as water warms.");
  } else if(key==="STL"){
    row("Seasonal tactics", season==="Spring"?"Spawn-run fish hold below the redds — work tailouts and slots, never the redds themselves.":season==="Fall"||season==="Winter"?"Fresh and holding fish stack in deeper slots and pool tails.":"Few fish around — focus dawn and dusk on the coldest water.");
    row("Fly sizes", flow==="Low / clear"?"Downsize to #12–16 nymphs on light tippet.":"#6–12 eggs, stoneflies and buggers in stained flow.");
    row("Water conditions","Best on dropping, clearing water a day or two after a rise.");
  } else if(["CHN","COH"].includes(key)){
    row("Holding water","Deep pools, log-jam tailouts and current breaks in the lower river.");
    row("Swing patterns","Large bright streamers / spey flies swung slow through the holding lies.");
    row("Best runs","Lower-river pools on a fresh push after rain; first light is prime.");
  } else if(key==="ATS"){
    row("Approach","Light tippet, small wets and nymphs, low light — and strictly catch-and-release for restoration fish.");
    row("Water","Cool, oxygenated runs from summer into fall.");
  } else if(key==="LAT"){
    row("Approach","Deep, slow presentations — heavy streamers and jigs in the big cold water.");
    row("Timing","Cold months; fish the seams off the main current.");
  }
  let note=null;
  if(warm) note="Water's warm — if you do fish, keep them wet, land them fast and release quickly. Often the right call is to rest the trout.";
  else if(flow==="Blown out") note="Most water is unfishable until it drops — give it a day.";
  return {clarity, techniques:tech.slice(0,4), flies:flies.slice(0,4), strategy:strat, note};
}

/* ===================== HYPERLOCAL FEED (client-side) =====================
   Generates a ranked, personalized feed from live conditions + forecasts +
   scoring + the angler's saved water and location. No backend needed. */
// Turn river names into one readable phrase: single → "Credit River",
// multiple → "Credit, Nottawasaga & Grand rivers".
function joinRivers(rivers){
  if(rivers.length===1) return rivers[0];
  // Only collapse to "… rivers" when every name is a "… River"; otherwise (Creek,
  // tributaries, mixed) keep the full names to avoid "… Creek rivers".
  const allRiver=rivers.every(r=>/\bRiver$/i.test(r));
  const names=allRiver?rivers.map(r=>r.replace(/\s+River$/i,"")):rivers.slice();
  const last=names.pop();
  const joined=`${names.join(", ")} & ${last}`;
  return allRiver?`${joined} rivers`:joined;
}
function buildFeed(ranked, userLoc, savedIds, now){
  const todayStr=now.toISOString().slice(0,10);
  // 1) Collect per-reach candidates, each tagged with a grouping `kind`.
  const cands=[];
  ranked.forEach(ev=>{
    const sec=ev.sec, c=ev.cond;
    const isSaved=savedIds.includes(sec.id);
    const dist=userLoc?haversineKm(userLoc.lat,userLoc.lon,sec.lat,sec.lon):null;
    const rel = ev.opportunity/6 + (isSaved?40:0) + (dist!=null?Math.max(0,22-dist/6):0);
    const add=(kind,cat,u,extra={})=>cands.push({kind,cat,u,river:sec.river,secId:sec.id,isSaved,rel,...extra});
    if(Array.isArray(c.forecast)){
      const wet=c.forecast.find(f=>f&&f.precip>=5);
      if(wet){ const dd=(new Date(wet.date)-new Date(todayStr))/864e5;
        const when = wet.date===todayStr?"today": dd<=1.5?"tomorrow":"in a couple of days";
        add("rain-"+when,"Weather",15,{when,precip:Math.round(wet.precip)}); }
    }
    if(c.flow==="Blown out") add("blown","Water",11);
    else if(c.flow==="High / stained") add("stained","Water",8);
    else if(c.flow==="Low / clear"&&c.days>=6) add("low","Water",5,{days:c.days});
    if(ev.warmStress) add("warm","Water",13,{temp:c.temp});
    if(ev.opportunity>=78) add("prime","Window",10,{opp:ev.opportunity});
  });
  // 2) Group same-kind candidates across rivers into a single combined post.
  const groups={};
  cands.forEach(x=>{ (groups[x.kind]=groups[x.kind]||[]).push(x); });
  const items=[];
  Object.keys(groups).forEach(kind=>{
    const g=groups[kind].sort((a,b)=>b.rel-a.rel);
    const rivers=[...new Set(g.map(x=>x.river))].slice(0,4);
    const phrase=joinRivers(rivers);
    const anySaved=g.some(x=>x.isSaved);
    const top=g[0];
    const relevance=Math.max(...g.map(x=>x.rel))+top.u+(rivers.length>1?5:0);
    let cat=top.cat,title="",body="";
    if(kind.startsWith("rain-")){ const mm=Math.max(...g.map(x=>x.precip||0));
      title=`Rain ${top.when} on the ${phrase}`;
      body=`Up to ${mm} mm forecast${anySaved?", including your saved water":""} — flows will bump and colour up. Time a trip to the back of the rise.`; }
    else if(kind==="prime"){ const mo=Math.max(...g.map(x=>x.opp||0));
      title=`Prime window on the ${phrase}`;
      body=`Conditions are lining up${rivers.length>1?` across ${rivers.length} rivers`:""} — up to ${mo}/100. Fish are active; time your session to the best light.`; }
    else if(kind==="warm"){ const t=Math.max(...g.map(x=>x.temp||0));
      title=`Warm water on the ${phrase}`;
      body=`Water is pushing ${t.toFixed(0)}°C on these reaches — trout are heat-stressed. Rest them, or fish the coldest water at first light and release fast.`; }
    else if(kind==="blown"){ title=`Blown out: the ${phrase}`; body=`High, dirty water — likely unfishable until it drops and clears.`; }
    else if(kind==="stained"){ title=`High, stained flows on the ${phrase}`; body=`Good streamer and run water right now — work the soft edges and seams.`; }
    else if(kind==="low"){ const d=Math.max(...g.map(x=>x.days||0));
      title=`Low, clear water on the ${phrase}`; body=`${d}+ days since meaningful rain — downsize, lengthen the leader, and fish first and last light.`; }
    items.push({ id:"grp-"+kind, category:cat, title, body, river:rivers.join(", "), secId:top.secId, ts:now.toISOString(), relevance, saved:anySaved });
  });

  // --- Region-level cards anglers care about (independent of any one reach) ---
  const m=now.getMonth(), ts=now.toISOString();
  const listPhrase=(a)=> a.length<=1 ? (a[0]||"") : `${a.slice(0,-1).join(", ")} & ${a[a.length-1]}`;
  // What's in season now: species at/near peak activity this month.
  const peaking=[...new Set(ranked.length
    ? Object.keys(SPECIES).filter(k=>SPECIES[k].a[m]>=0.8).map(k=>SPECIES[k].name.replace(/\s*\([^)]*\)\s*$/,""))
    : [])].slice(0,3);
  if(peaking.length) items.push({ id:"season-peak", category:"Window",
    title:`In season now: ${listPhrase(peaking)}`,
    body:`${listPhrase(peaking)} ${peaking.length>1?"are":"is"} at or near peak across Southern Ontario this month — target them while the window's open.`,
    ts, relevance:9, saved:false });
  // Seasonal tactical tip.
  const tip={Spring:["Spring tactics","Runoff is prime streamer and egg time — fish are aggressive as water warms into the 40s–50s°F. Swing soft edges and target the first slower water off the main push."],
    Summer:["Beat the heat","When water pushes past ~19°C, trout stress fast. Fish spring-fed and tailwater reaches at first and last light, keep fish wet, and release quickly."],
    Fall:["Fall run is on","Chinook and then steelhead stage in the tributaries. Watch for the first cool rains to pull fresh fish in, and drift the tailouts of holding pools."],
    Winter:["Winter steelhead","Slow, deep and low — dead-drift small nymphs and beads through the softest water. A few degrees of warming midday can turn fish on."]}[seasonOf(m)];
  if(tip) items.push({ id:"season-tip", category:"Water", title:tip[0], body:tip[1], ts, relevance:6, saved:false });
  // Regulations reminder — always worth surfacing; also populates the Regs filter.
  items.push({ id:"regs-reminder", category:"Regs",
    title:"Check the season before you go",
    body:"Open seasons, size and catch limits, and sanctuary closures vary by zone and by waterbody. Confirm the current Ontario fishing regulations for your zone before fishing.",
    ts, relevance:4, saved:false });

  items.sort((a,b)=>b.relevance-a.relevance);
  return items.slice(0,18);
}

function scoreColor(v){ return v>=70?C.cyan:v>=45?C.amber:C.red; }
function scoreWord(v){ return v>=70?"Prime":v>=45?"Fair":"Slow"; }
function confLabel(v){ return v>=80?"High":v>=62?"Moderate":"Building"; }
const serif='"Playfair Display",Besley,Georgia,"Times New Roman",serif';
const sans='"Public Sans","Trade Gothic","Helvetica Neue",Helvetica,Arial,system-ui,sans-serif';
const mono=sans; // heritage brand uses clean industrial-signage sans for labels, not monospace

function HeaderCrest({size=48}){
  return (<svg width={size} height={size} viewBox="0 0 200 200" style={{flexShrink:0}} aria-hidden="true">
    <circle cx="100" cy="100" r="95" fill="#1F3A2C" stroke="#D4AF37" strokeWidth="5"/>
    <circle cx="100" cy="100" r="80" fill="none" stroke="#D4AF37" strokeWidth="2"/>
    <g fill="#F4EFE6" stroke="#D4AF37" strokeWidth="2" strokeLinejoin="round">
      <path d="M64 116 Q116 78 162 88 Q112 126 64 116 Z"/>
      <path d="M64 116 L40 100 L52 116 L40 132 Z"/>
      <path d="M104 88 L116 74 L126 92 Z"/>
    </g>
    <circle cx="150" cy="98" r="3" fill="#1F3A2C"/>
  </svg>);
}
function Gauge({value,size=72,label,stroke=7}){
  const r=(size-stroke)/2, circ=2*Math.PI*r, col=scoreColor(value);
  return (<div style={{display:"inline-flex",flexDirection:"column",alignItems:"center",gap:4}}>
    <div style={{position:"relative",width:size,height:size}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.line} strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={circ*(1-value/100)} strokeLinecap="round"
          style={{transition:"stroke-dashoffset .5s ease, stroke .4s ease"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
        fontFamily:serif,fontSize:size*0.32,fontWeight:700,color:col,fontVariantNumeric:"tabular-nums"}}>{value}</div>
    </div>
    {label&&<div style={{fontFamily:mono,fontSize:10,letterSpacing:1.2,textTransform:"uppercase",color:C.textDim}}>{label}</div>}
    {label&&<div style={{fontFamily:sans,fontSize:9,fontWeight:700,letterSpacing:0.5,color:col}}>{scoreWord(value)}</div>}
  </div>);
}
function Bar({label,value}){
  return (<div style={{display:"flex",alignItems:"center",gap:8,fontSize:11}}>
    <div style={{width:72,fontFamily:mono,fontSize:9,letterSpacing:0.8,textTransform:"uppercase",color:C.textDim,textAlign:"right"}}>{label}</div>
    <div style={{flex:1,height:6,background:C.line,borderRadius:3,overflow:"hidden"}}>
      <div style={{width:`${value}%`,height:"100%",background:scoreColor(value),borderRadius:3,transition:"width .5s ease"}}/>
    </div>
    <div style={{width:26,fontFamily:mono,fontSize:10,color:C.text,fontVariantNumeric:"tabular-nums",textAlign:"right"}}>{value}</div>
  </div>);
}
function Pill({k,dim}){
  const sp=SPECIES[k];
  return (<span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"2px 8px",borderRadius:20,
    border:`1px solid ${sp.color}55`,background:`${sp.color}14`,fontFamily:mono,fontSize:11,letterSpacing:0.5,color:dim?C.textDim:sp.color}}>
    <span style={{width:5,height:5,borderRadius:5,background:sp.color}}/>{sp.short}</span>);
}
function SeasonStrip({sec,m}){
  return (<div style={{display:"flex",gap:2,marginTop:6}}>
    {MONTHS.map((mo,i)=>{ const v=bestSpecies(sec,i).activity, here=i===m;
      return (<div key={i} style={{flex:1,textAlign:"center"}}>
        <div style={{height:18,display:"flex",alignItems:"flex-end"}}>
          <div style={{width:"100%",height:`${20+v*80}%`,background:here?C.cyan:`${C.cyanDeep}${v>0.4?"cc":"55"}`,borderRadius:1,opacity:v<0.08?0.25:1}}/>
        </div>
        <div style={{fontFamily:mono,fontSize:9,marginTop:2,color:here?C.cyan:C.textFaint}}>{mo[0]}</div>
      </div>); })}
  </div>);
}

/* ============================== MAIN APP =================================== */
/* ============================== MAP VIEW ================================== */
/* Leaflet + markercluster are loaded from CDN in index.html (window.L). The map
   is an online feature; offline it shows a graceful note and the other tabs work. */
function MapView({ranked,userLoc,m,distOf,isSaved,onToggleSave,premium=true,onUpgrade,signedIn,activity={}}){
  const elRef=useRef(null), mapRef=useRef(null), clusterRef=useRef(null), userRef=useRef(null);
  const overlayRef=useRef(null), routeRef=useRef(null), rankedRef=useRef(ranked);
  const [sel,setSel]=useState(null);
  const [tick,setTick]=useState(0);
  const [parking,setParking]=useState(undefined);   // undefined | "loading" | "error" | [ ]
  const [route,setRoute]=useState(null);             // {drive,walk}
  const [routeStatus,setRouteStatus]=useState("idle");
  const [full,setFull]=useState(false);              // full-screen map mode
  rankedRef.current=ranked;
  // Leaflet needs a size recalc when the container resizes (fullscreen toggle).
  useEffect(()=>{ const map=mapRef.current; if(!map) return; const id=setTimeout(()=>{ try{map.invalidateSize();}catch(e){} },240); return ()=>clearTimeout(id); },[full]);
  // Lock body scroll behind the fullscreen map so only the map moves.
  useEffect(()=>{ if(!full) return; const prev=document.body.style.overflow; document.body.style.overflow="hidden"; return ()=>{ document.body.style.overflow=prev; }; },[full]);
  const sig=ranked.map(e=>e.sec.id+":"+e.opportunity).join(",");
  const ev = sel? ranked.find(e=>e.sec.id===sel) : null;
  const sec = ev?ev.sec:null;

  useEffect(()=>{
    const L=window.L;
    if(mapRef.current) return;
    if(!L){ const id=setInterval(()=>{ if(window.L){clearInterval(id);setTick(t=>t+1);} },300);
      const to=setTimeout(()=>clearInterval(id),6000); return ()=>{clearInterval(id);clearTimeout(to);}; }
    const map=L.map(elRef.current,{zoomControl:true}).setView([43.9,-79.4],8);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {maxZoom:19,subdomains:"abcd",attribution:"© OpenStreetMap, © CARTO"}).addTo(map);
    // Tapping empty map (not a marker — marker clicks don't propagate) closes the
    // open location panel, so users don't have to hunt for the ✕.
    map.on("click",()=>setSel(null));
    mapRef.current=map;
    setTimeout(()=>{ try{map.invalidateSize();}catch(e){} },220);
    return ()=>{ try{map.remove();}catch(e){} mapRef.current=null; clusterRef.current=null; userRef.current=null; overlayRef.current=null; routeRef.current=null; };
  },[tick]);

  useEffect(()=>{
    const L=window.L, map=mapRef.current; if(!L||!map) return;
    if(clusterRef.current){ try{map.removeLayer(clusterRef.current);}catch(e){} }
    const grp = L.markerClusterGroup? L.markerClusterGroup({maxClusterRadius:45,showCoverageOnHover:false}) : L.layerGroup();
    const pts=[];
    rankedRef.current.forEach(e=>{
      const lat=e.sec.lat, lon=e.sec.lon; if(lat==null) return;
      const col=scoreColor(e.opportunity);
      const icon=L.divIcon({className:"",iconSize:[32,32],iconAnchor:[16,16],
        html:`<div style="width:30px;height:30px;border-radius:50%;background:${C.bone};border:2.5px solid ${col};display:flex;align-items:center;justify-content:center;font-family:${serif};font-weight:700;font-size:12.5px;color:${C.pine};box-shadow:0 1px 4px rgba(0,0,0,.35)">${e.opportunity}</div>`});
      const mk=L.marker([lat,lon],{icon}); mk.on("click",()=>{ setSel(e.sec.id); logEvent("view_reach",e.sec.id,{via:"map"}); }); grp.addLayer(mk); pts.push([lat,lon]);
    });
    map.addLayer(grp); clusterRef.current=grp;
    if(pts.length){ try{ map.fitBounds(pts,{padding:[45,45],maxZoom:10}); }catch(e){} }
  },[sig,tick]);

  useEffect(()=>{
    const L=window.L, map=mapRef.current; if(!L||!map) return;
    if(userRef.current){ try{map.removeLayer(userRef.current);}catch(e){} userRef.current=null; }
    if(userLoc) userRef.current=L.circleMarker([userLoc.lat,userLoc.lon],{radius:7,weight:3,color:C.brick,fillColor:C.brick,fillOpacity:.5}).addTo(map);
  },[userLoc,tick]);

  // fetch parking when a section is selected
  useEffect(()=>{
    setRoute(null); setRouteStatus("idle");
    if(!sec){ setParking(undefined); return; }
    let live=true; setParking("loading");
    fetchParking(sec.lat,sec.lon).then(r=>{ if(live) setParking(r===null?"error":r); });
    return ()=>{ live=false; };
  },[sel]);

  // draw access point + parking markers
  useEffect(()=>{
    const L=window.L, map=mapRef.current; if(!L||!map) return;
    if(overlayRef.current){ try{map.removeLayer(overlayRef.current);}catch(e){} overlayRef.current=null; }
    if(!sec) return;
    const g=L.layerGroup();
    const access=L.divIcon({className:"",iconSize:[30,30],iconAnchor:[15,15],
      html:`<div style="width:26px;height:26px;border-radius:50%;background:${C.brass};border:2px solid ${C.pine};display:flex;align-items:center;justify-content:center"><div style="width:8px;height:8px;background:${C.pine};transform:rotate(45deg)"></div></div>`});
    L.marker([sec.lat,sec.lon],{icon:access,zIndexOffset:500}).addTo(g);
    if(Array.isArray(parking)) parking.forEach(p=>{
      const pic=L.divIcon({className:"",iconSize:[24,24],iconAnchor:[12,12],
        html:`<div style="width:22px;height:22px;border-radius:4px;background:${C.pine};color:${C.bone};display:flex;align-items:center;justify-content:center;font-family:${serif};font-weight:700;font-size:13px;border:1px solid ${C.bone}">P</div>`});
      L.marker([p.lat,p.lon],{icon:pic}).addTo(g).bindPopup((p.name||p.type||"Parking"));
    });
    g.addTo(map); overlayRef.current=g;
  },[sel,parking,tick]);

  // draw drive + walk route
  useEffect(()=>{
    const L=window.L, map=mapRef.current; if(!L||!map) return;
    if(routeRef.current){ try{map.removeLayer(routeRef.current);}catch(e){} routeRef.current=null; }
    if(!route) return;
    const g=L.layerGroup(); const all=[];
    if(route.drive&&route.drive.coords){ L.polyline(route.drive.coords,{color:C.pine,weight:5,opacity:.85}).addTo(g); route.drive.coords.forEach(c=>all.push(c)); }
    if(route.walk){ const line=route.walk.coords?route.walk.coords:[route.walk.from,route.walk.to]; L.polyline(line,{color:C.brass,weight:4,dashArray:route.walk.trail?null:"2,8",opacity:.95}).addTo(g); line.forEach(c=>all.push(c)); }
    g.addTo(map); routeRef.current=g;
    if(all.length){ try{ map.fitBounds(all,{padding:[50,50]}); }catch(e){} }
  },[route,tick]);

  const nearestP = (Array.isArray(parking)&&parking.length&&sec) ? parking.reduce((b,p)=>{ const d=distM(sec.lat,sec.lon,p.lat,p.lon); return (!b||d<b.d)?{p,d}:b; },null) : null;
  const walk = nearestP? walkEst(nearestP.d) : null;

  const routeFromMe=()=>{
    if(!userLoc||!nearestP||!sec) return;
    setRouteStatus("loading");
    fetchDriveRoute(userLoc,nearestP.p).then(async dr=>{
      if(!dr){ setRouteStatus("error"); return; }
      const foot=await fetchFootRoute({lat:nearestP.p.lat,lon:nearestP.p.lon},{lat:sec.lat,lon:sec.lon});
      setRouteStatus("done");
      setRoute({drive:dr,
        walk: foot
          ? {from:[nearestP.p.lat,nearestP.p.lon],to:[sec.lat,sec.lon],coords:foot.coords,min:foot.durMin,km:foot.distKm,trail:true}
          : {from:[nearestP.p.lat,nearestP.p.lon],to:[sec.lat,sec.lon],...walkEst(distM(nearestP.p.lat,nearestP.p.lon,sec.lat,sec.lon)),trail:false}});
    });
  };

  const hasL = typeof window!=="undefined" && !!window.L;
  const small={fontSize:12,color:C.textDim,lineHeight:1.45,marginBottom:8};

  return (<div style={full
      ? {position:"fixed",inset:0,zIndex:2200,background:C.panel,display:"flex",flexDirection:"column"}
      : {position:"relative",marginBottom:8,zIndex:0,isolation:"isolate"}}>
    <div ref={elRef} style={full
      ? {flex:1,width:"100%",background:C.panelHi}
      : {height:"66vh",minHeight:380,width:"100%",borderRadius:12,overflow:"hidden",border:`1px solid ${C.line}`,background:C.panelHi}}/>
    {hasL && <button onClick={()=>setFull(f=>!f)} aria-label={full?"Exit full screen":"Full screen map"}
      style={{position:"absolute",top:full?"calc(10px + env(safe-area-inset-top))":10,right:10,zIndex:1400,display:"inline-flex",alignItems:"center",gap:6,padding:"8px 12px",borderRadius:9,cursor:"pointer",fontFamily:sans,fontSize:12.5,fontWeight:700,background:C.panel,border:`1px solid ${C.line}`,color:C.pine,boxShadow:"0 2px 8px rgba(0,0,0,.2)"}}>
      <Icon name={full?"close":"map"} size={15}/>{full?"Close map":"Full screen"}</button>}
    {!hasL && <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center",padding:24,fontFamily:serif,fontStyle:"italic",fontSize:15,color:C.pine}}>Loading the map — this part needs a connection.</div>}
    {!full && <div style={{fontFamily:sans,fontSize:10,color:C.textFaint,marginTop:6,textAlign:"center"}}>Marker number = today's opportunity score · tap one for the report</div>}
    {ev && (<div style={{position:"absolute",left:8,right:8,bottom:full?"calc(14px + env(safe-area-inset-bottom))":30,maxHeight:full?"72%":"66%",overflowY:"auto",background:C.panel,border:`1px solid ${C.line}`,borderRadius:12,padding:14,boxShadow:"0 8px 28px rgba(0,0,0,.28)",zIndex:1300}}>
      <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:serif,fontSize:18,fontWeight:700,color:C.pine}}>{ev.sec.river}</div>
          <div style={{fontSize:12,color:C.textDim}}>{ev.sec.section}{distOf(ev.sec)!=null?` · ${distOf(ev.sec)} km away`:""}</div>
          <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap",alignItems:"center"}}><Pill k={ev.target}/>{onToggleSave&&<SaveButton saved={isSaved(ev.sec.id)} onClick={()=>onToggleSave(ev.sec)}/>}</div>
        </div>
        <Gauge value={ev.opportunity} size={58} stroke={6} label="Opp."/>
        <button onClick={()=>setSel(null)} aria-label="Close" style={{background:"none",border:"none",cursor:"pointer",color:C.textDim,padding:2,display:"flex"}}><Icon name="close" size={19}/></button>
      </div>
      <p style={{fontSize:12.5,color:C.text,lineHeight:1.5,margin:"10px 0 0"}}>{ev.explanation}</p>
      <ConditionsStrip cond={ev.cond}/>
      <MeasuredGauge lat={ev.sec.lat} lon={ev.sec.lon}/>
      <DepthFish sec={ev.sec} logged={activity[ev.sec.id]}/>
      <CatchForm sec={ev.sec} signedIn={signedIn}/>
      <div style={{marginTop:12,paddingTop:10,borderTop:`2px dotted ${C.line}`}}>
        <AdvHead t="Parking & route"/>
        <Locked premium={premium} onUpgrade={onUpgrade} label="Upgrade for parking & routes">
        {parking==="loading" && <div style={small}>Looking for parking nearby…</div>}
        {parking==="error" && <div style={small}>Couldn't load parking just now — try again shortly.</div>}
        {Array.isArray(parking)&&parking.length===0 && <div style={small}>No mapped parking within 1.5 km. Check access at the spot itself.</div>}
        {Array.isArray(parking)&&parking.length>0 && (<>
          <div style={small}>{parking.length} parking option{parking.length>1?"s":""} nearby. Nearest: <b style={{color:C.text}}>{nearestP.p.name||nearestP.p.type}</b> — about <b style={{color:C.text}}>{walk.min} min walk</b> ({walk.km} km) to the water.</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:6}}>
            {userLoc && <button onClick={routeFromMe} style={{...btnBig,borderColor:C.brick,color:C.brick,fontSize:12.5,padding:"8px 12px"}}><Icon name="drive" size={15}/>{routeStatus==="loading"?"Plotting…":"Route from me"}</button>}
            <a href={directionsUrl(nearestP.p.lat,nearestP.p.lon)} target="_blank" rel="noopener noreferrer" style={{...btnBig,borderColor:C.pine,color:C.pine,textDecoration:"none",fontSize:12.5,padding:"8px 12px"}}><Icon name="map" size={15}/>Directions</a>
            <a href={gmapsPin(sec.lat,sec.lon)} target="_blank" rel="noopener noreferrer" style={{...btnBig,borderColor:C.line,color:C.textDim,textDecoration:"none",fontSize:12.5,padding:"8px 12px"}}><Icon name="pin" size={15}/>Access</a>
          </div>
          {!userLoc && <div style={{...small,marginTop:8}}>Use your location (Rivers tab) to plot a route from where you are.</div>}
          {routeStatus==="error" && <div style={{...small,marginTop:8}}>Couldn't plot a driving route just now.</div>}
          {route && (<div style={{marginTop:10,borderTop:`1px dotted ${C.line}`}}>
            <div style={{display:"flex",gap:11,alignItems:"flex-start",padding:"11px 0",borderBottom:`1px dotted ${C.line}`}}>
              <div style={{width:32,height:32,borderRadius:9,background:C.panelHi,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:C.pine}}><Icon name="drive" size={17}/></div>
              <div><div style={{fontSize:13.5,fontWeight:700,color:C.text}}>Drive {route.drive.durMin} min · {route.drive.distKm} km</div><div style={{fontSize:12,color:C.textDim,marginTop:2}}>To the nearest parking</div></div>
            </div>
            <div style={{display:"flex",gap:11,alignItems:"flex-start",padding:"11px 0"}}>
              <div style={{width:32,height:32,borderRadius:9,background:C.panelHi,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:C.pine}}><Icon name="walk" size={17}/></div>
              <div><div style={{fontSize:13.5,fontWeight:700,color:C.text}}>{route.walk.trail?"Walk the trail":"Walk"} ~{route.walk.min} min · {route.walk.km} km</div><div style={{fontSize:12,color:C.textDim,marginTop:2}}>To the water</div></div>
              <div style={{flex:1}}/>
              <button onClick={()=>setRoute(null)} style={{background:"none",border:"none",color:C.brick,cursor:"pointer",fontSize:12,textDecoration:"underline",padding:0,alignSelf:"center"}}>clear</button>
            </div>
          </div>)}
        </>)}
        </Locked>
        <div style={{fontFamily:sans,fontSize:9.5,color:C.textFaint,marginTop:8,lineHeight:1.4}}>Parking from OpenStreetMap · driving via OSRM · the walk is a straight-line estimate. Confirm access and legality on site.</div>
      </div>
      <Advisor ev={ev} m={m} premium={premium} onUpgrade={onUpgrade}/>
    </div>)}
  </div>);
}

function SavedView({saved,visits,ranked,m,onUnsave,onLog,onRemoveVisit,goMap}){
  const [logFor,setLogFor]=useState(null); // section id being logged
  const [species,setSpecies]=useState(""), [flies,setFlies]=useState(""), [notes,setNotes]=useState("");
  const evOf=id=>ranked.find(e=>e.sec.id===id);
  const submit=(s)=>{
    const ev=evOf(s.id);
    onLog({ secId:s.id, river:s.label, section:s.section, date:new Date().toISOString(),
      opp:ev?ev.opportunity:null, target:ev?ev.target:null, flow:ev?ev.cond.flow:null, temp:ev?+ev.cond.temp.toFixed(0):null,
      species:species.trim(), flies:flies.trim(), notes:notes.trim() });
    setLogFor(null); setSpecies(""); setFlies(""); setNotes("");
  };
  const inp={width:"100%",padding:"8px 10px",borderRadius:6,border:`1px solid ${C.line}`,background:C.bone,color:C.text,fontFamily:sans,fontSize:13,marginTop:6};
  return (<div>
    <SectionTitle t="Saved Water"/>
    {saved.length===0 ? (
      <div style={{background:C.panel,border:`1px solid ${C.lineSoft}`,borderRadius:10,padding:16,fontSize:13,color:C.textDim,lineHeight:1.5}}>
        Your tackle box is empty. Tap <b style={{color:C.pine}}>☆ Save</b> on any river — in the Report or on the Map — and it'll wait for you here. <button onClick={goMap} style={{background:"none",border:"none",color:C.brick,cursor:"pointer",textDecoration:"underline",fontSize:13,padding:0}}>Open the map</button>
      </div>
    ) : saved.map(s=>{ const ev=evOf(s.id); return (
      <div key={s.id} style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:10,padding:14,marginBottom:8}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:serif,fontSize:16,fontWeight:700,color:C.pine}}>{s.label}</div>
            <div style={{fontSize:11.5,color:C.textDim}}>{s.section}</div>
          </div>
          {ev && <div style={{fontFamily:serif,fontSize:20,fontWeight:700,color:scoreColor(ev.opportunity)}}>{ev.opportunity}</div>}
        </div>
        <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
          <button onClick={()=>setLogFor(logFor===s.id?null:s.id)} style={{...btn,borderColor:C.brass,color:C.pine}}>＋ Log a visit</button>
          <button onClick={()=>onUnsave({id:s.id,river:s.label,section:s.section,lat:s.lat,lon:s.lon})} style={{...btn,borderColor:C.line,color:C.textDim}}>Remove</button>
        </div>
        {logFor===s.id && (<div style={{marginTop:12,paddingTop:10,borderTop:`2px dotted ${C.line}`}}>
          {ev && <div style={{fontSize:11,color:C.textFaint,marginBottom:4}}>Conditions today auto-saved: {ev.cond.temp.toFixed(0)}°C · {ev.cond.flow} · opp {ev.opportunity}</div>}
          <input style={inp} placeholder="Species caught (e.g. 2 browns)" value={species} onChange={e=>setSpecies(e.target.value)}/>
          <input style={inp} placeholder="Flies that worked" value={flies} onChange={e=>setFlies(e.target.value)}/>
          <input style={inp} placeholder="Notes" value={notes} onChange={e=>setNotes(e.target.value)}/>
          <button onClick={()=>submit(s)} style={{...btn,marginTop:10,borderColor:C.brick,background:C.brick,color:C.bone}}>Save to logbook</button>
        </div>)}
      </div>); })}

    <div style={{height:18}}/>
    <SectionTitle t="The Logbook"/>
    {visits.length===0 ? (
      <div style={{fontSize:13,color:C.textDim,lineHeight:1.5}}>No entries yet. Log a visit above and it'll keep the date, conditions, fish and flies — your own record, stored on this phone.</div>
    ) : visits.map(v=>(
      <div key={v.id} style={{background:C.panel,border:`1px solid ${C.lineSoft}`,borderRadius:10,padding:"11px 13px",marginBottom:8}}>
        <div style={{display:"flex",alignItems:"baseline",gap:8}}>
          <span style={{fontFamily:serif,fontSize:14.5,fontWeight:700,color:C.pine,flex:1,minWidth:0}}>{v.river} <span style={{color:C.textDim,fontWeight:400,fontSize:12}}>· {v.section}</span></span>
          <span style={{fontFamily:sans,fontSize:11,color:C.textFaint}}>{new Date(v.date).toLocaleDateString([], {month:"short",day:"numeric",year:"numeric"})}</span>
        </div>
        <div style={{fontSize:11.5,color:C.textFaint,marginTop:2}}>{v.temp!=null?`${v.temp}°C · `:""}{v.flow||""}{v.opp!=null?` · opp ${v.opp}`:""}</div>
        {v.species && <div style={{fontSize:12.5,color:C.text,marginTop:5}}><b style={{color:C.brickDeep}}>Caught:</b> {v.species}</div>}
        {v.flies && <div style={{fontSize:12.5,color:C.text,marginTop:2}}><b style={{color:C.brickDeep}}>Flies:</b> {v.flies}</div>}
        {v.notes && <div style={{fontSize:12.5,color:C.textDim,marginTop:2,lineHeight:1.45}}>{v.notes}</div>}
        <button onClick={()=>onRemoveVisit(v.id)} style={{background:"none",border:"none",color:C.textFaint,cursor:"pointer",fontSize:11,textDecoration:"underline",padding:0,marginTop:6}}>delete</button>
      </div>
    ))}
  </div>);
}

function catColor(cat){ return /weather/i.test(cat)?C.pine : /water/i.test(cat)?C.amberDeep : /window/i.test(cat)?C.brick : /regulat|regs|closure|licen/i.test(cat)?C.brick : C.pine; }
function FeedCard({it}){
  const col=catColor(it.category);
  const handle=it.external?(it.source||"Reports"):"Muddy York";
  return (<div style={{background:C.panel,border:`1px solid ${C.lineSoft}`,borderRadius:14,padding:15,marginBottom:12,boxShadow:"0 2px 8px rgba(30,40,30,.05)"}}>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
      <div style={{width:38,height:38,borderRadius:"50%",overflow:"hidden",flexShrink:0,border:`1px solid ${C.line}`}}><Crest size={38}/></div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontFamily:sans,fontSize:13.5,fontWeight:700,color:C.pine}}>{handle}</div>
        <div style={{fontFamily:sans,fontSize:11,color:C.textFaint}}>{it.category}{it.ts?` · ${new Date(it.ts).toLocaleDateString([], {month:"short",day:"numeric"})}`:""}</div>
      </div>
      <span style={{fontFamily:sans,fontSize:9,letterSpacing:1,textTransform:"uppercase",fontWeight:800,color:col,border:`1px solid ${col}44`,borderRadius:5,padding:"2px 7px"}}>{it.category}</span>
    </div>
    <div style={{fontFamily:serif,fontSize:16,fontWeight:700,color:C.pine,lineHeight:1.3}}>{it.title}</div>
    {it.body && <div style={{fontSize:13.5,color:C.text,lineHeight:1.55,marginTop:6}}>{it.body}</div>}
    {it.url && <a href={it.url} target="_blank" rel="noopener noreferrer" style={{fontFamily:sans,fontSize:12,fontWeight:600,color:C.brick,marginTop:8,display:"inline-block"}}>Read more</a>}
    <div style={{display:"flex",gap:20,alignItems:"center",marginTop:12,paddingTop:11,borderTop:`1px solid ${C.lineSoft}`,color:C.textDim}}>
      <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12.5,fontWeight:600}}><Icon name="like" size={17}/>Like</span>
      <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12.5,fontWeight:600}}><Icon name="comment" size={17}/>Comment</span>
    </div>
  </div>);
}
function PostCard({p,me,onToggleLike,onDelete,onReport,onBlock,onCommentDelta,onSetName,onSignIn,onOpenProfile}){
  const signedIn=!!(me&&me.user);
  const admin=!!(me&&me.isAdmin);
  const [menu,setMenu]=useState(false);
  const [open,setOpen]=useState(false); // comments panel
  const when=new Date(p.createdAt).toLocaleDateString([], {month:"short",day:"numeric"});
  const like=()=>{ if(!signedIn) return onSignIn&&onSignIn(); onToggleLike(p.id,p.likedByMe); };
  const report=()=>{ setMenu(false); if(!signedIn) return onSignIn&&onSignIn(); if(confirm("Report this post to the moderators?")) onReport(p.id); };
  const block=()=>{ setMenu(false); if(!signedIn) return onSignIn&&onSignIn(); if(confirm(`Block ${p.author.displayName}? You'll no longer see each other's posts or comments.`)) onBlock(p.authorId); };
  const del=()=>{ setMenu(false); if(confirm("Delete this post?")) onDelete(p.id); };
  const modRemove=()=>{ setMenu(false); if(confirm("Remove this post as moderator?")) onDelete(p.id); };
  const menuItem={display:"block",width:"100%",textAlign:"left",padding:"9px 13px",background:"none",border:"none",cursor:"pointer",fontFamily:sans,fontSize:13};
  return (<div style={{background:C.panel,border:`1px solid ${C.lineSoft}`,borderRadius:14,padding:15,marginBottom:12,boxShadow:"0 2px 8px rgba(30,40,30,.05)"}}>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
      <button onClick={()=>onOpenProfile&&onOpenProfile(p.authorId)} style={{background:"none",border:"none",padding:0,cursor:onOpenProfile?"pointer":"default",display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0,textAlign:"left"}}>
        <Avatar src={p.author.avatarUrl} size={38}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:sans,fontSize:13.5,fontWeight:700,color:C.pine}}>{p.author.displayName}</div>
          <div style={{fontFamily:sans,fontSize:11,color:C.textFaint}}>{p.river?`${p.river} · `:""}{when}</div>
        </div>
      </button>
      <div style={{position:"relative"}}>
        <button onClick={()=>setMenu(m=>!m)} aria-label="More" style={{background:"none",border:"none",cursor:"pointer",color:C.textFaint,padding:4,fontSize:18,lineHeight:1}}>⋯</button>
        {menu && <div style={{position:"absolute",right:0,top:26,background:"#fff",border:`1px solid ${C.line}`,borderRadius:9,boxShadow:"0 6px 20px rgba(0,0,0,.18)",zIndex:50,overflow:"hidden",minWidth:150}}>
          {p.mine
            ? <button onClick={del} style={{...menuItem,color:C.brick}}>Delete</button>
            : (<>
                <button onClick={report} style={{...menuItem,color:C.textDim}}>Report</button>
                <button onClick={block} style={{...menuItem,color:C.textDim}}>Block angler</button>
                {admin && <button onClick={modRemove} style={{...menuItem,color:C.brick,borderTop:`1px solid ${C.lineSoft}`}}>Remove (admin)</button>}
              </>)}
        </div>}
      </div>
    </div>
    {p.body && <div style={{fontSize:14,color:C.text,lineHeight:1.55,whiteSpace:"pre-wrap"}}>{p.body}</div>}
    {p.photoUrl && <div style={{marginTop:10,borderRadius:11,overflow:"hidden",border:`1px solid ${C.lineSoft}`,background:C.bone}}>
      <img src={p.photoUrl} alt="" loading="lazy" style={{display:"block",width:"100%",height:"auto"}}
        {...(p.photoW&&p.photoH?{width:p.photoW,height:p.photoH}:{})}/></div>}
    <div style={{display:"flex",gap:18,alignItems:"center",marginTop:12,paddingTop:11,borderTop:`1px solid ${C.lineSoft}`,color:C.textDim}}>
      <button onClick={like} style={{display:"inline-flex",alignItems:"center",gap:6,fontFamily:sans,fontSize:12.5,fontWeight:700,background:"none",border:"none",cursor:"pointer",color:p.likedByMe?C.brick:C.textDim,padding:0}}>
        <Icon name="like" size={17}/>{p.likeCount>0?p.likeCount:""} {p.likedByMe?"Liked":"Like"}</button>
      <button onClick={()=>setOpen(o=>!o)} style={{display:"inline-flex",alignItems:"center",gap:6,fontFamily:sans,fontSize:12.5,fontWeight:700,background:"none",border:"none",cursor:"pointer",color:C.textDim,padding:0}}>
        <Icon name="comment" size={17}/>{p.commentCount>0?p.commentCount:""} Comment{p.commentCount===1?"":"s"}</button>
    </div>
    {open && <CommentsPanel postId={p.id} me={me} admin={admin} onCommentDelta={onCommentDelta} onSetName={onSetName} onSignIn={onSignIn}/>}
  </div>);
}
function CommentsPanel({postId,me,admin,onCommentDelta,onSetName,onSignIn}){
  const signedIn=!!(me&&me.user);
  const [list,setList]=useState(null);
  const [text,setText]=useState(""),[name,setName]=useState(""),[busy,setBusy]=useState(false),[err,setErr]=useState("");
  const needsName=signedIn&&!me.user.displayName;
  useEffect(()=>{ let live=true; proxyJSON(`/posts/${encodeURIComponent(postId)}/comments`).then(d=>{ if(live) setList(d.comments||[]); }).catch(()=>{ if(live) setList([]); }); return ()=>{live=false;}; },[postId]);
  const inp={width:"100%",padding:"8px 11px",borderRadius:7,border:`1px solid ${C.line}`,background:C.bone,color:C.text,fontFamily:sans,fontSize:13};
  const submit=async()=>{ setErr(""); if(!signedIn) return onSignIn&&onSignIn();
    if(needsName&&!name.trim()){ setErr("Pick a display name first."); return; }
    if(!text.trim()) return; setBusy(true);
    try{ if(needsName) await onSetName(name.trim());
      const { comment }=await proxyJSON(`/posts/${encodeURIComponent(postId)}/comments`,{method:"POST",body:{body:text.trim()}});
      setList(prev=>[...(prev||[]),comment]); setText(""); onCommentDelta&&onCommentDelta(postId,1);
    }catch{ setErr("Couldn't post your comment — try again."); } finally{ setBusy(false); } };
  const del=async(id)=>{ setList(prev=>prev.filter(c=>c.id!==id)); onCommentDelta&&onCommentDelta(postId,-1);
    try{ await proxyJSON(`/comments/${encodeURIComponent(id)}`,{method:"DELETE"}); }catch{} };
  return (<div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.lineSoft}`}}>
    {list===null ? <div style={{fontSize:12.5,color:C.textFaint}}>Loading comments…</div>
      : list.length===0 ? <div style={{fontSize:12.5,color:C.textFaint,marginBottom:10}}>No comments yet. Be the first.</div>
      : <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:10}}>
          {list.map(c=>(<div key={c.id} style={{display:"flex",gap:8,alignItems:"baseline"}}>
            <span style={{fontFamily:sans,fontSize:12.5,fontWeight:700,color:C.pine,flexShrink:0}}>{c.author.displayName}</span>
            <span style={{fontSize:13,color:C.text,lineHeight:1.5,flex:1,minWidth:0,whiteSpace:"pre-wrap"}}>{c.body}</span>
            {(c.mine||admin) && <button onClick={()=>del(c.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.textFaint,fontSize:11,textDecoration:"underline",flexShrink:0}}>delete</button>}
          </div>))}
        </div>}
    {signedIn ? (<div>
      {needsName && <input style={{...inp,marginBottom:6}} placeholder="Choose a display name" value={name} maxLength={40} onChange={e=>setName(e.target.value)}/>}
      {err && <div style={{fontSize:11.5,color:C.brick,marginBottom:6}}>{err}</div>}
      <div style={{display:"flex",gap:8}}>
        <input style={inp} placeholder="Add a comment…" value={text} maxLength={1000} onChange={e=>setText(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); submit(); } }}/>
        <button disabled={busy} onClick={submit} style={{...btnBig,padding:"8px 13px",opacity:busy?0.6:1}}>Post</button>
      </div>
    </div>) : <button onClick={onSignIn} style={{...btn,borderColor:C.line,color:C.pine}}>Sign in to comment</button>}
  </div>);
}
function Composer({me,onCreatePost,onSetName,onSignIn}){
  const signedIn=!!(me&&me.user);
  const [name,setName]=useState("");
  const [body,setBody]=useState(""),[river,setRiver]=useState("");
  const [photo,setPhoto]=useState(null); // {file,preview,w,h}
  const [busy,setBusy]=useState(false),[err,setErr]=useState(""),[phDisabled,setPhDisabled]=useState(false);
  const fileRef=useRef(null);
  const rivers=useMemo(()=>[...new Set(RIVERS.map(r=>r.river))].sort(),[]);
  const inp={width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${C.line}`,background:C.bone,color:C.text,fontFamily:sans,fontSize:14};
  if(!signedIn) return (<div style={{display:"flex",alignItems:"center",gap:10,background:C.panel,border:`1px solid ${C.line}`,borderRadius:14,padding:12,marginBottom:14}}>
    <div style={{width:38,height:38,borderRadius:"50%",overflow:"hidden",border:`1px solid ${C.line}`,flexShrink:0}}><Crest size={38}/></div>
    <div style={{flex:1,fontSize:13.5,color:C.textDim}}>Sign in to share a catch, a technique, or a report.</div>
    <button onClick={onSignIn} style={{...btn,borderColor:C.brick,background:C.brick,color:C.bone}}>Sign in</button>
  </div>);
  const needsName=!me.user.displayName;
  const pickPhoto=e=>{ const f=e.target.files&&e.target.files[0]; if(!f) return; setErr("");
    const img=new Image(); const url=URL.createObjectURL(f);
    img.onload=()=>setPhoto({file:f,preview:url,w:img.naturalWidth,h:img.naturalHeight});
    img.onerror=()=>setErr("That image couldn't be read."); img.src=url; };
  const uploadPhoto=()=>cloudinaryUpload(photo.file).catch(e=>{ if(/configured|4\d\d/i.test(e.message||"")) setPhDisabled(true); throw e; });
  const submit=async()=>{ setErr("");
    if(needsName && !name.trim()){ setErr("Pick a display name first."); return; }
    if(!body.trim() && !photo){ setErr("Write something or add a photo."); return; }
    setBusy(true);
    try{ if(needsName) await onSetName(name.trim());
      let ph=null; if(photo) ph=await uploadPhoto();
      await onCreatePost({ body:body.trim(), river:river||null, photo:ph });
      setBody(""); setRiver(""); if(photo){ URL.revokeObjectURL(photo.preview); setPhoto(null); }
    }catch(e){ setErr(e.message||"Couldn't post — try again."); }
    finally{ setBusy(false); } };
  return (<div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:14,padding:14,marginBottom:16}}>
    {needsName && <input style={{...inp,marginBottom:8}} placeholder="Choose a display name (public)" value={name} onChange={e=>setName(e.target.value)} maxLength={40}/>}
    <textarea style={{...inp,minHeight:64,resize:"vertical"}} placeholder="Share a catch, a technique, a report…" value={body} onChange={e=>setBody(e.target.value)} maxLength={2000}/>
    {photo && <div style={{position:"relative",marginTop:10}}>
      <img src={photo.preview} alt="" style={{display:"block",width:"100%",height:"auto",borderRadius:10,border:`1px solid ${C.lineSoft}`}}/>
      <button onClick={()=>{ URL.revokeObjectURL(photo.preview); setPhoto(null); }} aria-label="Remove photo" style={{position:"absolute",top:8,right:8,background:"rgba(0,0,0,.6)",color:"#fff",border:"none",borderRadius:"50%",width:28,height:28,cursor:"pointer",fontSize:15}}>×</button>
    </div>}
    <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} style={{display:"none"}}/>
    {err && <div style={{fontSize:12,color:C.brick,marginTop:9,lineHeight:1.4}}>{err}</div>}
    <div style={{display:"flex",gap:8,marginTop:11,flexWrap:"wrap",alignItems:"center"}}>
      <select value={river} onChange={e=>setRiver(e.target.value)} style={{...inp,width:"auto",padding:"8px 10px",fontSize:13}}>
        <option value="">Tag a river (optional)</option>
        {rivers.map(r=><option key={r} value={r}>{r}</option>)}
      </select>
      {!phDisabled && <button onClick={()=>fileRef.current&&fileRef.current.click()} style={{...btnBig,padding:"8px 12px"}}><Icon name="pin" size={15}/>{photo?"Change photo":"Photo"}</button>}
    </div>
    <div style={{marginTop:10}}>
      <button disabled={busy} onClick={submit} style={{...btnBig,background:C.pine,color:C.headText,borderColor:C.pine,opacity:busy?0.6:1}}><Icon name="plus" size={15}/>{busy?"Posting…":"Post"}</button>
    </div>
    <div style={{fontSize:11,color:C.textFaint,marginTop:9,lineHeight:1.5}}>Posts are public. Your exact GPS is never shared — tag a river if you want to add context.</div>
  </div>);
}
function NewsView({derived, stockNews=[], flowNews=[], newsUrl, onSaveUrl, personalized, me, posts=[], postsCursor, onLoadMore, onCreatePost, onDeletePost, onToggleLike, onReport, onBlock, onCommentDelta, onSetName, onSignIn, onOpenProfile}){
  const [cat,setCat]=useState("All");
  const [url,setUrl]=useState(newsUrl||"");
  const [ext,setExt]=useState(null);
  const [extStatus,setExtStatus]=useState(newsUrl?"loading":"none");
  const [showCfg,setShowCfg]=useState(false);
  useEffect(()=>{
    if(!newsUrl){ setExtStatus("none"); setExt(null); return; }
    let live=true; setExtStatus("loading");
    fetch(newsUrl).then(r=>r.ok?r.json():Promise.reject()).then(d=>{ if(!live) return;
      const arr=Array.isArray(d)?d:(d.items||[]);
      setExt(arr.map((x,i)=>({id:"ext"+i,category:x.category||"Reports",title:x.title||"",body:x.summary||x.body||"",
        source:x.source||"",url:x.url||x.link||"",ts:x.published||x.date||"",relevance:60-i,external:true})));
      setExtStatus("ok");
    }).catch(()=>{ if(live){ setExt(null); setExtStatus("error"); } });
    return ()=>{ live=false; };
  },[newsUrl]);

  // Real, official stocking events as "Reports" news.
  const stockItems=(stockNews||[]).map((s,i)=>({
    id:s.id||"stock"+i, category:"Reports",
    title:`Stocking: ${s.species} in ${s.water}`,
    body:`${s.count?s.count.toLocaleString()+" ":""}${s.species.toLowerCase()} stocked in ${s.water}${s.year?` (${s.year})`:""}. Fresh fish can mean fast action in the weeks after — mind local regulations.`,
    relevance:20-i, external:true, source:"Ontario stocking data"}));
  // Live flow-trend from official Water Survey of Canada gauges.
  const titleCase=s=>String(s).toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
  const flowItems=(flowNews||[]).map((fl,i)=>{ const rising=fl.pct>0;
    return { id:"flow-"+fl.river.replace(/\s+/g,"_"), category:"Water",
      title:`Flow ${rising?"rising":"dropping"} on the ${fl.river}`,
      body:`The ${titleCase(fl.station)} gauge is ${rising?"up":"down"} ${Math.abs(fl.pct)}% over the last day (now ~${fl.discharge} m³/s). ${rising?"Expect higher, coloured water — fish the softer edges and seams.":"Dropping and clearing — it should be coming into shape."}`,
      relevance:24-i, external:true, source:"Water Survey of Canada" }; });
  const derivedAll=[...(ext||[]),...flowItems,...stockItems,...derived].sort((a,b)=>(b.relevance||0)-(a.relevance||0));
  // Real user posts (newest-first, real timestamps) sit above the auto-intel feed.
  // De-dupe defensively so no repeated news slips through (posts by id, derived
  // items by normalized title).
  const seenFeed=new Set();
  const all=mergeFeed(posts,derivedAll).filter(it=>{
    const key=it.kind==="post"?("p:"+it.id):("d:"+String(it.title||"").toLowerCase().trim());
    if(seenFeed.has(key)) return false; seenFeed.add(key); return true;
  });
  const signedIn=!!(me&&me.user);
  const cats=signedIn?["All","Following","Posts","Weather","Water","Window"]:["All","Posts","Weather","Water","Window"];
  const match=it=>{ if(cat==="All") return true;
    if(cat==="Posts") return it.kind==="post";
    return it.kind!=="post"&&it.category===cat; };
  const shown=all.filter(match);
  // "Following" pulls a separate followed-only feed on demand.
  const [followFeed,setFollowFeed]=useState(null);
  useEffect(()=>{ if(cat!=="Following"||!signedIn){ return; } let live=true; setFollowFeed(null);
    proxyJSON("/posts?following=1").then(d=>{ if(live) setFollowFeed(d.posts||[]); }).catch(()=>{ if(live) setFollowFeed([]); });
    return ()=>{live=false;}; },[cat,signedIn]);
  const inp={width:"100%",padding:"9px 11px",borderRadius:6,border:`1px solid ${C.line}`,background:C.bone,color:C.text,fontFamily:sans,fontSize:12.5};
  const postProps={me,onToggleLike,onDelete:onDeletePost,onReport,onBlock,onCommentDelta,onSetName,onSignIn,onOpenProfile};

  return (<div>
    <SectionTitle t="The Feed"/>
    <Composer me={me} onCreatePost={onCreatePost} onSetName={onSetName} onSignIn={onSignIn}/>
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
      {cats.map(x=><span key={x} className={"seg"+(cat===x?" on":"")} onClick={()=>setCat(x)}>{x}</span>)}
    </div>
    {cat==="Following"
      ? (followFeed===null ? <div style={{fontSize:13,color:C.textFaint,marginBottom:12}}>Loading…</div>
         : followFeed.length===0 ? <div style={{fontSize:13,color:C.textDim,lineHeight:1.5,marginBottom:12}}>You're not following anyone yet, or they haven't posted. Tap an angler's name to view their profile and follow them.</div>
         : followFeed.map(p=><PostCard key={p.id} p={p} {...postProps}/>))
      : shown.length===0
        ? <div style={{fontSize:13,color:C.textDim,lineHeight:1.5,marginBottom:12}}>Nothing in this category right now. Conditions are quiet — try “All”.</div>
        : shown.map(it=> it.kind==="post"
            ? <PostCard key={it.id} p={it} {...postProps}/>
            : <FeedCard key={it.id} it={it}/>)}
    {cat!=="Following" && postsCursor && <button onClick={onLoadMore} style={{...btn,borderColor:C.line,color:C.pine,width:"100%",padding:"10px",marginBottom:14}}>Load more posts</button>}
  </div>);
}

export default function App(){
  const [now,setNow]=useState(new Date());
  const [wx,setWx]=useState({});                 // id -> parsed station
  const [status,setStatus]=useState("loading");  // loading | live | fallback
  const [updated,setUpdated]=useState(null);
  const [manual,setManual]=useState(false);      // planning / what-if override
  const [mMonth,setMMonth]=useState(new Date().getMonth());
  const [mTemp,setMTemp]=useState(15);
  const [mFlow,setMFlow]=useState("Normal");
  const [mDays,setMDays]=useState(4);
  const [tab,setTab]=useState("rivers");
  const [drawerOpen,setDrawerOpen]=useState(false);
  const [riversView,setRiversView]=useState("list");
  const [radiusOpen,setRadiusOpen]=useState(false);
  const [methodOpen,setMethodOpen]=useState(false);
  const [boardOpen,setBoardOpen]=useState(false);
  const [adminOpen,setAdminOpen]=useState(false);
  const [notes,setNotes]=useState([]);
  const [me,setMe]=useState(null);
  const [authOpen,setAuthOpen]=useState(false);
  const [checkoutPlan,setCheckoutPlan]=useState(null);   // plan string when embedded checkout is open
  const [resetToken,setResetToken]=useState(()=>{ try{ return new URLSearchParams(window.location.search).get("reset"); }catch{ return null; } });
  const [flash,setFlash]=useState("");
  const [catchActivity,setCatchActivity]=useState({});
  const [trending,setTrending]=useState({});
  const [stockNews,setStockNews]=useState([]);
  const [flowNewsItems,setFlowNewsItems]=useState([]);
  const [noteSync,setNoteSync]=useState("off");   // off | syncing | synced
  const [posts,setPosts]=useState([]);            // server social posts (newest first)
  const [postsCursor,setPostsCursor]=useState(null);
  const [postsLoaded,setPostsLoaded]=useState(false);
  const [notifs,setNotifs]=useState({notifications:[],unread:0});
  const [notifOpen,setNotifOpen]=useState(false);
  const [profileId,setProfileId]=useState(null);
  const signedInRef=useRef(false);
  const noteSinceRef=useRef(null), noteSyncedRef=useRef([]);
  const [providers,setProviders]=useState({google:true,apple:false});
  const gateArmedRef=useRef(false);
  const refreshMe=useCallback(async()=>{ if(!API_BASE) return; try{ setMe(await proxyJSON("/auth/me")); }catch{ setMe({user:null,entitlement:"free"}); } },[]);
  useEffect(()=>{ if(API_BASE) proxyJSON("/auth/providers").then(setProviders).catch(()=>{}); },[]);
  const isPremium = !API_BASE || isPremiumMe(me);
  const openUpgrade=useCallback(()=>setAuthOpen(true),[]);
  const openCheckout=useCallback((plan="annual")=>setCheckoutPlan(plan),[]);
  // Mandatory sign-in gate: arm while signed out, so that once the user signs in
  // (here or via OAuth redirect) we show the subscription option once. They can
  // cancel it and continue on the free plan.
  useEffect(()=>{ if(API_BASE && me && !me.user) gateArmedRef.current=true; },[me&&!!(me&&me.user)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{
    if(!(API_BASE && me && me.user)) return;
    let armed=gateArmedRef.current;
    try{ if(sessionStorage.getItem("mkGate")==="1"){ armed=true; sessionStorage.removeItem("mkGate"); } }catch{}
    gateArmedRef.current=false;
    if(armed && !isPremiumMe(me)) openCheckout("annual");
  },[me&&me.user&&me.user.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{ refreshMe(); },[refreshMe]);
  // Returning from Stripe embedded checkout (return_url = /?checkout=complete).
  useEffect(()=>{
    const p=new URLSearchParams(window.location.search);
    if(p.get("checkout")==="complete"){
      setCheckoutPlan(null); refreshMe(); setFlash("Trial started — welcome aboard.");
      p.delete("checkout"); const q=p.toString();
      window.history.replaceState({},"",window.location.pathname+(q?"?"+q:""));
      setTimeout(()=>setFlash(""),6000);
    }
  },[refreshMe]);
  const [open,setOpen]=useState(null);
  const [userLoc,setUserLoc]=useState(null);        // {lat,lon} where you are
  const [userWx,setUserWx]=useState(null);          // weather where you are
  const [locStatus,setLocStatus]=useState("idle");  // idle|locating|on|denied|error|unsupported
  const [logCount,setLogCount]=useState(0);
  const [saved,setSaved]=useState([]);   // [{id,label,section,lat,lon,savedAt}]
  const [visits,setVisits]=useState([]); // logbook entries
  const [newsUrl,setNewsUrl]=useState("");
  const [sortBy,setSortBy]=useState("overall");     // overall|distance
  const [discovered,setDiscovered]=useState([]);    // sec-shaped auto spots
  const [discoStatus,setDiscoStatus]=useState("idle"); // idle|loading|done|error
  const [radiusM,setRadiusM]=useState(30000);
  const liveRef=useRef();

  const maybeLog=useCallback(async(map)=>{
    const last=await dbGet("log:lastTs"); const nowMs=Date.now();
    if(last && nowMs-last < 6*3600*1000) return;            // throttle: at most once / 6h
    const m=new Date().getMonth(), hr=new Date().getHours();
    const evs=RIVERS.map(s=>{ const w=map[s.id];
      const cond=w?{temp:modelStreamTemp(s,w.airMean),flow:w.flow,days:w.days,live:true}
                  :{temp:modelStreamTemp(s,CLIMO[m]),flow:"Normal",days:4,live:false};
      return evaluate(s,m,cond,new Date()); }).sort((a,b)=>b.opportunity-a.opportunity);
    const entry={ts:new Date().toISOString(),month:m,season:seasonOf(m),
      top:evs.slice(0,3).map(e=>({id:e.sec.id,river:e.sec.river,section:e.sec.section,opp:e.opportunity,target:e.target}))};
    const log=(await dbGet("log:entries"))||[]; log.push(entry); while(log.length>90) log.shift();
    await dbSet("log:entries",log); await dbSet("log:lastTs",nowMs); setLogCount(log.length);
  },[]);

  const loadWeather=useCallback(async()=>{
    setStatus(s=>s==="live"?"live":"loading");
    try{
      const res=await fetch(buildWeatherURL());
      if(!res.ok) throw new Error("net");
      const data=await res.json();
      const arr=Array.isArray(data)?data:[data];
      const map={};
      RIVERS.forEach((r,i)=>{ const p=arr[i]?parseStation(arr[i]):null; if(p) map[r.id]=p; });
      if(Object.keys(map).length===0) throw new Error("empty");
      const ts=new Date();
      setWx(map); setStatus("live"); setUpdated(ts);
      dbSet("wx:last",{map,ts:ts.toISOString()});
      maybeLog(map);
    }catch(e){ setStatus(f=>f==="live"?"live":"fallback"); setUpdated(new Date()); }
  },[maybeLog]);
  liveRef.current=loadWeather;

  const fetchUserWx=useCallback(async(lat,lon)=>{
    try{ const u=`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      +`&current=temperature_2m,precipitation,weather_code&timezone=America%2FToronto`;
      const r=await fetch(u); if(!r.ok) return; const d=await r.json();
      if(d&&d.current) setUserWx({air:d.current.temperature_2m,code:d.current.weather_code,precip:d.current.precipitation});
    }catch(e){}
  },[]);
  const requestLocation=useCallback(()=>{
    if(!navigator.geolocation){ setLocStatus("unsupported"); return; }
    setLocStatus("locating");
    navigator.geolocation.getCurrentPosition(
      p=>{ const loc={lat:+p.coords.latitude.toFixed(4),lon:+p.coords.longitude.toFixed(4)};
        setUserLoc(loc); setLocStatus("on"); dbSet("loc:last",loc); fetchUserWx(loc.lat,loc.lon); },
      e=>{ setLocStatus(e&&e.code===1?"denied":"error"); },
      {enableHighAccuracy:false,timeout:10000,maximumAge:600000});
  },[fetchUserWx]);

  const discoverNearby=useCallback(async(r)=>{
    if(!userLoc){ requestLocation(); return; }
    logEvent("discover",null,{radiusM:r||radiusM});
    setDiscoStatus("loading");
    const out=await discoverSecs(userLoc, r||radiusM);
    if(out==null){ setDiscoStatus("error"); return; }
    setDiscovered(out.list);
    if(out.wxUrl){
      try{ const res=await fetch(out.wxUrl); if(res.ok){ const data=await res.json();
        const arr=Array.isArray(data)?data:[data]; const add={};
        out.list.forEach((s,i)=>{ const p=arr[i]?parseStation(arr[i]):null; if(p) add[s.id]=p; });
        setWx(prev=>({...prev,...add}));
      } }catch(e){}
    }
    setDiscoStatus("done");
  },[userLoc,radiusM,requestLocation]);

  useEffect(()=>{
    if(navigator.storage&&navigator.storage.persist) navigator.storage.persist().catch(()=>{});
    (async()=>{
      const cached=await dbGet("wx:last");
      if(cached&&cached.map){ setWx(cached.map); setUpdated(new Date(cached.ts)); }
      const loc=await dbGet("loc:last"); if(loc){ setUserLoc(loc); setLocStatus("on"); fetchUserWx(loc.lat,loc.lon); }
      const log=await dbGet("log:entries"); if(log) setLogCount(log.length);
      const sv=await dbGet("saved"); if(Array.isArray(sv)){ setSaved(sv);
        if(API_BASE && !(await dbGet("saved:synced"))){
          for(const s of sv){ if(s.habitat) proxyJSON("/saved-spots",{method:"POST",body:{ref:s.id,river:s.label,section:s.section,lat:s.lat,lon:s.lon,source:s.source||"verified",habitat:s.habitat,species:s.species||[],history:s.history??60}}).catch(()=>{}); }
          dbSet("saved:synced",true);
        }
      }
      const vs=await dbGet("visits"); if(Array.isArray(vs)) setVisits(vs);
      const nt=await dbGet("notes"); if(Array.isArray(nt)) setNotes(nt);
      const nsi=await dbGet("notesSince"); if(nsi) noteSinceRef.current=nsi;
      const nsy=await dbGet("notesSynced"); if(Array.isArray(nsy)) noteSyncedRef.current=nsy;
      if(API_BASE) proxyJSON("/api/reach-activity").then(d=>setCatchActivity(d.activity||{})).catch(()=>{});
      if(API_BASE) proxyJSON("/api/reach-trending").then(d=>setTrending(d.trending||{})).catch(()=>{});
      if(API_BASE) proxyJSON("/api/stocking-news").then(d=>setStockNews(Array.isArray(d.items)?d.items:[])).catch(()=>{});
      if(API_BASE) proxyJSON("/api/flow-news").then(d=>setFlowNewsItems(Array.isArray(d.items)?d.items:[])).catch(()=>{});
      const nu=await dbGet("newsEndpoint"); if(typeof nu==="string") setNewsUrl(nu);
    })();
    loadWeather();
    const t1=setInterval(()=>liveRef.current&&liveRef.current(),30*60*1000);
    const t2=setInterval(()=>setNow(new Date()),60*1000);
    return ()=>{clearInterval(t1);clearInterval(t2);};
  },[loadWeather,fetchUserWx]);

  const hasData = Object.keys(wx).length>0;
  const liveMode = !manual && status==="live";
  const cached = !manual && status!=="live" && hasData;
  const month = manual ? mMonth : now.getMonth();
  const hour  = now.getHours();
  const season= seasonOf(month);

  // per-section conditions resolver (uses cached weather when offline)
  const condFor=useCallback((sec)=>{
    if(manual) return {temp:mTemp,flow:mFlow,days:mDays,live:false,cached:false,air:null,code:null};
    const w=wx[sec.id];
    if(w) return {temp:modelStreamTemp(sec,w.airMean),flow:w.flow,days:w.days,live:status==="live",cached:status!=="live",air:w.airNow,code:w.code,p48:w.p48,forecast:w.forecast,
      wind:w.wind,gust:w.gust,windDir:w.windDir,pressure:w.pressure,pressureTrend:w.pressureTrend,cloud:w.cloud,sunrise:w.sunrise,sunset:w.sunset};
    return {temp:modelStreamTemp(sec,CLIMO[month]),flow:"Normal",days:4,live:false,cached:false,air:CLIMO[month],code:null};
  },[manual,mTemp,mFlow,mDays,wx,status,month]);

  const distOf=useCallback(sec=>userLoc?haversineKm(userLoc.lat,userLoc.lon,sec.lat,sec.lon):null,[userLoc]);
  const isSaved=useCallback(id=>saved.some(s=>s.id===id),[saved]);
  const toggleSave=useCallback((sec)=>{
    setSaved(prev=>{ const ex=prev.some(s=>s.id===sec.id);
      const rec={id:sec.id,label:sec.river,section:sec.section,lat:sec.lat,lon:sec.lon,
        habitat:sec.h,species:sec.species,history:sec.history,source:sec.source||"verified",savedAt:new Date().toISOString()};
      const next= ex? prev.filter(s=>s.id!==sec.id) : [...prev,rec];
      dbSet("saved",next);
      if(API_BASE){
        if(ex) proxyJSON(`/saved-spots/${encodeURIComponent(sec.id)}`,{method:"DELETE"}).catch(()=>{});
        else { proxyJSON("/saved-spots",{method:"POST",body:{ref:sec.id,river:sec.river,section:sec.section,lat:sec.lat,lon:sec.lon,source:rec.source,habitat:sec.h,species:sec.species,history:sec.history}}).catch(()=>{}); logEvent("save",sec.id); }
      }
      return next; });
  },[]);
  const addVisit=useCallback((entry)=>{
    setVisits(prev=>{ const next=[{...entry,id:"v"+Date.now()},...prev].slice(0,200); dbSet("visits",next); return next; });
  },[]);
  const removeVisit=useCallback((id)=>{ setVisits(prev=>{ const next=prev.filter(v=>v.id!==id); dbSet("visits",next); return next; }); },[]);
  const addNote=useCallback((fields)=>{ setNotes(prev=>{
    // Attribute a pinned note to the nearest reach (≤20 km) so it feeds the
    // per-reach intel that tunes recommendations.
    let ref=fields.ref||null;
    if(!ref && typeof fields.lat==="number" && typeof fields.lon==="number"){
      let best=null; RIVERS.forEach(s=>{ const d=haversineKm(fields.lat,fields.lon,s.lat,s.lon); if(!best||d<best.d) best={id:s.id,d}; });
      if(best && best.d<=20) ref=best.id;
    }
    const n=newNote({...fields,ref}); const next=[n,...prev].slice(0,300); dbSet("notes",next);
    if(API_BASE&&signedInRef.current){ setNoteSync("syncing");
      proxyJSON("/notes",{method:"POST",body:n}).then(()=>{ noteSyncedRef.current=[...noteSyncedRef.current,n.id]; dbSet("notesSynced",noteSyncedRef.current); setNoteSync("synced"); }).catch(()=>setNoteSync("off")); }
    return next; }); },[]);
  const removeNote=useCallback((id)=>{ setNotes(prev=>{ const next=prev.filter(n=>n.id!==id); dbSet("notes",next);
    if(API_BASE&&signedInRef.current){ setNoteSync("syncing");
      proxyJSON(`/notes/${encodeURIComponent(id)}`,{method:"DELETE"}).then(()=>setNoteSync("synced")).catch(()=>setNoteSync("off")); }
    return next; }); },[]);
  // Full reconcile with the server (pull-since, merge, push local-only). Runs on
  // sign-in and app open; local-first and network-failure tolerant.
  const runNoteSync=useCallback(async()=>{
    if(!API_BASE||!(me&&me.user)) return;
    setNoteSync("syncing");
    const local=(await dbGet("notes"))||[];
    const api={ pull:(since)=>proxyJSON("/notes"+(since?`?since=${encodeURIComponent(since)}`:"")),
                push:(n)=>proxyJSON("/notes",{method:"POST",body:n}) };
    const { notes, since, syncedIds }=await syncNotes({ local, since:noteSinceRef.current, syncedIds:noteSyncedRef.current, api });
    noteSinceRef.current=since; noteSyncedRef.current=syncedIds;
    dbSet("notes",notes); dbSet("notesSince",since); dbSet("notesSynced",syncedIds);
    setNotes(notes); setNoteSync("synced");
  },[me]);
  useEffect(()=>{ signedInRef.current=!!(me&&me.user); if(API_BASE&&me&&me.user) runNoteSync(); },[me&&me.user&&me.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Social feed (Phase C slice 1) ----
  const loadPosts=useCallback(async(cursor)=>{
    if(!API_BASE) return;
    try{ const { posts:pg=[], nextBefore }=await proxyJSON("/posts"+(cursor?`?before=${encodeURIComponent(cursor)}`:""));
      setPosts(prev=> cursor ? [...prev,...pg] : pg); setPostsCursor(nextBefore); setPostsLoaded(true);
    }catch{ setPostsLoaded(true); }
  },[]);
  useEffect(()=>{ if(API_BASE) loadPosts(); },[loadPosts]);
  // Re-shape likedByMe when auth changes (a fresh sign-in should reflect my likes).
  useEffect(()=>{ if(API_BASE&&postsLoaded) loadPosts(); },[me&&me.user&&me.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const createPost=useCallback(async(fields)=>{ // {body,river,photo:{url,w,h}?}
    const body={ body:fields.body||"", river:fields.river||null };
    if(fields.photo){ body.photoUrl=fields.photo.url; body.photoW=fields.photo.w; body.photoH=fields.photo.h; }
    const { post }=await proxyJSON("/posts",{method:"POST",body});
    setPosts(prev=>[post,...prev]); return post;
  },[]);
  const deletePost=useCallback(async(id)=>{ setPosts(prev=>prev.filter(p=>p.id!==id));
    try{ await proxyJSON(`/posts/${encodeURIComponent(id)}`,{method:"DELETE"}); }catch{} },[]);
  const toggleLike=useCallback(async(id,liked)=>{
    setPosts(prev=>prev.map(p=>p.id===id?{...p,likedByMe:!liked,likeCount:p.likeCount+(liked?-1:1)}:p));
    try{ const r=await proxyJSON(`/posts/${encodeURIComponent(id)}/like`,{method:liked?"DELETE":"POST"});
      setPosts(prev=>prev.map(p=>p.id===id?{...p,likedByMe:r.likedByMe,likeCount:r.likeCount}:p));
    }catch{ setPosts(prev=>prev.map(p=>p.id===id?{...p,likedByMe:liked,likeCount:p.likeCount+(liked?1:-1)}:p)); } },[]);
  const reportPost=useCallback(async(id,reason)=>{ try{ await proxyJSON(`/posts/${encodeURIComponent(id)}/report`,{method:"POST",body:{reason:reason||""}}); }catch{} },[]);
  const blockAuthor=useCallback(async(authorId)=>{ setPosts(prev=>applyBlocks(prev,[authorId]));
    try{ await proxyJSON(`/users/${encodeURIComponent(authorId)}/block`,{method:"POST"}); }catch{} },[]);
  const bumpComments=useCallback((id,delta)=>{ setPosts(prev=>prev.map(p=>p.id===id?{...p,commentCount:Math.max(0,(p.commentCount||0)+delta)}:p)); },[]);
  const setDisplayName=useCallback(async(name)=>{ const { user }=await proxyJSON("/me",{method:"PATCH",body:{displayName:name}});
    setMe(prev=>prev?{...prev,user:{...prev.user,...user}}:prev); return user; },[]);
  // ---- Notifications (likes/comments on your posts) ----
  const loadNotifs=useCallback(async()=>{ if(!API_BASE||!(me&&me.user)) return; try{ setNotifs(await proxyJSON("/notifications")); }catch{} },[me]);
  useEffect(()=>{ if(!(API_BASE&&me&&me.user)) return; loadNotifs(); const id=setInterval(loadNotifs,60000); return ()=>clearInterval(id); },[me&&me.user&&me.user.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const openNotifs=useCallback(async()=>{ setNotifOpen(true); try{ await proxyJSON("/notifications/read",{method:"POST"}); setNotifs(n=>({...n,unread:0})); }catch{} },[]);
  const onSaveUrl=useCallback((u)=>{ setNewsUrl(u); dbSet("newsEndpoint",u); },[]);
  const nearest=useMemo(()=>{ if(!userLoc) return null; let best=null;
    RIVERS.forEach(s=>{ const d=haversineKm(userLoc.lat,userLoc.lon,s.lat,s.lon); if(!best||d<best.d) best={s,d}; });
    return best; },[userLoc]);

  const ranked=useMemo(()=>{
    const nudge=(ref)=>catchNudge((catchActivity[ref]||{}).momentum);
    const curated=RIVERS.map(s=>{ const ev={...evaluate(s,month,condFor(s),now),source:"verified"}; const n=nudge(s.id);
      return {...ev,opportunity:Math.min(100,ev.opportunity+n),confidence:Math.min(98,ev.confidence+Math.round(n/2))}; });
    const auto=discovered.map(s=>{ const ev=evaluate(s,month,condFor(s),now); const n=nudge(s.id);
      return {...ev,source:"auto",confidence:Math.min(70,applySourcePenalty(ev.confidence,"auto")+Math.round(n/2)),opportunity:Math.min(100,ev.opportunity+n)}; });
    return [...curated,...auto].sort((a,b)=>b.opportunity-a.opportunity);
  },[month,now,condFor,discovered,catchActivity]);
  const feed=useMemo(()=>buildFeed(ranked,userLoc,saved.map(s=>s.id),now),[ranked,userLoc,saved,now]);
  const top3=ranked.slice(0,3), honourable=ranked.slice(3,6);
  const warmAny=ranked.some(r=>r.warmStress);

  const fmtTime=d=>d?d.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}):"—";
  const fmtDate=d=>d.toLocaleDateString([], {weekday:"short",month:"short",day:"numeric"});

  const tabBtn=(id,label)=>(<button onClick={()=>setTab(id)} style={{flex:1,padding:"11px 2px",background:"none",border:"none",cursor:"pointer",
    fontFamily:sans,fontSize:10,letterSpacing:0.3,textTransform:"uppercase",fontWeight:tab===id?700:500,color:tab===id?C.brass:C.headDim,
    borderBottom:tab===id?`2px solid ${C.brass}`:`2px solid transparent`}}>{label}</button>);

  const statusDot = status==="live"?C.brass:status==="loading"?C.brass:(hasData?C.bone:C.brick);
  const statusTxt = manual?"Planning mode"
    : status==="live"?"Live"
    : status==="loading"?(hasData?"Refreshing…":"Updating…")
    : hasData?"Last-known (offline)":"Offline · seasonal model";

  // While auth is still resolving, hold a brand splash instead of flashing the
  // main app for a frame before the sign-in gate — makes first open feel intentional.
  if(API_BASE && me===null) return (
    <div style={{position:"fixed",inset:0,background:C.cyanDeep,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14}}>
      <Avatar src="icons/crest.png" size={96}/>
      <div style={{fontFamily:serif,fontSize:20,fontWeight:700,color:"#EFE9DB"}}>Muddy York Fishing</div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:C.ink,color:C.text,fontFamily:sans}}>
      <style>{`
        *{box-sizing:border-box;}
        html,body{margin:0;padding:0;background:${C.ink};-webkit-text-size-adjust:100%;}
        #root{min-height:100vh;background:${C.ink} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E");}
        ::selection{background:${C.brass}55;}
        input[type=range]{-webkit-appearance:none;appearance:none;height:4px;border-radius:3px;background:${C.line};outline:none;}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;border-radius:50%;background:${C.brick};border:2px solid ${C.bone};cursor:pointer;}
        input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:${C.brick};border:2px solid ${C.bone};cursor:pointer;}
        .seg{font-family:${sans};font-size:10px;letter-spacing:.5px;padding:6px 9px;border-radius:4px;cursor:pointer;border:1px solid ${C.line};background:${C.bone};color:${C.textDim};}
        .seg.on{background:${C.brick};border-color:${C.brick};color:${C.bone};}
        .tabs::-webkit-scrollbar{display:none;} .tabs{scrollbar-width:none;-ms-overflow-style:none;}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.35;}}
        @media (prefers-reduced-motion: reduce){*{transition:none !important;animation:none !important;}}
      `}</style>

      {/* TopBar */}
      <div style={{position:"sticky",top:0,zIndex:1100,borderBottom:`3px solid ${C.brass}`,background:C.ink2}}>
        <div style={{maxWidth:820,margin:"0 auto",padding:"calc(9px + env(safe-area-inset-top)) 16px 9px",display:"flex",alignItems:"center",gap:11}}>
          <Crest size={38}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:serif,fontSize:18,fontWeight:700,color:C.headText,letterSpacing:0.3,lineHeight:1}}>Muddy York</div>
            <div style={{fontFamily:sans,fontSize:9,letterSpacing:2.6,textTransform:"uppercase",color:C.brass,marginTop:3}}>Fishing</div>
          </div>
          {API_BASE && me && me.user && <button aria-label="Notifications" onClick={openNotifs} style={{position:"relative",background:"none",border:"none",cursor:"pointer",color:C.headText,padding:6,display:"flex"}}>
            <Icon name="alert" size={22}/>
            {notifs.unread>0 && <span style={{position:"absolute",top:1,right:1,minWidth:16,height:16,padding:"0 4px",borderRadius:9,background:C.brick,color:"#fff",fontFamily:sans,fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box"}}>{notifs.unread>9?"9+":notifs.unread}</span>}
          </button>}
          {API_BASE && <AccountButton me={me} onClick={()=>setAuthOpen(true)}/>}
          <button aria-label="Menu" onClick={()=>setDrawerOpen(true)} style={{background:"none",border:"none",cursor:"pointer",color:C.headText,padding:6,display:"flex"}}><Icon name="menu" size={23}/></button>
        </div>
      </div>

      <div style={{maxWidth:820,margin:"0 auto",padding:"14px 16px calc(86px + env(safe-area-inset-bottom))"}}>

        {/* Compact meta strip — scrolls away */}
        <div style={{display:"flex",background:C.panel,border:`1px solid ${C.lineSoft}`,borderRadius:12,overflow:"hidden",marginBottom:14}}>
          <div style={metaCell}><div style={metaK}>{fmtDate(now)}</div><div style={metaV}>{fmtTime(now)}</div></div>
          <div style={metaCell}><div style={metaK}>Now</div><div style={metaV}>{userWx?`${Math.round(userWx.air)}°`:status==="live"?"Live":"—"}<span style={metaEm}>{userWx&&WX_CODE(userWx.code)?" "+WX_CODE(userWx.code):""}</span></div></div>
          <div style={metaCell}><div style={metaK}>Season</div><div style={metaV}>{season}</div></div>
          <div style={{...metaCell,borderRight:"none",cursor:"pointer"}} onClick={()=>setRadiusOpen(true)}><div style={metaK}>Radius</div><div style={{...metaV,color:C.amberDeep}}>{radiusLabel(radiusM)}</div></div>
        </div>

        {/* ===================== RIVERS TAB ===================== */}
        {tab==="rivers" && (<>
          <div style={{fontFamily:serif,fontStyle:"italic",fontSize:15,color:C.pine,marginBottom:12}}>Find the right water, morning by morning.</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
            <button onClick={requestLocation} style={{...btnBig,borderColor:userLoc?C.pine:C.line,color:userLoc?C.pine:C.textDim}}>
              <Icon name="pin" size={15}/>{locStatus==="locating"?"Locating…":userLoc?"Located":"Use my location"}</button>
            {userLoc && <button onClick={()=> isPremium ? discoverNearby(radiusM) : openUpgrade()} style={{...btnBig,borderColor:C.brass,color:C.pine}}>
              <Icon name="search" size={15}/>{!isPremium?"Find water near me":discoStatus==="loading"?"Scouting…":discovered.length?`${discovered.length} spots found`:"Find water near me"}</button>}
            <button onClick={loadWeather} style={{...btnBig,borderColor:C.line,color:C.textDim}}><Icon name="refresh" size={15}/>Refresh</button>
          </div>
          {discoStatus==="error" && <div style={hint}>Couldn't scout new water just now — try again shortly.</div>}
          {locStatus==="denied" && <div style={hint}>Location is blocked — enable it in Settings ▸ Safari ▸ Location.</div>}

          <div style={{display:"flex",gap:5,background:C.panelHi,padding:4,borderRadius:11,marginBottom:14}}>
            <button onClick={()=>setRiversView("list")} style={segBtn(riversView==="list")}><Icon name="list" size={16}/>List</button>
            <button onClick={()=> isPremium ? (setRiversView("map"),logEvent("open_map")) : openUpgrade()} style={segBtn(riversView==="map"&&isPremium)}><Icon name={isPremium?"map":"lock"} size={16}/>Map</button>
          </div>

          {riversView==="map" && isPremium
            ? <MapView ranked={ranked} userLoc={userLoc} m={month} distOf={distOf} isSaved={isSaved} onToggleSave={toggleSave} premium={isPremium} onUpgrade={openUpgrade} signedIn={!!(me&&me.user)} activity={catchActivity}/>
            : (<>
              {warmAny && (top3[0]?.cond.temp>=19) && (<div style={{display:"flex",gap:10,padding:"11px 13px",marginBottom:14,background:`${C.red}12`,border:`1px solid ${C.red}44`,borderRadius:11,fontSize:13,color:C.text,lineHeight:1.5}}>
                <span style={{color:C.red,fontWeight:800}}>!</span><span>Warm-water caution: hooked trout rarely survive release at these temperatures. Favour cold tailwater and spring creeks, or rest the trout today.</span></div>)}
              {/* Free tier: the top 3 ranked reaches are open; deeper water is locked. */}
              {top3.map((ev,i)=><RecCard key={ev.sec.id} ev={ev} rank={i+1} m={month} dist={distOf(ev.sec)} isSaved={isSaved} onToggleSave={toggleSave} premium={isPremium} onUpgrade={openUpgrade} signedIn={!!(me&&me.user)} logged={catchActivity[ev.sec.id]} trend={trending[ev.sec.id]}/>)}
              <SectionTitle t="More water nearby"/>
              <Locked premium={isPremium} onUpgrade={openUpgrade} label="Upgrade to see more water">
                <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:8}}>
                  {honourable.map(ev=>(<div key={ev.sec.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 13px",background:C.panel,border:`1px solid ${C.lineSoft}`,borderRadius:11}}>
                    <span title={scoreWord(ev.opportunity)} style={{fontFamily:serif,fontSize:19,fontWeight:700,color:scoreColor(ev.opportunity),width:28}}>{ev.opportunity}</span>
                    <div style={{flex:1,minWidth:0}}><div style={{fontSize:14,color:C.text,fontWeight:600}}>{ev.sec.river}</div><div style={{fontSize:12.5,color:C.textDim}}>{ev.sec.section}{distOf(ev.sec)!=null?` · ${distOf(ev.sec)} km`:""}</div></div>
                    <Pill k={ev.target}/></div>))}
                </div>
              </Locked>
            </>)}
        </>)}

        {/* ===================== NEWS TAB ===================== */}
        {tab==="news" && <NewsView derived={feed} stockNews={stockNews} flowNews={flowNewsItems} newsUrl={newsUrl} onSaveUrl={onSaveUrl} personalized={saved.length>0||!!userLoc}
          me={me} posts={posts} postsCursor={postsCursor} onLoadMore={()=>loadPosts(postsCursor)}
          onCreatePost={createPost} onDeletePost={deletePost} onToggleLike={toggleLike} onReport={reportPost}
          onBlock={blockAuthor} onCommentDelta={bumpComments} onSetName={setDisplayName} onSignIn={openUpgrade} onOpenProfile={setProfileId}/>}

        {/* ===================== NOTES TAB ===================== */}
        {tab==="notes" && <NotesView saved={saved} notes={notes} onAddNote={addNote} onRemoveNote={removeNote} onUnsave={toggleSave} userLoc={userLoc} requestLocation={requestLocation} top={top3[0]} signedIn={!!(me&&me.user)} syncState={noteSync}/>}
      </div>

      {/* Bottom tab bar */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:1100,background:C.ink2,borderTop:`2px solid ${C.brass}`,display:"flex",padding:"3px 4px calc(4px + env(safe-area-inset-bottom))"}}>
        {[["rivers","Rivers","rivers"],["news","News","news"],["notes","Notes","notes"]].map(([id,label,icon])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,background:"none",border:"none",cursor:"pointer",color:tab===id?C.brass:C.headDim,display:"flex",flexDirection:"column",alignItems:"center",gap:1,padding:"4px 2px"}}>
            <Icon name={icon} size={19}/><span style={{fontSize:10,fontWeight:700}}>{label}</span></button>))}
      </div>

      {drawerOpen && <Drawer tab={tab} me={me} onNav={(t)=>{setTab(t);setDrawerOpen(false);}} onClose={()=>setDrawerOpen(false)}
        onAccount={()=>{setDrawerOpen(false); if(API_BASE) setAuthOpen(true);}} onRadius={()=>{setDrawerOpen(false);setRadiusOpen(true);}} onMethod={()=>{setDrawerOpen(false);setMethodOpen(true);}}
        onBoard={API_BASE?()=>{setDrawerOpen(false);setBoardOpen(true);}:null}
        onAdmin={(me&&me.isAdmin)?()=>{setDrawerOpen(false);setAdminOpen(true);}:null}/>}
      {boardOpen && <LeaderboardSheet onClose={()=>setBoardOpen(false)}/>}
      {adminOpen && <AdminSheet onClose={()=>setAdminOpen(false)}/>}
      {radiusOpen && <RadiusSheet current={radiusM} onPick={(m)=>{setRadiusM(m); if(userLoc) discoverNearby(m); setRadiusOpen(false);}} onClose={()=>setRadiusOpen(false)}/>}
      {methodOpen && <div onClick={()=>setMethodOpen(false)} style={sheetOverlay}><div onClick={e=>e.stopPropagation()} style={sheetPanel}><Method logCount={logCount}/><button onClick={()=>setMethodOpen(false)} style={{...btnBig,width:"100%",justifyContent:"center",marginTop:14}}>Close</button></div></div>}
      {resetToken && <ResetModal token={resetToken} onDone={()=>{ setResetToken(null); refreshMe(); try{ window.history.replaceState({},"",window.location.pathname); }catch{} }}/>}
      {API_BASE && me && !me.user && !resetToken && <SignInGate onAuth={refreshMe} providers={providers}/>}
      {notifOpen && <NotifPanel data={notifs} onClose={()=>setNotifOpen(false)} onOpenProfile={(id)=>{ setNotifOpen(false); setProfileId(id); }} onGoNews={()=>{ setNotifOpen(false); setTab("news"); }}/>}
      {profileId && <ProfileModal userId={profileId} me={me} onClose={()=>setProfileId(null)} onToggleLike={toggleLike} onDelete={deletePost} onReport={reportPost} onBlock={blockAuthor} onCommentDelta={bumpComments} onSetName={setDisplayName} onSignIn={openUpgrade} onOpenProfile={setProfileId}/>}
      {authOpen && <AuthModal me={me} onClose={()=>setAuthOpen(false)} onAuth={refreshMe} onCheckout={openCheckout}/>}
      {checkoutPlan && <CheckoutModal plan={checkoutPlan} onClose={()=>setCheckoutPlan(null)}/>}
      {flash && <div style={{position:"fixed",left:"50%",bottom:82,transform:"translateX(-50%)",zIndex:5000,background:C.pine,color:C.bone,fontFamily:sans,fontSize:13,fontWeight:600,padding:"10px 18px",borderRadius:24,boxShadow:"0 6px 20px rgba(0,0,0,.3)"}}>{flash}</div>}
    </div>
  );
}

const btn={fontFamily:mono,fontSize:10,letterSpacing:0.5,padding:"6px 11px",borderRadius:6,cursor:"pointer",background:C.panel,border:`1px solid ${C.line}`};

/* ---- redesign shared styles + shell components ---- */
const btnBig={display:"inline-flex",alignItems:"center",gap:7,fontFamily:sans,fontSize:13,fontWeight:600,padding:"9px 13px",borderRadius:9,cursor:"pointer",background:"#fff",border:`1px solid ${C.line}`,color:C.pine};
const metaCell={flex:1,padding:"7px 9px",borderRight:`1px solid ${C.lineSoft}`};
const metaK={fontFamily:sans,fontSize:8.5,letterSpacing:1.1,textTransform:"uppercase",color:C.textFaint,fontWeight:700};
const metaV={fontFamily:sans,fontSize:12.5,color:C.text,marginTop:2,fontWeight:700,whiteSpace:"nowrap"};
const metaEm={fontWeight:500,color:C.textDim};
const hint={fontFamily:sans,fontSize:11.5,color:C.amberDeep,marginBottom:10};
const notePill={fontFamily:sans,fontSize:11.5,fontWeight:600,padding:"3px 9px",borderRadius:20,border:`1px solid ${C.line}`,background:C.bone,color:C.textDim};
const sheetOverlay={position:"fixed",inset:0,background:"rgba(20,26,20,.5)",zIndex:2000,display:"flex",alignItems:"flex-end",justifyContent:"center"};
const sheetPanel={width:"100%",maxWidth:520,maxHeight:"84vh",overflowY:"auto",background:C.panel,borderRadius:"18px 18px 0 0",padding:"14px 18px calc(20px + env(safe-area-inset-bottom))",boxShadow:"0 -8px 30px rgba(0,0,0,.25)"};
function segBtn(on){ return {flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:"9px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:sans,fontSize:13.5,fontWeight:600,background:on?C.pine:"transparent",color:on?C.headText:C.textDim}; }

function LeaderboardSheet({onClose}){
  const [rows,setRows]=useState(null);
  useEffect(()=>{ let live=true; proxyJSON("/api/catch-leaderboard").then(d=>{ if(live) setRows(d.catches||[]); }).catch(()=>{ if(live) setRows([]); }); return ()=>{live=false;}; },[]);
  const when=d=>d<=0?"today":d===1?"yesterday":`${d}d ago`;
  return (<div onClick={onClose} style={sheetOverlay}>
    <div onClick={e=>e.stopPropagation()} style={sheetPanel}>
      <div style={{width:38,height:4,borderRadius:4,background:"#D5CCB8",margin:"0 auto 14px"}}/>
      <div style={{fontFamily:serif,fontSize:19,fontWeight:700,color:C.pine,marginBottom:4}}>Recent catches</div>
      <div style={{fontSize:12.5,color:C.textDim,marginBottom:14,lineHeight:1.5}}>The biggest catches logged across the network over the last 60 days. Anonymous and reach-level — exact spots stay private.</div>
      {rows===null ? <div style={{fontSize:13,color:C.textFaint}}>Loading…</div>
        : rows.length===0 ? <div style={{fontSize:13,color:C.textDim,lineHeight:1.5}}>No catches logged yet. Be the first — log a catch from any river card.</div>
        : <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {rows.map((r,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:11,padding:"10px 12px",background:C.panel,border:`1px solid ${C.lineSoft}`,borderRadius:11}}>
              <div style={{fontFamily:serif,fontSize:16,fontWeight:700,color:i<3?C.brick:C.textFaint,width:22,textAlign:"center",flexShrink:0}}>{i+1}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:sans,fontSize:14,fontWeight:700,color:C.pine}}>{r.species}{r.sizeInches?` · ${r.sizeInches}"`:""}</div>
                <div style={{fontSize:12,color:C.textDim,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.river} · {when(r.daysAgo)}</div>
              </div>
            </div>))}
          </div>}
      <button onClick={onClose} style={{...btnBig,width:"100%",justifyContent:"center",marginTop:16}}>Close</button>
    </div>
  </div>);
}
function AdminSheet({onClose}){
  const [d,setD]=useState(null);
  useEffect(()=>{ let live=true; proxyJSON("/api/admin/overview").then(x=>{ if(live) setD(x); }).catch(()=>{ if(live) setD({error:true}); }); return ()=>{live=false;}; },[]);
  const card=(label,val,sub)=>(<div style={{flex:"1 1 30%",minWidth:96,background:C.panel,border:`1px solid ${C.lineSoft}`,borderRadius:11,padding:"11px 12px"}}>
    <div style={{fontFamily:serif,fontSize:22,fontWeight:700,color:C.pine,lineHeight:1}}>{val}</div>
    <div style={{fontFamily:sans,fontSize:10,letterSpacing:0.6,textTransform:"uppercase",color:C.textFaint,fontWeight:700,marginTop:4}}>{label}</div>
    {sub!=null && <div style={{fontSize:11,color:C.textDim,marginTop:3}}>{sub}</div>}
  </div>);
  const head=(t)=>(<div style={{fontFamily:sans,fontSize:10,letterSpacing:1,textTransform:"uppercase",fontWeight:700,color:C.brass,margin:"18px 0 8px"}}>{t}</div>);
  const dt=(iso)=>new Date(iso).toLocaleDateString([], {month:"short",day:"numeric"});
  return (<div onClick={onClose} style={sheetOverlay}>
    <div onClick={e=>e.stopPropagation()} style={{...sheetPanel,maxWidth:600}}>
      <div style={{width:38,height:4,borderRadius:4,background:"#D5CCB8",margin:"0 auto 14px"}}/>
      <div style={{fontFamily:serif,fontSize:19,fontWeight:700,color:C.pine,marginBottom:2}}>Admin dashboard</div>
      <div style={{fontSize:12,color:C.textDim,marginBottom:6}}>Live business overview. Visible only to you.</div>
      {!d ? <div style={{fontSize:13,color:C.textFaint,padding:"14px 0"}}>Loading…</div>
        : d.error ? <div style={{fontSize:13,color:C.brick,padding:"14px 0"}}>Couldn't load — are you signed in as the admin?</div>
        : (<div>
          {head("Members & signups")}
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {card("Users",d.users.total,`+${d.users.new7d} this week`)}
            {card("Active members",d.members.active)}
            {card("On trial",d.members.trialing)}
            {card("New (30d)",d.users.new30d)}
          </div>
          {head("Content logged")}
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {card("Catches",d.content.catches)}
            {card("Notes",d.content.notes)}
            {card("Posts",d.content.posts)}
            {card("Comments",d.content.comments)}
          </div>
          {head("Usage (last 7 days)")}
          <div style={{fontSize:13,color:C.text,marginBottom:6}}>{d.events7d} interactions tracked.</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {(d.topEvents||[]).slice(0,8).map(e=><span key={e.type} style={{...notePill}}>{e.type} · {e.count}</span>)}
          </div>
          {head("Recent signups")}
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {(d.recentSignups||[]).map((u,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:12.5,color:C.text}}>
              <span style={{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.email}{u.displayName?` · ${u.displayName}`:""}</span>
              <span style={{color:C.textFaint,flexShrink:0}}>{dt(u.createdAt)}</span>
            </div>))}
          </div>
          {(d.recentCatches||[]).length>0 && <>{head("Recent catches")}
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {d.recentCatches.map((c,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:12.5,color:C.text}}>
                <span>{c.species}{c.sizeInches?` · ${c.sizeInches}"`:""} — {c.river}</span>
                <span style={{color:C.textFaint,flexShrink:0}}>{dt(c.caughtAt)}</span>
              </div>))}
            </div></>}
        </div>)}
      <button onClick={onClose} style={{...btnBig,width:"100%",justifyContent:"center",marginTop:18}}>Close</button>
    </div>
  </div>);
}
function Drawer({tab,me,onNav,onClose,onAccount,onRadius,onMethod,onBoard,onAdmin}){
  useEffect(()=>{ const h=e=>{ if(e.key==="Escape") onClose(); }; window.addEventListener("keydown",h); return ()=>window.removeEventListener("keydown",h); },[onClose]);
  const link=(icon,label,active,onClick)=>(<button onClick={onClick} style={{display:"flex",alignItems:"center",gap:12,width:"100%",textAlign:"left",padding:"11px 12px",borderRadius:9,border:"none",cursor:"pointer",fontFamily:sans,fontSize:14.5,fontWeight:600,background:active?"rgba(212,175,55,.16)":"transparent",color:active?C.brass:"#D6E0D4"}}><Icon name={icon} size={19}/>{label}</button>);
  return (<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(15,22,16,.5)",zIndex:2500,display:"flex",justifyContent:"flex-end"}}>
    <div onClick={e=>e.stopPropagation()} style={{width:280,maxWidth:"82%",background:C.cyanDeep,padding:"calc(16px + env(safe-area-inset-top)) 12px calc(20px + env(safe-area-inset-bottom))",display:"flex",flexDirection:"column",gap:2,overflowY:"auto"}}>
      <div style={{display:"flex",gap:11,alignItems:"center",padding:"4px 8px 14px"}}><Crest size={44}/><div><div style={{fontFamily:serif,fontSize:16,fontWeight:700,color:"#EFE9DB"}}>Muddy York</div><div style={{fontFamily:sans,fontSize:9,letterSpacing:2.6,textTransform:"uppercase",color:C.brass,marginTop:3}}>Fishing</div></div></div>
      {link("rivers","Rivers",tab==="rivers",()=>onNav("rivers"))}
      {link("news","News & catches",tab==="news",()=>onNav("news"))}
      {link("notes","My notes",tab==="notes",()=>onNav("notes"))}
      {onBoard && link("save","Recent catches",false,onBoard)}
      <div style={{height:1,background:"rgba(255,255,255,.13)",margin:"9px 2px"}}/>
      {API_BASE && link("account",`Account${me&&me.user?" · "+entitlementLabel(me):""}`,false,onAccount)}
      {onAdmin && link("account","Admin dashboard",false,onAdmin)}
      {link("radius","Search radius",false,onRadius)}
      {link("method","Method & sources",false,onMethod)}
      <div style={{height:1,background:"rgba(255,255,255,.13)",margin:"9px 2px"}}/>
      <div style={{fontFamily:sans,fontSize:12,color:"#8FA394",padding:"8px 12px",lineHeight:1.5}}>Before you fish — confirm open seasons, limits and sanctuary closures in the current Ontario regulations.</div>
    </div>
  </div>);
}
function RadiusSheet({current,onPick,onClose}){
  return (<div onClick={onClose} style={sheetOverlay}>
    <div onClick={e=>e.stopPropagation()} style={sheetPanel}>
      <div style={{width:38,height:4,borderRadius:4,background:"#D5CCB8",margin:"0 auto 14px"}}/>
      <div style={{fontFamily:serif,fontSize:18,fontWeight:700,color:C.pine,marginBottom:4}}>Search radius</div>
      <div style={{fontSize:13,color:C.textDim,marginBottom:14,lineHeight:1.5}}>How far around you to look for water. Wider searches take a little longer.</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {RADIUS_PRESETS.map(p=>{ const on=radiusLabel(current)===p.label; return (
          <button key={p.m} onClick={()=>onPick(p.m)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 15px",borderRadius:11,cursor:"pointer",fontFamily:sans,fontSize:15,fontWeight:600,border:`1px solid ${on?C.pine:C.line}`,background:on?"rgba(44,76,59,.08)":"#fff",color:C.pine}}>
            {p.label}{on && <Icon name="check" size={18}/>}</button>); })}
      </div>
    </div>
  </div>);
}
function NotesView({saved,notes,onAddNote,onRemoveNote,onUnsave,userLoc,requestLocation,top,signedIn,syncState}){
  const [f,setF]=useState({title:"",body:"",technique:"",flies:"",species:"",size:""});
  const [pin,setPin]=useState(false);
  const inp={width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${C.line}`,background:C.bone,color:C.text,fontFamily:sans,fontSize:14,marginTop:8};
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const submit=()=>{ if(!f.title.trim()&&!f.body.trim()) return;
    const fields={...f}; if(pin&&userLoc){ fields.lat=userLoc.lat; fields.lon=userLoc.lon; }
    onAddNote(fields); setF({title:"",body:"",technique:"",flies:"",species:"",size:""}); setPin(false); };
  const dropPin=()=>{ if(!userLoc) requestLocation(); setPin(true); };
  return (<div>
    <SectionTitle t="Drop a note"/>
    <div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:12,padding:14,marginBottom:18}}>
      <input style={inp} placeholder="Title (e.g. Forks pool)" value={f.title} onChange={e=>set("title",e.target.value)}/>
      <textarea style={{...inp,minHeight:70,resize:"vertical"}} placeholder="What happened, water read, conditions…" value={f.body} onChange={e=>set("body",e.target.value)}/>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <input style={inp} placeholder="Technique" value={f.technique} onChange={e=>set("technique",e.target.value)}/>
        <input style={inp} placeholder="Flies / patterns" value={f.flies} onChange={e=>set("flies",e.target.value)}/>
        <input style={inp} placeholder="Species caught" value={f.species} onChange={e=>set("species",e.target.value)}/>
        <input style={inp} placeholder="Approx size" value={f.size} onChange={e=>set("size",e.target.value)}/>
      </div>
      <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
        <button onClick={dropPin} style={{...btnBig,borderColor:pin?C.pine:C.line,color:pin?C.pine:C.textDim}}><Icon name="pin" size={15}/>{pin?(userLoc?"Pinned to here":"Getting GPS…"):"Drop a pin here"}</button>
        <button onClick={submit} style={{...btnBig,background:C.pine,color:C.headText,borderColor:C.pine}}><Icon name="plus" size={15}/>Save note</button>
      </div>
      <div style={{fontSize:11.5,color:C.textFaint,marginTop:9,lineHeight:1.5}}>{signedIn?"Backed up to your account and synced across your devices":"Saved to this device"}. A pin saves your current GPS spot so you can return to the exact place — and helps sharpen the app's spot suggestions.</div>
    </div>

    {saved.length>0 && (<><SectionTitle t="Saved water"/>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:18}}>
        {saved.map(s=>(<div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 13px",background:C.panel,border:`1px solid ${C.lineSoft}`,borderRadius:11}}>
          <div style={{flex:1,minWidth:0}}><div style={{fontFamily:serif,fontSize:15,fontWeight:700,color:C.pine}}>{s.label}</div><div style={{fontSize:12.5,color:C.textDim}}>{s.section}</div></div>
          <button onClick={()=>set("title",s.label+" — ")} style={{...btnBig,padding:"7px 10px",fontSize:12}}>Note</button>
          <button onClick={()=>onUnsave({id:s.id,river:s.label,section:s.section,lat:s.lat,lon:s.lon})} style={{background:"none",border:"none",cursor:"pointer",color:C.textFaint,padding:6}}><Icon name="close" size={16}/></button>
        </div>))}
      </div></>)}

    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <SectionTitle t="Your notes"/>
      {signedIn && syncState!=="off" && <span style={{fontFamily:sans,fontSize:11,fontWeight:700,letterSpacing:0.3,color:syncState==="synced"?C.pine:C.textDim,display:"inline-flex",alignItems:"center",gap:5}}>
        {syncState==="synced" ? <><Icon name="check" size={13}/>Synced</> : "Backing up…"}</span>}
    </div>
    {notes.length===0
      ? <div style={{fontSize:13.5,color:C.textDim,lineHeight:1.6,marginBottom:18}}>No notes yet. Jot down what worked — technique, flies, the water read — and drop a pin at spots worth returning to. Your logs help tune the app's recommendations.</div>
      : <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>
          {notes.map(n=>(<div key={n.id} style={{background:C.panel,border:`1px solid ${C.lineSoft}`,borderRadius:11,padding:14}}>
            <div style={{display:"flex",alignItems:"baseline",gap:8}}><div style={{flex:1,fontFamily:serif,fontSize:16,fontWeight:700,color:C.pine}}>{n.title||"Untitled"}</div><span style={{fontSize:11.5,color:C.textFaint}}>{new Date(n.createdAt).toLocaleDateString([], {month:"short",day:"numeric"})}</span></div>
            {n.body && <div style={{fontSize:13.5,color:C.text,lineHeight:1.55,marginTop:6}}>{n.body}</div>}
            {(n.technique||n.flies||n.species||n.size) && <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:9}}>
              {n.technique && <span style={notePill}>{n.technique}</span>}{n.flies && <span style={notePill}>{n.flies}</span>}
              {n.species && <span style={notePill}>{n.species}</span>}{n.size && <span style={notePill}>{n.size}</span>}</div>}
            <div style={{display:"flex",gap:12,alignItems:"center",marginTop:11}}>
              {hasPin(n) && <a href={gmapsPinUrl(n)} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12.5,fontWeight:600,color:C.pine,textDecoration:"none"}}><Icon name="pin" size={15}/>Open in Google Maps</a>}
              <div style={{flex:1}}/>
              <button onClick={()=>onRemoveNote(n.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.textFaint,fontSize:12,textDecoration:"underline"}}>delete</button>
            </div>
          </div>))}
        </div>}

    {top && <div style={{background:`${C.cyanDeep}12`,border:`1px solid ${C.cyanDeep}33`,borderRadius:11,padding:13,marginBottom:12}}>
      <div style={{fontFamily:sans,fontSize:9.5,letterSpacing:1,textTransform:"uppercase",fontWeight:700,color:C.pine}}>Today's best read</div>
      <div style={{fontSize:14,color:C.text,marginTop:5}}><b style={{fontFamily:serif,fontSize:16,color:C.pine}}>{top.sec.river}</b> — opportunity {top.opportunity}/100 ({scoreWord(top.opportunity)}).</div></div>}
    <div style={{background:`${C.amber}14`,border:`1px solid ${C.amber}55`,borderRadius:11,padding:13}}>
      <div style={{fontFamily:sans,fontSize:9.5,letterSpacing:1,textTransform:"uppercase",fontWeight:700,color:C.amberDeep,marginBottom:6}}>Before you fish</div>
      <div style={{fontSize:13,color:C.text,lineHeight:1.55}}>Confirm open seasons, gear and limits in the current Ontario Fishing Regulations for the zone, plus waterbody exceptions and sanctuary closures. When water is warm, the kindest call is often not to target trout at all.</div>
    </div>
  </div>);
}

/* ============================ AUTH / PAYWALL UI =========================== */
function AccountButton({me,onClick}){
  const label=entitlementLabel(me);
  return (<button onClick={onClick} style={{fontFamily:sans,fontSize:10,fontWeight:700,letterSpacing:0.4,padding:"5px 10px",borderRadius:6,cursor:"pointer",border:`1px solid ${C.brass}`,background:"transparent",color:C.brass,whiteSpace:"nowrap"}}>{me&&me.user?label:"Sign in"}</button>);
}
function AvatarEditor({me,onAuth}){
  const [busy,setBusy]=useState(false),[err,setErr]=useState("");
  const fileRef=useRef(null);
  const cur=me&&me.user&&me.user.avatarUrl;
  const pick=async(e)=>{ const f=e.target.files&&e.target.files[0]; if(!f) return; setErr(""); setBusy(true);
    try{ const { url }=await cloudinaryUpload(f); await proxyJSON("/me",{method:"PATCH",body:{avatarUrl:url}}); await onAuth(); }
    catch(ex){ setErr(ex.message||"Couldn't upload — try again."); } finally{ setBusy(false); if(fileRef.current) fileRef.current.value=""; } };
  const remove=async()=>{ setBusy(true); try{ await proxyJSON("/me",{method:"PATCH",body:{avatarUrl:""}}); await onAuth(); }catch{} finally{ setBusy(false); } };
  return (<div style={{marginTop:16,paddingTop:14,borderTop:`2px dotted ${C.line}`}}>
    <div style={{fontFamily:sans,fontSize:10,letterSpacing:1,textTransform:"uppercase",fontWeight:700,color:C.brass,marginBottom:8}}>Profile picture</div>
    <div style={{display:"flex",alignItems:"center",gap:12}}>
      <Avatar src={cur} size={52}/>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{display:"none"}}/>
        <button disabled={busy} onClick={()=>fileRef.current&&fileRef.current.click()} style={{...btn,borderColor:C.pine,color:C.pine,padding:"8px 12px",opacity:busy?0.6:1}}>{busy?"Uploading…":cur?"Change":"Upload"}</button>
        {cur && <button disabled={busy} onClick={remove} style={{...btn,borderColor:C.line,color:C.textDim,padding:"8px 12px"}}>Remove</button>}
      </div>
    </div>
    {err && <div style={{fontSize:12,color:C.brick,marginTop:8,lineHeight:1.4}}>{err}</div>}
  </div>);
}
function DisplayNameEditor({me,onAuth}){
  const [name,setName]=useState((me&&me.user&&me.user.displayName)||"");
  const [saved,setSaved]=useState(false),[busy,setBusy]=useState(false);
  const inp={width:"100%",padding:"9px 11px",borderRadius:6,border:`1px solid ${C.line}`,background:C.bone,color:C.text,fontFamily:sans,fontSize:13.5,marginTop:8};
  const save=async()=>{ const n=name.trim(); if(!n) return; setBusy(true);
    try{ await proxyJSON("/me",{method:"PATCH",body:{displayName:n}}); setSaved(true); await onAuth(); setTimeout(()=>setSaved(false),2000); }catch{} finally{ setBusy(false); } };
  return (<div style={{marginTop:16,paddingTop:14,borderTop:`2px dotted ${C.line}`}}>
    <div style={{fontFamily:sans,fontSize:10,letterSpacing:1,textTransform:"uppercase",fontWeight:700,color:C.brass,marginBottom:2}}>Display name</div>
    <div style={{fontSize:11,color:C.textDim}}>Shown publicly on your posts. Your email is never shown.</div>
    <input style={inp} placeholder="e.g. Riverdog" value={name} maxLength={40} onChange={e=>setName(e.target.value)}/>
    <button disabled={busy} onClick={save} style={{...btn,borderColor:C.pine,color:C.pine,width:"100%",padding:"9px",marginTop:8,opacity:busy?0.6:1}}>{saved?"Saved ✓":busy?"Saving…":"Save name"}</button>
  </div>);
}
function BlockedAnglers(){
  const [list,setList]=useState(null);
  useEffect(()=>{ let live=true; proxyJSON("/users/blocked").then(d=>{ if(live) setList(d.blocked||[]); }).catch(()=>{ if(live) setList([]); }); return ()=>{live=false;}; },[]);
  if(!list||list.length===0) return null;
  const unblock=async(id)=>{ setList(prev=>prev.filter(b=>b.id!==id)); try{ await proxyJSON(`/users/${encodeURIComponent(id)}/block`,{method:"DELETE"}); }catch{} };
  return (<div style={{marginTop:16,paddingTop:14,borderTop:`2px dotted ${C.line}`}}>
    <div style={{fontFamily:sans,fontSize:10,letterSpacing:1,textTransform:"uppercase",fontWeight:700,color:C.brass,marginBottom:8}}>Blocked anglers</div>
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {list.map(b=>(<div key={b.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,fontSize:13,color:C.text}}>
        <span>{b.displayName}</span>
        <button onClick={()=>unblock(b.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.brick,fontSize:12,textDecoration:"underline"}}>Unblock</button>
      </div>))}
    </div>
  </div>);
}
function AlertPrefs(){
  const [p,setP]=useState(null);
  const [push,setPush]=useState("idle"); // idle|on|off|busy|denied|unsupported|unconfigured
  useEffect(()=>{ let live=true; proxyJSON("/alert-prefs").then(d=>{ if(live) setP(d); }).catch(()=>{}); return ()=>{live=false;}; },[]);
  useEffect(()=>{ let live=true; (async()=>{
    if(!pushSupported()){ if(live) setPush("unsupported"); return; }
    try{ const reg=await navigator.serviceWorker.ready; const sub=await reg.pushManager.getSubscription(); if(live) setPush(sub?"on":"off"); }
    catch{ if(live) setPush("off"); }
  })(); return ()=>{live=false;}; },[]);
  if(!p) return null;
  const save=(next)=>{ setP(next); proxyJSON("/alert-prefs",{method:"PUT",body:next}).catch(()=>{}); };
  const togglePush=async()=>{
    if(push==="on"){ setPush("busy"); await disablePush().catch(()=>{}); setPush("off"); return; }
    setPush("busy");
    try{ await enablePush(); setPush("on"); }
    catch(e){ const m=e&&e.message; setPush(m==="denied"?"denied":m==="unconfigured"?"unconfigured":m==="unsupported"?"unsupported":"off"); }
  };
  const note={fontSize:11,color:C.textDim,marginTop:6,lineHeight:1.45};
  return (<div style={{marginTop:16,paddingTop:14,borderTop:`2px dotted ${C.line}`}}>
    <div style={{fontFamily:sans,fontSize:10,letterSpacing:1,textTransform:"uppercase",fontWeight:700,color:C.brass,marginBottom:8}}>Condition alerts</div>
    <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:C.text,cursor:"pointer"}}>
      <input type="checkbox" checked={p.alertEmail} onChange={e=>save({...p,alertEmail:e.target.checked})}/> Email me when my water hits prime
    </label>
    <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:C.text,cursor:push==="busy"||push==="unsupported"||push==="unconfigured"?"default":"pointer",marginTop:10,opacity:push==="unsupported"||push==="unconfigured"?0.6:1}}>
      <input type="checkbox" checked={push==="on"} disabled={push==="busy"||push==="unsupported"||push==="unconfigured"} onChange={togglePush}/> Push notifications to this device
    </label>
    {push!=="unsupported"&&push!=="unconfigured" && <div style={note}>Covers prime-condition alerts and when someone likes or comments on your posts.</div>}
    {push==="denied" && <div style={note}>Notifications are blocked — enable them for this site in your browser settings.</div>}
    {push==="unsupported" && <div style={note}>This browser can't do push. On iPhone, add the app to your Home Screen first, then enable it here.</div>}
    {push==="unconfigured" && <div style={note}>Push isn't switched on for the server yet.</div>}
    <div style={{marginTop:12,fontSize:11,color:C.textDim,display:"flex",justifyContent:"space-between"}}><span>Alert threshold</span><span style={{fontFamily:mono,color:C.text}}>{p.alertThreshold}/100</span></div>
    <input type="range" min="50" max="95" value={p.alertThreshold} style={{width:"100%",marginTop:6}} onChange={e=>save({...p,alertThreshold:+e.target.value})}/>
    <div style={note}>Alerts fire for your saved water when its opportunity score crosses this threshold.</div>
  </div>);
}
function AuthModal({me,onClose,onAuth,onCheckout}){
  const signedIn=me&&me.user;
  const premium=isPremiumMe(me);
  const [mode,setMode]=useState("signin");
  const [email,setEmail]=useState(""),[pw,setPw]=useState(""),[err,setErr]=useState(""),[busy,setBusy]=useState(false);
  const inp={width:"100%",padding:"10px 12px",borderRadius:6,border:`1px solid ${C.line}`,background:C.bone,color:C.text,fontFamily:sans,fontSize:14,marginTop:8};
  const submit=async()=>{ setErr(""); setBusy(true);
    try{ const wasSignup=mode==="signup"; await proxyJSON(wasSignup?"/auth/signup":"/auth/login",{method:"POST",body:{email:email.trim(),password:pw}}); await onAuth(); onClose();
      // Onboarding: new accounts go straight to the card-required trial checkout.
      if(wasSignup&&onCheckout) onCheckout("annual"); }
    catch(e){ setErr(mode==="signup"?"That email may already be registered, or the password is under 8 characters.":"Email or password incorrect."); }
    finally{ setBusy(false); } };
  const logout=async()=>{ try{ await proxyJSON("/auth/logout",{method:"POST"}); }catch{} await onAuth(); onClose(); };
  const startCheckout=(plan)=>{ onClose(); if(onCheckout) onCheckout(plan); };
  const portal=async()=>{ setErr(""); try{ const {url}=await proxyJSON("/billing/portal",{method:"POST"}); if(url) window.location=url; }catch{ setErr("Couldn't open billing — try again."); } };
  return (<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(20,26,20,.55)",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center",padding:18}}>
    <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:380,maxHeight:"88vh",overflowY:"auto",background:C.panel,border:`1px solid ${C.line}`,borderRadius:14,padding:20,boxShadow:"0 12px 40px rgba(0,0,0,.35)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontFamily:serif,fontSize:19,fontWeight:700,color:C.pine}}>{signedIn?"Your account":mode==="signup"?"Create account":"Sign in"}</div>
        <button onClick={onClose} aria-label="Close" style={{background:"none",border:"none",cursor:"pointer",color:C.textDim,padding:2,display:"flex"}}><Icon name="close" size={20}/></button>
      </div>
      {err&&<div style={{marginTop:10,fontSize:12,color:C.brick,lineHeight:1.4}}>{err}</div>}
      {signedIn ? (<div style={{marginTop:12}}>
        <div style={{fontSize:13,color:C.text}}>{me.user.email}</div>
        <div style={{fontFamily:sans,fontSize:10,letterSpacing:1,textTransform:"uppercase",fontWeight:700,color:C.brass,marginTop:4}}>{entitlementLabel(me)}</div>
        {!premium ? (<div style={{marginTop:14}}>
          <div style={{fontSize:12,color:C.textDim,marginBottom:8,lineHeight:1.45}}>Start your 14-day free trial. Unlock the full ranked list, discovery, the fly advisor, and routes. No charge today.</div>
          <button onClick={()=>startCheckout("annual")} style={{...btn,borderColor:C.brick,background:C.brick,color:C.bone,width:"100%",padding:"10px"}}>Start trial — annual {planPrice("annual")}</button>
          <button onClick={()=>startCheckout("monthly")} style={{...btn,borderColor:C.line,color:C.pine,width:"100%",padding:"9px",marginTop:8}}>Monthly — {planPrice("monthly")}</button>
        </div>) : (<button onClick={portal} style={{...btn,borderColor:C.line,color:C.pine,width:"100%",padding:"9px",marginTop:14}}>Manage subscription</button>)}
        <AvatarEditor me={me} onAuth={onAuth}/>
        <DisplayNameEditor me={me} onAuth={onAuth}/>
        <BlockedAnglers/>
        <AlertPrefs/>
        <button onClick={logout} style={{...btn,borderColor:C.line,color:C.textDim,width:"100%",padding:"9px",marginTop:14}}>Sign out</button>
      </div>) : (<div style={{marginTop:12}}>
        <a href={`${API_BASE}/auth/google`} style={{...btn,borderColor:C.pine,color:C.pine,width:"100%",padding:"10px",display:"block",textAlign:"center",textDecoration:"none",boxSizing:"border-box"}}>Continue with Google</a>
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
function ProfileModal({userId,me,onClose,onOpenProfile,...postProps}){
  const [data,setData]=useState(null),[busy,setBusy]=useState(false);
  const load=useCallback(()=>{ setData(null); proxyJSON(`/users/${encodeURIComponent(userId)}/profile`).then(setData).catch(()=>setData({error:true})); },[userId]);
  useEffect(()=>{ load(); },[load]);
  const prof=data&&data.profile;
  const signedIn=!!(me&&me.user);
  const toggleFollow=async()=>{ if(!signedIn) return postProps.onSignIn&&postProps.onSignIn(); if(!prof) return; setBusy(true);
    try{ await proxyJSON(`/users/${encodeURIComponent(userId)}/follow`,{method:prof.isFollowing?"DELETE":"POST"});
      setData(d=>({...d,profile:{...d.profile,isFollowing:!d.profile.isFollowing,followerCount:d.profile.followerCount+(d.profile.isFollowing?-1:1)}}));
    }catch{} finally{ setBusy(false); } };
  const stat=(n,l)=>(<div style={{textAlign:"center"}}><div style={{fontFamily:serif,fontSize:18,fontWeight:700,color:C.pine}}>{n}</div><div style={{fontFamily:sans,fontSize:10,letterSpacing:0.5,textTransform:"uppercase",color:C.textFaint,fontWeight:700}}>{l}</div></div>);
  return (<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(20,26,20,.55)",zIndex:3400,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"calc(20px + env(safe-area-inset-top)) 12px 12px",overflowY:"auto"}}>
    <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:520,background:C.bg||C.bone,borderRadius:16,overflow:"hidden",boxShadow:"0 12px 40px rgba(0,0,0,.35)"}}>
      <div style={{background:C.panel,padding:"16px 16px 18px",borderBottom:`1px solid ${C.lineSoft}`}}>
        <div style={{display:"flex",justifyContent:"flex-end"}}><button onClick={onClose} aria-label="Close" style={{background:"none",border:"none",cursor:"pointer",color:C.textDim,padding:2,display:"flex"}}><Icon name="close" size={20}/></button></div>
        {!prof ? <div style={{padding:"10px 0",fontSize:13,color:C.textFaint,textAlign:"center"}}>{data&&data.error?"Couldn't load this angler.":"Loading…"}</div>
          : (<div style={{display:"flex",alignItems:"center",gap:14}}>
            <Avatar src={prof.avatarUrl} size={64}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:serif,fontSize:20,fontWeight:700,color:C.pine}}>{prof.displayName}</div>
              <div style={{display:"flex",gap:18,marginTop:8}}>{stat(prof.postCount,"Posts")}{stat(prof.followerCount,"Followers")}{stat(prof.followingCount,"Following")}</div>
            </div>
            {!prof.isMe && <button disabled={busy} onClick={toggleFollow} style={{...btn,padding:"9px 16px",borderColor:prof.isFollowing?C.line:C.brick,background:prof.isFollowing?"#fff":C.brick,color:prof.isFollowing?C.pine:C.bone,opacity:busy?0.6:1}}>{prof.isFollowing?"Following":"Follow"}</button>}
          </div>)}
      </div>
      <div style={{padding:"14px 14px 20px",maxHeight:"60vh",overflowY:"auto"}}>
        {data&&data.posts&&data.posts.length===0 && <div style={{fontSize:13,color:C.textDim,textAlign:"center",padding:"16px 0"}}>No posts yet.</div>}
        {data&&data.posts&&data.posts.map(p=><PostCard key={p.id} p={p} me={me} {...postProps} onOpenProfile={onOpenProfile}/>)}
      </div>
    </div>
  </div>);
}
const gateBtn={width:"100%",padding:"13px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:sans,fontSize:15,fontWeight:700,display:"block",boxSizing:"border-box"};
function ResetModal({token,onDone}){
  const [pw,setPw]=useState(""),[pw2,setPw2]=useState(""),[err,setErr]=useState(""),[busy,setBusy]=useState(false);
  const inp={width:"100%",padding:"12px 14px",borderRadius:8,border:`1px solid ${C.line}`,background:"#fff",color:C.text,fontFamily:sans,fontSize:16,marginTop:10,boxSizing:"border-box"};
  const submit=async()=>{ setErr("");
    if(pw.length<8){ setErr("Use at least 8 characters."); return; }
    if(pw!==pw2){ setErr("Those passwords don't match."); return; }
    setBusy(true);
    try{ await proxyJSON("/auth/reset",{method:"POST",body:{token,password:pw}}); onDone(); }
    catch{ setErr("This reset link is invalid or has expired — request a new one."); setBusy(false); } };
  return (<div style={{position:"fixed",inset:0,zIndex:8100,background:C.cyanDeep,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"calc(24px + env(safe-area-inset-top)) 22px calc(24px + env(safe-area-inset-bottom))",overflowY:"auto"}}>
    <div style={{width:"100%",maxWidth:380}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",marginBottom:18}}>
        <Avatar src="icons/crest.png" size={72}/>
        <div style={{fontFamily:serif,fontSize:21,fontWeight:700,color:"#EFE9DB",marginTop:12}}>Set a new password</div>
      </div>
      {err&&<div style={{fontSize:12.5,color:"#F3C0B5",marginBottom:6,lineHeight:1.4,textAlign:"center"}}>{err}</div>}
      <input style={inp} type="password" placeholder="new password (8+ characters)" value={pw} onChange={e=>setPw(e.target.value)}/>
      <input style={inp} type="password" placeholder="confirm password" value={pw2} onChange={e=>setPw2(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") submit(); }}/>
      <button disabled={busy} onClick={submit} style={{...gateBtn,background:C.brick,color:"#fff",marginTop:14,opacity:busy?0.6:1}}>{busy?"…":"Save & sign in"}</button>
    </div>
  </div>);
}
function SignInGate({onAuth,providers={}}){
  const [mode,setMode]=useState("signup"); // signup | signin | forgot
  const [email,setEmail]=useState(""),[pw,setPw]=useState(""),[err,setErr]=useState(""),[busy,setBusy]=useState(false),[showEmail,setShowEmail]=useState(false),[sent,setSent]=useState(false);
  const inp={width:"100%",padding:"12px 14px",borderRadius:8,border:`1px solid ${C.line}`,background:"#fff",color:C.text,fontFamily:sans,fontSize:16,marginTop:10,boxSizing:"border-box"};
  const oauth=(p)=>{ try{ sessionStorage.setItem("mkGate","1"); }catch{} window.location=`${API_BASE}/auth/${p}`; };
  const submit=async()=>{ setErr(""); setBusy(true);
    try{ await proxyJSON(mode==="signup"?"/auth/signup":"/auth/login",{method:"POST",body:{email:email.trim(),password:pw}}); await onAuth(); }
    catch(e){ setErr(mode==="signup"?"That email may already be registered, or the password is under 8 characters.":"Email or password incorrect."); setBusy(false); } };
  const sendReset=async()=>{ setErr(""); setBusy(true);
    try{ await proxyJSON("/auth/forgot",{method:"POST",body:{email:email.trim()}}); }catch{} finally{ setSent(true); setBusy(false); } };
  const link={background:"none",border:"none",color:"#EFE9DB",textDecoration:"underline",cursor:"pointer",fontSize:12.5};
  return (<div style={{position:"fixed",inset:0,zIndex:8000,background:C.cyanDeep,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"calc(24px + env(safe-area-inset-top)) 22px calc(24px + env(safe-area-inset-bottom))",overflowY:"auto"}}>
    <div style={{width:"100%",maxWidth:380}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",marginBottom:22}}>
        <Avatar src="icons/crest.png" size={84}/>
        <div style={{fontFamily:serif,fontSize:23,fontWeight:700,color:"#EFE9DB",marginTop:12}}>Muddy York Fishing</div>
        <div style={{fontFamily:sans,fontSize:13,color:"#B7C7B7",marginTop:6,lineHeight:1.5}}>Sign in to find the right water, morning by morning.</div>
      </div>
      {providers.google!==false && <button onClick={()=>oauth("google")} style={{...gateBtn,background:"#fff",color:"#2A2A2A"}}>Continue with Google</button>}
      {providers.apple && <button onClick={()=>oauth("apple")} style={{...gateBtn,background:"#000",color:"#fff",marginTop:10}}> Continue with Apple</button>}
      {!showEmail
        ? <button onClick={()=>setShowEmail(true)} style={{...gateBtn,background:"transparent",color:"#EFE9DB",border:"1px solid rgba(255,255,255,.3)",marginTop:10}}>Continue with email</button>
        : mode==="forgot"
          ? (<div style={{marginTop:14}}>
              {sent
                ? <div style={{fontSize:13,color:"#B7C7B7",lineHeight:1.5,textAlign:"center"}}>If an account exists for that email, we've sent a reset link. Check your inbox (and spam).</div>
                : (<>
                    <input style={inp} type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/>
                    <button disabled={busy} onClick={sendReset} style={{...gateBtn,background:C.brick,color:"#fff",marginTop:12,opacity:busy?0.6:1}}>{busy?"…":"Send reset link"}</button>
                  </>)}
              <div style={{textAlign:"center",marginTop:12,fontSize:12.5,color:"#B7C7B7"}}><button onClick={()=>{setMode("signin");setErr("");setSent(false);}} style={link}>Back to sign in</button></div>
            </div>)
          : (<div style={{marginTop:14}}>
            {err&&<div style={{fontSize:12.5,color:"#F3C0B5",marginBottom:6,lineHeight:1.4}}>{err}</div>}
            <input style={inp} type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}/>
            <input style={inp} type="password" placeholder="password (8+ characters)" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") submit(); }}/>
            <button disabled={busy} onClick={submit} style={{...gateBtn,background:C.brick,color:"#fff",marginTop:12,opacity:busy?0.6:1}}>{busy?"…":mode==="signup"?"Create account":"Sign in"}</button>
            {mode==="signin" && <div style={{textAlign:"center",marginTop:10}}><button onClick={()=>{setMode("forgot");setErr("");}} style={link}>Forgot password?</button></div>}
            <div style={{textAlign:"center",marginTop:12,fontSize:12.5,color:"#B7C7B7"}}>{mode==="signup"?"Already have an account? ":"New here? "}<button onClick={()=>{setMode(mode==="signup"?"signin":"signup");setErr("");}} style={link}>{mode==="signup"?"Sign in":"Create one"}</button></div>
          </div>)}
      <div style={{textAlign:"center",fontSize:11,color:"#8FA394",marginTop:18,lineHeight:1.5}}>Free to use. A membership unlocks the map, the full ranked list, discovery, the fly advisor and routes.</div>
    </div>
  </div>);
}
function NotifPanel({data,onClose,onGoNews,onOpenProfile}){
  const list=(data&&data.notifications)||[];
  const when=(iso)=>{ const s=Math.max(0,(Date.now()-new Date(iso).getTime())/1000);
    if(s<60) return "just now"; if(s<3600) return Math.floor(s/60)+"m ago"; if(s<86400) return Math.floor(s/3600)+"h ago"; return Math.floor(s/86400)+"d ago"; };
  const act=(n)=>{ if(n.type==="follow"&&n.actorId&&onOpenProfile) onOpenProfile(n.actorId); else onGoNews&&onGoNews(); };
  return (<div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(20,26,20,.5)",zIndex:3200,display:"flex",justifyContent:"flex-end",alignItems:"flex-start"}}>
    <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:380,maxHeight:"84vh",marginTop:"calc(8px + env(safe-area-inset-top))",marginRight:8,overflowY:"auto",background:C.panel,border:`1px solid ${C.line}`,borderRadius:14,boxShadow:"0 12px 40px rgba(0,0,0,.35)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",borderBottom:`1px solid ${C.lineSoft}`}}>
        <div style={{fontFamily:serif,fontSize:18,fontWeight:700,color:C.pine}}>Notifications</div>
        <button onClick={onClose} aria-label="Close" style={{background:"none",border:"none",cursor:"pointer",color:C.textDim,padding:2,display:"flex"}}><Icon name="close" size={20}/></button>
      </div>
      {list.length===0
        ? <div style={{padding:"22px 16px",fontSize:13.5,color:C.textDim,lineHeight:1.5}}>No notifications yet. When someone likes or comments on your posts, you'll see it here.</div>
        : list.map(n=>(<button key={n.id} onClick={()=>act(n)} style={{display:"flex",gap:11,alignItems:"flex-start",width:"100%",textAlign:"left",padding:"12px 16px",background:n.read?"transparent":`${C.brass}12`,border:"none",borderBottom:`1px solid ${C.lineSoft}`,cursor:"pointer"}}>
            <div style={{marginTop:1,color:n.type==="like"?C.brick:C.pine,display:"flex"}}><Icon name={n.type==="like"?"like":n.type==="follow"?"account":"comment"} size={18}/></div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13.5,color:C.text,lineHeight:1.45}}><b style={{color:C.pine}}>{n.actorName}</b> {n.type==="like"?"liked your post":n.type==="follow"?"started following you":"commented on your post"}{n.type==="comment"&&n.preview?`: "${n.preview}"`:""}</div>
              <div style={{fontFamily:sans,fontSize:11,color:C.textFaint,marginTop:2}}>{when(n.createdAt)}</div>
            </div>
          </button>))}
    </div>
  </div>);
}
// Shared Cloudinary signed direct-upload → returns { url, w, h }.
async function cloudinaryUpload(file){
  const sign=await proxyJSON("/posts/photo-sign",{method:"POST"});
  const fd=new FormData(); fd.append("file",file); fd.append("api_key",sign.apiKey);
  fd.append("timestamp",sign.timestamp); fd.append("folder",sign.folder); fd.append("signature",sign.signature);
  const r=await fetch(`https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`,{method:"POST",body:fd});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error((j&&j.error&&j.error.message)?`Photo upload failed: ${j.error.message}`:"Photo upload failed.");
  return { url:j.secure_url, w:j.width, h:j.height };
}
function Avatar({src,size=38}){
  return (<div style={{width:size,height:size,borderRadius:"50%",overflow:"hidden",flexShrink:0,border:`1px solid ${C.line}`,background:C.bone}}>
    {src ? <img src={src} alt="" loading="lazy" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/> : <Crest size={size}/>}
  </div>);
}
function loadStripeJs(){
  return new Promise((resolve,reject)=>{
    if(window.Stripe) return resolve(window.Stripe);
    const done=()=>window.Stripe?resolve(window.Stripe):reject(new Error("stripe unavailable"));
    const existing=document.querySelector("script[data-stripe-js]");
    if(existing){ existing.addEventListener("load",done); existing.addEventListener("error",()=>reject(new Error("stripe load failed"))); return; }
    const s=document.createElement("script");
    s.src="https://js.stripe.com/v3/"; s.async=true; s.setAttribute("data-stripe-js","1");
    s.onload=done; s.onerror=()=>reject(new Error("stripe load failed"));
    document.head.appendChild(s);
  });
}
function CheckoutModal({plan:initialPlan,onClose}){
  const [plan,setPlan]=useState(initialPlan||"annual");
  const [err,setErr]=useState(""),[loading,setLoading]=useState(true);
  const mountRef=useRef(null), ecRef=useRef(null), planRef=useRef(plan);
  planRef.current=plan;
  const trialDate=useMemo(()=>new Date(Date.now()+14*86400000).toLocaleDateString(undefined,{month:"long",day:"numeric"}),[]);
  const mount=useCallback(async()=>{
    setErr(""); setLoading(true);
    try{ ecRef.current&&ecRef.current.destroy(); }catch{} ecRef.current=null;
    if(mountRef.current) mountRef.current.innerHTML="";
    try{
      const Stripe=await loadStripeJs();
      const {publishableKey}=await proxyJSON("/billing/config");
      if(!publishableKey) throw new Error("no key");
      const stripe=Stripe(publishableKey);
      const ec=await stripe.initEmbeddedCheckout({ fetchClientSecret: async()=>{
        const {clientSecret}=await proxyJSON("/billing/checkout",{method:"POST",body:{plan:planRef.current}});
        return clientSecret;
      }});
      ecRef.current=ec;
      if(mountRef.current){ ec.mount(mountRef.current); setLoading(false); }
    }catch(e){ setErr("Checkout is unavailable right now — please try again. You can keep using the free plan meanwhile."); setLoading(false); }
  },[]);
  useEffect(()=>{ mount(); return ()=>{ try{ ecRef.current&&ecRef.current.destroy(); }catch{} }; },[mount]);
  const changePlan=(p)=>{ if(p===plan) return; setPlan(p); planRef.current=p; mount(); };
  const tabBtn=(p,label)=>(<button onClick={()=>changePlan(p)} style={{flex:1,fontFamily:sans,fontSize:13,fontWeight:700,padding:"9px 8px",borderRadius:8,cursor:"pointer",border:`1px solid ${plan===p?C.brick:C.line}`,background:plan===p?C.brick:"#fff",color:plan===p?C.bone:C.pine}}>{label}</button>);
  return (<div style={{position:"fixed",inset:0,background:"rgba(20,26,20,.72)",zIndex:9000,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
    <div style={{width:"100%",maxWidth:520,margin:"0 auto",minHeight:"100%",boxSizing:"border-box",background:C.panel,padding:"calc(18px + env(safe-area-inset-top)) 18px calc(40px + env(safe-area-inset-bottom))"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <div style={{fontFamily:serif,fontSize:21,fontWeight:700,color:C.pine}}>Start your free trial</div>
        <button onClick={onClose} aria-label="Close" style={{background:"none",border:"none",cursor:"pointer",color:C.textDim,padding:2,display:"flex"}}><Icon name="close" size={22}/></button>
      </div>
      <div style={{fontFamily:sans,fontSize:13,color:C.text,lineHeight:1.5,marginBottom:12}}>
        <b>You won't be charged today.</b> Billing starts after your 14-day free trial on {trialDate} — cancel anytime before then.
      </div>
      <div style={{display:"flex",gap:8,marginBottom:14}}>{tabBtn("annual",`Annual · ${planPrice("annual")}`)}{tabBtn("monthly",`Monthly · ${planPrice("monthly")}`)}</div>
      {err&&<div style={{fontSize:12.5,color:C.brick,lineHeight:1.45,marginBottom:12}}>{err}<button onClick={mount} style={{...btn,borderColor:C.brick,color:C.brick,marginLeft:8}}>Retry</button></div>}
      {loading&&!err&&<div style={{fontFamily:sans,fontSize:13,color:C.textDim,padding:"24px 0",textAlign:"center"}}>Loading secure checkout…</div>}
      <div ref={mountRef}/>
      <button onClick={onClose} style={{...btn,borderColor:C.line,color:C.textDim,width:"100%",padding:"12px",marginTop:16}}>Maybe later — continue on the free plan</button>
    </div>
  </div>);
}
function Locked({premium,onUpgrade,children,label="Upgrade to unlock"}){
  if(premium) return children;
  return (<div style={{position:"relative"}}>
    <div style={{filter:"blur(4px)",pointerEvents:"none",userSelect:"none",opacity:0.7}} aria-hidden="true">{children}</div>
    <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <button onClick={onUpgrade} style={{display:"inline-flex",alignItems:"center",gap:7,fontFamily:sans,fontSize:13,fontWeight:700,borderRadius:9,cursor:"pointer",borderStyle:"solid",borderWidth:1,borderColor:C.brick,background:C.brick,color:C.bone,padding:"10px 16px",boxShadow:"0 3px 12px rgba(0,0,0,.25)"}}><Icon name="lock" size={15}/>{label}</button>
    </div>
  </div>);
}

/* ============================ SUB-COMPONENTS =============================== */
function SectionTitle({n,t}){
  return (<div style={{display:"flex",alignItems:"center",gap:10,margin:"6px 0 14px"}}>
    <span style={{width:6,height:6,borderRadius:2,background:C.brass,transform:"rotate(45deg)",flexShrink:0}}/>
    <span style={{fontFamily:serif,fontSize:18,fontWeight:700,color:C.pine,letterSpacing:0.2}}>{t}</span>
    <span style={{flex:1,borderTop:`2px dotted ${C.line}`,height:0}}/></div>);
}
function MiniStat({label,value,sub}){
  return (<div>
    <div style={{fontFamily:serif,fontSize:22,fontWeight:700,color:scoreColor(value),fontVariantNumeric:"tabular-nums",lineHeight:1}}>{value}</div>
    <div style={{fontFamily:mono,fontSize:9,letterSpacing:0.8,textTransform:"uppercase",color:C.textDim,marginTop:3}}>{label}{sub&&<span style={{color:C.textFaint}}> · {sub}</span>}</div>
  </div>);
}
function ConditionsStrip({cond}){
  if(cond.air==null && cond.wind==null && cond.temp==null) return null;
  const DIRS=["N","NE","E","SE","S","SW","W","NW"];
  const dir=cond.windDir!=null?DIRS[Math.round(cond.windDir/45)%8]:"";
  const pt=cond.pressureTrend;
  const press=pt==null?null:(pt>1.5?"↑ rising":pt<-1.5?"↓ falling":"→ steady");
  const sky=cond.cloud==null?null:(cond.cloud>70?"Overcast":cond.cloud<30?"Clear":"Cloudy");
  const chip=(label,val)=>(<span key={label} style={{display:"inline-flex",gap:5,alignItems:"baseline"}}>
    <span style={{fontFamily:sans,fontSize:10,letterSpacing:0.6,textTransform:"uppercase",color:C.textFaint}}>{label}</span>
    <span style={{fontFamily:sans,fontSize:12,color:C.text,fontWeight:600}}>{val}</span></span>);
  return (<div style={{display:"flex",gap:14,flexWrap:"wrap",marginTop:12,padding:"9px 11px",background:C.bone,border:`1px solid ${C.lineSoft}`,borderRadius:8}}>
    {chip("Water",`${cond.temp.toFixed(0)}°C`)}
    {cond.air!=null && chip("Air",`${Math.round(cond.air)}°C`)}
    {cond.wind!=null && chip("Wind",`${Math.round(cond.wind)} km/h${dir?" "+dir:""}`)}
    {press && chip("Pressure",press)}
    {sky && chip("Sky",sky)}
    {chip("Flow",cond.flow)}
  </div>);
}
function MeasuredGauge({lat,lon}){
  const [g,setG]=useState(undefined); // undefined=loading | null=none | object
  useEffect(()=>{
    if(!API_BASE){ setG(null); return; }
    let live=true; setG(undefined);
    proxyJSON(`/api/conditions?lat=${lat}&lon=${lon}`)
      .then(d=>{ if(live) setG(d.gauge||null); })
      .catch(()=>{ if(live) setG(null); });
    return ()=>{ live=false; };
  },[lat,lon]);
  if(!g) return null;
  const ago=Math.max(0,Math.round((Date.now()-new Date(g.observedAt).getTime())/3600000));
  return (<div style={{marginTop:10,padding:"8px 11px",background:`${C.cyanDeep}12`,border:`1px solid ${C.cyanDeep}33`,borderRadius:8,fontSize:12,color:C.text,lineHeight:1.45}}>
    <span style={{fontFamily:sans,fontSize:9,letterSpacing:1,textTransform:"uppercase",fontWeight:700,color:C.pine}}>Measured · nearest gauge</span>
    <div style={{marginTop:3}}><b>{g.name}</b> · {g.distanceKm} km</div>
    <div style={{marginTop:2}}>Flow <b>{g.discharge} m³/s</b>{g.level!=null?<> · level <b>{g.level} m</b></>:null} <span style={{color:C.textFaint}}>· {ago===0?"just now":`${ago} h ago`}</span></div>
    <div style={{fontFamily:sans,fontSize:9.5,color:C.textFaint,marginTop:3}}>Live reading from Water Survey of Canada. Water temperature remains modeled.</div>
  </div>);
}
function DepthFish({sec,logged}){
  const [d,setD]=useState(undefined);
  useEffect(()=>{ let live=true; setD(undefined);
    const jobs=[ API_BASE?proxyJSON(`/api/bathymetry?lat=${sec.lat}&lon=${sec.lon}`).catch(()=>({bathy:null})):Promise.resolve({bathy:null}),
      API_BASE?proxyJSON(`/api/stocking?lat=${sec.lat}&lon=${sec.lon}`).catch(()=>({stocking:null})):Promise.resolve({stocking:null}) ];
    Promise.all(jobs).then(([b,s])=>{ if(!live) return;
      const sounded=b.bathy?b.bathy.maxDepthM:null;
      const w=(sec.water||"").toLowerCase();
      const hw=holdingWater({ isTailwater:/tailwater|below the dam|below a dam|fishway/i.test((sec.section||"")+" "+(sec.water||"")), waterType:w.includes("lake")?"lake":w.includes("stream")?"stream":"river", gradientPct:1, sinuosity:1.15, nearConfluence:false, belowLake:false, soundedMaxDepthM:sounded });
      const stock=s.stocking&&s.stocking.events&&s.stocking.events[0];
      const fish=estimateFish({ species:sec.species||[], holding:hw, stocking:stock?{species:stock.species,yearsAgo:stock.yearsAgo}:null, coldRetention:sec.h?sec.h.cold:60, month:new Date().getMonth(), logged });
      setD({hw,bathy:b.bathy,fish,stock}); });
    return ()=>{live=false;};
  },[sec.lat,sec.lon,logged]);
  if(d===undefined) return null;
  const {hw,bathy,fish,stock}=d;
  // Collapse to base common name (drop "(resident)"/"(lake-run)"/…) and de-dupe
  // case-insensitively — stocking data gives "Brown Trout" while reach species
  // give "Brown trout", which must count as the same fish.
  const spSeen=new Set(); const spNames=[];
  for(const s of fish.species){
    const base=(SPECIES[s.key]?SPECIES[s.key].name:String(s.key)).replace(/\s*\([^)]*\)\s*$/,"").trim();
    const norm=base.toLowerCase();
    if(!base||spSeen.has(norm)) continue; spSeen.add(norm);
    spNames.push(norm.charAt(0).toUpperCase()+norm.slice(1)); // consistent sentence case
  }
  return (<div style={{marginTop:10,padding:"10px 12px",background:`${C.cyanDeep}12`,border:`1px solid ${C.cyanDeep}33`,borderRadius:10}}>
    <div style={{fontFamily:sans,fontSize:9.5,letterSpacing:1,textTransform:"uppercase",fontWeight:700,color:C.pine,marginBottom:5}}>Depth &amp; likely fish · estimate</div>
    <div style={{fontSize:13.5,color:C.text,lineHeight:1.5}}>
      {bathy&&bathy.maxDepthM!=null ? <><b>{bathy.maxDepthM} m</b> deepest here (surveyed)</> : <>Holding water: <b>{hw.class.replace("-"," ")}</b> ({hw.poolScore}/100)</>}
      {hw.drivers.length>0 && <> — {hw.drivers.slice(0,2).join(", ")}</>}.
    </div>
    <div style={{fontSize:13.5,color:C.text,lineHeight:1.5,marginTop:4}}>
      Likely: <b>{spNames.slice(0,3).join(", ")}</b>. Fish size: <b>{fish.sizeClass}</b> · {fish.ageEstimate}.
      {stock && <span style={{color:C.textDim}}> Stocked {stock.species} ~{stock.yearsAgo} yr ago ({stock.distanceKm} km).</span>}
    </div>
    {logged && Array.isArray(logged.topSpecies) && logged.topSpecies.length>0 && (()=>{
      const parts=logged.topSpecies.map(t=>{ const sz=logged.sizeBySpecies&&logged.sizeBySpecies[t.species]; return sz?`${t.species} to ${sz.max}"`:t.species; });
      return (<div style={{fontSize:12.5,color:C.pine,fontWeight:600,marginTop:6,lineHeight:1.45}}>
        <Icon name="save" size={12}/> Anglers logging here: {parts.slice(0,3).join(", ")}{logged.count30d>0?` · ${logged.count30d} recent`:""}.</div>); })()}
    <div style={{fontSize:9.5,color:C.textFaint,marginTop:5,lineHeight:1.4}}>Depth from Ontario surveys where available, else modelled from river shape. Species and size sharpen as anglers log catches and notes.</div>
  </div>);
}
function CatchForm({sec, signedIn, compact}){
  const [open,setOpen]=useState(false); const [sp,setSp]=useState((sec.species&&sec.species[0])||"BNT");
  const [size,setSize]=useState(""); const [done,setDone]=useState(false); const [busy,setBusy]=useState(false);
  if(!API_BASE) return null;
  if(!signedIn) return (<div style={{marginTop:10,fontSize:12.5,color:C.textDim,lineHeight:1.5}}>Sign in to log a catch — it's free and helps everyone.</div>);
  if(done) return (<div style={{marginTop:10,fontSize:13,color:C.pine,fontWeight:600}}>Logged — thanks, it helps everyone.</div>);
  const submit=async()=>{ setBusy(true);
    try{ await proxyJSON("/catches",{method:"POST",body:{ref:sec.id,river:sec.river,section:sec.section,species:SPECIES[sp]?SPECIES[sp].name:sp,sizeInches:size?+size:null}}); setDone(true); }
    catch{ setBusy(false); } };
  const inp={padding:"9px 11px",borderRadius:8,border:`1px solid ${C.line}`,background:C.bone,color:C.text,fontFamily:sans,fontSize:14};
  const pillBtn={display:"inline-flex",alignItems:"center",gap:5,fontFamily:sans,fontSize:12,fontWeight:700,color:C.pine,border:`1px solid ${C.line}`,borderRadius:20,padding:"5px 11px",background:C.bone,cursor:"pointer",whiteSpace:"nowrap"};
  if(!open) return (<button onClick={()=>setOpen(true)} style={compact?pillBtn:{...btnBig,marginTop:10,borderColor:C.brass,color:C.pine}}><Icon name="plus" size={compact?13:15}/>Log a catch</button>);
  return (<div style={{marginTop:10,padding:12,background:C.panel,border:`1px solid ${C.line}`,borderRadius:10,...(compact?{width:"100%",boxSizing:"border-box"}:{})}}>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
      <select value={sp} onChange={e=>setSp(e.target.value)} style={inp}>{
        // Offer every species (you can catch anything), with this reach's likely
        // fish listed first. De-duplicated so the full list is always available.
        [...new Set([...(sec.species||[]),...Object.keys(SPECIES)])].map(k=><option key={k} value={k}>{SPECIES[k]?SPECIES[k].name:k}</option>)
      }</select>
      <input style={{...inp,width:110}} type="number" placeholder="size (in)" value={size} onChange={e=>setSize(e.target.value)}/>
      <button disabled={busy} onClick={submit} style={{...btnBig,background:C.pine,color:C.headText,borderColor:C.pine}}>{busy?"…":"Submit"}</button>
    </div>
    <div style={{fontSize:11,color:C.textFaint,marginTop:8,lineHeight:1.4}}>Attached to this reach only — never your exact location.</div>
  </div>);
}
function AdvHead({t}){ return <div style={{fontFamily:sans,fontSize:10,letterSpacing:1.2,textTransform:"uppercase",color:C.brass,fontWeight:700,marginBottom:6}}>{t}</div>; }
// The expanded fly/strategy content, shared by the card and the map panel.
function AdvisorPanel({ev,m}){
  const ref=useRef(null);
  const a=useMemo(()=>advise(ev,m),[ev,m]);
  useEffect(()=>{ if(ref.current) ref.current.scrollIntoView({behavior:"smooth",block:"nearest"}); },[]);
  const tag=(txt,strong)=>(<span style={{fontFamily:sans,fontSize:10,letterSpacing:0.5,padding:"1px 7px",borderRadius:3,
    border:`1px solid ${strong?C.brass:C.line}`,background:strong?`${C.brass}22`:C.bone,color:strong?C.brickDeep:C.textDim}}>{txt}</span>);
  return (<div ref={ref} style={{marginTop:12}}>
    <AdvHead t="Recommended techniques"/>
    <ul style={{margin:"0 0 14px",paddingLeft:18}}>
      {a.techniques.map((x,i)=><li key={i} style={{fontSize:12.5,color:C.text,marginBottom:3,lineHeight:1.45}}>{x}</li>)}
    </ul>
    <AdvHead t="Recommended flies"/>
    <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:14}}>
      {a.flies.map((f,i)=>(<div key={i}>
        <div style={{display:"flex",alignItems:"baseline",gap:7,flexWrap:"wrap"}}>
          <span style={{fontFamily:serif,fontSize:14.5,fontWeight:700,color:C.pine}}>{f.name}</span>
          {tag(f.size,true)}{tag(f.color)}
          <a href={gImages(f.name.split(" / ")[0]+" fly")} target="_blank" rel="noopener noreferrer"
            style={{display:"inline-flex",alignItems:"center",gap:4,fontFamily:sans,fontSize:11,fontWeight:700,letterSpacing:0.3,color:C.brick,textDecoration:"none",whiteSpace:"nowrap"}}><Icon name="search" size={13}/>See it</a>
        </div>
        <div style={{fontSize:12,color:C.textDim,marginTop:3,lineHeight:1.45}}>{f.reason}</div>
      </div>))}
    </div>
    {a.strategy.length>0 && (<><AdvHead t={SPECIES[ev.target].name+" strategy"}/>
      <div style={{marginBottom:a.note?12:0}}>
        {a.strategy.map((s,i)=>(<div key={i} style={{marginBottom:9}}>
          <div style={{fontFamily:sans,fontSize:10,letterSpacing:0.8,textTransform:"uppercase",fontWeight:700,color:C.brick,marginBottom:1}}>{s.label}</div>
          <div style={{fontSize:12.5,color:C.text,lineHeight:1.45}}>{s.text}</div>
        </div>))}
      </div></>)}
    {a.note && <div style={{padding:"9px 11px",background:`${C.brass}1f`,border:`1px solid ${C.brass}66`,borderRadius:8,fontSize:12,color:C.text,lineHeight:1.45}}>{a.note}</div>}
  </div>);
}
function Advisor({ev,m,premium=true,onUpgrade}){
  const [open,setOpen]=useState(false);
  return (<div style={{marginTop:14,paddingTop:12,borderTop:`2px dotted ${C.line}`}}>
    <button onClick={()=> premium ? setOpen(o=>{ if(!o) logEvent("view_reach",ev.sec.id,{via:"advisor"}); return !o; }) : (onUpgrade&&onUpgrade())} style={{display:"inline-flex",alignItems:"center",gap:7,fontFamily:sans,fontSize:12.5,letterSpacing:0.3,fontWeight:700,padding:"8px 12px",borderRadius:8,
      cursor:"pointer",background:C.bone,border:`1px solid ${C.brass}`,color:C.pine}}><Icon name={premium?"fly":"lock"} size={15}/>Strategy &amp; flies{premium && <Icon name="chevron" size={14} style={{transform:open?"rotate(180deg)":"none",transition:"transform .2s"}}/>}</button>
    {open && premium && <AdvisorPanel ev={ev} m={m}/>}
  </div>);
}
function SaveButton({saved,onClick}){
  return (<button onClick={onClick} style={{display:"inline-flex",alignItems:"center",gap:5,fontFamily:sans,fontSize:11.5,fontWeight:700,letterSpacing:0.3,padding:"5px 11px",borderRadius:20,cursor:"pointer",
    border:`1px solid ${saved?C.brass:C.line}`,background:saved?`${C.brass}22`:"#fff",color:saved?C.brickDeep:C.textDim,whiteSpace:"nowrap"}}>
    <Icon name="save" size={13}/>{saved?"Saved":"Save"}</button>);
}
function RecCard({ev,rank,m,dist,isSaved,onToggleSave,premium=true,onUpgrade,signedIn,logged,trend}){
  const sec=ev.sec, cd=ev.cond;
  const [panel,setPanel]=useState(null); // "adv" | "depth" | null
  const toggle=(p)=>setPanel(cur=>cur===p?null:p);
  const stat=(label,val,sub)=>(<div><span style={{fontFamily:sans,fontSize:9,letterSpacing:0.8,textTransform:"uppercase",fontWeight:700,color:C.textFaint}}>{label}</span> <b style={{fontFamily:serif,fontSize:15,color:C.pine}}>{val}</b>{sub?<span style={{fontSize:11,color:C.textDim}}> {sub}</span>:null}</div>);
  const bottomBtn=(active)=>({display:"flex",alignItems:"center",justifyContent:"center",gap:6,flex:1,fontFamily:sans,fontSize:12.5,fontWeight:700,padding:"10px",borderRadius:9,cursor:"pointer",border:`1px solid ${active?C.brass:C.line}`,background:active?`${C.brass}18`:C.bone,color:C.pine});
  return (<div style={{background:C.panel,border:`1px solid ${C.line}`,borderRadius:12,padding:16,marginBottom:12,position:"relative",overflow:"hidden"}}>
    <div style={{position:"absolute",top:0,left:0,width:4,height:"100%",background:scoreColor(ev.opportunity)}}/>
    {/* Header: clean — river, section, gauge (no No.X, no species pills) */}
    <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontFamily:serif,fontSize:18,fontWeight:700,color:C.pine}}>{sec.river}</span>
          {trend && trend.score>=0.6 && <span style={{display:"inline-flex",alignItems:"center",gap:4,fontFamily:sans,fontSize:10,fontWeight:800,letterSpacing:0.5,textTransform:"uppercase",color:C.brick,border:`1px solid ${C.brick}55`,background:`${C.brick}12`,borderRadius:20,padding:"2px 8px"}}><Icon name="fly" size={11}/>Trending</span>}
        </div>
        <div style={{fontSize:12.5,color:C.textDim,marginTop:2}}>{sec.section}{dist!=null?<span style={{color:C.textFaint,fontFamily:mono,fontSize:11}}> · {dist} km away</span>:null}</div>
      </div>
      <Gauge value={ev.opportunity} label="Opportunity"/>
    </div>
    <p style={{fontSize:13,color:C.text,lineHeight:1.55,margin:"12px 0 0"}}>{ev.explanation}</p>
    <ConditionsStrip cond={cd}/>
    {/* Score breakdown — moved directly under the conditions box */}
    <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.lineSoft}`}}>
      <div style={{display:"flex",gap:18,marginBottom:9,flexWrap:"wrap"}}>{stat("Overall",ev.overall)}{stat("Confidence",ev.confidence,confLabel(ev.confidence))}</div>
      <div style={{display:"flex",flexDirection:"column",gap:5}}>
        <Bar label="Weather" value={ev.parts.weather}/><Bar label="Water" value={ev.parts.water}/>
        <Bar label="Seasonal" value={ev.parts.seasonal}/><Bar label="Time" value={ev.parts.time}/>
        <Bar label="Habitat" value={ev.parts.habitat}/>
      </div>
    </div>
    {/* Three actions */}
    <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap",alignItems:"center"}}>
      {onToggleSave && <SaveButton saved={isSaved(sec.id)} onClick={()=>onToggleSave(sec)}/>}
      <a href={directionsUrl(sec.lat,sec.lon)} target="_blank" rel="noopener noreferrer" onClick={()=>logEvent("directions",sec.id)}
        style={{display:"inline-flex",alignItems:"center",gap:5,fontFamily:sans,fontSize:12,fontWeight:700,color:C.pine,textDecoration:"none",border:`1px solid ${C.line}`,borderRadius:20,padding:"5px 11px",background:C.bone,whiteSpace:"nowrap"}}><Icon name="map" size={13}/>Directions</a>
      <CatchForm sec={sec} signedIn={signedIn} compact/>
    </div>
    {/* Two expandable sections */}
    <div style={{display:"flex",gap:8,marginTop:12}}>
      <button onClick={()=> premium ? toggle("adv") : (onUpgrade&&onUpgrade())} style={bottomBtn(panel==="adv")}>
        <Icon name={premium?"fly":"lock"} size={15}/>Strategy &amp; flies{premium && <Icon name="chevron" size={13} style={{transform:panel==="adv"?"rotate(180deg)":"none",transition:"transform .2s"}}/>}</button>
      <button onClick={()=>toggle("depth")} style={bottomBtn(panel==="depth")}>
        <Icon name="pin" size={15}/>Depth &amp; fish<Icon name="chevron" size={13} style={{transform:panel==="depth"?"rotate(180deg)":"none",transition:"transform .2s"}}/></button>
    </div>
    {panel==="adv" && premium && <AdvisorPanel ev={ev} m={m}/>}
    {panel==="depth" && <DepthFish sec={sec} logged={logged}/>}
  </div>);
}
function NotesBlock({month,season,top,live,cached,manual,status,now}){
  const notes=[];
  const h=now.getHours();
  notes.push(`Reading for ${now.toLocaleDateString([], {weekday:"long",month:"long",day:"numeric"})}, ${now.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})} · ${season.toLowerCase()}.`);
  if(manual) notes.push("Planning mode: scenario values are applied to every river for what-if comparison.");
  else if(live) notes.push("Conditions are live per river: air temperature and rainfall pulled from current weather, water temperature modeled from those readings.");
  else if(cached) notes.push("Showing your last saved live readings while offline — reconnect and refresh for current numbers.");
  else notes.push("Live weather is unavailable, so the engine is running on seasonal climate norms — treat exact temperatures as estimates and refresh when back online.");
  if(season==="Summer") notes.push("Migratory steelhead and salmon are out of the tributaries; productive water is cold-holding resident trout in tailwater and spring-fed reaches.");
  if(season==="Fall") notes.push("Chinook lead the fall push (late Aug–Sep), then coho, lake-run browns and staging steelhead. A fresh rain that bumps and stains flows is the trigger.");
  if(season==="Spring") notes.push("Peak steelhead window — fish move on rising, dropping water. Time outings to the back of a high-water event.");
  if(season==="Winter") notes.push("Overwintering steelhead hold in deeper, slower, oxygen-rich water; larger tailrace-fed systems stay fishable when small creeks lock up.");
  if(live && (h>=5&&h<8 || h>=19&&h<22)) notes.push("Low-light window right now — the most productive feeding period of the day.");
  if(live && season==="Summer" && h>=11 && h<16) notes.push("Midday summer sun: fish are deep, shaded or holding in faster oxygenated water until evening.");
  if(top) notes.push(`Strongest read right now: ${top.sec.river} — ${top.sec.section}.`);
  return (<div style={{background:C.panel,border:`1px solid ${C.lineSoft}`,borderRadius:10,padding:14,marginBottom:24}}>
    {notes.map((n,i)=>(<p key={i} style={{margin:i?"10px 0 0":0,fontSize:12.5,color:C.text,lineHeight:1.55,paddingLeft:14,position:"relative"}}>
      <span style={{position:"absolute",left:0,color:C.brass}}>›</span>{n}</p>))}
  </div>);
}
function Outlook({month}){
  const rows=[];
  for(let k=0;k<4;k++){ const mm=(month+k)%12; let label;
    const s=seasonOf(mm);
    if(s==="Fall") label="chinook → coho → lake-run brown → staging steelhead";
    else if(s==="Spring") label="steelhead run (peak) + early resident trout";
    else if(s==="Winter") label="overwintering steelhead in larger systems";
    else label="resident brook & brown trout in cold water";
    rows.push({mo:MONTHS[mm],label,here:k===0}); }
  return (<div style={{marginBottom:24}}>
    {rows.map((r,i)=>(<div key={i} style={{display:"flex",gap:12,alignItems:"baseline",padding:"10px 0",borderBottom:i<3?`1px dotted ${C.line}`:"none"}}>
      <span style={{fontFamily:mono,fontSize:11,width:34,color:r.here?C.cyan:C.textDim}}>{r.mo}</span>
      <span style={{fontSize:12.5,color:r.here?C.text:C.textDim}}>{r.label}</span></div>))}
  </div>);
}
function Method({logCount}){
  const rows=[
    ["Habitat quality","25%","Cold-water retention, holding water, structure, oxygen, spawning gravel, groundwater."],
    ["Seasonal suitability","20%","How in-season the best available species is, from monthly run-timing curves."],
    ["Current conditions","20%","Live air temp → modeled water temp, flow fit, post-rain freshness, time of day."],
    ["Historical success","15%","Encoded long-run productivity of the reach."],
    ["Recent reports","10%","Public-report signal, decayed by age (24-month ceiling)."],
    ["Water conditions","10%","Level and clarity suitability."],
  ];
  return (<div>
    <p style={{fontSize:13,color:C.text,lineHeight:1.6,margin:"0 0 16px"}}>
      Each section gets an <b>Overall Score</b> (season-independent quality), a <b>Current Opportunity Score</b> (recomputed live for the moment you open the app), and a <b>Confidence</b> rating. Opportunity is the weighted sum below; habitat + history + conditions make up <b>70%</b>, public reports only <b>10%</b>.</p>
    {rows.map(([a,b,c])=>(<div key={a} style={{display:"flex",gap:12,padding:"11px 0",borderBottom:`1px dotted ${C.line}`}}>
      <span style={{fontFamily:mono,fontSize:13,color:C.cyan,width:42}}>{b}</span>
      <div><div style={{fontSize:13,color:C.text,fontWeight:500}}>{a}</div>
        <div style={{fontSize:12,color:C.textDim,marginTop:2,lineHeight:1.5}}>{c}</div></div></div>))}
    <div style={{marginTop:20,padding:14,background:C.panel,border:`1px solid ${C.line}`,borderRadius:10}}>
      <div style={{fontFamily:mono,fontSize:10,letterSpacing:1,textTransform:"uppercase",color:C.cyan,marginBottom:8}}>On this device</div>
      <p style={{fontSize:12.5,color:C.text,lineHeight:1.55,margin:0}}>
        The river database, your last weather pull, your saved location and an analysis log are stored on this iPhone in the app's own on-device database — nothing leaves the phone except the weather request itself. The app keeps showing your last-known readings even with no signal, and logs a snapshot of its top picks over time (currently <b style={{color:C.cyan}}>{logCount}</b> {logCount===1?"entry":"entries"}) — the seed of a learning record that grows the more you use it. Storage is requested as persistent so iOS keeps it between sessions; installing the app to your Home Screen is what protects it from being cleared.</p>
    </div>
    <div style={{marginTop:14,padding:14,background:`${C.cyanDeep}1a`,border:`1px solid ${C.cyanDeep}55`,borderRadius:10}}>
      <div style={{fontFamily:mono,fontSize:10,letterSpacing:1,textTransform:"uppercase",color:C.cyan,marginBottom:8}}>How the report is read</div>
      <p style={{fontSize:12.5,color:C.text,lineHeight:1.55,margin:0}}>
        Air temperature and rainfall are fetched live per river from Open-Meteo and refresh every 30 minutes. Water temperature is <b>modeled</b> from a multi-day air-temp average damped by each reach's cold-water retention — there's no public real-time temperature gauge on most of these rivers. Flow is <b>estimated</b> from recent rainfall; wiring in true Water Survey of Canada gauge data needs a small backend proxy because browsers block those endpoints directly. Persistent learning (storing analyses, tuning confidence over time) also needs a database. The DATA / ENGINE / LIVE / UI split means each of those upgrades drops in without touching the scoring logic.</p>
    </div>
    <div style={{marginTop:14,padding:14,background:`${C.amber}14`,border:`1px solid ${C.amber}55`,borderRadius:10}}>
      <div style={{fontFamily:mono,fontSize:10,letterSpacing:1,textTransform:"uppercase",color:C.amber,marginBottom:8}}>Before you fish</div>
      <p style={{fontSize:12.5,color:C.text,lineHeight:1.55,margin:0}}>
        Always confirm open seasons, gear and limits in the current Ontario Fishing Regulations Summary for the relevant zone — FMZ 16 and 17 around Toronto, FMZ 13/14 for Georgian Bay tributaries — plus waterbody exceptions and seasonal sanctuary (spawning) closures. Several reaches here, including Twelve Mile Creek and the upper Credit, carry special rules. When water is warm, the kindest call is often not to target trout at all.</p>
    </div>
  </div>);
}
function Footer(){
  return (<div style={{marginTop:28,paddingTop:16,borderTop:`2px dotted ${C.line}`,fontSize:11,color:C.textFaint,lineHeight:1.6}}>
    Habitat and run-timing records are researched estimates for planning, not a substitute for on-the-water judgement or official regulations. Parking, driving and walking routes are drawn from OpenStreetMap and OSRM as a convenience — always confirm access and legality on site.</div>);
}

/* ------------------------------- PWA MOUNT -------------------------------- */
const _root=document.getElementById("root");
if(_root) createRoot(_root).render(<App/>);
if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{ navigator.serviceWorker.register("./sw.js").catch(()=>{}); });
}
