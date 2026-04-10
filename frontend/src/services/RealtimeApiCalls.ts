// call to http://localhost:3000/api/realtime/trip-updates
import axios from "axios";

// Base URL configurable via NEXT_PUBLIC_API_BASE_URL (fallback to localhost)
interface EnvProcess { env?: { API_BASE_URL?: string } }
const maybeProc: EnvProcess | undefined = typeof process !== 'undefined' ? (process as unknown as EnvProcess) : undefined;
const API_BASE_URL = maybeProc?.env?.API_BASE_URL
  ? String(maybeProc.env.API_BASE_URL).replace(/\/$/, '')
  : "http://localhost:3000/api";

export type RealtimeScheduleRelationship =
  | "SCHEDULED"
  | "ADDED"
  | "UNSCHEDULED"
  | "CANCELED"
  | "REPLACEMENT"
  | "DUPLICATED"
  | string
  | null;

export type RealtimeStopTimeUpdate = {
  stopId: string | null;
  stopSequence: number | null;
  arrivalTimeSecs: number | null;
  departureTimeSecs: number | null;
  arrivalDelaySecs: number | null;
  departureDelaySecs: number | null;
  scheduleRelationship?: RealtimeScheduleRelationship;
};

export type RealtimeTripUpdate = {
  trip: {
    tripId: string | null;
    routeId: string | null;
    startTime: string | null;
    startDate: string | null;
    originalTripId: string | null;
    scheduleRelationship?: RealtimeScheduleRelationship;
    isCanceled?: boolean;
  };
  stopTimeUpdates: RealtimeStopTimeUpdate[];
};

export type RealtimeByTripResponse = {
  isRealtime: boolean;
  isCached: boolean;
  isStale: boolean;
  cacheAgeMs: number;
  fetchedAt: string | null;
  tripUpdatesCount: number;
  tripUpdates: RealtimeTripUpdate[];
};

export const realtimeUpdatesByTripIds = async (tripIds: string[]) => {
    // Use POST with body to support thousands of IDs
    const response = await axios.post<RealtimeByTripResponse>(
      `${API_BASE_URL}/realtime/trip-updates/by-trip`,
      { tripIds }
    );
    return response.data;
}
