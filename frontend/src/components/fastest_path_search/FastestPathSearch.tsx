"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import FastestPathRouteDetails, {
  RealtimeStatus,
  RouteSummary,
} from "../fastest_path_route/FastestPathRouteDetails";
import { fetchFastestPath, FastestPathRequest } from "@/services/FastestPathApiCalls";
import { searchProcessedStops } from "@/services/StopsApiCalls";
import { getRouteGeometryByTrip } from "@/services/RouteApi";
import {
  RealtimeTripUpdate,
  realtimeUpdatesByTripIds,
} from "@/services/RealtimeApiCalls";

type Props = {
  onCloseAction: () => void;
};

const buildDepartureTimestamp = (date: string, time: string) => {
  if (!date || !time) return null;
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const dt = new Date(`${date}T${normalizedTime}`);
  const millis = dt.getTime();
  if (!Number.isFinite(millis)) return null;
  return String(Math.floor(millis / 1000));
};

const getCurrentDateAndTime = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  };
};

type RaptorStopPoint = {
  trip_id: string;
  stop_id: string;
  arrival_time: number;
  from_stop_id?: string;
  walk_duration_seconds?: number;
  walking_geometry?: {
    type?: string;
    coordinates?: number[][];
  };
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

type StopCoordinate = {
  lat: number;
  lon: number;
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

const clockToSeconds = (clock: string) => {
  const parts = String(clock).split(":").map((value) => Number(value));
  if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
    return null;
  }
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  if (hh < 0 || hh > 47 || mm < 0 || mm > 59) return null;
  return hh * 3600 + mm * 60;
};

const shiftClockBySeconds = (clock: string, deltaSeconds: number) => {
  const base = clockToSeconds(clock);
  if (base == null || !Number.isFinite(deltaSeconds)) return clock;
  return formatSecondsToClock(base + deltaSeconds);
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

const isCoordinatePair = (value: unknown): value is number[] =>
  Array.isArray(value) && value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]));

const normalizeLineGeometry = (geometry: unknown): number[][] => {
  if (!Array.isArray(geometry)) return [];
  return geometry
    .map((coord) => (isCoordinatePair(coord) ? [Number(coord[0]), Number(coord[1])] : null))
    .filter((coord): coord is number[] => Array.isArray(coord));
};

const formatTransferText = (segment: RouteSummary["segments"][number]) => {
  if (segment.mode !== "walk") return segment.line;
  if (segment.line.toLowerCase() === "walk") return `Walk ${segment.travelTime}`;
  return `${segment.line} ${segment.travelTime}`;
};

const looksLikeStopId = (value?: string) => {
  if (!value) return false;
  return /[:]/.test(value) || /^\d+$/.test(value);
};

const ensureReadableStopName = (
  stop: RouteSummary["from"] | RouteSummary["to"],
  fallbackName?: string
) => {
  if (!fallbackName?.trim()) return stop;
  if (stop.name && !looksLikeStopId(stop.name)) return stop;
  return {
    ...stop,
    name: fallbackName,
  };
};

const applyEndpointFallbackNames = (
  routes: RouteSummary[],
  startStopName?: string,
  endStopName?: string
) => {
  return routes.map((route) => ({
    ...route,
    from: ensureReadableStopName(route.from, startStopName),
    to: ensureReadableStopName(route.to, endStopName),
    segments: route.segments.map((segment, index, allSegments) => {
      if (!segment.stops.length) return segment;

      const nextStops = [...segment.stops];
      if (index === 0 && looksLikeStopId(nextStops[0]?.name) && startStopName?.trim()) {
        nextStops[0] = {
          ...nextStops[0],
          name: startStopName,
        };
      }

      if (
        index === allSegments.length - 1 &&
        looksLikeStopId(nextStops[nextStops.length - 1]?.name) &&
        endStopName?.trim()
      ) {
        const lastIndex = nextStops.length - 1;
        nextStops[lastIndex] = {
          ...nextStops[lastIndex],
          name: endStopName,
        };
      }

      return {
        ...segment,
        stops: nextStops,
      };
    }),
  }));
};

const resolveStopNameFromSearch = (result: unknown, stopId: string) => {
  if (!Array.isArray(result)) return undefined;

  const exactMatch = result.find(
    (item) =>
      isObjectRecord(item) &&
      typeof item.stop_id === "string" &&
      item.stop_id === stopId &&
      typeof item.stop_name === "string" &&
      !!item.stop_name.trim()
  );
  if (isObjectRecord(exactMatch) && typeof exactMatch.stop_name === "string") {
    return exactMatch.stop_name;
  }

  const firstNamed = result.find(
    (item) =>
      isObjectRecord(item) && typeof item.stop_name === "string" && !!item.stop_name.trim()
  );
  if (isObjectRecord(firstNamed) && typeof firstNamed.stop_name === "string") {
    return firstNamed.stop_name;
  }

  return undefined;
};

const hydrateRouteStopNames = async (
  route: RouteSummary,
  startStopName?: string,
  endStopName?: string
): Promise<RouteSummary> => {
  const routeWithEndpoints = applyEndpointFallbackNames([route], startStopName, endStopName)[0];
  if (!routeWithEndpoints) return route;

  const knownStopNameById = new Map<string, string>();
  routeWithEndpoints.segments.forEach((segment) => {
    segment.stops.forEach((stop) => {
      if (!stop.stop_id || !stop.name || looksLikeStopId(stop.name)) return;
      knownStopNameById.set(stop.stop_id, stop.name);
    });
  });

  const unresolvedStopIds = Array.from(
    new Set(
      routeWithEndpoints.segments
        .flatMap((segment) => segment.stops)
        .map((stop) => stop.stop_id)
        .filter(
          (stopId): stopId is string =>
            typeof stopId === "string" &&
            !!stopId &&
            !knownStopNameById.has(stopId)
        )
    )
  );

  if (unresolvedStopIds.length) {
    await Promise.all(
      unresolvedStopIds.map(async (stopId) => {
        try {
          const searchResult = await searchProcessedStops(stopId);
          const resolvedName = resolveStopNameFromSearch(searchResult, stopId);
          if (resolvedName) {
            knownStopNameById.set(stopId, resolvedName);
          }
        } catch {
          // Ignore stop lookup failures and keep existing values.
        }
      })
    );
  }

  const nextSegments = routeWithEndpoints.segments.map((segment) => {
    const nextStops = segment.stops.map((stop) => {
      if (!stop.stop_id || !knownStopNameById.has(stop.stop_id)) return stop;
      const resolvedName = knownStopNameById.get(stop.stop_id);
      if (!resolvedName) return stop;
      if (stop.name && !looksLikeStopId(stop.name)) return stop;
      return {
        ...stop,
        name: resolvedName,
      };
    });

    if (segment.mode !== "walk") {
      return {
        ...segment,
        stops: nextStops,
      };
    }

    const firstStop = nextStops[0];
    const lastStop = nextStops[nextStops.length - 1];
    const nextDirection =
      firstStop && lastStop
        ? firstStop.stop_id && lastStop.stop_id && firstStop.stop_id === lastStop.stop_id
          ? `Change at ${firstStop.name}`
          : `${firstStop.name} → ${lastStop.name}`
        : segment.direction;

    return {
      ...segment,
      direction: nextDirection,
      stops: nextStops,
    };
  });

  const firstStop = nextSegments[0]?.stops[0] ?? routeWithEndpoints.from;
  const lastSegment = nextSegments[nextSegments.length - 1];
  const lastStop =
    lastSegment?.stops[Math.max(0, (lastSegment.stops.length ?? 1) - 1)] ?? routeWithEndpoints.to;

  return {
    ...routeWithEndpoints,
    segments: nextSegments,
    from: ensureReadableStopName(firstStop, startStopName),
    to: ensureReadableStopName(lastStop, endStopName),
  };
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

const normalizeStopIdToken = (value?: string) => {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const baseToken = trimmed.split(":")[0] ?? trimmed;
  return baseToken.trim().toLowerCase();
};

const stopIdsMatch = (left?: string, right?: string) => {
  if (!left || !right) return false;
  if (left === right) return true;

  const leftToken = normalizeStopIdToken(left);
  const rightToken = normalizeStopIdToken(right);
  if (leftToken && rightToken && leftToken === rightToken) return true;

  return left.startsWith(`${right}:`) || right.startsWith(`${left}:`);
};

const findStopIndexById = (stops: RouteFeatureStop[], stopId?: string) => {
  if (!stopId) return -1;

  const exactIndex = stops.findIndex((stop) => stop.stop_id === stopId);
  if (exactIndex >= 0) return exactIndex;

  return stops.findIndex((stop) => stopIdsMatch(stop.stop_id, stopId));
};

const getFastestPathSegmentColor = (mode: RouteSummary["segments"][number]["mode"]) => {
  const colors: Record<RouteSummary["segments"][number]["mode"], string> = {
    train: "#2563eb",
    bus: "#2563eb",
    tram: "#7c3aed",
    metro: "#db2777",
    ferry: "#0891b2",
    cable: "#ca8a04",
    walk: "#6b7280",
  };

  return colors[mode] ?? colors.train;
};

const readStopCoordinateFromFeatureStop = (stop?: RouteFeatureStop | null): StopCoordinate | null => {
  if (!stop) return null;
  const lat = Number(stop.stop_lat);
  const lon = Number(stop.stop_lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
};

const resolveStopCoordinateFromMap = (
  stopId: string | undefined,
  coordinatesByStopId: Map<string, StopCoordinate>
) => {
  if (!stopId) return null;

  const exact = coordinatesByStopId.get(stopId);
  if (exact) return exact;

  const normalized = normalizeStopIdToken(stopId);
  if (!normalized) return null;

  const normalizedKey = `norm:${normalized}`;
  const normalizedExact = coordinatesByStopId.get(normalizedKey);
  if (normalizedExact) return normalizedExact;

  for (const [key, value] of coordinatesByStopId.entries()) {
    if (key.startsWith("norm:")) continue;
    if (stopIdsMatch(key, stopId)) return value;
  }

  return null;
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

  const startStopIndex = findStopIndexById(stops, startStopId);
  const endStopIndex = findStopIndexById(stops, endStopId);
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

const clipFeatureToCoordinateRange = (
  feature: RouteFeature,
  startCoord?: StopCoordinate | null,
  endCoord?: StopCoordinate | null
): RouteFeature => {
  if (!feature.geometry?.coordinates?.length || !startCoord || !endCoord) {
    return feature;
  }

  const startCoordIndex = nearestCoordinateIndex(
    feature.geometry.coordinates,
    startCoord.lat,
    startCoord.lon
  );
  const endCoordIndex = nearestCoordinateIndex(
    feature.geometry.coordinates,
    endCoord.lat,
    endCoord.lon
  );

  const minCoordIndex = Math.min(startCoordIndex, endCoordIndex);
  const maxCoordIndex = Math.max(startCoordIndex, endCoordIndex);
  let clippedCoords = feature.geometry.coordinates.slice(minCoordIndex, maxCoordIndex + 1);

  if (startCoordIndex > endCoordIndex) {
    clippedCoords = clippedCoords.reverse();
  }

  if (!clippedCoords.length) return feature;

  return {
    ...feature,
    geometry: {
      ...feature.geometry,
      coordinates: clippedCoords,
    },
  };
};

const anchorCoordinatesToStops = (
  coordinates: number[][],
  startCoord?: StopCoordinate | null,
  endCoord?: StopCoordinate | null
) => {
  if (!Array.isArray(coordinates) || !coordinates.length) return coordinates;

  const anchored = [...coordinates];
  const epsilon = 1e-6;
  const samePoint = (left?: number[], right?: number[]) => {
    if (!left || !right || left.length < 2 || right.length < 2) return false;
    return (
      Math.abs(Number(left[0]) - Number(right[0])) <= epsilon &&
      Math.abs(Number(left[1]) - Number(right[1])) <= epsilon
    );
  };

  if (startCoord) {
    const startPoint = [startCoord.lon, startCoord.lat];
    if (!samePoint(anchored[0], startPoint)) {
      anchored.unshift(startPoint);
    }
  }

  if (endCoord) {
    const endPoint = [endCoord.lon, endCoord.lat];
    if (!samePoint(anchored[anchored.length - 1], endPoint)) {
      anchored.push(endPoint);
    }
  }

  return anchored;
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
        .filter(
          (tripId): tripId is string =>
            typeof tripId === "string" && !!tripId && tripId !== "TRANSFER"
        )
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

      const groupedSegments = tripGroups
        .map((group, groupIndex) => {
          const firstPoint = group[0];
          const lastPoint = group[group.length - 1];
          if (!firstPoint || !lastPoint) return null;

          const isTransferGroup = firstPoint.trip_id === "TRANSFER";

          if (isTransferGroup) {
            const fromStopId = firstPoint.from_stop_id ?? firstPoint.stop_id;
            const toStopId = lastPoint.stop_id;
            const walkSeconds = Math.max(0, Number(firstPoint.walk_duration_seconds) || 0);
            const startTime = Math.max(0, firstPoint.arrival_time - walkSeconds);
            const walkingGeometry = normalizeLineGeometry(firstPoint.walking_geometry?.coordinates);

            const transferSegment: RouteSummary["segments"][number] = {
              id: `route-${optionIndex + 1}-segment-transfer-${groupIndex + 1}`,
              mode: "walk",
              line: "Walk",
              direction: `${fromStopId} → ${toStopId}`,
              travelTime: formatDuration(walkSeconds),
              start_stop_id: fromStopId,
              end_stop_id: toStopId,
              walkingGeometry: walkingGeometry.length >= 2 ? walkingGeometry : undefined,
              stops: [
                {
                  time: formatSecondsToClock(startTime),
                  name: fromStopId,
                  stop_id: fromStopId,
                },
                {
                  time: formatSecondsToClock(lastPoint.arrival_time),
                  name: toStopId,
                  stop_id: toStopId,
                },
              ],
            };

            return {
              segment: transferSegment,
              firstPoint,
              lastPoint,
              isTransferGroup: true,
            };
          }

          const tripMeta = tripMetaMap.get(firstPoint.trip_id) ?? {
            line: firstPoint.trip_id,
            direction: "",
            mode: "train" as const,
            stopNameById: {},
          };

          const segmentStartStopId = firstPoint.from_stop_id ?? firstPoint.stop_id;

          const stops: RouteSummary["segments"][number]["stops"] = [];

          if (segmentStartStopId) {
            stops.push({
              time: formatSecondsToClock(firstPoint.arrival_time),
              name: tripMeta.stopNameById[segmentStartStopId] ?? segmentStartStopId,
              stop_id: segmentStartStopId,
            });
          }

          group.forEach((stopPoint) => {
            const stopName = tripMeta.stopNameById[stopPoint.stop_id] ?? stopPoint.stop_id;
            const previousStop = stops[stops.length - 1];
            if (previousStop?.stop_id === stopPoint.stop_id) {
              return;
            }

            stops.push({
              time: formatSecondsToClock(stopPoint.arrival_time),
              name: stopName,
              stop_id: stopPoint.stop_id,
            });
          });

          const segmentDuration = Math.max(0, lastPoint.arrival_time - firstPoint.arrival_time);

          const segment: RouteSummary["segments"][number] = {
            id: `route-${optionIndex + 1}-segment-${groupIndex + 1}`,
            mode: tripMeta.mode,
            line: tripMeta.line,
            direction: tripMeta.direction,
            travelTime: formatDuration(segmentDuration),
            trip_id: firstPoint.trip_id,
            start_stop_id: segmentStartStopId,
            end_stop_id: lastPoint.stop_id,
            stops,
          };

          return {
            segment,
            firstPoint,
            lastPoint,
            isTransferGroup: false,
          };
        })
        .filter(
          (
            entry
          ): entry is {
            segment: RouteSummary["segments"][number];
            firstPoint: RaptorStopPoint;
            lastPoint: RaptorStopPoint;
            isTransferGroup: boolean;
          } => entry !== null
        );

      const segments: RouteSummary["segments"] = [];

      groupedSegments.forEach((entry, index) => {
        segments.push(entry.segment);

        if (index >= groupedSegments.length - 1) return;

        const nextEntry = groupedSegments[index + 1];
        if (entry.isTransferGroup || nextEntry?.isTransferGroup) return;

        const nextBoardingStopId = nextEntry.firstPoint.from_stop_id ?? nextEntry.firstPoint.stop_id;
        const fromStop = entry.segment.stops[entry.segment.stops.length - 1];
        const toStop =
          nextEntry.segment.stops.find((stop) => stop.stop_id === nextBoardingStopId) ??
          nextEntry.segment.stops[0];
        if (!fromStop || !toStop) return;

        const transferSeconds = Math.max(0, nextEntry.firstPoint.arrival_time - entry.lastPoint.arrival_time);
        const sameStop =
          !!entry.lastPoint.stop_id &&
          !!nextBoardingStopId &&
          entry.lastPoint.stop_id === nextBoardingStopId;

        if (transferSeconds <= 0 && sameStop) return;

        const isWalkingTransfer = !sameStop;
        const transferSegment: RouteSummary["segments"][number] = {
          id: `route-${optionIndex + 1}-segment-transfer-${index + 1}`,
          mode: "walk",
          line: isWalkingTransfer ? "Walk" : "Transfer",
          direction: isWalkingTransfer
            ? `${fromStop.name} → ${toStop.name}`
            : `Change at ${fromStop.name}`,
          travelTime: formatDuration(transferSeconds),
          start_stop_id: entry.lastPoint.stop_id,
          end_stop_id: nextBoardingStopId,
          stops: [
            {
              time: formatSecondsToClock(entry.lastPoint.arrival_time),
              name: fromStop.name,
              stop_id: entry.lastPoint.stop_id,
            },
            {
              time: formatSecondsToClock(nextEntry.firstPoint.arrival_time),
              name: toStop.name,
              stop_id: nextBoardingStopId,
            },
          ],
        };

        segments.push(transferSegment);
      });

      if (!segments.length) return null;

      const firstStop = segments[0].stops[0];
      const lastSegment = segments[segments.length - 1];
      const lastStop = lastSegment.stops[lastSegment.stops.length - 1];

      if (!firstStop || !lastStop) return null;

      const firstSegmentMeta = segments.find((segment) => segment.mode !== "walk") ?? segments[0];
      const durationSeconds =
        typeof option.duration_seconds === "number" && Number.isFinite(option.duration_seconds)
          ? option.duration_seconds
          : Math.max(0, points[points.length - 1].arrival_time - points[0].arrival_time);

      let normalizedLastStop = lastStop;
      const endpointTimesEqual = firstStop.time === lastStop.time;
      if (endpointTimesEqual && durationSeconds > 0) {
        normalizedLastStop = {
          ...lastStop,
          time: shiftClockBySeconds(firstStop.time, durationSeconds),
        };

        const finalSegment = segments[segments.length - 1];
        const finalStopIndex = finalSegment?.stops.length ? finalSegment.stops.length - 1 : -1;
        if (finalSegment && finalStopIndex >= 0) {
          finalSegment.stops[finalStopIndex] = {
            ...finalSegment.stops[finalStopIndex],
            time: normalizedLastStop.time,
          };
        }
      }

      return {
        id: `route-${optionIndex + 1}`,
        line: firstSegmentMeta.line,
        direction: firstSegmentMeta.direction,
        from: firstStop,
        to: normalizedLastStop,
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

const parseDurationToMinutes = (duration: string) => {
  const source = duration.toLowerCase();
  const hourMatch = source.match(/(\d+)\s*h/);
  const minuteMatch = source.match(/(\d+)\s*m/);
  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
};

const routeWalkMinutes = (route: RouteSummary) =>
  route.segments
    .filter((segment) => segment.mode === "walk")
    .reduce((sum, segment) => sum + Math.max(0, parseDurationToMinutes(segment.travelTime) || 0), 0);

const normalizeStatusFromDelay = (delaySeconds: number | null): RealtimeStatus => {
  if (delaySeconds == null || !Number.isFinite(delaySeconds)) return "unknown";
  if (delaySeconds >= 60) return "delayed";
  if (delaySeconds <= -60) return "early";
  return "on-time";
};

const computeDelayFromTripUpdate = (tripUpdate: RealtimeTripUpdate): number | null => {
  const updates = Array.isArray(tripUpdate.stopTimeUpdates) ? tripUpdate.stopTimeUpdates : [];
  if (!updates.length) return null;

  const sorted = [...updates]
    .filter((entry) => typeof entry.stopSequence === "number" || entry.stopId)
    .sort((left, right) => (Number(left.stopSequence ?? 0) - Number(right.stopSequence ?? 0)));

  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const entry = sorted[index];
    const delay =
      typeof entry.departureDelaySecs === "number"
        ? entry.departureDelaySecs
        : typeof entry.arrivalDelaySecs === "number"
          ? entry.arrivalDelaySecs
          : null;
    if (typeof delay === "number" && Number.isFinite(delay)) return delay;
  }

  return null;
};

const buildRealtimeIndex = (tripUpdates: RealtimeTripUpdate[]) => {
  const map = new Map<string, RealtimeTripUpdate>();
  tripUpdates.forEach((tripUpdate) => {
    const tripId = tripUpdate.trip?.tripId;
    const originalTripId = tripUpdate.trip?.originalTripId;
    if (typeof tripId === "string" && tripId.trim()) map.set(tripId, tripUpdate);
    if (typeof originalTripId === "string" && originalTripId.trim()) map.set(originalTripId, tripUpdate);
  });
  return map;
};

const applyRealtimeStatusToRoutes = async (routes: RouteSummary[]) => {
  const tripIds = Array.from(
    new Set(
      routes
        .flatMap((route) => route.segments)
        .map((segment) => segment.trip_id)
        .filter((tripId): tripId is string => typeof tripId === "string" && !!tripId)
    )
  );

  if (!tripIds.length) {
    return {
      routes,
      fetchedAt: null as string | null,
    };
  }

  try {
    const realtimeResponse = await realtimeUpdatesByTripIds(tripIds);
    const updates = Array.isArray(realtimeResponse.tripUpdates)
      ? realtimeResponse.tripUpdates
      : [];
    const indexByTripId = buildRealtimeIndex(updates);

    const enrichedRoutes = routes.map((route) => {
      const enrichedSegments = route.segments.map((segment) => {
        if (!segment.trip_id) return segment;

        const tripUpdate = indexByTripId.get(segment.trip_id);
        if (!tripUpdate) {
          return {
            ...segment,
            realtimeStatus: "unknown" as RealtimeStatus,
            realtimeDelaySeconds: null,
          };
        }

        const tripIsCanceled =
          tripUpdate.trip?.isCanceled === true ||
          tripUpdate.trip?.scheduleRelationship === "CANCELED";
        const delaySeconds = computeDelayFromTripUpdate(tripUpdate);

        return {
          ...segment,
          realtimeStatus: tripIsCanceled
            ? ("canceled" as RealtimeStatus)
            : normalizeStatusFromDelay(delaySeconds),
          realtimeDelaySeconds: delaySeconds,
        };
      });

      const transitSegments = enrichedSegments.filter((segment) => !!segment.trip_id);
      const canceledSegment = transitSegments.find((segment) => segment.realtimeStatus === "canceled");
      const delayedSegments = transitSegments.filter((segment) => segment.realtimeStatus === "delayed");
      const earlySegments = transitSegments.filter((segment) => segment.realtimeStatus === "early");
      const onTimeSegments = transitSegments.filter((segment) => segment.realtimeStatus === "on-time");

      let routeStatus: RealtimeStatus = "unknown";
      let routeDelaySeconds: number | null = null;

      if (canceledSegment) {
        routeStatus = "canceled";
      } else if (delayedSegments.length) {
        routeStatus = "delayed";
        routeDelaySeconds = Math.max(
          ...delayedSegments.map((segment) => Number(segment.realtimeDelaySeconds ?? 0))
        );
      } else if (earlySegments.length) {
        routeStatus = "early";
        routeDelaySeconds = Math.min(
          ...earlySegments.map((segment) => Number(segment.realtimeDelaySeconds ?? 0))
        );
      } else if (onTimeSegments.length) {
        routeStatus = "on-time";
        routeDelaySeconds = 0;
      }

      return {
        ...route,
        segments: enrichedSegments,
        realtimeStatus: routeStatus,
        realtimeDelaySeconds: routeDelaySeconds,
      };
    });

    return {
      routes: enrichedRoutes,
      fetchedAt: typeof realtimeResponse.fetchedAt === "string" ? realtimeResponse.fetchedAt : null,
    };
  } catch {
    return {
      routes,
      fetchedAt: null as string | null,
    };
  }
};

const getRealtimeBadgeClass = (status?: RealtimeStatus) => {
  if (status === "canceled") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "delayed") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "early") return "border-sky-200 bg-sky-50 text-sky-700";
  if (status === "on-time") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-neutral-200 bg-neutral-50 text-neutral-600";
};

const formatRealtimeLabel = (status?: RealtimeStatus, delaySeconds?: number | null) => {
  if (!status || status === "unknown") return null;
  if (status === "canceled") return "Canceled";

  if (typeof delaySeconds === "number" && Number.isFinite(delaySeconds)) {
    const delayMinutes = Math.max(1, Math.round(Math.abs(delaySeconds) / 60));
    if (status === "delayed") return `Delay +${delayMinutes}m`;
    if (status === "early") return `Early -${delayMinutes}m`;
  }

  if (status === "on-time") return "On time";
  if (status === "delayed") return "Delayed";
  if (status === "early") return "Early";
  return null;
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
  const [startLocation, setStartLocation] = useState("");
  const [destination, setDestination] = useState("");
  const [departureDate, setDepartureDate] = useState(() => getCurrentDateAndTime().date);
  const [departureTime, setDepartureTime] = useState(() => getCurrentDateAndTime().time);
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
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [realtimeFetchedAt, setRealtimeFetchedAt] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const enrichedRoutesRef = useRef<Set<string>>(new Set());
  const routeGeometryByRouteIdRef = useRef<Map<string, RouteFeature[]>>(new Map());

  const routeHighlights = useMemo(() => {
    if (!routes.length) {
      return {
        fastestRouteId: null as string | null,
        fewestTransfersRouteId: null as string | null,
        leastWalkRouteId: null as string | null,
      };
    }

    let fastestRouteId = routes[0]?.id ?? null;
    let fewestTransfersRouteId = routes[0]?.id ?? null;
    let leastWalkRouteId = routes[0]?.id ?? null;
    let bestDuration = Number.POSITIVE_INFINITY;
    let bestTransfers = Number.POSITIVE_INFINITY;
    let bestWalk = Number.POSITIVE_INFINITY;

    routes.forEach((route) => {
      const routeDuration = parseDurationToMinutes(route.duration);
      const transfers = Math.max(
        0,
        route.segments.filter((segment) => segment.mode !== "walk").length - 1
      );
      const walkMinutes = routeWalkMinutes(route);

      if (routeDuration < bestDuration) {
        bestDuration = routeDuration;
        fastestRouteId = route.id;
      }

      if (transfers < bestTransfers) {
        bestTransfers = transfers;
        fewestTransfersRouteId = route.id;
      }

      if (walkMinutes < bestWalk) {
        bestWalk = walkMinutes;
        leastWalkRouteId = route.id;
      }
    });

    return {
      fastestRouteId,
      fewestTransfersRouteId,
      leastWalkRouteId,
    };
  }, [routes]);

  const liveStatusMessage = useMemo(() => {
    if (isLoading) return "Searching for best route options.";
    if (errorMessage) return `Search failed: ${errorMessage}`;
    if (!routes.length) return "No routes displayed yet.";

    const disruptedCount = routes.filter(
      (route) => route.realtimeStatus === "canceled" || route.realtimeStatus === "delayed"
    ).length;

    if (disruptedCount > 0) {
      return `${routes.length} routes available. ${disruptedCount} route${disruptedCount > 1 ? "s are" : " is"} disrupted.`;
    }

    return `${routes.length} route${routes.length > 1 ? "s are" : " is"} available.`;
  }, [errorMessage, isLoading, routes]);

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
      const departureTimeValue = buildDepartureTimestamp(departureDate, departureTime);
    if (!departureTimeValue) {
      setErrorMessage("Please provide a valid date and time.");
      return;
    }

    if (!startStop || !endStop) {
      setErrorMessage("Please select both stops from the suggestions.");
      return;
    }

    if (!Number.isFinite(startStop.stop_lat) || !Number.isFinite(startStop.stop_lon)) {
      setErrorMessage("Start stop coordinates are missing. Please pick a stop from suggestions or map.");
      return;
    }

    if (!Number.isFinite(endStop.stop_lat) || !Number.isFinite(endStop.stop_lon)) {
      setErrorMessage("Destination stop coordinates are missing. Please pick a stop from suggestions or map.");
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const payload: FastestPathRequest = {
      origin: {
        lat: Number(startStop.stop_lat),
        lon: Number(startStop.stop_lon),
        radius_m: 300,
        max_candidates: 20,
        seed_candidates: 6,
      },
      destination: {
        lat: Number(endStop.stop_lat),
        lon: Number(endStop.stop_lon),
        radius_m: 300,
        max_candidates: 20,
        seed_candidates: 8,
      },
      departure_time: departureTimeValue,
      algorithm: "raptor",
      max_transfers: 5,
    };

    setIsLoading(true);
    setErrorMessage(null);
    setRealtimeFetchedAt(null);

    try {
      const data = await fetchFastestPath(payload, { signal: controller.signal });
      const normalizedRoutes = await normalizeRoutes(data);
      const nextRoutes = applyEndpointFallbackNames(
        normalizedRoutes,
        startStop.stop_name,
        endStop.stop_name
      );
      const realtimeAnnotated = await applyRealtimeStatusToRoutes(nextRoutes);
      if (!nextRoutes.length) {
        setErrorMessage("No routes returned by the backend.");
      }
      enrichedRoutesRef.current.clear();
      routeGeometryByRouteIdRef.current.clear();
      setRoutes(realtimeAnnotated.routes);
      setRealtimeFetchedAt(realtimeAnnotated.fetchedAt);
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
    ? `Segment: ${selectedSegment.line}${formatRealtimeLabel(selectedSegment.realtimeStatus, selectedSegment.realtimeDelaySeconds) ? ` (${formatRealtimeLabel(selectedSegment.realtimeStatus, selectedSegment.realtimeDelaySeconds)})` : ""}`
    : selectedRoute
      ? `Route: ${selectedRoute.from.name} -> ${selectedRoute.to.name}${formatRealtimeLabel(selectedRoute.realtimeStatus, selectedRoute.realtimeDelaySeconds) ? ` (${formatRealtimeLabel(selectedRoute.realtimeStatus, selectedRoute.realtimeDelaySeconds)})` : ""}`
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
      const rawFeatureBySegmentId = new Map<string, RouteFeature>();
      const transitFeatureBySegmentId = new Map<string, RouteFeature>();
      const coordinatesByStopId = new Map<string, StopCoordinate>();

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
          rawFeatureBySegmentId.set(segment.id, feature);

          const featureStops = Array.isArray(feature.properties.stops) ? feature.properties.stops : [];
          featureStops.forEach((stop) => {
            if (typeof stop.stop_id !== "string") return;
            const coordinate = readStopCoordinateFromFeatureStop(stop);
            if (!coordinate) return;
            coordinatesByStopId.set(stop.stop_id, coordinate);
            const normalizedToken = normalizeStopIdToken(stop.stop_id);
            if (normalizedToken) {
              coordinatesByStopId.set(`norm:${normalizedToken}`, coordinate);
            }
          });

          const clipped = clipFeatureToStopRange(feature, segment.start_stop_id, segment.end_stop_id);

          const clippedStops = Array.isArray(clipped.properties.stops) ? clipped.properties.stops : [];
          const stopNameById = new Map<string, string>();
          clippedStops.forEach((stop) => {
            if (typeof stop.stop_id === "string" && typeof stop.stop_name === "string") {
              stopNameById.set(stop.stop_id, stop.stop_name);
            }

            if (typeof stop.stop_id === "string") {
              const coordinate = readStopCoordinateFromFeatureStop(stop);
              if (!coordinate) return;
              coordinatesByStopId.set(stop.stop_id, coordinate);
              const normalizedToken = normalizeStopIdToken(stop.stop_id);
              if (normalizedToken) {
                coordinatesByStopId.set(`norm:${normalizedToken}`, coordinate);
              }
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

          transitFeatureBySegmentId.set(segment.id, {
            ...clipped,
            properties: {
              ...clipped.properties,
              route_short_name: routeShortName,
              route_long_name: routeLongName,
              segment_id: segment.id,
              segment_mode: segment.mode,
              trip_id: segment.trip_id,
              fastest_path_color: getFastestPathSegmentColor(segment.mode),
            },
          });
        } catch {
          nextSegments.push(segment);
        }
      }

      for (const segment of activeRoute.segments) {
        if (!segment.trip_id) continue;

        const rawFeature = rawFeatureBySegmentId.get(segment.id);
        const existingFeature = transitFeatureBySegmentId.get(segment.id);
        if (!rawFeature || !existingFeature) continue;

        const startCoord = resolveStopCoordinateFromMap(segment.start_stop_id, coordinatesByStopId);
        const endCoord = resolveStopCoordinateFromMap(segment.end_stop_id, coordinatesByStopId);
        if (!startCoord || !endCoord) continue;

        const coordClipped = clipFeatureToCoordinateRange(rawFeature, startCoord, endCoord);
        const robustClipped = clipFeatureToStopRange(
          coordClipped,
          segment.start_stop_id,
          segment.end_stop_id
        );
        const anchoredCoords = anchorCoordinatesToStops(
          robustClipped.geometry?.coordinates ?? [],
          startCoord,
          endCoord
        );

        transitFeatureBySegmentId.set(segment.id, {
          ...robustClipped,
          geometry: robustClipped.geometry
            ? {
                ...robustClipped.geometry,
                coordinates: anchoredCoords.length
                  ? anchoredCoords
                  : robustClipped.geometry.coordinates,
              }
            : robustClipped.geometry,
          properties: {
            ...existingFeature.properties,
          },
        });
      }

      const nextFeatures: RouteFeature[] = [];
      for (const segment of activeRoute.segments) {
        const transitFeature = transitFeatureBySegmentId.get(segment.id);
        if (transitFeature) {
          nextFeatures.push(transitFeature);
          continue;
        }

        if (segment.mode !== "walk") continue;

        const walkingGeometry = normalizeLineGeometry(segment.walkingGeometry);
        if (walkingGeometry.length >= 2) {
          const startCoord = resolveStopCoordinateFromMap(segment.start_stop_id, coordinatesByStopId);
          const endCoord = resolveStopCoordinateFromMap(segment.end_stop_id, coordinatesByStopId);
          const anchoredWalkGeometry = anchorCoordinatesToStops(
            walkingGeometry,
            startCoord,
            endCoord
          );

          nextFeatures.push({
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: anchoredWalkGeometry,
            },
            properties: {
              route_short_name: segment.line,
              route_long_name: segment.direction,
              segment_id: segment.id,
              segment_mode: segment.mode,
              fastest_path_color: getFastestPathSegmentColor(segment.mode),
              fastest_path_dash: "8 8",
            },
          });
          continue;
        }
        // Walk segments without backend walking geometry are not rendered to avoid inaccurate straight lines.
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

      const hydratedRoute = await hydrateRouteStopNames(
        updatedRoute,
        startStop?.stop_name,
        endStop?.stop_name
      );

      setRoutes((previous) =>
        previous.map((route) => (route.id === selectedRouteId ? hydratedRoute : route))
      );

      enrichedRoutesRef.current.add(selectedRouteId);
      routeGeometryByRouteIdRef.current.set(selectedRouteId, nextFeatures);
      dispatchFastestPathGeometry({ features: nextFeatures, selectedSegmentId });
    };

    enrichSelectedRoute();

    return () => {
      cancelled = true;
    };
  }, [routes, selectedRouteId, selectedSegmentId, startStop?.stop_name, endStop?.stop_name]);

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

  const handleSwapStops = () => {
    const nextStartText = destination;
    const nextDestinationText = startLocation;
    const nextStartStop = endStop;
    const nextEndStop = startStop;

    setStartLocation(nextStartText);
    setDestination(nextDestinationText);
    setStartStop(nextStartStop);
    setEndStop(nextEndStop);
    setStartOptions([]);
    setEndOptions([]);
    setPickMode(null);
    setErrorMessage(null);
  };

  return (
    <div
      className={`absolute top-[80px] z-[130] w-[min(95vw,720px)] max-w-[95vw] transition-all duration-300 sm:top-[92px] ${
        pickMode || selectedRoute
          ? "left-1/2 -translate-x-1/2 sm:left-6 sm:translate-x-0 sm:max-w-[380px] opacity-95"
          : "left-1/2 -translate-x-1/2"
      }`}
    >
      <div className="sr-only" aria-live="polite">{liveStatusMessage}</div>
      {!selectedRoute && (
        <div
          className={`polish-panel space-y-4 rounded-[24px] sm:rounded-[28px] shadow-2xl transition-all duration-300 max-h-[calc(100vh-112px)] overflow-y-auto ${
            pickMode ? "p-3" : "p-5"
          }`}
        >
          {pickMode && (
            <div className="stagger-in rounded-[16px] border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              Click on the map to set the {pickMode === "start" ? "start" : "destination"} stop.
            </div>
          )}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-neutral-800">Fastest path</div>
              <div className="text-xs text-neutral-500">Compare routes by speed, transfers, and walk time</div>
            </div>
            <button
              className="rounded-full border border-neutral-200 p-2 text-neutral-700 transition hover:border-neutral-300"
              type="button"
              aria-label="Close fastest path"
              onClick={onCloseAction}
            >
              ×
            </button>
          </div>

          <div className="stagger-in rounded-[24px] sm:rounded-[28px] border border-neutral-100 bg-gradient-to-b from-sky-50/60 to-white p-5 shadow-sm">
            <div className="flex gap-4">
              <div className="flex flex-col items-center pt-2">
                <div className="h-4 w-4 rounded-full border border-neutral-500 bg-white" />
                <div className="h-22 w-px bg-neutral-300" />
                <div className="h-4 w-4 rounded-full border border-neutral-500 bg-white" />
              </div>
              <div className="flex-1 space-y-3">
                <div className="relative">
                  <input
                    className="w-full rounded-xl border border-transparent bg-neutral-50 px-4 py-3 pr-10 text-base text-neutral-700 outline-none transition focus:border-neutral-300 focus:ring-2 focus:ring-sky-100"
                    placeholder="Starting location"
                    value={startLocation}
                    onChange={(event) => {
                      setStartLocation(event.target.value);
                      setStartStop(null);
                      setErrorMessage(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !startStop && startOptions.length) {
                        event.preventDefault();
                        selectTopStart();
                      }
                    }}
                    aria-label="Starting location"
                  />
                  {!!startLocation && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-neutral-200 px-2 py-1 text-[10px] text-neutral-500 hover:border-neutral-300"
                      onClick={() => {
                        setStartLocation("");
                        setStartStop(null);
                        setStartOptions([]);
                      }}
                      aria-label="Clear start location"
                    >
                      Clear
                    </button>
                  )}
                </div>
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
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="soft-pulse inline-block h-1.5 w-1.5 rounded-full bg-sky-500" />
                    Searching stops...
                  </div>
                )}
                {!!startOptions.length && !startStop && (
                  <div className="stagger-in max-h-40 overflow-auto rounded-xl border border-neutral-200 bg-white text-sm shadow">
                    {startOptions.map((stop) => (
                      <button
                        key={stop.stop_id}
                        type="button"
                        onClick={() => {
                          setStartLocation(stop.stop_name);
                          setStartStop(stop);
                          setStartOptions([]);
                          setErrorMessage(null);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-neutral-50"
                      >
                        <div className="text-sm text-neutral-700">{stop.stop_name}</div>
                        <div className="text-xs text-neutral-400">{stop.stop_id}</div>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={handleSwapStops}
                    className="polish-card rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-medium text-neutral-600 transition hover:border-neutral-300"
                    aria-label="Swap start and destination"
                  >
                    Swap
                  </button>
                </div>
                <div className="relative">
                  <input
                    className="w-full rounded-xl border border-transparent bg-neutral-50 px-4 py-3 pr-10 text-base text-neutral-700 outline-none transition focus:border-neutral-300 focus:ring-2 focus:ring-sky-100"
                    placeholder="Destination"
                    value={destination}
                    onChange={(event) => {
                      setDestination(event.target.value);
                      setEndStop(null);
                      setErrorMessage(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !endStop && endOptions.length) {
                        event.preventDefault();
                        selectTopEnd();
                      }
                    }}
                    aria-label="Destination"
                  />
                  {!!destination && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-neutral-200 px-2 py-1 text-[10px] text-neutral-500 hover:border-neutral-300"
                      onClick={() => {
                        setDestination("");
                        setEndStop(null);
                        setEndOptions([]);
                      }}
                      aria-label="Clear destination"
                    >
                      Clear
                    </button>
                  )}
                </div>
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
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="soft-pulse inline-block h-1.5 w-1.5 rounded-full bg-sky-500" />
                    Searching stops...
                  </div>
                )}
                {!!endOptions.length && !endStop && (
                  <div className="stagger-in max-h-40 overflow-auto rounded-xl border border-neutral-200 bg-white text-sm shadow">
                    {endOptions.map((stop) => (
                      <button
                        key={stop.stop_id}
                        type="button"
                        onClick={() => {
                          setDestination(stop.stop_name);
                          setEndStop(stop);
                          setEndOptions([]);
                          setErrorMessage(null);
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

          <div className="stagger-in rounded-[24px] border border-neutral-100 bg-white px-4 py-3 shadow-sm">
            <button
              type="button"
              onClick={() => setShowAdvancedOptions((prev) => !prev)}
              className="flex w-full items-center justify-between rounded-xl px-2 py-1 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              aria-expanded={showAdvancedOptions}
            >
              <span>Departure options</span>
              <span className="text-xs text-neutral-500">{showAdvancedOptions ? "Hide" : "Show"}</span>
            </button>
            {showAdvancedOptions && (
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] uppercase tracking-wide text-neutral-500">
                    Date
                  </label>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-transparent bg-neutral-50 px-4 py-3 text-sm text-neutral-600 outline-none focus:border-neutral-300"
                    value={departureDate}
                    onChange={(event) => setDepartureDate(event.target.value)}
                  />
                </div>
                <div className="hidden h-10 w-px bg-neutral-200 sm:block" />
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] uppercase tracking-wide text-neutral-500">
                    Time
                  </label>
                  <input
                    type="time"
                    className="w-full rounded-xl border border-transparent bg-neutral-50 px-4 py-3 text-sm text-neutral-600 outline-none focus:border-neutral-300"
                    value={departureTime}
                    onChange={(event) => setDepartureTime(event.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setDepartureTime(getCurrentDateAndTime().time)}
                  className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-600 hover:border-neutral-300"
                >
                  Now
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
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
              className="polish-card flex-1 rounded-[18px] border border-blue-200 bg-blue-50 px-6 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-400"
            >
              {isLoading ? "Searching routes..." : "Find best route"}
            </button>
            <button
              type="button"
              className="polish-card rounded-[18px] border border-neutral-200 px-4 py-3 text-xs font-medium text-neutral-600 hover:border-neutral-300"
              onClick={() => {
                const now = getCurrentDateAndTime();
                setStartLocation("");
                setDestination("");
                setStartStop(null);
                setEndStop(null);
                setStartOptions([]);
                setEndOptions([]);
                setRoutes([]);
                setSelectedRouteId(null);
                setSelectedSegmentId(null);
                setErrorMessage(null);
                setRealtimeFetchedAt(null);
                setDepartureDate(now.date);
                setDepartureTime(now.time);
              }}
            >
              Reset
            </button>
          </div>

          {errorMessage && (
            <div className="rounded-[16px] border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-600">
              <div>{errorMessage}</div>
              <button
                type="button"
                onClick={handleSearch}
                className="mt-2 rounded-full border border-rose-200 bg-white px-3 py-1 text-[11px] font-semibold text-rose-600 hover:border-rose-300"
              >
                Retry search
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold uppercase tracking-[0.22em] text-neutral-400">
              Results
            </div>
            <div className="text-right">
              {!!routes.length && (
                <div className="text-xs text-neutral-500">{routes.length} route{routes.length > 1 ? "s" : ""}</div>
              )}
              {!!realtimeFetchedAt && (
                <div className="text-[10px] text-neutral-400">Realtime updated</div>
              )}
            </div>
          </div>

          {!!routes.length && (
            <div className="text-[11px] text-neutral-500">Tip: tap a route card to open a detailed segment timeline.</div>
          )}

          {!startStop || !endStop ? (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              Pick both stops from suggestions or map mode to get accurate routing.
            </div>
          ) : null}

          <div className="results-scroll max-h-[46vh] overflow-auto rounded-[24px] bg-white px-2 py-2 border border-neutral-100">
            {isLoading && (
              <div className="space-y-2 p-2">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`route-skeleton-${index}`}
                    className="animate-pulse rounded-2xl border border-neutral-100 bg-neutral-50 p-4"
                  >
                    <div className="h-3 w-24 rounded bg-neutral-200" />
                    <div className="mt-3 h-4 w-40 rounded bg-neutral-200" />
                    <div className="mt-3 h-3 w-full rounded bg-neutral-200" />
                  </div>
                ))}
              </div>
            )}

            {!routes.length && !isLoading && !errorMessage && (
              <div className="px-4 py-8 text-center">
                <div className="text-sm font-semibold text-neutral-700">No route yet</div>
                <div className="mt-1 text-xs text-neutral-500">
                  Enter start and destination, then run a search.
                </div>
              </div>
            )}

            {routes.map((route, routeIndex) => {
              const firstMainSegment =
                route.segments.find((segment) => segment.mode !== "walk") ?? route.segments[0];
              const mode = firstMainSegment?.mode || "train";
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
              const transferCount =
                route.segments.filter((segment) => segment.mode !== "walk").length - 1;
              const walkMinutes = routeWalkMinutes(route);
              const realtimeLabel = formatRealtimeLabel(
                route.realtimeStatus,
                route.realtimeDelaySeconds
              );

              return (
                <button
                  key={route.id}
                  type="button"
                  onClick={() => handleRouteSelect(route.id)}
                  title={`${route.from.name} ${route.from.time} -> ${route.to.name} ${route.to.time} | ${route.duration}`}
                  aria-pressed={selectedRouteId === route.id}
                  aria-label={`Select route from ${route.from.name} at ${route.from.time} to ${route.to.name} at ${route.to.time}`}
                  className={`stagger-in polish-card w-full rounded-3xl border px-4 py-4 text-left transition transform-gpu hover:-translate-y-0.5 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    selectedRouteId === route.id
                      ? "border-neutral-200 bg-neutral-50 shadow-lg ring-1 ring-blue-50"
                      : "border-transparent"
                  }`}
                  style={{ animationDelay: `${Math.min(routeIndex * 55, 260)}ms` }}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
                    <div className="flex items-center gap-1">
                      {routeHighlights.fastestRouteId === route.id && (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                          Fastest
                        </span>
                      )}
                      {routeHighlights.fewestTransfersRouteId === route.id && (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 font-semibold text-sky-700">
                          Fewest transfers
                        </span>
                      )}
                      {routeHighlights.leastWalkRouteId === route.id && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                          Least walking
                        </span>
                      )}
                      {realtimeLabel && (
                        <span className={`rounded-full border px-2 py-0.5 font-semibold ${getRealtimeBadgeClass(route.realtimeStatus)}`}>
                          {realtimeLabel}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-center">
                    <div className="flex items-center gap-3">
                      <RouteMainIcon mode={mode} />
                      <div>
                        <div className="flex items-center gap-2 text-xs text-neutral-500">
                          <span className={`rounded-full border px-2 py-0.5 font-semibold ${badgeClass}`}>
                            {firstMainSegment?.line ?? route.line}
                          </span>
                          <span>{firstMainSegment?.direction || route.direction}</span>
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
                  <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
                    <span>{Math.max(0, transferCount)} transfer{Math.max(0, transferCount) > 1 ? "s" : ""}</span>
                    <span>{walkMinutes} min walk</span>
                  </div>
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
          <div className="absolute right-0 top-0 hidden rounded-full bg-white px-4 py-2 text-xs font-medium text-neutral-600 shadow border border-neutral-100 sm:block">
            {mapStatus}
          </div>
          {selectedSegment && (
            <div className="soft-pulse absolute right-0 top-12 hidden rounded-full bg-white px-3 py-2 text-[11px] text-neutral-500 shadow border border-neutral-100 sm:block">
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
      <Image
        src={src}
        alt={alt}
        width={28}
        height={28}
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
  const compactSegments = segments.filter((segment) => {
    if (segment.mode !== "walk") return true;
    const minutes = Number.parseInt(segment.travelTime, 10);
    return Number.isFinite(minutes) || segment.travelTime !== "0m";
  });

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
      {compactSegments.map((segment, index) => (
        <div key={segment.id} className="flex items-center gap-2">
          {index > 0 && <span className="text-neutral-300">•</span>}
          <span
            className={`rounded-full border px-2 py-0.5 ${
              segment.mode === "bus"
                ? "border-emerald-200 text-emerald-600"
                : segment.mode === "tram"
                  ? "border-purple-200 text-purple-600"
                  : segment.mode === "metro"
                    ? "border-pink-200 text-pink-600"
                    : segment.mode === "ferry"
                      ? "border-cyan-200 text-cyan-600"
                      : segment.mode === "cable"
                        ? "border-yellow-200 text-yellow-700"
                        : segment.mode === "walk"
                          ? "border-neutral-200 text-neutral-600"
                          : "border-blue-200 text-blue-600"
            }`}
          >
            {formatTransferText(segment)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default FastestPathSearch;
