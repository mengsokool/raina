import { Navbar } from "../components/Navbar";
import { Hero } from "../components/Hero";
import { ProductShowcase } from "../components/ProductShowcase";
import { ShareAccessSection } from "../components/ShareAccessSection";
import { FeatureGrid } from "../components/FeatureGrid";
import { SelfHostSection } from "../components/SelfHostSection";
import { Footer } from "../components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <ProductShowcase />
        <ShareAccessSection />
        <FeatureGrid />
        <SelfHostSection />
      </main>
      <Footer />
    </div>
  );
}
