"use client";

import { useEffect, useRef, useState } from "react";
import FastestPathRouteDetails, {
  RouteSummary,
} from "../fastest_path_route/FastestPathRouteDetails";
import { fetchFastestPath, FastestPathRequest } from "@/services/FastestPathApiCalls";
import { searchProcessedStops } from "@/services/StopsApiCalls";
import { getRouteGeometryByTrip } from "@/services/RouteApi";

type Props = {
  onCloseAction: () => void;
};

const buildDepartureDateTime = (date: string, time: string) => {
  if (!date || !time) return null;
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  return `${date}T${normalizedTime}`;
};

type RaptorStopPoint = {
  trip_id: string;
  stop_id: string;
  arrival_time: number;
};

type RaptorOption = {
  departure_time?: number;
  transfers?: number;
  duration_seconds?: number;
  segments: RaptorStopPoint[];
};

type RaptorResponse = {
  algorithm?: string;
  transfers?: number;
  duration_seconds?: number;
  segments?: RaptorStopPoint[];
  options?: RaptorOption[];
  routes?: unknown;
};

type TripMeta = {
  line: string;
  direction: string;
  mode: "train" | "bus" | "tram" | "walk" | "metro" | "ferry" | "cable";
  stopNameById: Record<string, string>;
};

type RouteFeatureStop = {
  stop_id: string;
  stop_name?: string;
  stop_lat?: number;
  stop_lon?: number;
};

type RouteFeature = {
  type: "Feature";
  geometry: {
    type: "LineString";
    coordinates: number[][];
  } | null;
  properties: Record<string, unknown> & {
    stops?: RouteFeatureStop[];
    route_id?: string;
    route_short_name?: string;
    route_long_name?: string;
    route_color?: string;
    segment_id?: string;
    trip_id?: string;
  };
};

type FastestPathGeometryDetail = {
  features: RouteFeature[];
  selectedSegmentId: string | null;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isRouteSummaryArray = (value: unknown): value is RouteSummary[] => {
  if (!Array.isArray(value)) return false;
  if (!value.length) return true;
  const first = value[0];
  return isObjectRecord(first) && typeof first.id === "string" && Array.isArray(first.segments);
};

const formatSecondsToClock = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "--:--";
  const normalized = ((Math.floor(seconds) % 86400) + 86400) % 86400;
  const hh = String(Math.floor(normalized / 3600)).padStart(2, "0");
  const mm = String(Math.floor((normalized % 3600) / 60)).padStart(2, "0");
  return `${hh}:${mm}`;
};

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}m`;
  if (!minutes) return `${hours}h`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
};

const modeFromRouteType = (routeType: unknown): TripMeta["mode"] => {
  const value = typeof routeType === "number" ? routeType : Number(routeType);
  if (!Number.isFinite(value)) return "train";
  if (value === 0) return "tram";
  if (value === 1) return "metro";
  if (value === 2) return "train";
  if (value === 6 || value === 1300) return "cable";
  if (value === 4 || value === 5 || value === 7 || value === 11 || value === 12)
    return "ferry";
  if (value === 3 || value === 200 || value === 700 || value === 800) return "bus";
  return "train";
};

const groupConsecutiveByTrip = (points: RaptorStopPoint[]) => {
  const groups: RaptorStopPoint[][] = [];
  for (const point of points) {
    const current = groups[groups.length - 1];
    if (!current || current[0]?.trip_id !== point.trip_id) {
      groups.push([point]);
    } else {
      current.push(point);
    }
  }
  return groups;
};

const deduplicateConsecutiveStops = (points: RaptorStopPoint[]) => {
  const cleaned: RaptorStopPoint[] = [];
  for (const point of points) {
    const previous = cleaned[cleaned.length - 1];
    if (previous?.stop_id === point.stop_id && previous.arrival_time === point.arrival_time) {
      continue;
    }
    cleaned.push(point);
  }
  return cleaned;
};

const readTripMetaFromFeature = (feature: unknown): TripMeta => {
  const fallback: TripMeta = {
    line: "Transit",
    direction: "",
    mode: "train",
    stopNameById: {},
  };

  if (!isObjectRecord(feature) || !isObjectRecord(feature.properties)) return fallback;

  const properties = feature.properties;
  const line =
    typeof properties.route_short_name === "string" && properties.route_short_name.trim()
      ? properties.route_short_name
      : typeof properties.route_long_name === "string" && properties.route_long_name.trim()
        ? properties.route_long_name
        : fallback.line;
  const direction =
    typeof properties.trip_headsign === "string"
      ? properties.trip_headsign
      : typeof properties.route_long_name === "string"
        ? properties.route_long_name
        : "";

  const stopNameById: Record<string, string> = {};
  if (Array.isArray(properties.stops)) {
    for (const stop of properties.stops) {
      if (!isObjectRecord(stop)) continue;
      if (typeof stop.stop_id === "string" && typeof stop.stop_name === "string") {
        stopNameById[stop.stop_id] = stop.stop_name;
      }
    }
  }

  return {
    line,
    direction,
    mode: modeFromRouteType(properties.route_type),
    stopNameById,
  };
};

const nearestCoordinateIndex = (coordinates: number[][], lat: number, lon: number) => {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  coordinates.forEach((coord, index) => {
    const coordLon = Number(coord[0]);
    const coordLat = Number(coord[1]);
    if (!Number.isFinite(coordLat) || !Number.isFinite(coordLon)) return;
    const dLat = coordLat - lat;
    const dLon = coordLon - lon;
    const distance = dLat * dLat + dLon * dLon;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
};

const clipFeatureToStopRange = (
  feature: RouteFeature,
  startStopId?: string,
  endStopId?: string
): RouteFeature => {
  const stops = Array.isArray(feature.properties.stops) ? feature.properties.stops : [];
  if (!startStopId || !endStopId || !stops.length || !feature.geometry?.coordinates?.length) {
    return feature;
  }

  const startStopIndex = stops.findIndex((stop) => stop.stop_id === startStopId);
  const endStopIndex = stops.findIndex((stop) => stop.stop_id === endStopId);
  if (startStopIndex < 0 || endStopIndex < 0) return feature;

  const [minStopIndex, maxStopIndex] =
    startStopIndex <= endStopIndex
      ? [startStopIndex, endStopIndex]
      : [endStopIndex, startStopIndex];
  const clippedStops = stops.slice(minStopIndex, maxStopIndex + 1);

  const startStop = stops[startStopIndex];
  const endStop = stops[endStopIndex];

  if (
    !startStop ||
    !endStop ||
    !Number.isFinite(Number(startStop.stop_lat)) ||
    !Number.isFinite(Number(startStop.stop_lon)) ||
    !Number.isFinite(Number(endStop.stop_lat)) ||
    !Number.isFinite(Number(endStop.stop_lon))
  ) {
    return {
      ...feature,
      properties: {
        ...feature.properties,
        stops: clippedStops,
      },
    };
  }

  const startCoordIndex = nearestCoordinateIndex(
    feature.geometry.coordinates,
    Number(startStop.stop_lat),
    Number(startStop.stop_lon)
  );
  const endCoordIndex = nearestCoordinateIndex(
    feature.geometry.coordinates,
    Number(endStop.stop_lat),
    Number(endStop.stop_lon)
  );

  const minCoordIndex = Math.min(startCoordIndex, endCoordIndex);
  const maxCoordIndex = Math.max(startCoordIndex, endCoordIndex);
  let clippedCoords = feature.geometry.coordinates.slice(minCoordIndex, maxCoordIndex + 1);

  if (startCoordIndex > endCoordIndex) {
    clippedCoords = clippedCoords.reverse();
  }

  return {
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: clippedCoords.length ? clippedCoords : feature.geometry.coordinates,
    },
    properties: {
      ...feature.properties,
      stops: clippedStops,
    },
  };
};

const dispatchFastestPathGeometry = (detail: FastestPathGeometryDetail) => {
  window.dispatchEvent(new CustomEvent("app:fastest-path-geometry", { detail }));
};

const normalizeRoutes = async (data: unknown): Promise<RouteSummary[]> => {
  if (isRouteSummaryArray(data)) return data;

  if (
    isObjectRecord(data) &&
    Array.isArray((data as RaptorResponse).routes) &&
    isRouteSummaryArray((data as RaptorResponse).routes)
  ) {
    return (data as RaptorResponse).routes as RouteSummary[];
  }

  if (!isObjectRecord(data)) return [];

  const response = data as RaptorResponse;
  const options = Array.isArray(response.options) && response.options.length
    ? response.options
    : Array.isArray(response.segments)
      ? [
          {
            transfers: response.transfers,
            duration_seconds: response.duration_seconds,
            segments: response.segments,
          },
        ]
      : [];

  if (!options.length) return [];

  const uniqueTripIds = Array.from(
    new Set(
      options
        .flatMap((option) => option.segments ?? [])
        .map((point) => point.trip_id)
        .filter((tripId): tripId is string => typeof tripId === "string" && !!tripId)
    )
  );

  const tripMetaMap = new Map<string, TripMeta>();
  await Promise.all(
    uniqueTripIds.map(async (tripId) => {
      try {
        const feature = await getRouteGeometryByTrip(tripId, { includeStops: true, maxTrips: 1 });
        tripMetaMap.set(tripId, readTripMetaFromFeature(feature));
      } catch {
        tripMetaMap.set(tripId, {
          line: tripId,
          direction: "",
          mode: "train",
          stopNameById: {},
        });
      }
    })
  );

  return options
    .map((option, optionIndex): RouteSummary | null => {
      const points = Array.isArray(option.segments) ? deduplicateConsecutiveStops(option.segments) : [];
      if (!points.length) return null;

      const tripGroups = groupConsecutiveByTrip(points);
      if (!tripGroups.length) return null;

      const segments = tripGroups
        .map((group, groupIndex): RouteSummary["segments"][number] | null => {
          const firstPoint = group[0];
          const lastPoint = group[group.length - 1];
          if (!firstPoint || !lastPoint) return null;

          const tripMeta = tripMetaMap.get(firstPoint.trip_id) ?? {
            line: firstPoint.trip_id,
            direction: "",
            mode: "train" as const,
            stopNameById: {},
          };

          const stops = group.map((stopPoint) => ({
            time: formatSecondsToClock(stopPoint.arrival_time),
            name: tripMeta.stopNameById[stopPoint.stop_id] ?? stopPoint.stop_id,
            stop_id: stopPoint.stop_id,
          }));

          const segmentDuration = Math.max(0, lastPoint.arrival_time - firstPoint.arrival_time);

          const segment: RouteSummary["segments"][number] = {
            id: `route-${optionIndex + 1}-segment-${groupIndex + 1}`,
            mode: tripMeta.mode,
            line: tripMeta.line,
            direction: tripMeta.direction,
            travelTime: formatDuration(segmentDuration),
            trip_id: firstPoint.trip_id,
            start_stop_id: firstPoint.stop_id,
            end_stop_id: lastPoint.stop_id,
            stops,
          };

          if (groupIndex < tripGroups.length - 1) {
            segment.transferAfter = "Transfer";
          }

          return segment;
        })
        .filter((segment): segment is RouteSummary["segments"][number] => segment !== null);

      if (!segments.length) return null;

      const firstStop = segments[0].stops[0];
      const lastSegment = segments[segments.length - 1];
      const lastStop = lastSegment.stops[lastSegment.stops.length - 1];

      if (!firstStop || !lastStop) return null;

      const firstSegmentMeta = segments[0];
      const durationSeconds =
        typeof option.duration_seconds === "number" && Number.isFinite(option.duration_seconds)
          ? option.duration_seconds
          : Math.max(0, points[points.length - 1].arrival_time - points[0].arrival_time);

      return {
        id: `route-${optionIndex + 1}`,
        line: firstSegmentMeta.line,
        direction: firstSegmentMeta.direction,
        from: firstStop,
        to: lastStop,
        duration: formatDuration(durationSeconds),
        segments,
      };
    })
    .filter((route): route is RouteSummary => !!route);
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
type FastestPathStopPickDetail = {
  mode?: PickMode;
  stop?: StopOption;
};

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
  const enrichedRoutesRef = useRef<Set<string>>(new Set());
  const routeGeometryByRouteIdRef = useRef<Map<string, RouteFeature[]>>(new Map());

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent("app:fastest-path-pick", { detail: { mode: null } }));
      dispatchFastestPathGeometry({ features: [], selectedSegmentId: null });
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
      const nextRoutes = await normalizeRoutes(data);
      if (!nextRoutes.length) {
        setErrorMessage("No routes returned by the backend.");
      }
      enrichedRoutesRef.current.clear();
      routeGeometryByRouteIdRef.current.clear();
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
    if (!selectedRouteId) {
      dispatchFastestPathGeometry({ features: [], selectedSegmentId: null });
      return;
    }

    const activeRoute = routes.find((route) => route.id === selectedRouteId);
    if (!activeRoute) return;

    const cachedFeatures = routeGeometryByRouteIdRef.current.get(selectedRouteId);
    if (cachedFeatures && enrichedRoutesRef.current.has(selectedRouteId)) {
      dispatchFastestPathGeometry({ features: cachedFeatures, selectedSegmentId });
      return;
    }

    let cancelled = false;

    const enrichSelectedRoute = async () => {
      const nextSegments: RouteSummary["segments"] = [];
      const nextFeatures: RouteFeature[] = [];

      for (const segment of activeRoute.segments) {
        if (!segment.trip_id) {
          nextSegments.push(segment);
          continue;
        }

        try {
          const feature = (await getRouteGeometryByTrip(segment.trip_id, {
            includeStops: true,
            maxTrips: 1,
          })) as RouteFeature;
          const clipped = clipFeatureToStopRange(feature, segment.start_stop_id, segment.end_stop_id);

          const clippedStops = Array.isArray(clipped.properties.stops) ? clipped.properties.stops : [];
          const stopNameById = new Map<string, string>();
          clippedStops.forEach((stop) => {
            if (typeof stop.stop_id === "string" && typeof stop.stop_name === "string") {
              stopNameById.set(stop.stop_id, stop.stop_name);
            }
          });

          const routeShortName =
            typeof clipped.properties.route_short_name === "string" &&
            clipped.properties.route_short_name.trim()
              ? clipped.properties.route_short_name
              : segment.line;
          const routeLongName =
            typeof clipped.properties.route_long_name === "string" &&
            clipped.properties.route_long_name.trim()
              ? clipped.properties.route_long_name
              : segment.direction;

          nextSegments.push({
            ...segment,
            line: routeShortName,
            direction: routeLongName,
            stops: segment.stops.map((stop) => ({
              ...stop,
              name:
                stop.stop_id && stopNameById.has(stop.stop_id)
                  ? stopNameById.get(stop.stop_id) ?? stop.name
                  : stop.name,
            })),
          });

          nextFeatures.push({
            ...clipped,
            properties: {
              ...clipped.properties,
              route_short_name: routeShortName,
              route_long_name: routeLongName,
              segment_id: segment.id,
              trip_id: segment.trip_id,
            },
          });
        } catch {
          nextSegments.push(segment);
        }
      }

      if (cancelled) return;

      const updatedRoute: RouteSummary = {
        ...activeRoute,
        segments: nextSegments,
        from: nextSegments[0]?.stops[0] ?? activeRoute.from,
        to:
          nextSegments[nextSegments.length - 1]?.stops[
            Math.max(0, (nextSegments[nextSegments.length - 1]?.stops.length ?? 1) - 1)
          ] ?? activeRoute.to,
      };

      setRoutes((previous) =>
        previous.map((route) => (route.id === selectedRouteId ? updatedRoute : route))
      );

      enrichedRoutesRef.current.add(selectedRouteId);
      routeGeometryByRouteIdRef.current.set(selectedRouteId, nextFeatures);
      dispatchFastestPathGeometry({ features: nextFeatures, selectedSegmentId });
    };

    enrichSelectedRoute();

    return () => {
      cancelled = true;
    };
  }, [routes, selectedRouteId, selectedSegmentId]);

  useEffect(() => {
    if (!selectedRouteId) return;
    const cached = routeGeometryByRouteIdRef.current.get(selectedRouteId);
    if (!cached) return;
    dispatchFastestPathGeometry({ features: cached, selectedSegmentId });
  }, [selectedRouteId, selectedSegmentId]);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<FastestPathStopPickDetail>;
      const mode = customEvent.detail?.mode;
      const stop = customEvent.detail?.stop;
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
      className={`absolute top-[92px] z-[130] w-[min(94vw,720px)] max-w-[94vw] transition-all duration-200 ${
        pickMode || selectedRoute
          ? "left-6 translate-x-0 max-w-[360px] opacity-90"
          : "left-1/2 -translate-x-1/2"
      }`}
    >
      {!selectedRoute && (
        <div
          className={`space-y-4 rounded-[28px] bg-white shadow-2xl border border-neutral-100 transition-all duration-200 max-h-[calc(100vh-120px)] overflow-y-auto ${
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
            onClose={handleCloseDetails}
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
