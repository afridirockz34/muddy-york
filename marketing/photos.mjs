// Photos used on the public site, all from Wikimedia Commons under public
// domain or Creative Commons licences. Credits are listed on /photo-credits/.
export const PHOTOS = {
  elora: { src: "/img/site/elora-gorge.jpg", sm: "/img/site/elora-gorge-sm.jpg", alt: "The Grand River running through the green walls of the Elora Gorge",
    credit: "Mhsheikholeslami", licence: "CC BY-SA 4.0", file: "Elora_Gorge_Conservation_Area-_Elora_Gorge_and_Grand_River-_Elora-Ontario_(1).jpg" },
  flyFishers: { src: "/img/site/fly-fishers.jpg", sm: "/img/site/fly-fishers-sm.jpg", alt: "An angler wading a clear river with a fly rod",
    credit: "Andy Morffew", licence: "CC BY 2.0", file: "Fly_Fishing_on_The_River_Itchen_(19238200845).jpg" },
  wading: { src: "/img/site/wading-anglers.jpg", sm: "/img/site/wading-anglers-sm.jpg", alt: "Two anglers fly fishing a wide river",
    credit: "Jim Peaco, U.S. National Park Service", licence: "Public domain", file: "Woman_and_man_fly_fishing_in_the_Firehole_River,_2012.jpg" },
  steelhead: { src: "/img/site/steelhead.jpg", sm: "/img/site/steelhead-sm.jpg", alt: "An angler holding a bright steelhead over the water",
    credit: "Tobin John, U.S. Fish and Wildlife Service", licence: "Public domain", file: "Man_holding_a_steelhead_(Oncorhynchus_mykiss)_cropped.jpg" },
  ganaraska: { src: "/img/site/ganaraska.jpg", sm: "/img/site/ganaraska-sm.jpg", alt: "The Ganaraska River running over rocks through Port Hope",
    credit: "Mhsheikholeslami", licence: "CC BY-SA 4.0", file: "Ganaraska_River-Port_Hope-Ontario-20221024.jpg" },
  creek: { src: "/img/site/belfountain-creek.jpg", sm: "/img/site/belfountain-creek-sm.jpg", alt: "A small, clear creek running through cedar forest near Belfountain",
    credit: "XeresNelro", licence: "CC BY-SA 4.0", file: "Belfountain_2.jpg" },
  rainbow: { src: "/img/site/rainbow-trout.jpg", sm: "/img/site/rainbow-trout-sm.jpg", alt: "A rainbow trout underwater, close up",
    credit: "U.S. Fish and Wildlife Service, Pacific Southwest Region", licence: "Public domain", file: "Rainbow_trout_(26809663537).jpg" },
  salmon: { src: "/img/blog/salmon-run.jpg", sm: "/img/site/salmon-run-sm.jpg", alt: "A Chinook salmon leaping up a waterfall",
    credit: "U.S. Fish and Wildlife Service", licence: "Public domain", file: "SALMON_JUMPING_AT_DAM_(51163352177).jpg" },
  brownTrout: { src: "/img/blog/brown-trout.jpg", sm: "/img/site/brown-trout-sm.jpg", alt: "A brown trout with dark spots and a golden belly",
    credit: "U.S. Fish and Wildlife Service", licence: "Public domain", file: "Brown_Trout_(Salmo_trutta).jpg" },
  brookTrout: { src: "/img/blog/brook-trout-stream.jpg", sm: "/img/site/brook-trout-stream-sm.jpg", alt: "A wild brook trout over gravel in a cold stream",
    credit: "Eric Engbretson, U.S. Fish and Wildlife Service", licence: "Public domain", file: "Brook_trout_swims_in_native_stream_underwater_fish_image.jpg" },
  credit: { src: "/img/blog/forks-of-the-credit.jpg", sm: "/img/site/forks-of-the-credit-sm.jpg", alt: "The Credit River at Forks of the Credit Provincial Park in winter",
    credit: "The Cosmonaut", licence: "CC BY-SA 2.5 CA", file: "Credit_River_at_Forks_of_the_Credit_Provincial_Park.jpg" },
};
const LICENCE_URL = {
  "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
  "CC BY 2.0": "https://creativecommons.org/licenses/by/2.0/",
  "CC BY-SA 2.5 CA": "https://creativecommons.org/licenses/by-sa/2.5/ca/deed.en",
};
export const creditRows = () => Object.values(PHOTOS).map((p) => ({ ...p,
  fileUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(p.file).replace(/%2C/g, ",").replace(/%28/g, "(").replace(/%29/g, ")")}`,
  licenceUrl: LICENCE_URL[p.licence] || null }));

// The banner photo for a river page, matched to the kind of water it is.
export function riverPhoto(r) {
  const w = (r.water || "").toLowerCase(), sp = r.species || [];
  if (/spring|headwater|cold|brook/.test(w)) return PHOTOS.creek;
  if (r.river === "Grand River" && w.includes("tailwater")) return PHOTOS.elora;
  if (sp.includes("CHN")) return PHOTOS.ganaraska;
  if (sp.includes("STL")) return PHOTOS.wading;
  return PHOTOS.flyFishers;
}
