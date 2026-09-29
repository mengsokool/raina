import { Link } from "react-router";
import { MotionChevron } from "./MotionChevron";

const installCommand = "curl -fsSL https://raw.githubusercontent.com/mengsokool/raina/main/deploy/install.sh | bash";

export function SelfHostSection() {
  return (
    <section id="self-host" className="site-self-host border-b border-border">
      <div className="mx-auto grid max-w-[1280px] gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-20">
        <div>
          <h2 className="site-section-heading max-w-[13ch] font-display font-bold text-foreground">
            Run it on your server.
          </h2>
          <p className="mt-6 max-w-[40ch] text-lg leading-relaxed text-muted-foreground">
            Keep the platform and its data under your control. Add your own domain when you are ready to share.
          </p>
          <Link to="/docs/self-host" className="site-text-link t-learn mt-7 inline-flex items-center gap-2 text-sm font-bold text-foreground">
            Read the install guide <MotionChevron />
          </Link>
        </div>
        <div className="site-install-terminal" aria-label="Raina installation command">
          <p>On your server</p>
          <pre><code>{installCommand}</code></pre>
        </div>
      </div>
    </section>
  );
}
