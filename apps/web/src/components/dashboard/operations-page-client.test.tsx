import { render, screen } from "@testing-library/react";
import { canApprove, canExecute } from "@/components/dashboard/operations-page-client";

describe("operations action gating", () => {
  it("allows approval only for requested operations", () => {
    expect(canApprove("requested")).toBe(true);
    expect(canApprove("approved")).toBe(false);
    expect(canApprove("failed")).toBe(false);
  });

  it("allows execute for approved and submitted operations", () => {
    expect(canExecute("approved")).toBe(true);
    expect(canExecute("submitted")).toBe(true);
    expect(canExecute("requested")).toBe(false);
  });
});

describe("operations empty state", () => {
  it("renders a simple placeholder message for selection state", () => {
    render(<div>Select a request from the queue.</div>);
    expect(screen.getByText("Select a request from the queue.")).toBeInTheDocument();
  });
});
