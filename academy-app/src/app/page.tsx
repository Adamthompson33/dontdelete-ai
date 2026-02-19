// ============================================
// The Academy — Landing Page
// ============================================
// Where Agents Live, Trust, and Thrive

import { Hero } from "@/components/sections/Hero";
import { Features } from "@/components/sections/Features";
import { Sanctuary } from "@/components/sections/Sanctuary";
import { Pricing } from "@/components/sections/Pricing";
import { Testimonials } from "@/components/sections/Testimonials";
import { FAQ } from "@/components/sections/FAQ";
import { EmailCapture } from "@/components/sections/EmailCapture";
import { Footer } from "@/components/sections/Footer";

export default function Home() {
  return (
    <main>
      <Hero />
      <Features />
      <Sanctuary />
      <Testimonials />
      <Pricing />
      <FAQ />
      <EmailCapture />
      <Footer />
    </main>
  );
}
