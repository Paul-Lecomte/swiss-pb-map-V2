"use client";

import { useMemo, useState } from "react";
import FastestPathRouteDetails, {
  RouteSummary,
} from "../fastest_path_route/FastestPathRouteDetails";

type Props = {
  onCloseAction: () => void;
};

const FastestPathSearch = ({ onCloseAction }: Props) => {
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
      {
        id: "route-3",
        line: "R3",
        direction: "Direction Leman",
        from: { time: "08:47", name: "Lausanne", platform: "voie 1" },
        to: { time: "10:32", name: "Geneve", platform: "voie 2" },
        duration: "1:45",
        segments: [
          {
            id: "seg-4",
            mode: "train",
            line: "R3",
            direction: "Direction Leman",
            travelTime: "55m",
            stops: [
              { time: "08:47", name: "Lausanne", platform: "voie 1" },
              { time: "09:42", name: "Rolle" },
            ],
            transferAfter: "3min transfer",
          },
          {
            id: "seg-5",
            mode: "tram",
            line: "Tram 2",
            direction: "Direction Cornavin",
            travelTime: "50m",
            stops: [
              { time: "09:45", name: "Rolle Centre" },
              { time: "10:32", name: "Geneve", platform: "voie 2" },
            ],
          },
        ],
      },
      {
        id: "route-4",
        line: "IC5",
        direction: "Direction Geneve",
        from: { time: "09:10", name: "Lausanne", platform: "voie 6" },
        to: { time: "10:50", name: "Geneve", platform: "voie 4" },
        duration: "1:40",
        segments: [
          {
            id: "seg-6",
            mode: "walk",
            line: "Walk",
            direction: "To platform",
            travelTime: "8m",
            stops: [
              { time: "09:10", name: "Lausanne Hall" },
              { time: "09:18", name: "Lausanne", platform: "voie 6" },
            ],
            transferAfter: "2min transfer",
          },
          {
            id: "seg-7",
            mode: "train",
            line: "IC5",
            direction: "Direction Geneve",
            travelTime: "1h 32m",
            stops: [
              { time: "09:20", name: "Lausanne", platform: "voie 6" },
              { time: "10:50", name: "Geneve", platform: "voie 4" },
            ],
          },
        ],
      },
      {
        id: "route-5",
        line: "Multi",
        direction: "Direction Geneve Aéroport",
        from: { time: "07:20", name: "Lausanne", platform: "voie 5" },
        to: { time: "10:15", name: "Geneve", platform: "voie 4" },
        duration: "2:55",
        segments: [
          {
            id: "seg-8",
            mode: "train",
            line: "S5",
            direction: "Direction Allaman",
            travelTime: "22m",
            stops: [
              { time: "07:20", name: "Lausanne", platform: "voie 5" },
              { time: "07:32", name: "Renens" },
              { time: "07:42", name: "Allaman", platform: "voie 2" }
            ],
            transferAfter: "8min transfer"
          },
          {
            id: "seg-9",
            mode: "bus",
            line: "Bus 724",
            direction: "Direction Rolle",
            travelTime: "35m",
            stops: [
              { time: "07:50", name: "Allaman Gare" },
              { time: "08:10", name: "Aubonne" },
              { time: "08:25", name: "Rolle Gare" }
            ],
            transferAfter: "10min transfer"
          },
          {
            id: "seg-10",
            mode: "train",
            line: "RE33",
            direction: "Direction Coppet",
            travelTime: "45m",
            stops: [
              { time: "08:35", name: "Rolle", platform: "voie 1" },
              { time: "08:55", name: "Nyon" },
              { time: "09:20", name: "Coppet", platform: "voie 3" }
            ],
            transferAfter: "15min transfer"
          },
          {
            id: "seg-11",
            mode: "train",
            line: "SL4",
            direction: "Direction Annemasse",
            travelTime: "40m",
            stops: [
              { time: "09:35", name: "Coppet", platform: "voie 3" },
              { time: "09:50", name: "Versoix" },
              { time: "10:15", name: "Geneve", platform: "voie 4" }
            ]
          }
        ]
      }
    ],
    []
  );

  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? null;
  const selectedSegment =
    selectedRoute?.segments.find((segment) => segment.id === selectedSegmentId) ?? null;

  const handleRouteSelect = (routeId: string) => {
    setSelectedRouteId(routeId);
    setSelectedSegmentId(null);
  };

  const handleCloseDetails = () => {
    setSelectedRouteId(null);
    setSelectedSegmentId(null);
  };

  const mapStatus = selectedSegment
    ? `Segment: ${selectedSegment.line}`
    : selectedRoute
      ? `Route: ${selectedRoute.from.name} -> ${selectedRoute.to.name}`
      : "Search results";

  return (
    <div className="absolute left-6 top-[92px] z-[130] w-[min(94vw,720px)] max-w-[94vw]">
      {!selectedRoute && (
        <div className="space-y-4 rounded-[28px] bg-white p-5 shadow-2xl border border-neutral-100">
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

          <div className="rounded-[32px] bg-white p-6 shadow-sm">
            <div className="flex gap-4">
              <div className="flex flex-col items-center pt-2">
                <div className="h-4 w-4 rounded-full border border-neutral-500 bg-white" />
                <div className="h-10 w-px bg-neutral-300" />
                <div className="h-4 w-4 rounded-full border border-neutral-500 bg-white" />
              </div>
              <div className="flex-1 space-y-3">
                <input
                  className="w-full rounded-xl border border-transparent bg-neutral-50 px-4 py-3 text-base text-neutral-700 outline-none transition focus:border-neutral-300"
                  placeholder="Starting location"
                  value={startLocation}
                  onChange={(event) => setStartLocation(event.target.value)}
                />
                <div className="h-px w-full bg-neutral-200" />
                <input
                  className="w-full rounded-xl border border-transparent bg-neutral-50 px-4 py-3 text-base text-neutral-700 outline-none transition focus:border-neutral-300"
                  placeholder="Destination"
                  value={destination}
                  onChange={(event) => setDestination(event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="rounded-[32px] bg-white px-6 py-3 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1">
                <input
                  type="date"
                  className="w-full rounded-xl border border-transparent bg-neutral-50 px-4 py-3 text-sm text-neutral-600 outline-none focus:border-neutral-300"
                  value={departureDate}
                  onChange={(event) => setDepartureDate(event.target.value)}
                />
              </div>
              <div className="hidden h-10 w-px bg-neutral-200 sm:block" />
              <div className="flex-1">
                <input
                  type="time"
                  className="w-full rounded-xl border border-transparent bg-neutral-50 px-4 py-3 text-sm text-neutral-600 outline-none focus:border-neutral-300"
                  value={departureTime}
                  onChange={(event) => setDepartureTime(event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="text-center text-sm font-semibold uppercase tracking-[0.3em] text-neutral-400">
            Results
          </div>

          <div className="results-scroll max-h-[46vh] overflow-auto rounded-[24px] bg-white px-2 py-2 border border-neutral-100">
            {routes.map((route) => {
              const mode = route.segments[0]?.mode || "train";
              const badgeColors: Record<string, string> = {
                train: "border-blue-200 text-blue-600",
                bus: "border-emerald-200 text-emerald-600",
                tram: "border-purple-200 text-purple-600",
                metro: "border-pink-200 text-pink-600",
                ferry: "border-cyan-200 text-cyan-600",
                cable: "border-yellow-200 text-yellow-600",
                walk: "border-neutral-200 text-neutral-600",
              };

              const badgeClass = badgeColors[mode] ?? badgeColors.train;

              return (
                <button
                  key={route.id}
                  type="button"
                  onClick={() => handleRouteSelect(route.id)}
                  title={`${route.from.name} ${route.from.time} → ${route.to.name} ${route.to.time} • ${route.duration}`}
                  aria-pressed={selectedRouteId === route.id}
                  aria-label={`Select route from ${route.from.name} at ${route.from.time} to ${route.to.name} at ${route.to.time}`}
                  className={`w-full rounded-3xl border px-4 py-4 text-left transition transform-gpu hover:shadow-md hover:-translate-y-0.5 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    selectedRouteId === route.id
                      ? "border-neutral-200 bg-neutral-50 shadow-lg ring-1 ring-blue-50"
                      : "border-transparent"
                  }`}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center">
                    <div className="flex items-center gap-3">
                      <RouteMainIcon mode={mode} />
                      <div>
                        <div className="flex items-center gap-2 text-xs text-neutral-500">
                          <span className={`rounded-full border px-2 py-0.5 font-semibold ${badgeClass}`}>
                            {route.line}
                          </span>
                          <span>{route.direction}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-1 items-center justify-between gap-4">
                      <div>
                        <div className="text-lg font-semibold text-neutral-800">
                          {route.from.time}
                        </div>
                        <div className="text-xs text-neutral-500">{route.from.name}</div>
                      </div>

                      <div className="flex flex-1 flex-col items-center gap-2">
                        <div className="relative h-4 w-full">
                          <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-neutral-300" />
                          <div className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-neutral-500 bg-white" />
                          <div className="absolute right-0 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full border border-neutral-500 bg-white" />
                        </div>
                        <div className="text-xs text-neutral-500">{route.duration}</div>
                      </div>

                      <div className="text-right flex items-center gap-2">
                        <div>
                          <div className="text-lg font-semibold text-neutral-800">
                            {route.to.time}
                          </div>
                          <div className="text-xs text-neutral-500">{route.to.name}</div>
                        </div>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-neutral-300">
                          <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <RouteTransfers segments={route.segments} />
                  <div className="mt-4 h-px w-full bg-neutral-200" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedRoute && (
        <>
          {/* Détails: le composant gère son propre positionnement (left-6/top-6). */}
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
          <div className="absolute right-0 top-0 rounded-full bg-white px-4 py-2 text-xs font-medium text-neutral-600 shadow border border-neutral-100">
            {mapStatus}
          </div>
          {selectedSegment && (
            <div className="absolute right-0 top-12 rounded-full bg-white px-3 py-2 text-[11px] text-neutral-500 shadow border border-neutral-100">
              Map route highlighted
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Composant pour afficher l'icône principale du trajet selon le mode du premier segment
const RouteMainIcon = ({ mode }: { mode: string }) => {
  const iconConfig: Record<string, { src: string; border: string; alt: string }> = {
    train: {
      src: "/icons/train_marker.png",
      border: "border-blue-600",
      alt: "Train icon",
    },
    bus: {
      src: "/icons/bus_marker.png",
      border: "border-emerald-600",
      alt: "Bus icon",
    },
    tram: {
      src: "/icons/tram_marker.png",
      border: "border-purple-600",
      alt: "Tram icon",
    },
    metro: {
      src: "/icons/metro_marker.png",
      border: "border-pink-600",
      alt: "Metro icon",
    },
    ferry: {
      src: "/icons/ferry_marker.png",
      border: "border-cyan-600",
      alt: "Ferry icon",
    },
    cable: {
      src: "/icons/cable_marker.png",
      border: "border-yellow-600",
      alt: "Cable car icon",
    },
  };

  if (mode === "walk") {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-neutral-400 bg-white text-neutral-500">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle cx="12" cy="5" r="2" fill="currentColor" />
          <path d="M12 7l-2 5 3 2 1 6" stroke="currentColor" strokeWidth="2" />
          <path d="M10 12l-3 3" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
    );
  }

  const { src, border, alt } = iconConfig[mode] ?? iconConfig.train;

  return (
    <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 bg-white ${border}`}>
      <img
        src={src}
        alt={alt}
        className="h-7 w-7 object-contain"
        draggable={false}
      />
    </div>
  );
};

const RouteTransfers = ({
  segments,
}: {
  segments: RouteSummary["segments"];
}) => {
  const transferCount = Math.max(0, segments.length - 1);

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
      {segments.map((segment) => (
        <span
          key={segment.id}
          className={`flex items-center gap-2 rounded-full border px-2 py-0.5 ${
            segment.mode === "bus"
              ? "border-emerald-200 text-emerald-600"
              : segment.mode === "tram"
                ? "border-purple-200 text-purple-600"
                : segment.mode === "walk"
                  ? "border-neutral-200 text-neutral-500"
                  : "border-blue-200 text-blue-600"
          }`}
        >
          <span className="h-2 w-2 rounded-full bg-current" />
          <span>{segment.line}</span>
        </span>
      ))}
      {transferCount > 0 && (
        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-500">
          {transferCount} transfer{transferCount > 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
};

export default FastestPathSearch;
