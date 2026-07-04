import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WelcomeBanner } from "@/components/candidate/welcome-banner";

const searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

describe("WelcomeBanner", () => {
  it("does not render without the welcome flag", () => {
    searchParams.delete("welcome");
    const { container } = render(<WelcomeBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a welcome message when welcome=1 and can be dismissed", async () => {
    searchParams.set("welcome", "1");
    const user = userEvent.setup();
    render(<WelcomeBanner />);
    expect(screen.getByText(/bienvenue/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /fermer/i }));
    expect(screen.queryByText(/bienvenue/i)).not.toBeInTheDocument();
  });
});
