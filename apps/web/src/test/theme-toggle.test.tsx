import React from "react";
import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

describe("ThemeToggle Component", () => {
  it("renders theme toggle button and toggles theme on click", async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <ThemeToggle />
      </ThemeProvider>
    );

    const button = await screen.findByRole("button", { name: /toggle theme/i });
    expect(button).toBeDefined();
    expect(button.getAttribute("title")).toBe("Switch to light mode");

    await user.click(button);
    expect(button.getAttribute("title")).toBe("Switch to dark mode");

    await user.click(button);
    expect(button.getAttribute("title")).toBe("Switch to light mode");
  });
});
