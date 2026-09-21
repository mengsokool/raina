# Raina Web Agent Rules

This application is built with **React Router v7** (Framework Mode with SSR) and **Tailwind CSS v4**, NOT Next.js.

## Key Conventions

- **Framework**: React Router v7 (`react-router.config.ts`, `src/routes.ts`)
- **Routing**: Centralized route definitions in `src/routes.ts` using `index()`, `route()`, and `layout()`
- **Server/Client Boundaries**:
  - Loaders run server-side during SSR and client-side on subsequent navigations
  - BFF reverse proxy handles `/v1/*` in `src/routes/api-proxy.ts`
- **UI Components**: Radix UI primitives, Lucide Icons, Recharts, `@xyflow/react`
- **API Client**: Typesafe Hono RPC client (`@/lib/api-client.ts`) connecting to `@raina/server` AppType
- **Realtime**: Dual-stream telemetry hook (`src/hooks/useDashboardRealtime.ts`) with native WebSocket and automatic SSE fallback
