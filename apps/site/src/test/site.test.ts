import { describe, it, expect } from "vitest";
import routes from "../routes";

describe("Site Route Configurations", () => {
  it("defines the expected routes and docs structure", () => {
    expect(routes).toBeDefined();
    expect(routes.length).toBeGreaterThanOrEqual(2);

    // First route is index (home)
    const homeRoute = routes[0];
    expect(homeRoute).toHaveProperty("file", "routes/home.tsx");

    // Second route is layout with docs sub-routes
    const docsLayout = routes[1] as any;
    expect(docsLayout).toHaveProperty("file", "routes/docs/layout.tsx");
    expect(docsLayout.children).toBeDefined();

    const childPaths = docsLayout.children.map((c: any) => c.path);
    expect(childPaths).toContain("docs");
    expect(childPaths).toContain("docs/rlp");
    expect(childPaths).toContain("docs/sdk");
    expect(childPaths).toContain("docs/self-host");
    expect(childPaths).toContain("docs/api");
  });
});
