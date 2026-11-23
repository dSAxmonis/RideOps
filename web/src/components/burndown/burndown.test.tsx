import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BurndownView } from "@/components/burndown/BurndownView";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const board = () => ({
  snapshot_at: null,
  open_at_snapshot: 2,
  open_now: 2,
  cleared: 0,
  lanes: [{ lane: "confirm_fix", label: "Confirm fix", count: 2, owner: "L1", next_action: "Confirm" }],
  items: ["T-1", "T-2"].map((ticket_id) => ({
    ticket_id,
    priority: "P2",
    client_name: "Example",
    category: "routing",
    description: "Sample",
    assigned_agent: "Agent",
    status: "Open",
    eng_outcome: "Fixed",
    age_hours: 5,
    handoffs: 0,
    reopen_count: 0,
    lane: "confirm_fix",
    owner: "L1",
    next_action: "Confirm",
    status_mismatch: ticket_id === "T-1",
    state: "open",
    last_action_at: null,
  })),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <BurndownView />
    </QueryClientProvider>,
  );
}

describe("BurndownView", () => {
  beforeEach(() => localStorage.setItem("rideops_agent_name", "Test Agent"));

  it("shows the key message, mismatch flag and source-data notice", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(board())));
    renderView();
    expect(await screen.findByText(/2 open tickets already have an engineering verdict/)).toBeInTheDocument();
    expect(screen.getByText("Status mismatch")).toBeInTheDocument();
    expect(screen.getByText(/does not change the source ticket data/)).toBeInTheDocument();
  });

  it("updates optimistically, then rolls back on error", async () => {
    let release: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url.includes("/actions")
          ? new Promise<Response>((resolve) => { release = resolve; })
          : Promise.resolve(json(board())),
      ),
    );
    renderView();
    await userEvent.click(await screen.findByRole("button", { name: "Clear T-1" }));
    expect(await screen.findByRole("button", { name: "Reopen T-1" })).toBeInTheDocument();
    expect(screen.getByText(/1 cleared/)).toBeInTheDocument();
    release(json({ detail: "failed" }, 500));
    expect(await screen.findByText("Not saved. Restored.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Clear T-1" })).toBeInTheDocument());
    expect(screen.getByText(/0 cleared/)).toBeInTheDocument();
  });

  it("asks for a name before recording", async () => {
    localStorage.setItem("rideops_agent_name", "");
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => json(board()));
    vi.stubGlobal("fetch", fetchMock);
    renderView();
    await userEvent.click(await screen.findByRole("button", { name: "Clear T-1" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Add your name");
    expect(fetchMock.mock.calls.some(([url]) => url.includes("/actions"))).toBe(false);
  });
});
