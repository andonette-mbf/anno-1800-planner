import React from "react";
import icons from "@/lib/goodIcons.json";
import icons117 from "@/lib/goodIcons117.json";
import type { Game } from "@/lib/games";

// Small goods picture from the wiki sets (public/icons/goods and
// public/icons/goods-117, fetched by scripts/fetch-good-icons{,-117}.mjs).
// Keyed by the good's display name *within a game* — the two games share 24
// names (Beer, Bread, Coal, Wood…) with entirely different art, so the map has
// to be picked by game or Rome ends up wearing 1800's oil paintings. Goods
// without a picture render nothing. Purely decorative, hidden from screen
// readers — the name is always printed next to it.
export function GoodIcon({ name, game }: { name?: string | null; game?: Game }) {
  const set = (game === "anno117" ? icons117 : icons) as Record<string, string>;
  const src = name ? set[name] : undefined;
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="gicon" src={src} alt="" aria-hidden loading="lazy" />;
}
