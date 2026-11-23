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
}));

const CHECKS = [
  { key: "logs_attached", label: "Logs or screenshot attached", required: true },
  { key: "reproduced", label: "Reproduced by L1", required: true },
  { key: "kb_checked", label: "Known-issue list checked", required: false },
];

const decisions = [];

function precheck(ticket, evidence) {
  const checklist = CHECKS.map((check) => ({ ...check, done: Boolean(evidence[check.key]) }));
  const missing = checklist.filter((item) => item.required && !item.done);
  const index = Number(ticket.ticket_id.slice(-2));
  let verdict = "ready_to_escalate";
  if (missing.length === 2) verdict = index % 2 ? "likely_known_issue" : "needs_info";
  else if (missing.length === 1) verdict = "try_l1_fix";
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
    suggested_action: verdict === "ready_to_escalate" ? "Escalate with the attached evidence" : "Complete the required evidence",
    override_allowed: true,
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

const backtest = {
  verdict_counts: { likely_known_issue: 214, try_l1_fix: 141, needs_info: 96, ready_to_escalate: 349 },
  precision: 0.81,
  true_bugs_delayed: 23,
  p1_misses: 0,
  sample_size: 800,
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
  if (req.method === "GET" && path === "/metrics/weekly") return send(res, 200, { weeks });
  if (req.method === "GET" && path === "/metrics/backtest") return send(res, 200, backtest);

  const match = path.match(/^\/tickets\/([^/]+)(?:\/(precheck|decisions))?$/);
  const ticket = match && tickets.find((item) => item.ticket_id === match[1]);
  if (!ticket) return send(res, 404, { detail: "not found" });
  if (req.method === "GET" && !match[2]) return send(res, 200, ticket);

  if (req.method === "POST" && match[2] === "precheck") {
    const body = await readBody(req);
    if (!body || typeof body.evidence !== "object") return send(res, 422, { detail: "evidence required" });
    return send(res, 200, precheck(ticket, body.evidence));
  }
  if (req.method === "POST" && match[2] === "decisions") {
    const body = await readBody(req);
    if (!body?.action || !body.agent) return send(res, 422, { detail: "action and agent required" });
    const against = body.action === "escalated" && body.verdict_shown !== "ready_to_escalate";
    if (against && ticket.priority !== "P1" && !body.override_reason?.trim()) {
      return send(res, 422, { detail: "override_reason is required" });
    }
    decisions.push({ ticket_id: ticket.ticket_id, ...body });
    console.log("decision", JSON.stringify(decisions.at(-1)));
    if (body.action === "escalated") ticket.escalated_to_eng = true;
    if (body.action === "resolved_at_l1") ticket.status = "closed";
    return send(res, 201, { ok: true });
  }
  return send(res, 405, { detail: "method not allowed" });
}).listen(PORT, "127.0.0.1", () => console.log(`mock on http://127.0.0.1:${PORT}`));
