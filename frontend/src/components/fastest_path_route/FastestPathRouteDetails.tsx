import React from "react";
import Image from "next/image";

export type RouteStop = {
  time: string;
  name: string;
  stop_id?: string;
  platform?: string;
};

export type RealtimeStatus = "delayed" | "early" | "canceled" | "on-time" | "unknown";

export type RouteSegment = {
  id: string;
  mode: "train" | "bus" | "tram" | "walk" | "metro" | "ferry" | "cable";
  line: string;
  direction: string;
  travelTime: string;
  stops: RouteStop[];
  walkingGeometry?: number[][];
  trip_id?: string;
  start_stop_id?: string;
  end_stop_id?: string;
  transferAfter?: string;
  realtimeStatus?: RealtimeStatus;
  realtimeDelaySeconds?: number | null;
};

export type RouteSummary = {
  id: string;
  line: string;
  direction: string;
  from: RouteStop;
  to: RouteStop;
  duration: string;
  segments: RouteSegment[];
  realtimeStatus?: RealtimeStatus;
  realtimeDelaySeconds?: number | null;
};

type FastestPathRouteDetailsProps = {
  route: RouteSummary;
  selectedSegmentId: string | null;
  onSelectSegment: (segmentId: string) => void;
  onBackToOverview: () => void;
  onClose: () => void;
};

const parseTravelMinutes = (value: string) => {
  const source = value.toLowerCase();
  const hourMatch = source.match(/(\d+)\s*h/);
  const minuteMatch = source.match(/(\d+)\s*m/);

  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
};

const FastestPathRouteDetails = ({
  route,
  selectedSegmentId,
  onSelectSegment,
  onBackToOverview,
  onClose,
}: FastestPathRouteDetailsProps) => {
  const selectedSegment =
    route.segments.find((segment) => segment.id === selectedSegmentId) ?? null;

  const transferCount = Math.max(
    0,
    route.segments.filter((segment) => segment.mode !== "walk").length - 1
  );
  const totalWalkMinutes = route.segments
    .filter((segment) => segment.mode === "walk")
    .reduce((sum, segment) => sum + parseTravelMinutes(segment.travelTime), 0);
  const routeStatusLabel = formatRealtimeLabel(route.realtimeStatus, route.realtimeDelaySeconds);

  return (
    <aside className="absolute left-1/2 bottom-3 z-[130] w-[min(95vw,420px)] -translate-x-1/2 max-h-[calc(100vh-120px)] overflow-y-auto rounded-[28px] polish-panel p-5 shadow-2xl animate-fadeIn sm:bottom-auto sm:left-6 sm:top-6 sm:w-[380px] sm:max-w-[94vw] sm:translate-x-0">
      <div className="flex items-center justify-between">
        <button
          className="rounded-full border border-neutral-200 p-2 text-neutral-700 transition hover:border-neutral-300"
          type="button"
          aria-label="Close route details"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
        <div className="flex-1 px-3 min-w-0">
          <div className="text-sm font-semibold text-neutral-800 truncate">
            {route.from.name} to {route.to.name}
          </div>
          <div className="text-xs text-neutral-400">Route details</div>
        </div>
      </div>

      <section className="mt-4 rounded-2xl border border-neutral-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Total duration
            </div>
            <div className="text-xl font-bold text-neutral-900">{route.duration}</div>
          </div>
          <div className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-semibold text-sky-700">
            {transferCount} transfer{transferCount !== 1 ? "s" : ""}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-white bg-white/80 px-3 py-2">
            <div className="text-neutral-500">Departure</div>
            <div className="font-semibold text-neutral-800">{route.from.time} - {route.from.name}</div>
          </div>
          <div className="rounded-xl border border-white bg-white/80 px-3 py-2">
            <div className="text-neutral-500">Arrival</div>
            <div className="font-semibold text-neutral-800">{route.to.time} - {route.to.name}</div>
          </div>
        </div>
        {routeStatusLabel && (
          <div className="mt-2">
            <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${getRealtimeBadgeClass(route.realtimeStatus)}`}>
              {routeStatusLabel}
            </span>
          </div>
        )}
        {totalWalkMinutes > 0 && (
          <div className="mt-2 text-xs text-neutral-600">Includes about {totalWalkMinutes} min walking</div>
        )}
      </section>

      {!selectedSegment ? (
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-neutral-400">Trip timeline</div>
            <div className="text-xs text-neutral-500">
              {route.segments.length} segment{route.segments.length > 1 ? "s" : ""}
            </div>
          </div>
          {route.segments.map((segment, index) => {
            const firstStop = segment.stops[0];
            const lastStop = segment.stops[segment.stops.length - 1];
            const badgeClass = getModeBadgeClass(segment.mode);
            const segmentLabel =
              segment.mode === "walk"
                ? segment.line.toLowerCase() === "walk"
                  ? `Walk ${segment.travelTime}`
                  : `${segment.line} ${segment.travelTime}`
                : segment.line;
            const segmentCardClass =
              segment.mode === "walk"
                ? "border-dashed border-neutral-200 bg-neutral-50"
                : "border-neutral-100";
            const realtimeLabel = formatRealtimeLabel(segment.realtimeStatus, segment.realtimeDelaySeconds);

            return (
              <button
                key={segment.id}
                type="button"
                onClick={() => onSelectSegment(segment.id)}
                className={`polish-card w-full rounded-2xl border px-3 py-3 text-left transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 flex items-start gap-3 ${segmentCardClass}`}
                aria-label={`Open segment ${index + 1} details`}
              >
                <div className="mt-0.5">
                  <ModeIcon mode={segment.mode} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm text-neutral-700">
                    <span className={`rounded-full border px-2 py-0.5 font-semibold ${badgeClass}`}>
                      {segmentLabel}
                    </span>
                    <span className="text-xs text-neutral-500 truncate">{segment.direction}</span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {firstStop?.time} {firstStop?.name} to {lastStop?.time} {lastStop?.name}
                  </div>
                  {realtimeLabel && (
                    <div className="mt-1">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getRealtimeBadgeClass(segment.realtimeStatus)}`}>
                        {realtimeLabel}
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-xs font-medium text-neutral-500">{segment.travelTime}</div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <button
            className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400 transition hover:text-neutral-500"
            type="button"
            onClick={onBackToOverview}
          >
            Back to overview
          </button>

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3">
            <div className="flex items-center gap-3">
              <ModeIcon mode={selectedSegment.mode} />
              <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${getModeBadgeClass(selectedSegment.mode)}`}>
                {selectedSegment.mode === "walk"
                  ? `${selectedSegment.line} ${selectedSegment.travelTime}`
                  : selectedSegment.line}
              </span>
              <span className="text-xs text-neutral-500 truncate">{selectedSegment.direction}</span>
              <span className="ml-auto text-xs text-neutral-400">{selectedSegment.travelTime}</span>
            </div>
            {formatRealtimeLabel(selectedSegment.realtimeStatus, selectedSegment.realtimeDelaySeconds) && (
              <div className="mt-2">
                <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${getRealtimeBadgeClass(selectedSegment.realtimeStatus)}`}>
                  {formatRealtimeLabel(selectedSegment.realtimeStatus, selectedSegment.realtimeDelaySeconds)}
                </span>
              </div>
            )}
          </div>

          <div className="relative pl-6">
            <div className="absolute left-[9px] top-2 bottom-2 w-px bg-neutral-200" />
            <div className="space-y-4">
              {selectedSegment.stops.map((stop, index) => (
                <div key={`${selectedSegment.id}-${index}`} className="stagger-in flex items-start gap-3" style={{ animationDelay: `${index * 40}ms` }}>
                  <div className="mt-1 h-4 w-4 rounded-full border border-neutral-400 bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.9)]" />
                  <div className="flex-1 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-neutral-800">{stop.name}</span>
                      <span className="text-xs text-neutral-500 whitespace-nowrap">{stop.time}</span>
                    </div>
                    {stop.platform && (
                      <div className="text-xs text-neutral-400">{stop.platform}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {selectedSegment.transferAfter && (
            <div className="rounded-full bg-neutral-100 px-3 py-1 text-center text-xs text-neutral-500">
              {selectedSegment.transferAfter}
            </div>
          )}
        </div>
      )}
    </aside>
  );
};

const VehicleIcon = ({
  src,
  alt,
  borderClass,
}: {
  src: string;
  alt: string;
  borderClass: string;
}) => (
  <div
    className={`flex h-9 w-9 items-center justify-center rounded-full border-2 bg-white ${borderClass}`}
  >
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

const TrainIcon = () => (
  <VehicleIcon
    src="/icons/train_marker.png"
    alt="Train icon"
    borderClass="border-blue-600"
  />
);

const BusIcon = () => (
  <VehicleIcon
    src="/icons/bus_marker.png"
    alt="Bus icon"
    borderClass="border-emerald-600"
  />
);

const TramIcon = () => (
  <VehicleIcon
    src="/icons/tram_marker.png"
    alt="Tram icon"
    borderClass="border-purple-600"
  />
);

const MetroIcon = () => (
  <VehicleIcon
    src="/icons/metro_marker.png"
    alt="Metro icon"
    borderClass="border-pink-600"
  />
);

const FerryIcon = () => (
  <VehicleIcon
    src="/icons/ferry_marker.png"
    alt="Ferry icon"
    borderClass="border-cyan-600"
  />
);

const CableIcon = () => (
  <VehicleIcon
    src="/icons/cable_marker.png"
    alt="Cable car icon"
    borderClass="border-yellow-600"
  />
);

const WalkIcon = () => (
  <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-neutral-400 bg-white text-neutral-500">
    <svg
      width="16"
      height="16"
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

const ModeIcon = ({ mode }: { mode: RouteSegment["mode"] }) => {
  if (mode === "bus") {
    return <BusIcon />;
  }

  if (mode === "tram") {
    return <TramIcon />;
  }

  if (mode === "metro") {
    return <MetroIcon />;
  }

  if (mode === "ferry") {
    return <FerryIcon />;
  }

  if (mode === "cable") {
    return <CableIcon />;
  }

  if (mode === "walk") {
    return <WalkIcon />;
  }

  return <TrainIcon />;
};

const getModeBadgeClass = (mode: RouteSegment["mode"]) => {
  const colors: Record<RouteSegment["mode"], string> = {
    train: "border-blue-200 text-blue-600",
    bus: "border-emerald-200 text-emerald-600",
    tram: "border-purple-200 text-purple-600",
    metro: "border-pink-200 text-pink-600",
    ferry: "border-cyan-200 text-cyan-600",
    cable: "border-yellow-200 text-yellow-700",
    walk: "border-neutral-200 text-neutral-600",
  };

  return colors[mode] ?? colors.train;
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
    const mins = Math.max(1, Math.round(Math.abs(delaySeconds) / 60));
    if (status === "delayed") return `Delayed +${mins}m`;
    if (status === "early") return `Early -${mins}m`;
  }

  if (status === "on-time") return "On time";
  if (status === "delayed") return "Delayed";
  if (status === "early") return "Early";
  return null;
};

const CloseIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export default FastestPathRouteDetails;
