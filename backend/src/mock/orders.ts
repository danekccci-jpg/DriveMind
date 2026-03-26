import type { Role, UnifiedOrder } from "@drivemind/shared";

const KRAKOW = {
  center: { lat: 50.06465, lng: 19.94498 },
  oldTown: { lat: 50.06143, lng: 19.93658 },
  kazimierz: { lat: 50.0519, lng: 19.9442 },
  podgorze: { lat: 50.0418, lng: 19.9602 },
  nowaHuta: { lat: 50.0716, lng: 20.0376 }
};

function isoNowMinus(min: number) {
  return new Date(Date.now() - min * 60_000).toISOString();
}

export function getMockOrders(role: Role): UnifiedOrder[] {
  const base: UnifiedOrder[] = [
    {
      id: "ord_krk_001",
      platform: "glovo",
      kind: "delivery",
      createdAt: isoNowMinus(2),
      pickup: { ...KRAKOW.kazimierz, label: "Kazimierz • Pickup" },
      dropoff: { ...KRAKOW.oldTown, label: "Old Town • Dropoff" },
      pricePLN: 24,
      distanceKm: 3.1,
      etaMin: 17
    },
    {
      id: "ord_krk_002",
      platform: "wolt",
      kind: "delivery",
      createdAt: isoNowMinus(3),
      pickup: { ...KRAKOW.oldTown, label: "Old Town • Pickup" },
      dropoff: { ...KRAKOW.podgorze, label: "Podgórze • Dropoff" },
      pricePLN: 29,
      distanceKm: 4.8,
      etaMin: 24
    },
    {
      id: "ord_krk_003",
      platform: "uber",
      kind: "ride",
      createdAt: isoNowMinus(1),
      pickup: { ...KRAKOW.center, label: "Center • Pickup" },
      dropoff: { ...KRAKOW.kazimierz, label: "Kazimierz • Dropoff" },
      pricePLN: 38,
      distanceKm: 6.2,
      etaMin: 20
    },
    {
      id: "ord_krk_004",
      platform: "bolt",
      kind: "ride",
      createdAt: isoNowMinus(5),
      pickup: { ...KRAKOW.kazimierz, label: "Kazimierz • Pickup" },
      dropoff: { ...KRAKOW.nowaHuta, label: "Nowa Huta • Dropoff" },
      pricePLN: 69,
      distanceKm: 15.4,
      etaMin: 33
    }
  ];

  if (role === "courier") return base.filter((o) => o.kind === "delivery");
  return base.filter((o) => o.kind === "ride");
}

