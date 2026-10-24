import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "EcoDrops — Verified surplus, matched to campus need",
    template: "%s · EcoDrops",
  },
  description: "A transparent surplus-to-campus workflow with independent receiving, anonymous matching, and scenario-based avoided-emissions estimates.",
  applicationName: "EcoDrops",
  keywords: ["climate tech", "surplus reuse", "campus inventory", "avoided emissions"],
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#17352c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}
