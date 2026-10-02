// Technique picker for the "Strategy & flies" advisor.
//
// Every technique earns points from the live read: water temperature, flow and
// clarity, light (cloud cover and time of day), wind, pressure trend, season,
// the target species and the kind of water. The best score wins and the
// runner-up is offered as a change-up. Each point comes with a reason, so the
// "why" text explains the actual call instead of repeating one stock line.

export const TECHNIQUES = {
  nymphing: "Nymphing",
  eggs: "Drifting eggs",
  swing: "Swinging flies",
  streamer: "Stripping streamers",
  "dry-dropper": "Dry-dropper",
  dry: "Dry fly",
};

// Light: dawn/dusk window, bright, or dull. `now` and sun times are Dates/ISO.
export function lightOf({ now = new Date(), sunrise, sunset, cloud } = {}) {
  const t = new Date(now).getTime();
  let lowSun = false;
  if (sunrise && sunset) {
    const r = new Date(sunrise).getTime(), s = new Date(sunset).getTime(), w = 90 * 60000;
    lowSun = Math.abs(t - r) <= w || Math.abs(t - s) <= w || t < r || t > s;
  } else {
    const h = new Date(now).getHours();
    lowSun = h < 8 || h >= 18;
  }
  const overcast = cloud != null && cloud >= 70;
  const bright = !lowSun && cloud != null && cloud < 30;
  return { lowSun, overcast, bright, dull: lowSun || overcast };
}

// input: { temp, flow, cloud, wind, pressureTrend, sunrise, sunset, now,
//          species (code), run (bool, fish are running), season, water (text) }
export function rankTechniques(input) {
  const { temp: t, flow, wind, pressureTrend: pt, species, run, season } = input;
  const light = lightOf(input);
  const water = String(input.water || "").toLowerCase();
  const tailwater = water.includes("tailwater");
  const smallCold = /headwater|spring|cold|brook/.test(water);
  const stained = flow === "High / stained", blown = flow === "Blown out", clear = flow === "Low / clear";
  const cold = t < 8, cool = t >= 8 && t < 13, prime = t >= 13 && t <= 18, warm = t > 18;
  const calm = wind == null || wind < 15, windy = wind != null && wind >= 25;
  const falling = pt != null && pt <= -1.5, rising = pt != null && pt >= 1.5;
  const browns = species === "BNT" || species === "BNTr";

  const S = {};
  const add = (tech, pts, why) => { (S[tech] ||= { tech, score: 0, reasons: [] }); S[tech].score += pts; if (why && pts > 0) S[tech].reasons.push({ pts, why }); };

  if (run) {
    add("eggs", 55);
    add("swing", 50);
    add("streamer", 40);
    add("nymphing", 45);
    if (stained) { add("eggs", 20, "colour in the water lets fish feed confidently on a drifted egg"); add("streamer", 15, "stained water hides the leader and suits a big profile"); add("swing", -10); }
    if (blown) { add("streamer", 40, "the river is blown out, so only a big, dark streamer on the soft edges gets seen"); add("eggs", -20); add("swing", -25); add("nymphing", -25); }
    if (clear) { add("nymphing", 15, "low, clear water spooks fish, so go small on light tippet"); add("eggs", -5); add("swing", 5); add("streamer", -15); }
    if (flow === "Normal") add("swing", 15, "steady, fishable flow lets a swung fly cover the most fish");
    if (light.dull) { add("swing", 12, light.lowSun ? "fresh fish chase a swung fly in the low light of dawn and dusk" : "overcast skies make fish move to a swung fly"); add("streamer", 8); }
    if (light.bright) { add("eggs", 8, "bright sun pushes fish deep, so dead-drift right on the bottom"); add("nymphing", 6); add("swing", -8); }
    if (t < 4) { add("eggs", 15, "near-freezing water means fish won't move far, so drift it to them"); add("nymphing", 10); add("swing", -20); add("streamer", -10); }
    else if (t >= 5 && t <= 12 && species === "STL") add("swing", 12, "prime steelhead temperatures for a swung fly");
    if (species === "COH") { add("streamer", 30, "coho hit a stripped streamer hard"); add("swing", -5); }
    if (species === "CHN") { add("eggs", 10, "chinook rarely chase, so a drifted egg right in front of them is the best shot"); add("swing", -5); }
    if (browns) add("streamer", 12, "lake-run browns are predators and hit a streamer");
    if (falling) add("streamer", 8, "falling pressure turns fish aggressive");
  } else {
    add("nymphing", 52);
    add("dry-dropper", 46);
    add("streamer", 38);
    add("dry", 30);
    if (cold) { add("nymphing", 20, "cold water keeps trout deep and slow, so get the flies on the bottom"); add("dry", -30); add("dry-dropper", -18); add("streamer", -5); }
    if (cool) { add("dry-dropper", 10, "cool, comfortable water has trout feeding through the column"); add("nymphing", 5); }
    if (prime) { add("dry", 22, "prime water temperature has trout looking up"); add("dry-dropper", 14, "prime water temperature covers the top and the drift below"); add("nymphing", -6); }
    if (warm) { add("dry-dropper", 15, "warm water means fishing only early and late, light and high in the column"); add("dry", 8); add("streamer", -15); add("nymphing", -5); }
    if (stained) { add("streamer", 28, "rising, stained water has trout hunting the edges, where a streamer gets noticed"); add("dry", -25); add("dry-dropper", -12); add("nymphing", 6); }
    if (blown) { add("streamer", 40, "the river is blown out, so work a big, dark streamer through the slack water"); add("dry", -40); add("dry-dropper", -30); add("nymphing", -15); }
    if (clear) { add("dry", 10, "low, clear water calls for a small dry on a long, fine leader"); add("nymphing", 4); add("streamer", -14); }
    if (light.lowSun) { add("streamer", 14, "bigger trout leave cover to hunt in the low light of dawn and dusk"); add("dry", 10, "the evening and morning windows bring fish up"); }
    if (light.overcast && !cold && (season === "Spring" || season === "Fall")) add("dry", 12, "cool, cloudy weather is prime for a Blue-Winged Olive hatch");
    else if (light.overcast) add("streamer", 8, "overcast skies make trout less wary");
    if (light.bright) { add("nymphing", 8, "bright, high sun keeps trout deep in the shade and seams"); add("dry", -6); add("streamer", -10); }
    if (windy) { add("dry", -15); add("streamer", 6); add("nymphing", 4); }
    else if (calm && prime) add("dry", 6, "calm air for a clean, drag-free dry");
    if (falling) { add("streamer", 10, "falling pressure ahead of weather makes trout feed hard"); add("dry", 4); }
    if (rising) add("nymphing", 6, "rising pressure after a front sends fish deep and makes them picky");
    if (browns && season === "Fall") add("streamer", 12, "fall browns get territorial before the spawn");
    if (season === "Summer" && !cold) add("dry-dropper", 8, "summer terrestrials make a hopper with a nymph below deadly");
    if (tailwater) { add("nymphing", 8, "steady, cold tailwater flows are classic nymph water"); add("dry", 4); }
    if (smallCold) { add("dry-dropper", 10, "brookies and wild browns in small, cold headwaters rise readily"); add("streamer", -8); }
  }

  const ranked = Object.values(S).sort((a, b) => b.score - a.score || a.tech.localeCompare(b.tech));
  ranked.forEach((r) => r.reasons.sort((a, b) => b.pts - a.pts));
  return ranked;
}

// "Because ..." sentence from the strongest reasons.
export function reasonText(choice, max = 2) {
  const rs = choice.reasons.slice(0, max).map((r) => r.why);
  if (!rs.length) return null;
  const s = rs.join(", and ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
}
