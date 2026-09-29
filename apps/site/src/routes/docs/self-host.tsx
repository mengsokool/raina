export default function SelfHostDoc() {
  return (
    <article className="max-w-3xl space-y-6">
      <div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-primary font-bold block mb-1">
          Operations & Deployment
        </span>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          Self-Host & Raina CLI Guide
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          How to install, manage, update, and back up a production Raina instance with single-command simplicity.
        </p>
      </div>

      <section className="space-y-3 text-xs text-muted-foreground leading-relaxed">
        <h2 className="text-sm font-bold text-foreground border-b border-border pb-1.5">
          1. Quick Bootstrap Installation
        </h2>
        <p>Run the following command on any Linux (Ubuntu, Debian, Rocky, Alpine) or macOS host with Docker installed:</p>
        <pre className="p-3 rounded-xs bg-slate-900 border border-slate-800 text-xs font-mono text-lime-400 select-all overflow-x-auto">
          <code>curl -fsSL https://raw.githubusercontent.com/mengsokool/raina/main/deploy/install.sh | bash</code>
        </pre>
        <p className="text-[11px] text-muted-foreground">
          This script detects CPU architecture, checks Docker availability, installs the <code className="text-lime-700 font-mono">/usr/local/bin/raina</code> CLI, generates cryptographically secure secrets, and starts all services in <code className="text-lime-700 font-mono">/opt/raina</code>.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-foreground border-b border-border pb-1.5">
          2. Directory Structure (/opt/raina)
        </h2>
        <pre className="p-3.5 rounded-xs bg-slate-900 border border-slate-800 text-xs font-mono text-slate-100 leading-relaxed overflow-x-auto">
          <code>{`/opt/raina/
├── compose.yaml          # Pinned Docker Compose stack
├── .env                  # Generated secrets (POSTGRES_PASSWORD, JWT, keys)
├── config/               # Custom certificates and proxy configs
├── state/                # Installation metadata and update state machine
├── data/                 # Host volume mounts
├── backups/              # Automated database snapshot archives (.tar.gz)
└── updates/              # Cached release manifests and migration scripts`}</code>
        </pre>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-foreground border-b border-border pb-1.5">
          3. Raina CLI Reference
        </h2>
        <div className="overflow-x-auto rounded-sm border border-border bg-card">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted text-foreground border-b border-border">
              <tr>
                <th className="p-2.5 font-bold font-mono">Command</th>
                <th className="p-2.5 font-bold">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-[11px]">
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">raina status</td>
                <td className="p-2.5 text-muted-foreground">View current release version, channel, container health, and API readiness.</td>
              </tr>
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">raina logs [-f] [service]</td>
                <td className="p-2.5 text-muted-foreground">Stream or inspect container logs (e.g. <code className="text-primary font-mono">raina logs -f api</code>).</td>
              </tr>
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">raina backup [note]</td>
                <td className="p-2.5 text-muted-foreground">Take an atomic snapshot of PostgreSQL database and configuration into a .tar.gz archive.</td>
              </tr>
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">raina restore &lt;file&gt;</td>
                <td className="p-2.5 text-muted-foreground">Restore database and configuration from a specified backup archive.</td>
              </tr>
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">raina update [--version v]</td>
                <td className="p-2.5 text-muted-foreground">Atomic update with automatic pre-backup and instant rollback if health check fails.</td>
              </tr>
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">raina rollback</td>
                <td className="p-2.5 text-muted-foreground">Revert stack back to the previous release.</td>
              </tr>
              <tr>
                <td className="p-2.5 text-primary font-mono font-bold">raina doctor</td>
                <td className="p-2.5 text-muted-foreground">Run diagnostic checks on disk, ports, file permissions, and daemon connectivity.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </article>
  );
}
