import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anno 1800 Production Planner — shared-resource calculator",
  description:
    "Production calculator, lean playbook and session tracker for Anno 1800. Building counts, shared-resource savings, zero-waste layouts, population needs.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
