import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/auth/login.tsx"),
  route("auth/session", "routes/auth/session.ts"),
  route("public/d/:token", "routes/dashboards/public.tsx"),
  route("v1/*", "routes/api-proxy.ts"),

  layout("routes/app-layout.tsx", [
    route("projects", "routes/projects/index.tsx"),
    route("settings", "routes/settings/index.tsx"),
    route("settings/staff", "routes/settings/staff.tsx"),
    route("settings/users", "routes/settings/users-redirect.tsx"),

    route("p/:proj", "routes/projects/redirect.tsx"),
    route("p/:proj/dashboards", "routes/dashboards/list.tsx"),
    route("p/:proj/dashboards/:id", "routes/dashboards/view.tsx"),
    route("p/:proj/dashboards/:id/edit", "routes/dashboards/editor.tsx"),
    route("p/:proj/device", "routes/devices/index.tsx"),
    route("p/:proj/variables", "routes/variables/index.tsx"),
    route("p/:proj/tokens", "routes/tokens/redirect.tsx"),
    route("p/:proj/users", "routes/settings/users.tsx"),
    route("p/:proj/automations", "routes/automations/list.tsx"),
    route("p/:proj/automations/editor", "routes/automations/editor.tsx"),
  ]),
] satisfies RouteConfig;
