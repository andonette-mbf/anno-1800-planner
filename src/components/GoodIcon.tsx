import React from "react";
import icons from "@/lib/goodIcons.json";
import icons117 from "@/lib/goodIcons117.json";
import type { Game } from "@/lib/games";

// Small goods picture from the wiki sets (public/icons/goods and
// public/icons/goods-117, fetched by scripts/fetch-good-icons{,-117}.mjs).
// Keyed by the good's display name *within a game* — games share names (24
// collide between 1800 and 117 alone: Beer, Bread, Coal, Wood…) with entirely
// different art, so each game has its OWN map and icon files (M12); a new
// game adds an entry here and its own fetch script. Goods without a picture
// render nothing. Purely decorative, hidden from screen readers — the name is
// always printed next to it.
const ICONS: Record<Game, Record<string, string>> = {
  anno1800: icons,
  anno117: icons117,
};

export function GoodIcon({ name, game }: { name?: string | null; game?: Game }) {
  const set = ICONS[game ?? "anno1800"];
  const src = name ? set[name] : undefined;
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="gicon" src={src} alt="" aria-hidden loading="lazy" />;
}
