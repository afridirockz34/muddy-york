// Editorial posts shipped with the code. seedBlogPosts() creates any that are
// missing (matched by slug) and never touches a post that already exists, so
// edits made later in the admin editor always win.
//
// Facts come from the Ontario Fishing Regulations Summary (synced into
// src/data/regs-zones.json) and the province's species pages. Cover photos are
// public domain or CC licensed from Wikimedia Commons, served from /img/blog/.

const IMG = "/img/blog"; // served by Netlify from the repo root

export const SEED_POSTS = [
  {
    slug: "ontario-salmon-run-week-by-week",
    title: "Ontario Salmon Run: A Week by Week Guide",
    excerpt: "When the Chinook salmon run starts, peaks and ends on Lake Ontario rivers, where to watch it, and the rules that change during the run.",
    coverUrl: `${IMG}/salmon-run.jpg`,
    coverAlt: "A Chinook salmon leaping up a waterfall during its fall spawning run",
    publishedAt: "2026-10-06T13:00:00Z",
    body: `Every fall, Chinook salmon leave Lake Ontario and push up the rivers they were stocked in or born in. For a few weeks you can stand on a bridge in Port Hope, Bowmanville or Toronto and watch fish the length of your arm throw themselves at a waterfall. Here is how the run unfolds, week by week, and what to know before you go.

## Why salmon run up Ontario rivers

Chinook salmon are not native to the Great Lakes. They were introduced and are now naturalized, and the province describes them as fish that [gather at the mouth of rivers in late summer and early fall before migrating upstream to spawn](https://www.ontario.ca/page/chinook-salmon). Like all Pacific salmon, a Chinook spawns once and dies. That is why the end of the run leaves dead fish along the banks, and why every fish you see in October is on a one way trip.

Coho salmon run the same rivers in smaller numbers, usually a little later. Atlantic salmon are being restored to Lake Ontario through the [Bring Back the Salmon](https://www.bringbackthesalmon.ca) program, and in the tributaries of Zones 16 and 17 they are catch and release only, with a limit of zero.

## Late July and August: staging at the river mouths

The run starts out in the lake. Mature Chinook gather off the mouths of their home rivers through August, and anglers fish for them from piers and harbour walls in places like Port Credit, Bronte and Port Hope. Very few fish have entered the rivers yet. If you only want to watch, it is too early.

What moves them is water. A good rain raises and cools the river, and the first fish push in on that bump in flow. A dry August can hold them in the lake for weeks.

## Early to mid September: the first push

After the first real rain of September, fish start showing in the lower river and at the first barriers. In a wet year this can happen by Labour Day. Fish move mostly at night and in the low light of morning, then hold in the deeper pools during bright days.

This is the time to check the rules for the river you plan to fish. Several Toronto area rivers have stretches that turn into fish sanctuaries during the run. On the Credit River, the water from Highway 403 up to Britannia Road in Streetsville is closed from August 15 to December 31. The details for each spot are on our [salmon run pages](/salmon-run/).

## Mid September to mid October: peak run

On most Lake Ontario tributaries the run peaks from about the third week of September to the middle of October. This is when the fish ladders are busiest:

- **Port Hope:** the fish ladder at Corbett Dam on the Ganaraska River. See the [Port Hope salmon run guide](/salmon-run/port-hope-ganaraska-river/).
- **Toronto:** the weirs on the Humber River at Old Mill. See the [Humber River at Old Mill](/salmon-run/humber-river-old-mill-toronto/).
- **Bowmanville:** the fish ladder on Bowmanville Creek. See [Bowmanville salmon run](/salmon-run/bowmanville-creek/).
- **Mississauga:** Erindale Park on the Credit. See [Credit River salmon run in Mississauga](/salmon-run/credit-river-mississauga/).
- **Owen Sound:** below the Mill Dam on the Sydenham River, on the Georgian Bay side. See [Owen Sound salmon run](/salmon-run/owen-sound-sydenham-river/).

Fish move in waves. A day after rain can be full of jumping fish, and three dry days later the same ladder can look empty. If you want to see salmon jump, go one or two days after a rain, early in the morning.

> Want to know when a river is rising? [Muddy York Fishing](/) shows live flow, water temperature and today's season status for 30+ Southern Ontario rivers. Try it free for 7 days.

## Late October and November: the tail end

By late October most Chinook have spawned. You will see spawned out fish with white, frayed fins, and dead fish on the gravel bars. This is not a sign of a problem; it is how the run ends.

The rivers do not go quiet, though. Steelhead and lake run brown trout follow the salmon in to feed on loose eggs, and the fall steelhead season starts in earnest. Our [steelhead guide](/guides/steelhead-fishing-ontario/) covers that next chapter.

## Fishing the run the right way

Salmon in the river are spawning fish, and the rules reflect that.

1. **No snagging.** Ontario's general regulations prohibit catching or keeping a fish by hooking it anywhere other than the mouth, and a fish hooked that way [must be released immediately](https://www.ontario.ca/document/ontario-fishing-regulations-summary/general-fishing-regulations).
2. **Know the stretch.** Seasons change at bridges, rail lines and dams. A spot that is open all year can be 100 metres from one that is closed.
3. **Stay off the gravel.** Spawning beds (redds) are the light, cleaned patches of gravel. Wading through them crushes eggs for the next generation.
4. **Give fish room at barriers.** Fish stacked below a ladder or dam are exhausted. Many barriers have closed zones around them for this reason.

## Bring the right gear for watching

You do not need a licence to watch. Polarized sunglasses help you see fish under the glare. Wear boots with grip, since river banks in fall are muddy and leaf covered. Keep dogs leashed and back from the edge, and stay behind railings at fish ladders.

## Quick answers

**When is the salmon run in Ontario?** Mostly mid September to mid October on Lake Ontario tributaries, with fish staging off river mouths from August and stragglers into November.

**Where is the best place to see the salmon run near Toronto?** The Humber River at Old Mill is the easiest, a short walk from Old Mill subway station. Port Hope and Bowmanville have fish ladders that are worth the drive.

**Can I keep a salmon I catch in a river?** In open water, yes, within your licence limits (Pacific salmon are S-5 and C-2 in Zones 16 and 17), but only if it was hooked in the mouth. Atlantic salmon must be released.

For the full picture of rivers, timing and rules, read our [Ontario salmon run guide](/guides/salmon-run-ontario/), or open the [Muddy York Fishing app](/) to see which rivers are rising today.

*Cover photo: Chinook salmon jumping, U.S. Fish and Wildlife Service, via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:SALMON_JUMPING_AT_DAM_(51163352177).jpg). Public domain.*`,
  },
  {
    slug: "where-to-find-brown-trout-in-ontario",
    title: "Where to Find Brown Trout in Ontario",
    excerpt: "The water brown trout live in, the Ontario rivers known for them, and when to fish, from spring tailwaters to fall lake run browns.",
    coverUrl: `${IMG}/brown-trout.jpg`,
    coverAlt: "A brown trout with dark spots and a golden belly",
    publishedAt: "2026-10-05T13:00:00Z",
    body: `Brown trout are the fish many Ontario fly anglers chase longest and catch least. They are wary, they feed hardest when most people have gone home, and the big ones live in water that is easy to walk past. This guide covers the kinds of water that hold them, the rivers that are known for them, and how the year shapes where they will be.

## A European fish that made Ontario home

Brown trout are not native to North America. According to the province, they were [introduced into Ontario streams from Europe in 1913](https://www.ontario.ca/page/brown-trout) and are now found throughout the Great Lakes, their tributaries and streams across Southern Ontario. They tolerate slightly warmer water than brook trout, which is why they hold on in rivers that run through farmland and towns.

There are two kinds you will meet:

- **River resident browns** that spend their lives in one stretch of stream.
- **Great Lakes browns** that grow large in Lake Ontario or Georgian Bay and run up the tributaries in the fall.

The Ontario record is 15.6 kilograms. Most river browns are 25 to 45 centimetres.

## Five kinds of water that hold brown trout

### 1. Undercut banks and wood

Brown trout want a roof over their heads. Look for banks where the current has cut underneath, fallen trees, root wads and log jams. A good brown can live under a single sunken tree for years.

### 2. Tailwaters below bottom draw dams

Dams that release cold water from the bottom of a reservoir create a long stretch of cool, stable, insect rich water downstream. The [Grand River below Shand Dam](/rivers/grand-river-tailwater-shand-dam-to-west-montrose/) is Ontario's best known example, with special regulations on the Fergus, Elora and West Montrose stretches. The [Conestogo River below its dam](/rivers/conestogo-river-tailwater-below-conestogo-dam/) works the same way.

### 3. Cold, spring fed middle reaches

Groundwater keeps some reaches cool through July and August. The [Credit River from Norval to Glen Williams](/rivers/credit-river-middle-norval-to-glen-williams/) and the [upper Credit at the Forks](/rivers/credit-river-upper-forks-of-the-credit-belfountain/) hold resident browns for this reason.

### 4. The heads and tails of pools

Fish sit where food arrives and they can rest. That is usually the seam at the head of a pool, where fast water meets slow, and the tail, where the pool shallows before the next riffle. In low light, big browns slide up into the shallow tails to feed.

### 5. Piers and river mouths in the fall

The Great Lakes browns gather off river mouths and harbour walls from September on. The province notes that you will find them in [shallower water than rainbow trout and Chinook salmon](https://www.ontario.ca/page/brown-trout) and suggests small spinners, plugs and baits under floats once they enter the rivers.

> [Muddy York Fishing](/) ranks Ontario trout rivers every morning on water temperature, flow and season status, and shows the stretches that hold browns. Free for 7 days.

## When to fish for brown trout

**Spring (fourth Saturday in April to May).** The trout season opens in Zones 16 and 17 on the fourth Saturday in April. Water is high and cold, and browns are hungry. Streamers and nymphs fished slow and deep work well. See our [trout opener guide](/guides/ontario-trout-opener/).

**Late spring and early summer.** This is hatch season on the Grand tailwater and the Credit. Evenings with mayflies and caddis can bring big browns to the surface.

**Mid summer.** Water warms. Fish early and late, and stop when the water passes about 20 °C. Trout caught in warm water struggle to recover. Many anglers carry a stream thermometer for this reason.

**Fall.** The regular trout season in Zones 16 and 17 closes on September 30, but many lower tributary stretches stay open longer for brown trout, rainbow trout and salmon. This is when the lake run browns arrive. Check the exact stretch before you fish; our [Zone 16](/regulations/zone-16/) and [Zone 17](/regulations/zone-17/) pages list them.

## How to fish for them

Brown trout, the province says, [feed most aggressively at night](https://www.ontario.ca/page/brown-trout). You do not need to fish in the dark, but the first and last hours of light are when the biggest fish move. A few habits help:

- **Move slowly and stay low.** A brown that sees you will not eat.
- **Fish upstream** with nymphs and dry flies, so you come up behind the fish.
- **Swing or strip streamers** past cover on overcast days and in stained water after rain.
- **Rest a spot** after you spook a fish, and come back later.

On spinning gear, small spinners and minnow imitating lures cast tight to cover and retrieved across the current are a proven Ontario method.

## Limits and keeping fish

In Zones 16 and 17 the brown trout limit is S-5 and C-2, within a combined trout and salmon limit of five (sport licence) or two (conservation licence). Special stretches, like parts of the Grand tailwater, have their own rules, including artificial lures only and catch and release sections. Always check the [official regulations](https://www.ontario.ca/document/ontario-fishing-regulations-summary) for the exact water.

Wild browns that grow big in small rivers are slow to replace. Many anglers release the large ones, handle them with wet hands and keep them in the water for the photo.

## Quick answers

**Are there brown trout near Toronto?** Yes. The Credit River holds resident browns, and the Humber, Credit and other Lake Ontario tributaries get lake run browns in the fall.

**What is the best river for brown trout in Ontario?** The Grand River tailwater below Shand Dam is the best known, with a reputation that draws anglers from across North America.

**When can I fish for brown trout?** In most of Zones 16 and 17, from the fourth Saturday in April to September 30, with longer seasons on some tributary stretches. Lake Ontario itself (Zone 20) is open all year.

Find today's best brown trout water in the [Muddy York Fishing app](/), or keep reading with our [brown trout fishing guide](/guides/brown-trout-fishing-ontario/).

*Cover photo: brown trout (Salmo trutta), U.S. Fish and Wildlife Service, via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Brown_Trout_(Salmo_trutta).jpg). Public domain.*`,
  },
  {
    slug: "ontario-fishing-seasons-trout-salmon",
    title: "Ontario Fishing Seasons for Trout and Salmon",
    excerpt: "When trout and salmon season opens and closes in Southern Ontario, how fishing zones work, and the stretches that stay open all year.",
    coverUrl: `${IMG}/forks-of-the-credit.jpg`,
    coverAlt: "The Credit River in winter at Forks of the Credit Provincial Park, with snow on the banks and cedars in evening light",
    publishedAt: "2026-10-04T13:00:00Z",
    body: `"Is it open?" is the first question every Ontario trout and salmon angler should ask, and the answer is rarely a single date. Seasons in Ontario are set by fisheries management zone, then changed for specific rivers, and sometimes for specific stretches of the same river. This guide explains how the system works and gives the key dates for Southern Ontario.

## How Ontario sets fishing seasons

Ontario is divided into [20 fisheries management zones](https://www.ontario.ca/page/fishing-licences). Each zone has its own seasons and limits for each species. On top of the zone rules sit:

- **Waterbody exceptions:** a lake or river with its own rules.
- **Additional fishing opportunities:** stretches, often the lower parts of Great Lakes tributaries, that stay open longer than the zone.
- **Sanctuaries:** areas closed for part or all of the year, often around dams, fishways and spawning grounds.

Southern Ontario's trout and salmon rivers fall mostly in three zones:

- **Zone 16:** west and north of Toronto, including the Credit, Humber, Grand, Nottawasaga, Saugeen and Bronte Creek.
- **Zone 17:** east of Toronto, including Duffins Creek, Bowmanville Creek, Wilmot Creek and the Ganaraska.
- **Zone 20:** Lake Ontario itself and the Niagara River.

We keep plain language versions of each zone, updated from the official summary twice a day: [Zone 16](/regulations/zone-16/), [Zone 17](/regulations/zone-17/) and [Zone 20](/regulations/zone-20/).

## Trout and salmon seasons in Zones 16 and 17

In both zones, the default season for brook trout, brown trout, rainbow trout, Pacific salmon and Atlantic salmon runs from the **fourth Saturday in April to September 30**. In 2027, the fourth Saturday in April is April 24.

Limits differ by species and licence. "S" is a sport licence and "C" a conservation licence:

| Species | Zone 16 | Zone 17 |
|---|---|---|
| Brook trout | S-5, C-2 | S-2, C-1 |
| Brown trout | S-5, C-2 | S-5, C-2 |
| Rainbow trout | S-2, C-1 | S-2, C-1 |
| Pacific salmon | S-5, C-2 | S-5, C-2 |
| Atlantic salmon | S-0, C-0 | S-0, C-0 |

All trout and salmon together are limited to S-5 and C-2 a day.

## The stretches that stay open

The spring opener and September 30 closing are only the default. Many of the lower stretches of Lake Ontario and Georgian Bay tributaries have additional fishing opportunities for rainbow trout, brown trout, Pacific salmon and Atlantic salmon. A few examples from the current summary:

- **Humber River:** open all year from Eglinton Avenue down to Lake Ontario. See the [lower Humber](/rivers/humber-river-lower-old-mill-to-the-mouth-toronto/).
- **Credit River:** open all year below the Highway 403 bridge, with a sanctuary from Highway 403 to Britannia Road from August 15 to December 31. See the [lower Credit](/rivers/credit-river-lower-mouth-to-streetsville/).
- **Durham Region creeks:** open all year below the CNR tracks, and to December 31 between Highway 2 and the tracks. See [Duffins Creek](/rivers/duffins-creek-lower-ajax-pickering/).
- **Ganaraska River:** three different sets of rules in Port Hope alone, including a sanctuary closed all year from Highway 401 to the Jocelyn Street bridge.

These are summaries. The legal wording, with the exact landmarks, is in the [Ontario Fishing Regulations Summary](https://www.ontario.ca/document/ontario-fishing-regulations-summary).

> The [Muddy York Fishing app](/) shows "Open", "Closed" or "Check" for each stretch today, straight from the official summary, with a link to the exact paragraph. Free for 7 days.

## Lake Ontario (Zone 20)

In Lake Ontario, brown trout, rainbow trout and Pacific salmon are **open all year**. Lake trout are open January 1 to September 30 and December 1 to 31. Atlantic salmon can be kept only on a sport licence, one fish greater than 63 centimetres; conservation licence holders must release them. Brook trout are listed as not present in Zone 20 and are closed all year.

## Why trout seasons close in the fall

Brook trout and brown trout spawn in the fall, on gravel in cold, clean water. The September 30 closing protects them on their spawning beds. The tributary stretches that stay open are mostly the lower reaches, where lake run fish travel through on their way upstream.

## Licences and free fishing

To fish in Ontario you need an Outdoors Card and a fishing licence, bought through the province's [licensing service](https://www.ontario.ca/page/fishing-licences). Some anglers do not need one, including Ontario residents under 18 and 65 or older, and veterans and Canadian Armed Forces members who live in Ontario. Canadian residents can also fish licence free during four family fishing periods a year. Check the province's page for current dates and the ID you must carry.

## How to check a season before you go

1. Find the zone for your river. Our [river guides](/rivers/) list it on every page.
2. Look up the zone wide season for the species you are after.
3. Check the waterbody exceptions and additional opportunities for the exact stretch.
4. Look for sanctuaries near dams, fishways and in towns.
5. Read the province's fishing notices for any in season changes.

## Common mistakes to avoid

- **Assuming a whole river shares one season.** On the Credit and the Ganaraska, the rules change several times between the lake and the first dam.
- **Fishing a sanctuary by accident.** Sanctuaries are often in the most popular watching spots, right below fishways and dams, so a crowd is not a sign that fishing is allowed.
- **Using last year's rules.** The summary changes, and in season notices can close or open water with little warning. Check before every trip, not once a year.

## Quick answers

**When does trout season open in Ontario?** In Zones 16 and 17, on the fourth Saturday in April. That is April 24 in 2027.

**When does trout season close?** September 30 in most of Zones 16 and 17, but many lower tributary stretches stay open longer, some all year.

**Can I fish for salmon all year in Ontario?** In Lake Ontario, yes. In rivers, only on the stretches listed as additional fishing opportunities.

For a deeper look at opening day, see our [Ontario trout opener guide](/guides/ontario-trout-opener/), or open the [app](/) to see what is open near you right now.

*Cover photo: the Credit River at Forks of the Credit Provincial Park, by The Cosmonaut, via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Credit_River_at_Forks_of_the_Credit_Provincial_Park.jpg). Licensed [CC BY-SA 2.5 CA](https://creativecommons.org/licenses/by-sa/2.5/ca/deed.en).*`,
  },
  {
    slug: "brook-trout-small-creeks-ontario",
    title: "Brook Trout in Ontario's Small Creeks",
    excerpt: "How to find and fish wild brook trout in Southern Ontario's small, cold creeks: reading the water, light gear, the season and how to protect them.",
    coverUrl: `${IMG}/brook-trout-stream.jpg`,
    coverAlt: "A wild brook trout swimming over gravel in a clear, cold stream",
    publishedAt: "2026-10-03T13:00:00Z",
    body: `Some of the best trout fishing in Southern Ontario happens in water you can step across. Small, cold creeks running through cedar swamps and farm valleys hold wild brook trout, Ontario's native char, with colours that look painted on. The fish are rarely big. The places they live are worth protecting. Here is how to find them and fish them well.

## Ontario's native trout

Brook trout are native to Ontario. The province describes their range as reaching from [the small brooks of southern Ontario farmland to the larger rivers, ponds and lakes of the North](https://www.ontario.ca/page/brook-trout). In the south, most are 15 to 25 centimetres. A 30 centimetre creek brookie is a fish to remember.

What they need is simple and increasingly rare: **a year round supply of cold, clear water** and plenty of cover. In practice that means groundwater. Springs and seeps keep a creek cold in August and keep it from freezing solid in February.

## Reading a small creek

### Look for cold water first

On a hot day, put your hand in. Brook trout water feels cold even in midsummer. Signs of groundwater include watercress, cedar swamps along the banks, and patches where the creek stays open in winter. A stream thermometer takes the guessing out: brook trout do best in water below about 20 °C.

### Then look for cover

The province's own advice is to look [near overhanging trees, submerged wood and rocky points](https://www.ontario.ca/page/brook-trout). In a small creek that means:

- **Undercut banks** on the outside of bends.
- **Log jams and root wads.**
- **Plunge pools** below small drops, beaver dams and culverts.
- **Deeper slots** where the current runs along a bank.

In summer, river brook trout hold in cold pools below falls and rapids. In spring and fall, they spread out through the stream.

## Where to start in Southern Ontario

We do not publish private spots, and you should not either. Small creek populations cannot take heavy pressure. Public land is the right place to start:

- **Conservation areas and provincial parks.** [Forks of the Credit Provincial Park](/rivers/credit-river-upper-forks-of-the-credit-belfountain/) sits on the cold upper Credit. Conservation authorities such as [Credit Valley Conservation](https://cvc.ca), the [Toronto and Region Conservation Authority](https://trca.ca) and the [Ganaraska Region Conservation Authority](https://grca.on.ca) publish maps of their properties and trails.
- **The headwaters of larger rivers.** The upper reaches of the Nottawasaga system, including the [Mad, Boyne and Pine rivers](/rivers/nottawasaga-tributaries-mad-boyne-pine-rivers-cold-tribs/), and the [Boyne River at Primrose](/rivers/boyne-river-primrose-boyne-valley-cold-headwaters/) are cold, spring fed water.
- **The Niagara Escarpment and Oak Ridges Moraine.** Groundwater from these landforms feeds dozens of small cold streams.

Remember that most creek banks in Southern Ontario run through private land. Ask before you cross it, and respect posted signs.

> Not sure which creeks near you are cold enough? The [Muddy York Fishing app](/) scouts the rivers and creeks around you and scores them on modeled water temperature and flow. Free for 7 days.

## Gear for small water

Keep it light and short. A 6 to 7 foot rod is plenty, whether it is a 2 to 4 weight fly rod or an ultralight spinning rod with 4 to 6 pound line. The province suggests a light action 7 foot rod with [4 to 8 pound test](https://www.ontario.ca/page/brook-trout).

Good choices:

- **Flies:** small beadhead nymphs, Elk Hair Caddis, Adams and small streamers.
- **Lures:** the smallest inline spinners and spoons. Pinch the barbs.
- **Bait:** worms work, especially in high water, but swallowed hooks are hard on small wild fish. If you release fish, flies and single barbless hooks are kinder.

## How to approach the fish

In a small creek the fish see you before you see them.

1. **Walk upstream** and fish upstream. Trout face into the current.
2. **Stay low and back from the bank.** Kneel if you need to.
3. **Make the first cast count.** In small pools you often get one shot.
4. **Keep moving.** If a pool does not produce in a few casts, the next one might.

## Season and limits

In Zones 16 and 17 brook trout season runs from the **fourth Saturday in April to September 30**. The limit is S-5 and C-2 in Zone 16 and S-2 and C-1 in Zone 17, and some waters have their own exceptions. Check the [Zone 16](/regulations/zone-16/) or [Zone 17](/regulations/zone-17/) summary and the [official regulations](https://www.ontario.ca/document/ontario-fishing-regulations-summary) before you go.

The fall closing matters. Brook trout spawn in autumn on gravel where groundwater comes up through the streambed. Stay off the gravel in October and November, even when you are only walking.

## Protecting creek brook trout

Small creek trout face warming water, silt and lost streamside trees. You can help:

- **Keep fish wet** and release them quickly.
- **Keep fewer fish** than the limit allows, or none. A small creek may hold only a few dozen adults.
- **Clean your boots** between watersheds to avoid moving invasive species.
- **Support local stream work.** Conservation authorities and groups such as the [Ontario Federation of Anglers and Hunters](https://www.ofah.org) run planting and habitat projects every year.

## Quick answers

**Where can I find brook trout in Southern Ontario?** In small, cold, spring fed creeks, often in the headwaters of larger rivers like the Credit and Nottawasaga, and in conservation areas on the Niagara Escarpment and Oak Ridges Moraine.

**When is brook trout season in Ontario?** In Zones 16 and 17, from the fourth Saturday in April to September 30.

**What is the best bait for brook trout?** Worms are the classic bait. Small spinners, beadhead nymphs and dry flies all work, and are easier on fish you plan to release.

To see which streams near you are cold enough today, open the [Muddy York Fishing app](/). For more river by river detail, browse our [Ontario river guides](/rivers/).

*Cover photo: brook trout in a native stream, by Eric Engbretson, U.S. Fish and Wildlife Service, via [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Brook_trout_swims_in_native_stream_underwater_fish_image.jpg). Public domain.*`,
  },
];

export async function seedBlogPosts(prisma, log = console) {
  let created = 0;
  for (const p of SEED_POSTS) {
    try {
      const have = await prisma.blogPost.findUnique({ where: { slug: p.slug }, select: { id: true } });
      if (have) continue;
      await prisma.blogPost.create({ data: {
        slug: p.slug, title: p.title, excerpt: p.excerpt, body: p.body, coverUrl: p.coverUrl, coverAlt: p.coverAlt,
        status: "published", publishedAt: new Date(p.publishedAt),
      } });
      created++;
    } catch (e) { log.error?.({ err: e, slug: p.slug }, "blog seed failed"); }
  }
  if (created) log.info?.({ created }, "blog posts seeded");
  return created;
}
