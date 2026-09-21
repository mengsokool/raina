import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpTooltip } from "@/components/ui/help-tooltip";

describe("HelpTooltip Component", () => {
  it("renders help icon button and toggles content on click/tap", async () => {
    const user = userEvent.setup();

    render(
      <HelpTooltip
        label="Workflow tips"
        triggerTestId="help-btn"
        content="Enter natural language commands"
      />
    );

    const button = screen.getByTestId("help-btn");
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-label", "Workflow tips");

    // Click/tap to open
    await user.click(button);
    expect(await screen.findByText("Enter natural language commands")).toBeInTheDocument();

    // Click again to close
    await user.click(button);
  });
});
