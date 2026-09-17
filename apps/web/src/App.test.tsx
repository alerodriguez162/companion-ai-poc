import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("routes", () => {
  it("renders character selection on /", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Character selection" })).toBeInTheDocument();
  });

  it("renders the character creator", () => {
    render(
      <MemoryRouter initialEntries={["/characters/new"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Character creator" })).toBeInTheDocument();
  });
});
