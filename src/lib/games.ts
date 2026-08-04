// M10: which game the Tracker is showing, and the per-game content that goes
// with it — region tags, starter kits, and the one-tap building chips.
// Everything 1800-side is verbatim what TrackerView held before the switcher
// landed; the 117 side is derived from data-117.json (real building names, so
// the entries parse back into the ledger) rather than typed from memory.

export type Game = "anno1800" | "anno117";

export const GAMES: { id: Game; label: string; short: string }[] = [
  { id: "anno1800", label: "Anno 1800", short: "⚓ 1800" },
  { id: "anno117", label: "Anno 117", short: "🏛 117" },
];

export function isGame(v: unknown): v is Game {
  return v === "anno1800" || v === "anno117";
}

export interface GameContent {
  /** Island 🌍 tags: key -> label, in menu order. */
  regionLabels: Record<string, string>;
  /** Island region key -> the dataset's region number/bitmask, for filtering. */
  regionNum: Record<string, number>;
  /** One-tap chips for the island inventory. `regions` omitted = everywhere. */
  suggestions: { t: string; regions?: string[] }[];
  /** Seeded UNTICKED on island add — red "still to do" gaps. */
  starters: { key: string; label: string; items: string[] }[];
  /** Fandom wiki search base for the 🔗 lookup on an item. */
  wikiSearch: string;
}

const ANNO1800: GameContent = {
  regionLabels: {
    ow: "Old World",
    nw: "New World",
    ar: "Arctic",
    en: "Enbesa",
  },
  regionNum: { ow: 1, nw: 2, ar: 4, en: 5 },
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
  ],
  starters: [
    {
      key: "ow",
      label: "Old World / Cape Trelawney",
      items: [
        "Marketplace",
        "Lumberjack's Hut",
        "Sawmill",
        "Fishery",
        "Potato Farm",
        "Schnapps Distillery",
        "Sheep Farm",
        "Framework Knitters",
        "Fire Station",
      ],
    },
    {
      key: "nw",
      label: "New World",
      items: [
        "Marketplace",
        "Lumberjack's Hut",
        "Sawmill",
        "Fish Oil Factory",
        "Plantain Plantation",
        "Fried Plantain Kitchen",
        "Alpaca Farm",
        "Poncho Darner",
        "Sugar Cane Plantation",
        "Rum Distillery",
        "Fire Station",
      ],
    },
    {
      key: "ar",
      label: "The Arctic",
      items: [
        "Heaters + coal supply",
        "Lumberjack's Hut",
        "Sawmill",
        "Whaling Station",
        "Caribou Hunting Cabin",
        "Pemmican Cookhouse",
        "Seal Hunting Docks",
        "Goose Farm",
        "Sleeping Bag Factory",
      ],
    },
    {
      key: "en",
      label: "Enbesa",
      items: [
        "Marketplace",
        "Water wells / irrigation",
        "Wanza Woodcutter",
        "Goat Farm",
        "Sanga Farm",
        "Salt Works",
        "Dry-House",
        "Hibiscus Farm",
        "Tea Spicer",
      ],
    },
    { key: "none", label: "Blank island", items: [] },
  ],
  wikiSearch: "https://anno1800.fandom.com/wiki/Special:Search?query=",
};

// 117's regions are the two sessions, and the dataset stores them as a bitmask
// (1 Latium, 2 Albion) because 29 goods exist in both.
const ANNO117: GameContent = {
  regionLabels: { la: "Latium", al: "Albion" },
  regionNum: { la: 1, al: 2 },
  // Public-service buildings each region's residences actually ask for, from
  // the pack's `services` lists. Not production, so they're chips not chains.
  suggestions: [
    { t: "Market" },
    { t: "Tavern", regions: ["la"] },
    { t: "Sanctuary", regions: ["la"] },
    { t: "Forum", regions: ["la"] },
    { t: "Library", regions: ["la"] },
    { t: "Amphitheatre", regions: ["la"] },
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
  // The first resident tier's full need chains plus the construction-material
  // basics — building names come straight from data-117.json, so a ticked
  // starter feeds the ledger.
  starters: [
    {
      key: "la",
      label: "Latium (Liberti)",
      items: [
        "Market",
        "Woodcutter",
        "Sawmill",
        "Fishing Hut",
        "Oat Farm",
        "Porridge Stand",
        "Hemp Farm",
        "Spinner",
        "Sheep Farm",
        "Pileus Felter",
      ],
    },
    {
      key: "al",
      label: "Albion (Waders)",
      items: [
        "Market",
        "Woodcutter",
        "Sawmill",
        "Cockle Picker",
        "Eel Grabber",
        "Reed Gatherer",
        "Shoe Weaver",
        "Hemp Farm",
        "Spinner",
      ],
    },
    { key: "none", label: "Blank island", items: [] },
  ],
  wikiSearch: "https://anno117.fandom.com/wiki/Special:Search?query=",
};

export const GAME_CONTENT: Record<Game, GameContent> = {
  anno1800: ANNO1800,
  anno117: ANNO117,
};
