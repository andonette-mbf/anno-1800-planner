import type { MetadataRoute } from "next";

// M6: installable on a phone home screen. Deliberately NO service worker —
// installability no longer requires one, and the app is localStorage-first
// already; offline caching can come later if anyone asks. Colours are the
// app's own: the black top bar behind the status bar, the page grey behind
// the splash.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Anno Production Planner",
    short_name: "Anno Planner",
    description:
      "Production calculator and companion tracker for Anno 1800 and Anno 117.",
    start_url: "/",
    display: "standalone",
    background_color: "#ededed",
    theme_color: "#0b0b0b",
    icons: [
      { src: "/icons/app-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/app-512.png", sizes: "512x512", type: "image/png" },
      // The mark fills a full-bleed square, so the same file survives the
      // maskable crop.
      { src: "/icons/app-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
