"use client";

import { useEffect, useRef, useState } from "react";
import FastestPathRouteDetails, {
  RouteSummary,
} from "../fastest_path_route/FastestPathRouteDetails";
import { fetchFastestPath, FastestPathRequest } from "@/services/FastestPathApiCalls";
import { searchProcessedStops } from "@/services/StopsApiCalls";

type Props = {
  onCloseAction: () => void;
};

const buildDepartureDateTime = (date: string, time: string) => {
  if (!date || !time) return null;
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  return `${date}T${normalizedTime}`;
};

const normalizeRoutes = (data: unknown): RouteSummary[] => {
  if (Array.isArray(data)) return data as RouteSummary[];
  if (data && typeof data === "object" && Array.isArray((data as { routes?: unknown }).routes)) {
    return (data as { routes: RouteSummary[] }).routes;
  }
  return [];
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return "Request failed.";
};

type StopOption = {
  stop_id: string;
  stop_name: string;
  stop_lat?: number;
  stop_lon?: number;
};
type PickMode = "start" | "end" | null;

const FastestPathSearch = ({ onCloseAction }: Props) => {
  const [startLocation, setStartLocation] = useState("Lausanne");
  const [destination, setDestination] = useState("Geneve");
  const [departureDate, setDepartureDate] = useState("2026-02-03");
  const [departureTime, setDepartureTime] = useState("10:55");
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [startStop, setStartStop] = useState<StopOption | null>(null);
  const [endStop, setEndStop] = useState<StopOption | null>(null);
  const [startOptions, setStartOptions] = useState<StopOption[]>([]);
  const [endOptions, setEndOptions] = useState<StopOption[]>([]);
  const [isSearchingStart, setIsSearchingStart] = useState(false);
  const [isSearchingEnd, setIsSearchingEnd] = useState(false);
  const [pickMode, setPickMode] = useState<PickMode>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent("app:fastest-path-pick", { detail: { mode: null } }));
    };
  }, []);

  useEffect(() => {
    let active = true;
    const query = startLocation.trim();
    if (query.length < 2) {
      setStartOptions([]);
      return;
    }

    setIsSearchingStart(true);
    const timer = setTimeout(() => {
      searchProcessedStops(query)
        .then((data) => {
          if (!active) return;
          setStartOptions(Array.isArray(data) ? data : []);
        })
        .catch(() => {
          if (!active) return;
          setStartOptions([]);
        })
        .finally(() => {
          if (!active) return;
          setIsSearchingStart(false);
        });
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [startLocation]);

  useEffect(() => {
    let active = true;
    const query = destination.trim();
    if (query.length < 2) {
      setEndOptions([]);
      return;
    }

    setIsSearchingEnd(true);
    const timer = setTimeout(() => {
      searchProcessedStops(query)
        .then((data) => {
          if (!active) return;
          setEndOptions(Array.isArray(data) ? data : []);
        })
        .catch(() => {
          if (!active) return;
          setEndOptions([]);
        })
        .finally(() => {
          if (!active) return;
          setIsSearchingEnd(false);
        });
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [destination]);

  const handleSearch = async () => {
    const departureTimeValue = buildDepartureDateTime(departureDate, departureTime);
    if (!departureTimeValue) {
      setErrorMessage("Please provide a valid date and time.");
      return;
    }

    if (!startStop || !endStop) {
      setErrorMessage("Please select both stops from the suggestions.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const payload: FastestPathRequest = {
      start_stop_id: startStop.stop_id,
      end_stop_id: endStop.stop_id,
      departure_time: departureTimeValue,
      algorithm: "raptor",
    };

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await fetchFastestPath(payload, { signal: controller.signal });
      const nextRoutes = normalizeRoutes(data);
      if (!nextRoutes.length) {
        setErrorMessage("No routes returned by the backend.");
      }
      setRoutes(nextRoutes);
      setSelectedRouteId(null);
      setSelectedSegmentId(null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

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

  useEffect(() => {
    const handler = (e: any) => {
      const mode = e?.detail?.mode as PickMode;
      const stop = e?.detail?.stop as StopOption | undefined;
      if (!mode || !stop) return;
      if (mode === "start") {
        setStartStop(stop);
        setStartLocation(stop.stop_name);
        setStartOptions([]);
      } else {
        setEndStop(stop);
        setDestination(stop.stop_name);
        setEndOptions([]);
      }
      setPickMode(null);
    };
    window.addEventListener("app:fastest-path-stop", handler as EventListener);
    return () => window.removeEventListener("app:fastest-path-stop", handler as EventListener);
  }, []);

  const handlePickMode = (mode: PickMode) => {
    const nextMode = pickMode === mode ? null : mode;
    setPickMode(nextMode);
    window.dispatchEvent(new CustomEvent("app:fastest-path-pick", { detail: { mode: nextMode } }));
  };

  const selectTopStart = () => {
    const top = startOptions[0];
    if (!top) return;
    setStartLocation(top.stop_name);
    setStartStop(top);
    setStartOptions([]);
  };

  const selectTopEnd = () => {
    const top = endOptions[0];
    if (!top) return;
    setDestination(top.stop_name);
    setEndStop(top);
    setEndOptions([]);
  };

  return (
    <div
      className={`absolute left-6 top-[92px] z-[130] w-[min(94vw,720px)] max-w-[94vw] transition-all duration-200 ${
        pickMode ? "max-w-[360px] opacity-90" : ""
      }`}
    >
      {!selectedRoute && (
        <div
          className={`space-y-4 rounded-[28px] bg-white shadow-2xl border border-neutral-100 transition-all duration-200 ${
            pickMode ? "p-3" : "p-5"
          }`}
        >
          {pickMode && (
            <div className="rounded-[16px] border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              Click on the map to set the {pickMode === "start" ? "start" : "destination"} stop.
            </div>
          )}
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
                  onChange={(event) => {
                    setStartLocation(event.target.value);
                    setStartStop(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !startStop && startOptions.length) {
                      event.preventDefault();
                      selectTopStart();
                    }
                  }}
                />
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <button
                    type="button"
                    onClick={() => handlePickMode("start")}
                    className={`rounded-full border px-2 py-0.5 transition ${
                      pickMode === "start"
                        ? "border-blue-300 text-blue-600 bg-blue-50"
                        : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
                    }`}
                  >
                    {pickMode === "start" ? "Click on map to pick start" : "Pick start on map"}
                  </button>
                  {startStop && (
                    <span className="text-neutral-500">Selected: {startStop.stop_name}</span>
                  )}
                </div>
                {isSearchingStart && (
                  <div className="text-xs text-neutral-400">Searching...</div>
                )}
                {!!startOptions.length && !startStop && (
                  <div className="max-h-40 overflow-auto rounded-xl border border-neutral-200 bg-white text-sm shadow">
                    {startOptions.map((stop) => (
                      <button
                        key={stop.stop_id}
                        type="button"
                        onClick={() => {
                          setStartLocation(stop.stop_name);
                          setStartStop(stop);
                          setStartOptions([]);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-neutral-50"
                      >
                        <div className="text-sm text-neutral-700">{stop.stop_name}</div>
                        <div className="text-xs text-neutral-400">{stop.stop_id}</div>
                      </button>
                    ))}
                  </div>
                )}
                <div className="h-px w-full bg-neutral-200" />
                <input
                  className="w-full rounded-xl border border-transparent bg-neutral-50 px-4 py-3 text-base text-neutral-700 outline-none transition focus:border-neutral-300"
                  placeholder="Destination"
                  value={destination}
                  onChange={(event) => {
                    setDestination(event.target.value);
                    setEndStop(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !endStop && endOptions.length) {
                      event.preventDefault();
                      selectTopEnd();
                    }
                  }}
                />
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <button
                    type="button"
                    onClick={() => handlePickMode("end")}
                    className={`rounded-full border px-2 py-0.5 transition ${
                      pickMode === "end"
                        ? "border-blue-300 text-blue-600 bg-blue-50"
                        : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
                    }`}
                  >
                    {pickMode === "end" ? "Click on map to pick destination" : "Pick destination on map"}
                  </button>
                  {endStop && (
                    <span className="text-neutral-500">Selected: {endStop.stop_name}</span>
                  )}
                </div>
                {isSearchingEnd && (
                  <div className="text-xs text-neutral-400">Searching...</div>
                )}
                {!!endOptions.length && !endStop && (
                  <div className="max-h-40 overflow-auto rounded-xl border border-neutral-200 bg-white text-sm shadow">
                    {endOptions.map((stop) => (
                      <button
                        key={stop.stop_id}
                        type="button"
                        onClick={() => {
                          setDestination(stop.stop_name);
                          setEndStop(stop);
                          setEndOptions([]);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-neutral-50"
                      >
                        <div className="text-sm text-neutral-700">{stop.stop_name}</div>
                        <div className="text-xs text-neutral-400">{stop.stop_id}</div>
                      </button>
                    ))}
                  </div>
                )}
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

          <button
            type="button"
            onClick={handleSearch}
            disabled={
              isLoading ||
              !startLocation.trim() ||
              !destination.trim() ||
              !departureDate ||
              !departureTime ||
              !startStop ||
              !endStop
            }
            className="rounded-[20px] border border-blue-200 bg-blue-50 px-6 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-400"
          >
            {isLoading ? "Searching..." : "Search"}
          </button>

          {errorMessage && (
            <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-600">
              {errorMessage}
            </div>
          )}

          <div className="text-center text-sm font-semibold uppercase tracking-[0.3em] text-neutral-400">
            Results
          </div>

          <div className="results-scroll max-h-[46vh] overflow-auto rounded-[24px] bg-white px-2 py-2 border border-neutral-100">
            {!routes.length && !isLoading && !errorMessage && (
              <div className="px-4 py-6 text-center text-xs text-neutral-400">
                No results yet. Launch a search to see routes.
              </div>
            )}
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
