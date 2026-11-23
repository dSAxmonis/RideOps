// Local development mock of the backend contract. Invented data only.
// Not imported by the app, so it never reaches the production bundle.
//   MOCK_COLD_START_MS=20000 npm run mock   simulates a sleeping server
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 8000);
const ACCESS_CODE = process.env.MOCK_ACCESS_CODE ?? "demo-code";
const COLD_START_MS = Number(process.env.MOCK_COLD_START_MS ?? 0);
const startedAt = Date.now();

const hoursAgo = (hours) => new Date(Date.now() - hours * 3_600_000).toISOString();
const CATEGORIES = ["routing", "billing", "driver_app", "gps_tracking", "login"];
const AGENTS = ["Agent Alpha", "Agent Bravo", "Agent Charlie"];
const TIERS = ["gold", "silver", "bronze"];
const TEXT = [
  "Sample: route not updating after shift change",
  "Sample: invoice total differs from trip count",
  "Sample: app freezes when a trip starts",
  "Sample: vehicle location stuck on the map",
  "Sample: user cannot sign in after reset",
];

const tickets = Array.from({ length: 36 }, (_, index) => ({
  ticket_id: `MOCK-${String(1000 + index)}`,
  created_at: hoursAgo(3 + index * 5.5),
  channel: ["email", "phone", "chat"][index % 3],
  client_name: `Example Client ${String.fromCharCode(65 + (index % 6))}`,
  client_tier: TIERS[index % 3],
  category: CATEGORIES[index % 5],
  priority: index % 11 === 2 ? "P1" : `P${(index % 3) + 2}`,
  description: TEXT[index % 5],
  assigned_agent: index % 7 === 6 ? null : AGENTS[index % 3],
  status: index > 29 ? "closed" : "open",
  escalated_to_eng: false,
  client_id: `CL-${100 + (index % 6)}`,
  first_response_at: null,
  eng_ticket_id: null,
  eng_handoffs: null,
  eng_outcome: null,
  first_closed_at: null,
  final_closed_at: null,
  reopen_count: null,
  csat_score: null,
}));

const CHECKS = [
  { key: "logs_attached", label: "Logs or screenshot reference", required: true, proof_hint: "Paste a log ID or screenshot link" },
  { key: "reproduced", label: "Reproduced by L1", required: true, proof_hint: "What you did and what happened" },
  { key: "kb_checked", label: "Known-issue list checked", required: false, proof_hint: "Which entry you checked" },
];

const hasProof = (value) =>
  typeof value === "string" && value.replace(/\s/g, "").length >= 8 && value.trim().length <= 300;

const decisions = [];
const KNOWN_ISSUES = [
  { id: "KI-1", title: "Sample: map pin lags after a sync", category: "gps_tracking", duplicate_count: 6, last_seen: hoursAgo(90) },
  { id: "KI-2", title: "Sample: sign-in loop after reset", category: "login", duplicate_count: 4, last_seen: hoursAgo(140) },
];

function verdictFor(ticket, evidence) {
  const missing = CHECKS.filter((check) => check.required && !hasProof(evidence[check.key]));
  if (missing.length > 0) return { verdict: "needs_info", missing };
  const known = KNOWN_ISSUES.some((issue) => issue.category === ticket.category);
  return { verdict: known ? "likely_known_issue" : "ready_to_escalate", missing };
}

function precheck(ticket, evidence) {
  const checklist = CHECKS.map((check) => ({
    ...check,
    done: hasProof(evidence[check.key]),
    proof: typeof evidence[check.key] === "string" ? evidence[check.key] : "",
  }));
  const { verdict, missing } = verdictFor(ticket, evidence);
  const index = Number(ticket.ticket_id.slice(-2));
  const issue = KNOWN_ISSUES.find((item) => item.category === ticket.category);
  return {
    ticket_id: ticket.ticket_id,
    verdict,
    confidence_band: missing.length === 0 ? "high" : missing.length === 1 ? "medium" : "low",
    reasons:
      missing.length === 0
        ? ["Required evidence is complete"]
        : missing.map((item) => `Missing: ${item.label}`),
    checklist,
    similar: [1, 2, 3].map((offset) => ({
      ticket_id: `MOCK-${500 + index + offset}`,
      description: TEXT[(index + offset) % 5],
      category: ticket.category,
      eng_outcome: ["no_bug_config", "true_bug_fixed", "duplicate"][offset - 1],
      similarity: 0.9 - offset * 0.11,
      closed_at: hoursAgo(200 + offset * 30),
    })),
    suggested_action:
      verdict === "ready_to_escalate"
        ? "Escalate with the attached evidence. Optional: try a quick config or how-to check at L1."
        : "Complete the required evidence",
    override_allowed: true,
    known_issue: issue
      ? { id: issue.id, title: issue.title, duplicate_count: issue.duplicate_count, last_seen: issue.last_seen }
      : null,
    playbook: {
      title: `Sample steps for ${ticket.category}`,
      steps: ["Confirm the sample setting", "Compare with the last good state", "Tell the client what changed"],
      draft: true,
    },
  };
}

const LANES = [
  ["confirm_fix", "Confirm fix", "L1", "Confirm the fix with the client"],
  ["apply_config", "Apply config", "L1", "Apply the config change"],
  ["get_info", "Get info", "L1", "Ask the client for details"],
  ["link_known_issue", "Link known issue", "L1", "Link to the known issue"],
  ["send_howto", "Send how-to", "L1", "Send the how-to steps"],
  ["verify_with_client", "Verify with client", "Account", "Verify the outcome"],
  ["l1_triage", "L1 triage", "L1", "Triage the ticket"],
];
const OUTCOMES = ["Fixed", "Config change", "Needs more info", "Duplicate of known issue", "How-to", "Could not reproduce"];
const backlogState = new Map();
const actions = [];
const snapshotOpen = tickets.filter((ticket) => ticket.status === "open");
const laneIndex = (ticket) => Number(ticket.ticket_id.slice(-2)) % LANES.length;

function burndown() {
  const items = snapshotOpen.map((ticket) => {
    const index = laneIndex(ticket);
    const [lane, , owner, nextAction] = LANES[index];
    const entry = backlogState.get(ticket.ticket_id);
    return {
      ticket_id: ticket.ticket_id,
      priority: ticket.priority,
      client_name: ticket.client_name,
      category: ticket.category,
      description: ticket.description,
      assigned_agent: ticket.assigned_agent,
      status: ticket.status,
      eng_outcome: index === 6 ? null : OUTCOMES[index],
      age_hours: (Date.now() - Date.parse(ticket.created_at)) / 3_600_000,
      handoffs: index % 3,
      reopen_count: index % 2,
      lane,
      owner,
      next_action: nextAction,
      status_mismatch: index < 2,
      state: entry?.state ?? "open",
      last_action_at: entry?.at ?? null,
    };
  });
  const active = items.filter((item) => item.state !== "cleared");
  return {
    snapshot_at: hoursAgo(1),
    open_at_snapshot: items.length,
    open_now: active.length,
    cleared: items.length - active.length,
    lanes: LANES.map(([lane, label, owner, next_action]) => ({
      lane, label, owner, next_action,
      count: active.filter((item) => item.lane === lane).length,
    })),
    items,
  };
}

function liveMetrics() {
  const board = burndown();
  const byAction = { escalated: 0, resolved_at_l1: 0, requested_info: 0 };
  for (const decision of decisions) byAction[decision.action] += 1;
  const overrides = decisions.filter((decision) => decision.override_reason).length;
  const byLane = {};
  for (const item of board.items) {
    if (item.state === "cleared") byLane[item.lane] = (byLane[item.lane] ?? 0) + 1;
  }
  return {
    open_at_snapshot: board.open_at_snapshot,
    open_now: board.open_now,
    cleared: board.cleared,
    decisions_total: decisions.length,
    by_action: byAction,
    overrides,
    override_rate: decisions.length ? overrides / decisions.length : null,
    escalations_avoided: byAction.resolved_at_l1,
    by_lane_cleared: byLane,
    by_day: [{ day: new Date().toISOString().slice(0, 10), decisions: decisions.length, cleared: board.cleared }],
    storage: "memory",
    durable: false,
  };
}

const weeks = Array.from({ length: 12 }, (_, index) => {
  const start = new Date(Date.UTC(2026, 8, 7 + index * 7));
  const partial = index === 11;
  return {
    week_start: start.toISOString().slice(0, 10),
    partial,
    arrivals: partial ? 31 : 88 + (index % 4) * 3,
    closures: partial ? 28 : 84 + (index % 5) * 3,
    net_flow: partial ? 3 : 4 - (index % 5),
    avg_open_7d: 142 - index * 3 + (index % 3),
    avoidable_escalation_share: 0.42 - index * 0.012,
    reopen_rate: 0.07 + (index % 3) * 0.004,
    p1p2_median_close_h: 19 - index * 0.2 + (index % 2),
    csat_avg: index === 5 ? null : 4.05 + (index % 4) * 0.04,
    csat_response_rate: 0.31 + (index % 3) * 0.01,
  };
});

const backtestRun = (delayed, flaggedKnown, extraFlag) => ({
  window: { start: "2026-01-01 00:00:00", end: "2026-01-31 23:59:00" },
  policy_version: "mock.v2",
  escalations: 100,
  flagged_by_verdict: { likely_known_issue: flaggedKnown, try_l1_fix: extraFlag, needs_info: 0, ready_to_escalate: 100 - flaggedKnown - extraFlag },
  precision_by_verdict: {
    likely_known_issue: { flagged: flaggedKnown, correct: 8, precision: 8 / flaggedKnown, base_rate: 0.2, lift: 8 / flaggedKnown / 0.2, target_outcomes: ["Sample outcome"] },
    needs_info: { flagged: 0, correct: 0, precision: null, base_rate: 0.1, lift: null, target_outcomes: ["Sample outcome"] },
  },
  held_for_review: { count: flaggedKnown + extraFlag, avoidable: 12, precision_avoidable: 12 / (flaggedKnown + extraFlag), base_rate_avoidable: 0.5, recall_avoidable: 0.24 },
  fixed_bugs_delayed: { count: delayed, fixed_total: 40, rate: delayed / 40, by_verdict: { likely_known_issue: delayed } },
  p1: { total: 6, misses: 0 },
  assumptions: ["Mock assumption: evidence is treated as complete in replay."],
});

const backtest = {
  ...backtestRun(5, 20, 0),
  result_label: "revised_not_clean_holdout",
  clean_holdout: false,
  methodology_note: "Mock note: the revision was informed by the evaluation window, so this is not a clean holdout.",
  original_pre_change: { ...backtestRun(9, 20, 10), result_label: "original_pre_change", clean_holdout: false },
};

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve(null);
      }
    });
  });

createServer(async (req, res) => {
  if (Date.now() - startedAt < COLD_START_MS) return send(res, 503, { detail: "starting" });

  const url = new URL(req.url, "http://mock");
  const path = url.pathname.replace(/^\/api\/v1/, "");
  if (path === "/health") return send(res, 200, { status: "ok" });
  if (req.headers["x-access-code"] !== ACCESS_CODE) return send(res, 401, { detail: "invalid code" });

  if (req.method === "GET" && path === "/tickets") {
    const params = url.searchParams;
    const status = params.get("status") ?? "open";
    const q = params.get("q")?.toLowerCase();
    const items = tickets.filter(
      (ticket) =>
        (status === "all" || ticket.status === "open") &&
        (!params.get("agent") || ticket.assigned_agent === params.get("agent")) &&
        (!params.get("category") || ticket.category === params.get("category")) &&
        (!params.get("priority") || ticket.priority === params.get("priority")) &&
        (!q || `${ticket.ticket_id} ${ticket.description}`.toLowerCase().includes(q)),
    );
    const offset = Number(params.get("offset") ?? 0);
    const limit = Number(params.get("limit") ?? 50);
    return send(res, 200, { items: items.slice(offset, offset + limit), total: items.length });
  }
  if (req.method === "GET" && path === "/backlog/burndown") return send(res, 200, burndown());
  if (req.method === "GET" && path === "/metrics/live") return send(res, 200, liveMetrics());
  if (req.method === "GET" && path === "/known-issues") return send(res, 200, { items: KNOWN_ISSUES });
  const backlog = path.match(/^\/backlog\/([^/]+)\/actions$/);
  if (req.method === "POST" && backlog) {
    if (!snapshotOpen.some((ticket) => ticket.ticket_id === backlog[1])) return send(res, 404, { detail: "not found" });
    const body = await readBody(req);
    if (!["cleared", "waiting_client", "reopened"].includes(body?.action) || !body.agent?.trim()) {
      return send(res, 422, { detail: "action and agent required" });
    }
    const at = new Date().toISOString();
    backlogState.set(backlog[1], { state: body.action, at });
    actions.push({ ticket_id: backlog[1], ...body, at });
    return send(res, 201, { ticket_id: backlog[1], state: body.action, last_action_at: at });
  }
  if (req.method === "GET" && path === "/metrics/weekly") return send(res, 200, { weeks });
  if (req.method === "GET" && path === "/metrics/backtest") return send(res, 200, backtest);

  const match = path.match(/^\/tickets\/([^/]+)(?:\/(precheck|decisions))?$/);
  const ticket = match && tickets.find((item) => item.ticket_id === match[1]);
  if (!ticket) return send(res, 404, { detail: "not found" });
  if (req.method === "GET" && !match[2]) return send(res, 200, ticket);

  if (req.method === "POST" && match[2] === "precheck") {
    const body = await readBody(req);
    if (!body || typeof body.evidence !== "object" || Object.values(body.evidence).some((value) => typeof value !== "string")) return send(res, 422, { detail: "evidence required" });
    return send(res, 200, precheck(ticket, body.evidence));
  }
  if (req.method === "POST" && match[2] === "decisions") {
    const body = await readBody(req);
    if (!body?.action || !body.agent) return send(res, 422, { detail: "action and agent required" });
    const serverVerdict = verdictFor(ticket, body.evidence ?? {}).verdict;
    const against = body.action === "escalated" && serverVerdict !== "ready_to_escalate";
    if (against && ticket.priority !== "P1" && !body.override_reason?.trim()) {
      return send(res, 422, { detail: "override_reason is required when escalating against this verdict" });
    }
    decisions.push({ ticket_id: ticket.ticket_id, ...body });
    console.log("decision", JSON.stringify(decisions.at(-1)));
    if (body.action === "escalated") ticket.escalated_to_eng = true;
    if (body.action === "resolved_at_l1") ticket.status = "closed";
    return send(res, 201, { ok: true });
  }
  return send(res, 405, { detail: "method not allowed" });
}).listen(PORT, "127.0.0.1", () => console.log(`mock on http://127.0.0.1:${PORT}`));
