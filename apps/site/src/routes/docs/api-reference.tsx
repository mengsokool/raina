export default function ApiReferenceDoc() {
  return (
    <article className="max-w-3xl space-y-6">
      <div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-primary font-bold block mb-1">
          HTTP Interfaces
        </span>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          REST Telemetry API
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Standard HTTP JSON endpoints for devices without direct binary socket access.
        </p>
      </div>

      <section className="space-y-3 text-xs text-muted-foreground leading-relaxed">
        <h2 className="text-sm font-bold text-foreground border-b border-border pb-1.5">
          1. POST /v1/telemetry
        </h2>
        <p>Ingests one or more sensor metrics for a specified device.</p>

        <h3 className="text-xs font-bold text-foreground">Headers</h3>
        <ul className="list-disc list-inside text-xs font-mono space-y-1 pl-1 text-muted-foreground">
          <li>Content-Type: application/json</li>
          <li>x-device-token: YOUR_HARDWARE_TOKEN</li>
        </ul>

        <h3 className="text-xs font-bold text-foreground mt-3">Example Request</h3>
        <pre className="p-3.5 rounded-xs bg-slate-900 border border-slate-800 text-xs font-mono text-slate-100 overflow-x-auto leading-relaxed">
          <code>{`curl -X POST http://127.0.0.1:3001/v1/telemetry \\
  -H "Content-Type: application/json" \\
  -H "x-device-token: YOUR_HARDWARE_TOKEN" \\
  -d '{
    "device_id": "greenhouse-sensor-01",
    "metrics": {
      "temperature": 28.5,
      "humidity": 65.2,
      "soil_ph": 6.8
    }
  }'`}</code>
        </pre>
      </section>

      <section className="space-y-3 text-xs text-muted-foreground leading-relaxed">
        <h2 className="text-sm font-bold text-foreground border-b border-border pb-1.5">
          2. GET /health
        </h2>
        <p>Healthcheck endpoint used by the Raina CLI and container orchestration.</p>
        <pre className="p-3.5 rounded-xs bg-slate-900 border border-slate-800 text-xs font-mono text-lime-400 overflow-x-auto leading-relaxed">
          <code>{`// 200 OK
{
  "status": "healthy",
  "version": "1.0.0",
  "database": "ok",
  "redis": "ok",
  "timestamp": 1727330000000
}`}</code>
        </pre>
      </section>
    </article>
  );
}
