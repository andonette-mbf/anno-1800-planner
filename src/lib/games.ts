// M10: which game the Tracker is showing, and the per-game content that goes
// with it — region tags, starter kits, and the one-tap building chips.
// Everything 1800-side is verbatim what TrackerView held before the switcher
// landed; the 117 side is derived from data-117.json (real building names, so
// the entries parse back into the ledger) rather than typed from memory.

export type Game = "anno1800" | "anno117" | "anno1701" | "anno1404" | "anno2070" | "anno2205";

// Adding a game (M12): extend the union above, give it a row here — id, switcher
// labels, and its own storage prefix — then fill in GAME_CONTENT below and the
// calculator's DATASETS. Everything else keys off these lists.
export const GAMES: { id: Game; label: string; short: string; prefix: string }[] = [
  // 1800 keeps the bare legacy prefix FOREVER — /legacy.html and the original
  // single-file app read the unprefixed `anno_*` keys. Never reuse "anno_".
  { id: "anno1800", label: "Anno 1800", short: "⚓ 1800", prefix: "anno_" },
  { id: "anno117", label: "Anno 117", short: "🏛 117", prefix: "anno117_" },
  // The other 3D Annos (M12) — Tracker-only until each gets a data pack
  // (`trackerOnly` in dataset.ts hides their 🧮 tab). The two established
  // games stay first; these four follow in setting order.
  { id: "anno1701", label: "Anno 1701", short: "⛵ 1701", prefix: "anno1701_" },
  { id: "anno1404", label: "Anno 1404", short: "🕌 1404", prefix: "anno1404_" },
  { id: "anno2070", label: "Anno 2070", short: "🌊 2070", prefix: "anno2070_" },
  { id: "anno2205", label: "Anno 2205", short: "🌕 2205", prefix: "anno2205_" },
];

export function isGame(v: unknown): v is Game {
  return GAMES.some((g) => g.id === v);
}

const PREFIX = Object.fromEntries(GAMES.map((g) => [g.id, g.prefix])) as Record<Game, string>;

/** A game's localStorage key for one of the legacy `anno_*` base names — the
 *  base IS the 1800 key, so 1800 values stay exactly where the legacy app
 *  looks for them, and every other game gets its prefix from GAMES. */
export function gameKey(game: Game, base: string): string {
  return base.replace(/^anno_/, PREFIX[game]);
}

export interface GameContent {
  /** Topbar logo glyph, next to the game's GAMES label. */
  logo: string;
  /** Extra sentence on the calculator's lead line — "" when the standard one
   *  says it all (M12: each game supplies its own wording). */
  lead: string;
  /** The game's bit of a save-export filename: `anno-<fileSlug>-<name>.json`. */
  fileSlug: string;
  /** Footer data credits — where this game's numbers and pictures come from. */
  credits: string;
  /** What the silo toggle covers in this game, shown muted beside it. */
  siloHint: string;
  /** Empty-state example for the shared-resources pane: two lines with a
   *  common input, phrased in this game's goods. */
  sharedExample: string;
  /** Tooltip on the 📈 add-a-growth-goal dropdown — each game grows its own
   *  way, and the control should say so in that game's terms. */
  growthHint: string;
  /** Island 🌍 tags: key -> label, in menu order. */
  regionLabels: Record<string, string>;
  /** Island region key -> the dataset's region number/bitmask, for filtering. */
  regionNum: Record<string, number>;
  /** One-tap chips for the island inventory. `regions` omitted = everywhere. */
  suggestions: { t: string; regions?: string[] }[];
  /** Buildings that make nothing, so the ledger doesn't know them and they
   *  can't be chips without swamping the row — offered as you type instead. */
  services: { t: string; regions?: string[] }[];
  /** Region choices for the add-island row. Purely the 🌍 tag — new islands
   *  start blank (the inventory is a production ledger, not a settle-up
   *  checklist; the old starter kits seeded Marketplaces and free-text the
   *  ledger couldn't read, and got deleted more than ticked). */
  starters: { key: string; label: string }[];
  /** Fandom wiki search base for the 🔗 lookup on an item. */
  wikiSearch: string;
  /** A region tag that is really another one wearing a different name. Cape
   *  Trelawney is Old World in the numbers and in every building list, but you
   *  settle it and sail to it as its own place — so it gets its own tag, and
   *  this says which tag's buildings and chips it borrows. */
  regionAlias?: Record<string, string>;
  /** Suggestions for a ship's type in the fleet list. Unlike `starters` and
   *  `suggestions` these are NOT extracted from a data pack — the packs carry
   *  goods and buildings, not ships — so this is a convenience list of the
   *  common ones, and the field is always free text. Empty is fine: 117's
   *  ships aren't in any data we've extracted, so it types its own. */
  shipTypes: string[];
}

const ANNO1800: GameContent = {
  logo: "A",
  lead: "",
  fileSlug: "1800",
  credits:
    "Base data: production times & chains from the open-source Anno 1800 calculator " +
    "community data, cross-checked against the Anno 1800 Wiki. Goods pictures, culture " +
    "collections and specialist items from the Anno 1800 Wiki (CC-BY-SA; game art & " +
    "values © Ubisoft). Late-game / DLC recipes may vary by patch — every rate is editable " +
    "in the model. Not affiliated with Ubisoft.",
  siloHint: "(animal farms ×2, eat feed)",
  sharedExample:
    "Add two lines that use a common input — e.g. Steel Beams + Weapons (both need Steel & Iron), or a preset.",
  growthHint:
    "Growth milestones from the game's own need tables — each is the point a new need unlocks. " +
    "'Custom…' asks for any number. Scoped to your islands' 🌍 regions (or the filtered island's).",
  regionLabels: {
    ow: "Old World",
    ct: "Cape Trelawney",
    nw: "New World",
    ar: "Arctic",
    en: "Enbesa",
  },
  // Cape Trelawney IS the Old World as far as the numbers go — same region 1,
  // same buildings — so it borrows ow's chips through regionAlias.
  regionNum: { ow: 1, ct: 1, nw: 2, ar: 4, en: 5 },
  regionAlias: { ct: "ow" },
  suggestions: [
    { t: "Fire Station", regions: ["ow", "nw"] },
    { t: "Police Station", regions: ["ow", "nw"] },
    { t: "Hospital", regions: ["ow", "nw"] },
    { t: "Oil Power Plant", regions: ["ow"] },
    { t: "Fuel Station", regions: ["ow"] },
    { t: "Oil harbour", regions: ["ow", "nw"] },
    { t: "Docklands harbour" },
    { t: "Commuter pier", regions: ["ow"] },
    { t: "Zoo", regions: ["ow"] },
    { t: "Museum", regions: ["ow"] },
    { t: "Botanical Garden", regions: ["ow"] },
    { t: "Palace", regions: ["ow"] },
    { t: "Airship platform" },
    { t: "Research Institute", regions: ["en"] },
    { t: "Hacienda", regions: ["nw"] },
    { t: "Town Hall", regions: ["ow", "nw", "en"] },
    { t: "Trade Union", regions: ["ow", "nw", "en"] },
    { t: "Post Office", regions: ["ow", "nw", "ar"] },
  ],
  services: [
    { t: "Marketplace", regions: ["ow", "nw", "en"] },
    { t: "Depot" },
    { t: "Harbourmaster's Office", regions: ["ow", "nw", "en"] },
    // The Arctic's item building (M11b) — its label is what socketsOn matches.
    { t: "Arctic Lodge", regions: ["ar"] },
    { t: "Pub", regions: ["ow"] },
    { t: "Church", regions: ["ow"] },
    { t: "School", regions: ["ow"] },
    { t: "Bank", regions: ["ow"] },
    { t: "University", regions: ["ow"] },
    { t: "Variety Theatre", regions: ["ow"] },
    { t: "Bus Stop", regions: ["ow"] },
    { t: "Chapel", regions: ["nw"] },
    { t: "Cinema", regions: ["nw"] },
    { t: "Heater", regions: ["ar"] },
    // Hacienda modules that make nothing the calculator tracks — the fertiliser
    // works turns Dung into Fertiliser, neither of which is a tradeable good.
    { t: "Hacienda Storeroom", regions: ["nw"] },
    { t: "Hacienda Fertiliser Works", regions: ["nw"] },
  ],
  starters: [
    { key: "ow", label: "Old World" },
    // Same region as the Old World in the numbers, its own tag on the map.
    { key: "ct", label: "Cape Trelawney" },
    { key: "nw", label: "New World" },
    { key: "ar", label: "The Arctic" },
    { key: "en", label: "Enbesa" },
    { key: "none", label: "No region" },
  ],
  wikiSearch: "https://anno1800.fandom.com/wiki/Special:Search?query=",
  // The ones you actually name and keep. Deliberately not exhaustive — DLC
  // adds more and the field takes any text.
  shipTypes: [
    "Schooner",
    "Clipper",
    "Cargo Ship",
    "Great Eastern",
    "Extravaganza Steamer",
    "Salvager",
    "Gunboat",
    "Frigate",
    "Ship-of-the-Line",
    "Monitor",
    "Battle Cruiser",
    "Airship",
  ],
};

// 117's regions are the two sessions, and the dataset stores them as a bitmask
// (1 Latium, 2 Albion) because 29 goods exist in both.
const ANNO117: GameContent = {
  logo: "🏛",
  lead: "Pick the region you're building in: Rome's recipes differ by province.",
  fileSlug: "117",
  credits:
    "Base data: Anno 117 production times & chains extracted from the open-source " +
    "anno-mods/anno-117-calculator pack (MIT tooling; game values © Ubisoft). Goods pictures " +
    "from the Anno 117 Wiki (game art © Ubisoft). Rome is still patching — every rate is " +
    "editable in the model. Not affiliated with Ubisoft.",
  siloHint: "(Sheep/Pig/Horse ×2, eat Wheat)",
  sharedExample:
    "Add two lines that use a common input — e.g. Tiles + Amphorae (both need clay and a coal fire), or a preset.",
  growthHint:
    "A 117 residence has no fixed size — it holds the sum of what its supplied needs are worth, " +
    "so each goal is a need and the residents it adds to every house of that tier. Needs worth " +
    "nothing are named, not offered. 'Custom…' asks for any number. Scoped to your islands' 🌍 " +
    "regions (or the filtered island's).",
  regionLabels: { la: "Latium", al: "Albion" },
  regionNum: { la: 1, al: 2 },
  // Public-service buildings each region's residences actually ask for, from
  // the pack's `services` lists. Not production, so they're chips not chains.
  suggestions: [
    { t: "Market" },
    // The item buildings (M11c) — their labels are what socketsOn matches, so
    // ticking one makes its specialist panel appear on the island card.
    { t: "Villa", regions: ["la"] },
    { t: "Guesthouse", regions: ["al"] },
    { t: "Tavern", regions: ["la"] },
    { t: "Sanctuary", regions: ["la"] },
    { t: "Forum", regions: ["la"] },
    { t: "Library", regions: ["la"] },
    { t: "Amphitheatre", regions: ["la"] },
    { t: "Hippodrome", regions: ["la"] },
    { t: "Bardic Hearth", regions: ["al"] },
    { t: "Fanum", regions: ["al"] },
    { t: "Alder Council", regions: ["al"] },
    { t: "Barrow", regions: ["al"] },
    { t: "Sacred Grove", regions: ["al"] },
    { t: "Recreation Ground", regions: ["al"] },
    { t: "Grammaticus" },
    { t: "Theatre" },
    { t: "Gambling House" },
    { t: "Temple" },
    { t: "Baths" },
    { t: "Aqueduct Cistern" },
  ],
  // 117's public buildings are few enough to all be chips.
  services: [],
  starters: [
    { key: "la", label: "Latium" },
    { key: "al", label: "Albion" },
    { key: "none", label: "No region" },
  ],
  wikiSearch: "https://anno117.fandom.com/wiki/Special:Search?query=",
  // Rome's ships aren't in the pack and the wiki has no list worth extracting
  // yet, so the type is free text here — same call as its specialists. Fill
  // this in from what the game actually shows, not from memory.
  shipTypes: [],
};

// ------------------------------------------------ Tracker-only games (M12)
//
// The four other 3D Annos, registered with no data pack yet — the Tracker
// (quests, islands, typed inventory, fleet) is fully live, the calculator
// waits for a pack (`trackerOnly` in dataset.ts hides its tab). All the
// calculator-facing wording is "" because nothing renders it; each game's
// 🌍 tags are the settle-able place kinds the game actually has. Building
// chips, services and ship types are deliberately empty rather than typed
// from memory — the inventory takes free text, and real lists arrive with
// each game's pack (the 117 rule).
const TRACKER_ONLY: Omit<GameContent, "fileSlug" | "logo" | "credits" | "wikiSearch"> = {
  lead: "",
  siloHint: "",
  sharedExample: "",
  growthHint: "",
  regionLabels: {},
  regionNum: {},
  suggestions: [],
  services: [],
  starters: [{ key: "none", label: "No region" }],
  shipTypes: [],
};

const noPackCredits = (label: string): string =>
  `${label}: Tracker only for now — quests, islands, inventory and fleet. ` +
  "The calculator needs a data pack (ROADMAP M12). Not affiliated with Ubisoft.";

// 1701 settles one climate of island — no region tags to speak of. It also
// has NO wiki: anno1701.fandom.com doesn't exist (checked Aug 2026; the only
// 1701 Fandom wiki is a 20-article DS-port stub), so the 🔗 lookup falls back
// to a plain web search rather than a wiki that would 404.
const ANNO1701: GameContent = {
  ...TRACKER_ONLY,
  logo: "⛵",
  fileSlug: "1701",
  credits: noPackCredits("Anno 1701"),
  wikiSearch: "https://www.google.com/search?q=Anno%201701%20",
};

// 1404's two worlds — Occidental islands and the Orient's date-palm south.
const ANNO1404: GameContent = {
  ...TRACKER_ONLY,
  logo: "🕌",
  fileSlug: "1404",
  credits: noPackCredits("Anno 1404"),
  regionLabels: { oc: "Occident", or: "Orient" },
  regionNum: { oc: 1, or: 2 },
  starters: [
    { key: "oc", label: "Occident" },
    { key: "or", label: "Orient" },
    { key: "none", label: "No region" },
  ],
  wikiSearch: "https://anno1404.fandom.com/wiki/Special:Search?query=",
};

// 2070 settles islands and, with Deep Ocean, underwater plateaus.
const ANNO2070: GameContent = {
  ...TRACKER_ONLY,
  logo: "🌊",
  fileSlug: "2070",
  credits: noPackCredits("Anno 2070"),
  regionLabels: { is: "Island", uw: "Underwater plateau" },
  regionNum: { is: 1, uw: 2 },
  starters: [
    { key: "is", label: "Island" },
    { key: "uw", label: "Underwater plateau" },
    { key: "none", label: "No region" },
  ],
  wikiSearch: "https://anno2070.fandom.com/wiki/Special:Search?query=",
};

// 2205's settlements are whole sectors, one map each.
const ANNO2205: GameContent = {
  ...TRACKER_ONLY,
  logo: "🌕",
  fileSlug: "2205",
  credits: noPackCredits("Anno 2205"),
  regionLabels: { te: "Temperate", ar: "Arctic", lu: "Lunar", tu: "Tundra", orb: "Orbit" },
  regionNum: { te: 1, ar: 2, lu: 3, tu: 4, orb: 5 },
  starters: [
    { key: "te", label: "Temperate" },
    { key: "ar", label: "Arctic" },
    { key: "lu", label: "Lunar" },
    { key: "tu", label: "Tundra" },
    { key: "orb", label: "Orbit" },
    { key: "none", label: "No region" },
  ],
  wikiSearch: "https://anno2205.fandom.com/wiki/Special:Search?query=",
};

export const GAME_CONTENT: Record<Game, GameContent> = {
  anno1800: ANNO1800,
  anno117: ANNO117,
  anno1701: ANNO1701,
  anno1404: ANNO1404,
  anno2070: ANNO2070,
  anno2205: ANNO2205,
};
