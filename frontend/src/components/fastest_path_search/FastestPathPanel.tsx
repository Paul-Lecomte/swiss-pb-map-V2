"use client";

import React, { useMemo, useState } from "react";
import FastestPathRouteDetails, {
  RouteSummary,
} from "../fastest_path_route/FastestPathRouteDetails";

type Props = {
  onCloseAction: () => void;
};

export default function FastestPathPanel({ onCloseAction }: Props) {
  const [startLocation, setStartLocation] = useState("Lausanne");
  const [destination, setDestination] = useState("Geneve");
  const [departureDate, setDepartureDate] = useState("2026-02-03");
  const [departureTime, setDepartureTime] = useState("10:55");
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  const routes = useMemo<RouteSummary[]>(
    () => [
      {
        id: "route-1",
        line: "IC5",
        direction: "Direction Geneve",
        from: { time: "08:17", name: "Lausanne", platform: "voie 8" },
        to: { time: "10:00", name: "Geneve", platform: "voie 3" },
        duration: "1:45",
        segments: [
          {
            id: "seg-1",
            mode: "train",
            line: "IC5",
            direction: "Direction Geneve",
            travelTime: "1h 45m",
            stops: [
              { time: "08:17", name: "Lausanne", platform: "voie 8" },
              { time: "09:03", name: "Morges" },
              { time: "09:28", name: "Nyon" },
              { time: "10:00", name: "Geneve", platform: "voie 3" },
            ],
          },
        ],
      },
      {
        id: "route-2",
        line: "IC5",
        direction: "Direction Geneve",
        from: { time: "08:17", name: "Lausanne", platform: "voie 8" },
        to: { time: "10:05", name: "Geneve", platform: "voie 1" },
        duration: "1:48",
        segments: [
          {
            id: "seg-2",
            mode: "train",
            line: "IC5",
            direction: "Direction Geneve",
            travelTime: "1h 02m",
            stops: [
              { time: "08:17", name: "Lausanne", platform: "voie 8" },
              { time: "09:19", name: "Nyon" },
            ],
            transferAfter: "6min transfer",
          },
          {
            id: "seg-3",
            mode: "bus",
            line: "Bus 12",
            direction: "Direction Centre",
            travelTime: "40m",
            stops: [
              { time: "09:25", name: "Nyon Gare" },
              { time: "10:05", name: "Geneve", platform: "voie 1" },
            ],
          },
        ],
      },
    ],
    []
  );

  const selectedRoute = routes.find((r) => r.id === selectedRouteId) ?? null;

  const handleRouteSelect = (routeId: string) => {
    setSelectedRouteId(routeId);
    setSelectedSegmentId(null);
  };

  const handleCloseDetails = () => {
    setSelectedRouteId(null);
    setSelectedSegmentId(null);
  };

  if (selectedRoute) {
    return (
      <FastestPathRouteDetails
        route={selectedRoute}
        selectedSegmentId={selectedSegmentId}
        onSelectSegment={(segmentId) => setSelectedSegmentId(segmentId)}
        onBackToOverview={() => setSelectedSegmentId(null)}
        onClose={() => {
          handleCloseDetails();
          onCloseAction();
        }}
      />
    );
  }

  return (
    <aside className="absolute left-6 top-6 z-[130] w-[min(94vw,420px)] max-w-[94vw] rounded-[32px] bg-white/95 p-5 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-neutral-800">Fastest path</div>
        <button
          className="rounded-full border border-neutral-200 p-2 text-neutral-700 transition hover:border-neutral-300"
          type="button"
          aria-label="Close fastest path"
          onClick={onCloseAction}
        >
          ×
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <input
          className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700 outline-none focus:border-neutral-300"
          placeholder="Starting location"
          value={startLocation}
          onChange={(e) => setStartLocation(e.target.value)}
        />
        <input
          className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700 outline-none focus:border-neutral-300"
          placeholder="Destination"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        />
        <div className="flex gap-3">
          <input
            type="date"
            className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700 outline-none focus:border-neutral-300"
            value={departureDate}
            onChange={(e) => setDepartureDate(e.target.value)}
          />
          <input
            type="time"
            className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700 outline-none focus:border-neutral-300"
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
          />
        </div>

        <div className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
          Results
        </div>
        <div className="max-h-[50vh] overflow-auto rounded-3xl border border-neutral-100 bg-white">
          {routes.map((route) => (
            <button
              key={route.id}
              type="button"
              onClick={() => handleRouteSelect(route.id)}
              className="w-full border-b border-neutral-100 px-4 py-4 text-left hover:bg-neutral-50"
              aria-label={`Select route ${route.id}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-neutral-800">
                    {route.from.name} → {route.to.name}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {route.from.time} → {route.to.time} · {route.duration}
                  </div>
                </div>
                <div className="text-xs text-neutral-500">{route.line}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

