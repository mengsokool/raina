import { Link } from "react-router";
import { IotGauge } from "../../../web/src/routes/dashboards/widgets/IotGauge";
import { IotSlider } from "../../../web/src/routes/dashboards/widgets/IotSlider";
import { IotToggle } from "../../../web/src/routes/dashboards/widgets/IotToggle";
import { IotValue } from "../../../web/src/routes/dashboards/widgets/IotValue";
import { AutomationPreview } from "./AutomationPreview";
import { MotionChevron } from "./MotionChevron";

export function FeatureGrid() {
  return (
    <section id="architecture" className="site-simple-flow border-b border-border py-20 sm:py-28">
      <div className="mx-auto max-w-[1280px] px-5 sm:px-8">
        <h2 className="site-section-heading max-w-[13ch] font-display font-bold text-foreground">
          Start anywhere. Build the whole thing.
        </h2>
        <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-muted-foreground">
          Connect an endnode, put together a dashboard, and automate what happens. All in one place.
        </p>

        <div className="site-capabilities mt-14">
          <div className="site-capability">
            <div className="site-capability-copy">
              <h3>Connect your hardware.</h3>
              <p>Use the Arduino SDK, RLP, or HTTP API. Build for the hardware you have.</p>
            </div>
            <div className="site-capability-methods" aria-label="Connection methods: Arduino SDK, RLP, HTTP API">
              <span>Arduino SDK</span><span>RLP</span><span>HTTP API</span>
            </div>
          </div>

          <div className="site-capability">
            <div className="site-capability-copy">
              <h3>Make the dashboard yours.</h3>
              <p>Eight built-in widgets for live readings and controls. Arrange them without building a frontend first.</p>
            </div>
            <div className="site-capability-widgets" aria-label="Raina dashboard widgets">
              <div className="site-capability-widget">
                <IotValue props={{ title: "Temperature", unit: "°C" }} value={28.4} />
              </div>
              <div className="site-capability-widget">
                <IotGauge props={{ title: "Reservoir level", min: 0, max: 100, unit: "%" }} value={64} />
              </div>
              <div className="site-capability-widget">
                <IotToggle props={{ title: "Pump", onValue: "on", offValue: "off" }} value="off" />
              </div>
              <div className="site-capability-widget">
                <IotSlider props={{ title: "Fan speed", min: 0, max: 100, unit: "%" }} value={45} />
              </div>
            </div>
          </div>

          <div className="site-capability site-capability-automation">
            <div className="site-capability-copy">
              <h3>Automate visually.</h3>
              <p>Connect blocks to turn readings into actions.</p>
              <Link to="/docs" className="site-text-link t-learn mt-7 inline-flex items-center gap-2 text-sm font-bold text-foreground">
                Explore workflows <MotionChevron />
              </Link>
            </div>
            <AutomationPreview />
          </div>
        </div>
      </div>
    </section>
  );
}
