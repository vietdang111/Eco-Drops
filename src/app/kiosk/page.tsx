import type { Metadata } from "next";
import { KioskExperience } from "@/components/kiosk-experience";
import { PublicHeader, SiteFooter, SourceLabel } from "@/components/site-chrome";

export const metadata: Metadata = { title: "Anonymous student kiosk" };

export default function KioskPage() {
  return (
    <>
      <PublicHeader current="kiosk" />
      <main className="kiosk-page" id="main-content">
        <section className="kiosk-hero">
          <div className="container kiosk-hero__inner">
            <div><p className="eyebrow">Synthetic Demo Campus · sponsored access</p><h1>Match what you need.<br /><em>Keep your identity.</em></h1></div>
            <div><SourceLabel kind="simulated">Synthetic inventory</SourceLabel><p>Up to three sponsored claims per anonymous demo visitor each week. No name, login, student ID, demographic profile, or payment details.</p></div>
          </div>
        </section>
        <section className="container kiosk-wrap"><KioskExperience /></section>
      </main>
      <SiteFooter />
    </>
  );
}
