import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  layout("routes/docs/layout.tsx", [
    route("docs", "routes/docs/index.tsx"),
    route("docs/rlp", "routes/docs/rlp-protocol.tsx"),
    route("docs/sdk", "routes/docs/firmware-sdk.tsx"),
    route("docs/self-host", "routes/docs/self-host.tsx"),
    route("docs/api", "routes/docs/api-reference.tsx"),
  ]),
] satisfies RouteConfig;
