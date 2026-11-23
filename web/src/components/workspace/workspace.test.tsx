import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PrecheckResponse } from "@/lib/contract";
import { DecisionBar } from "@/components/workspace/DecisionBar";
import { PrecheckPanel } from "@/components/workspace/PrecheckPanel";

const precheck: PrecheckResponse = {
  ticket_id: "T-1",
  verdict: "likely_known_issue",
  confidence_band: "medium",
  reasons: ["Matches a sample pattern"],
  checklist: [{ key: "logs", label: "Logs attached", required: true, done: false }],
  similar: [],
  suggested_action: "Hold and apply the known fix",
  override_allowed: true,
};

describe("PrecheckPanel", () => {
  it("shows the verdict and reports evidence changes", async () => {
    const onToggle = vi.fn();
    render(<PrecheckPanel data={precheck} isP1Ticket={false} updating={false} onToggle={onToggle} />);
    expect(screen.getByText("Likely a known issue")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /Logs attached/ }));
    expect(onToggle).toHaveBeenCalledWith("logs", true);
  });

  it("never shows hold advice on a P1", () => {
    render(<PrecheckPanel data={precheck} isP1Ticket updating={false} onToggle={vi.fn()} />);
    expect(screen.queryByText("Likely a known issue")).not.toBeInTheDocument();
    expect(screen.queryByText(/Hold and apply/)).not.toBeInTheDocument();
  });
});

describe("DecisionBar", () => {
  const setup = (priority: string, verdict: PrecheckResponse["verdict"] | null) => {
    localStorage.setItem("rideops_agent_name", "Test Agent");
    const onSubmit = vi.fn();
    render(
      <DecisionBar priority={priority} verdict={verdict} submitting={false} error={null} recorded={null} onSubmit={onSubmit} />,
    );
    return onSubmit;
  };

  it("requires a reason to escalate against the advice, then allows it", async () => {
    const onSubmit = setup("P2", "try_l1_fix");
    await userEvent.click(screen.getByRole("button", { name: "Escalate" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm: Escalate" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("reason");
    await userEvent.type(screen.getByLabelText(/Why escalate anyway/), "Client is blocked");
    await userEvent.click(screen.getByRole("button", { name: "Confirm: Escalate" }));
    expect(onSubmit).toHaveBeenCalledWith({
      action: "escalated",
      verdict_shown: "try_l1_fix",
      agent: "Test Agent",
      override_reason: "Client is blocked",
    });
  });

  it("escalates a P1 in one click with no reason", async () => {
    const onSubmit = setup("P1", "likely_known_issue");
    await userEvent.click(screen.getByRole("button", { name: "Escalate now" }));
    expect(onSubmit).toHaveBeenCalledWith({
      action: "escalated",
      verdict_shown: "likely_known_issue",
      agent: "Test Agent",
    });
  });

  it("does not ask for a reason when the verdict is ready", async () => {
    const onSubmit = setup("P3", "ready_to_escalate");
    await userEvent.click(screen.getByRole("button", { name: "Escalate" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm: Escalate" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("can still escalate when the check is unavailable", async () => {
    const onSubmit = setup("P3", null);
    await userEvent.click(screen.getByRole("button", { name: "Escalate" }));
    await userEvent.type(screen.getByLabelText(/check is unavailable/), "Check is down");
    await userEvent.click(screen.getByRole("button", { name: "Confirm: Escalate" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ verdict_shown: null }));
  });
});
