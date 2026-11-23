import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { PrecheckResponse } from "@/lib/contract";
import { DecisionBar } from "@/components/workspace/DecisionBar";
import { PrecheckPanel } from "@/components/workspace/PrecheckPanel";

const precheck: PrecheckResponse = {
  ticket_id: "T-1",
  verdict: "likely_known_issue",
  confidence_band: "medium",
  reasons: ["Matches a sample pattern"],
  checklist: [{ key: "logs", label: "Logs attached", required: true, done: false, proof: "", proof_hint: "Paste a log reference" }],
  similar: [],
  suggested_action: "Hold and apply the known fix",
  override_allowed: true,
  known_issue: { id: "7", title: "Sample known issue", duplicate_count: 4, last_seen: null },
  playbook: { title: "Sample steps", steps: ["Check the sample setting"], draft: true },
};

describe("PrecheckPanel", () => {
  it("shows the verdict and reports evidence changes", async () => {
    const onProofChange = vi.fn();
    render(<PrecheckPanel data={precheck} isP1Ticket={false} updating={false} onProofChange={onProofChange} />);
    expect(screen.getByText("Likely a known issue")).toBeInTheDocument();
    expect(screen.getByText("Paste a log reference")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Logs attached"), "x");
    expect(onProofChange).toHaveBeenCalledWith("logs", "x");
  });

  it("shows the known issue and draft playbook", () => {
    render(<PrecheckPanel data={precheck} isP1Ticket={false} updating={false} onProofChange={vi.fn()} />);
    expect(screen.getByText("Sample known issue")).toBeInTheDocument();
    expect(screen.getByText(/Draft playbook/)).toBeInTheDocument();
    expect(screen.getByText("Check the sample setting")).toBeInTheDocument();
  });

  it("shows how much proof is still needed", () => {
    const partial = { ...precheck, checklist: [{ ...precheck.checklist[0]!, proof: "abc" }] };
    render(<PrecheckPanel data={partial} isP1Ticket={false} updating={false} onProofChange={vi.fn()} />);
    expect(screen.getByText("5 more characters")).toBeInTheDocument();
  });

  it("never shows hold advice on a P1", () => {
    render(<PrecheckPanel data={precheck} isP1Ticket updating={false} onProofChange={vi.fn()} />);
    expect(screen.queryByText("Likely a known issue")).not.toBeInTheDocument();
    expect(screen.queryByText(/Hold and apply/)).not.toBeInTheDocument();
  });
});

describe("DecisionBar", () => {
  const setup = (priority: string, verdict: PrecheckResponse["verdict"] | null) => {
    localStorage.setItem("rideops_agent_name", "Test Agent");
    const onSubmit = vi.fn();
    render(
      <DecisionBar priority={priority} verdict={verdict} submitting={false} error={null} recorded={null} evidence={{ logs: "sample proof" }} onSubmit={onSubmit} />,
    );
    return onSubmit;
  };

  it("requires a reason to escalate against the advice, then allows it", async () => {
    const onSubmit = setup("P2", "needs_info");
    await userEvent.click(screen.getByRole("button", { name: "Escalate" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm: Escalate" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("reason");
    await userEvent.type(screen.getByLabelText(/Why escalate anyway/), "Client is blocked");
    await userEvent.click(screen.getByRole("button", { name: "Confirm: Escalate" }));
    expect(onSubmit).toHaveBeenCalledWith({
      action: "escalated",
      verdict_shown: "needs_info",
      evidence: { logs: "sample proof" },
      agent: "Test Agent",
      override_reason: "Client is blocked",
    }, expect.anything());
  });

  it("escalates a P1 in one click with no reason", async () => {
    const onSubmit = setup("P1", "likely_known_issue");
    await userEvent.click(screen.getByRole("button", { name: "Escalate now" }));
    expect(onSubmit).toHaveBeenCalledWith({
      action: "escalated",
      verdict_shown: "likely_known_issue",
      evidence: { logs: "sample proof" },
      agent: "Test Agent",
    }, expect.anything());
  });

  it("does not ask for a reason when the verdict is ready", async () => {
    const onSubmit = setup("P3", "ready_to_escalate");
    await userEvent.click(screen.getByRole("button", { name: "Escalate" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm: Escalate" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("opens the reason prompt when the server returns 422", async () => {
    const onSubmit = setup("P3", "ready_to_escalate");
    await userEvent.click(screen.getByRole("button", { name: "Escalate" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm: Escalate" }));
    const options = onSubmit.mock.calls[0]?.[1] as { onError: (error: unknown) => void };
    act(() => options.onError(new ApiError(422, "request_failed", "override_reason is required")));
    const input = await screen.findByLabelText(/server needs a one-line reason/);
    await userEvent.type(input, "Client is blocked");
    await userEvent.click(screen.getByRole("button", { name: "Confirm: Escalate" }));
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ override_reason: "Client is blocked" }),
      expect.anything(),
    );
  });

  it("waits for a running re-check before confirming, except on P1", async () => {
    localStorage.setItem("rideops_agent_name", "Test Agent");
    render(
      <DecisionBar priority="P3" verdict="needs_info" evidence={{}} checking submitting={false} error={null} recorded={null} onSubmit={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Escalate" }));
    expect(screen.getByRole("button", { name: "Re-checking" })).toBeDisabled();
  });

  it("can still escalate when the check is unavailable", async () => {
    const onSubmit = setup("P3", null);
    await userEvent.click(screen.getByRole("button", { name: "Escalate" }));
    await userEvent.type(screen.getByLabelText(/check is unavailable/), "Check is down");
    await userEvent.click(screen.getByRole("button", { name: "Confirm: Escalate" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ verdict_shown: null }), expect.anything());
  });
});
