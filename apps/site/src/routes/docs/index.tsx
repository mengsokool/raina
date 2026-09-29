import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";

const guides = [
  {
    title: "Self-Host Guide",
    description: "Install the platform and learn the commands for updates, backups, and diagnostics.",
    to: "/docs/self-host",
  },
  {
    title: "RLP Protocol",
    description: "Understand the binary frames and connection flow used by Raina devices.",
    to: "/docs/rlp",
  },
  {
    title: "Firmware SDK",
    description: "Connect an ESP32 or Arduino device, send telemetry, and handle commands.",
    to: "/docs/sdk",
  },
  {
    title: "REST Telemetry API",
    description: "Send readings over HTTP when a binary socket is not the right fit.",
    to: "/docs/api",
  },
];

export default function DocsIndex() {
  return (
    <article className="space-y-8">
      <div>
        <h1 className="text-foreground">Raina documentation</h1>
        <p className="max-w-[58ch] text-muted-foreground">
          Set up Raina, connect a device, and follow its data from the gateway to dashboards and workflows.
        </p>
      </div>

      <section>
        <h2 className="text-foreground">What is Raina?</h2>
        <p className="max-w-[68ch] text-muted-foreground">
          Raina is a self-hosted platform for collecting IoT telemetry, viewing live device state, and building visual automations. Devices can send data through the RLP gateway or the HTTP API.
        </p>
      </section>

      <section>
        <h2 className="text-foreground">Choose a starting point</h2>
        <div className="mt-5 border-t border-border">
          {guides.map((guide) => (
            <Link
              key={guide.to}
              to={guide.to}
              className="site-docs-guide group grid gap-2 border-b border-border py-5 focus-visible:outline-2 focus-visible:outline-primary sm:grid-cols-[0.42fr_0.58fr] sm:gap-6 sm:px-3"
            >
              <span className="inline-flex items-start gap-2 font-display text-lg font-medium text-foreground group-hover:text-primary">
                {guide.title} <ArrowUpRight className="mt-1 size-4 shrink-0" aria-hidden="true" />
              </span>
              <span className="text-sm leading-relaxed text-muted-foreground">{guide.description}</span>
            </Link>
          ))}
        </div>
      </section>
    </article>
  );
}
