import "dotenv/config";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { computeProfitability, type Role, type ServiceToggles } from "@drivemind/shared";
import { getMockOrders } from "./mock/orders.js";

const app = express();
app.use(helmet());
app.use(cors({ origin: true }));
app.use(express.json());

const PORT = Number(process.env.PORT ?? 4000);

function parseRole(raw: unknown): Role {
  return raw === "taxi" || raw === "driver" ? "taxi" : "courier";
}

// In-memory MVP state (replace with Postgres later)
let serviceToggles: ServiceToggles = { uber: true, bolt: true, glovo: true, wolt: true };
const shift = {
  active: false,
  startedAt: null as string | null,
  totalEarningsPLN: 0,
  tasksCompleted: 0
};

app.get("/health", (_req, res) => res.json({ ok: true, name: "drivemind-api" }));

app.get("/v1/dashboard", (req, res) => {
  const role = parseRole(req.query.role);
  const earningsTodayPLN = shift.totalEarningsPLN;
  const workingMin = shift.active && shift.startedAt ? Math.max(1, Math.round((Date.now() - new Date(shift.startedAt).getTime()) / 60_000)) : 0;
  const earningsPerHour = workingMin ? (earningsTodayPLN / workingMin) * 60 : 0;

  res.json({
    role,
    online: shift.active,
    today: {
      earningsPLN: Math.round(earningsTodayPLN * 100) / 100,
      tasksCompleted: shift.tasksCompleted,
      earningsPerHourPLN: Math.round(earningsPerHour * 10) / 10
    },
    activeTask: shift.active
      ? {
          id: "active_mock",
          title: role === "courier" ? "Delivery • Kazimierz → Old Town" : "Ride • Center → Kazimierz",
          etaMin: role === "courier" ? 12 : 18
        }
      : null
  });
});

app.get("/v1/services", (_req, res) => res.json(serviceToggles));
app.post("/v1/services", (req, res) => {
  const body = req.body as Partial<ServiceToggles>;
  serviceToggles = { ...serviceToggles, ...body };
  res.json(serviceToggles);
});

app.get("/v1/orders", (req, res) => {
  const role = parseRole(req.query.role);
  const sort = (req.query.sort as string | undefined) ?? "profit_hour";

  const orders = getMockOrders(role).filter((o) => serviceToggles[o.platform]);
  const withProfit = orders.map((o) => {
    const profit = computeProfitability({ role, pricePLN: o.pricePLN, distanceKm: o.distanceKm, etaMin: o.etaMin });
    return { ...o, profitability: profit };
  });

  const sorted = [...withProfit].sort((a, b) => {
    if (sort === "distance") return a.distanceKm - b.distanceKm;
    // default: higher hourly first
    return b.profitability.estHourlyPLN - a.profitability.estHourlyPLN;
  });

  res.json({ role, items: sorted });
});

app.post("/v1/orders/:id/accept", (req, res) => {
  const role = parseRole(req.query.role);
  const id = req.params.id;
  const orders = getMockOrders(role);
  const accepted = orders.find((o) => o.id === id) ?? null;
  if (!accepted) return res.status(404).json({ error: "Not found" });

  // MVP behavior: increment earnings and tasks
  shift.totalEarningsPLN = Math.round((shift.totalEarningsPLN + accepted.pricePLN) * 100) / 100;
  shift.tasksCompleted += 1;

  res.json({ ok: true, accepted });
});

app.get("/v1/shift", (_req, res) => res.json(shift));
app.post("/v1/shift/start", (_req, res) => {
  shift.active = true;
  shift.startedAt = new Date().toISOString();
  res.json(shift);
});
app.post("/v1/shift/end", (_req, res) => {
  const startedAt = shift.startedAt ? new Date(shift.startedAt).getTime() : null;
  const workingMin = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 60_000)) : 0;
  const efficiencyScore0to100 = Math.max(0, Math.min(100, Math.round((shift.tasksCompleted * 12 + shift.totalEarningsPLN) / (workingMin || 1))));

  const summary = {
    totalEarningsPLN: shift.totalEarningsPLN,
    tasksCompleted: shift.tasksCompleted,
    workingMin,
    efficiencyScore0to100
  };

  shift.active = false;
  shift.startedAt = null;
  res.json({ ok: true, summary });
});

app.get("/v1/analytics", (req, res) => {
  const role = parseRole(req.query.role);
  res.json({
    role,
    daily: [
      { day: "Mon", earningsPLN: 210 },
      { day: "Tue", earningsPLN: 280 },
      { day: "Wed", earningsPLN: 195 },
      { day: "Thu", earningsPLN: 320 },
      { day: "Fri", earningsPLN: 410 },
      { day: "Sat", earningsPLN: 520 },
      { day: "Sun", earningsPLN: 360 }
    ],
    perPlatform: [
      { platform: "uber", earningsPLN: role === "taxi" ? 820 : 0 },
      { platform: "bolt", earningsPLN: role === "taxi" ? 610 : 0 },
      { platform: "glovo", earningsPLN: role === "courier" ? 530 : 0 },
      { platform: "wolt", earningsPLN: role === "courier" ? 460 : 0 }
    ],
    recommendations: {
      bestTime: "18:00–22:00",
      bestZones: ["Old Town", "Kazimierz", "Rondo Mogilskie"]
    }
  });
});

app.listen(PORT, () => {
  console.log(`DriveMind API listening on http://localhost:${PORT}`);
});

