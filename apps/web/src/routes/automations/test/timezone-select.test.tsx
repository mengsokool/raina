import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimezoneSelect } from "../components/TimezoneSelect";

describe("TimezoneSelect Component", () => {
  it("renders trigger button and displays active timezone", () => {
    const onChange = vi.fn();
    render(<TimezoneSelect value="Asia/Bangkok" onChange={onChange} />);

    const trigger = screen.getByTestId("inspector-input-tz");
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent("Asia/Bangkok");
  });

  it("opens popover on click and filters timezones by search query", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<TimezoneSelect value="UTC" onChange={onChange} />);

    const trigger = screen.getByTestId("inspector-input-tz");
    await user.click(trigger);

    // Search input should appear
    const searchInput = screen.getByPlaceholderText(/search city, country or timezone/i);
    expect(searchInput).toBeInTheDocument();

    // Type "Bangkok"
    await user.type(searchInput, "Bangkok");

    // Option should be found and clickable
    const option = await screen.findByTestId("timezone-option-Asia/Bangkok");
    expect(option).toBeInTheDocument();

    await user.click(option);
    expect(onChange).toHaveBeenCalledWith("Asia/Bangkok");
  });
});
