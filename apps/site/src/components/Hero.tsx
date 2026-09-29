import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import { IotValue } from "../../../web/src/routes/dashboards/widgets/IotValue";
import { IotToggle } from "../../../web/src/routes/dashboards/widgets/IotToggle";

export function Hero() {
  return (
    <section className="site-hero border-b border-border">
      <div className="mx-auto grid max-w-[1440px] lg:min-h-[620px] lg:grid-cols-[1.06fr_0.94fr]">
        <div className="site-hero-copy flex flex-col justify-center px-5 py-16 sm:px-8 lg:px-12 xl:px-20">
          <h1 className="font-display text-[clamp(4rem,7.5vw,7.5rem)] font-bold leading-[0.9] tracking-[-0.08em] text-foreground">
            <span className="block whitespace-nowrap">Make it</span>{" "}
            <span className="site-hero-accent block whitespace-nowrap">react.</span>
          </h1>
          <p className="mt-7 max-w-[34ch] text-lg leading-[1.5] text-muted-foreground sm:text-xl">
            Connect devices, automate what happens, and share live views with exactly who you choose.
          </p>
          <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Link to="/docs/self-host" className="site-button-primary inline-flex min-h-12 items-center gap-8 px-5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
              Get Raina <ArrowUpRight className="size-5" aria-hidden="true" />
            </Link>
            <Link to="/docs" className="site-button-secondary inline-flex min-h-12 items-center px-5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
              Read docs
            </Link>
          </div>
        </div>

        <div className="site-hero-scene flex min-h-[330px] items-center justify-center overflow-hidden px-5 py-12 sm:px-8 lg:py-16">
          <div className="site-hero-demo" aria-label="Example Raina dashboard components with sample data">
            <div className="site-hero-demo-accent" aria-hidden="true" />
            <div className="site-hero-demo-value"><IotValue props={{ title: "Temperature", unit: "°C" }} value={28.4} /></div>
            <div className="site-hero-demo-toggle"><IotToggle props={{ title: "Vent fan", onValue: "on", offValue: "off" }} value="off" /></div>
          </div>
        </div>
      </div>
    </section>
  );
}
