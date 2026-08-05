import React from "react";
import icons from "@/lib/goodIcons.json";

// Small goods picture from the wiki set (public/icons/goods, fetched by
// scripts/fetch-good-icons.mjs). Keyed by the good's display name; goods
// without a picture render nothing. Purely decorative, hidden from
// screen readers — the name is always printed next to it.
export function GoodIcon({ name }: { name?: string | null }) {
  const src = name ? (icons as Record<string, string>)[name] : undefined;
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="gicon" src={src} alt="" aria-hidden loading="lazy" />;
}
