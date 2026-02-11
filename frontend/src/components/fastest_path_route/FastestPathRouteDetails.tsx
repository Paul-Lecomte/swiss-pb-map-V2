import React from "react";
import Image from "next/image";

export type RouteStop = {
  time: string;
  name: string;
  platform?: string;
};

export type RouteSegment = {
  id: string;
  mode: "train" | "bus" | "tram" | "walk" | "metro" | "ferry" | "cable";
  line: string;
  direction: string;
  travelTime: string;
  stops: RouteStop[];
  transferAfter?: string;
};

export type RouteSummary = {
  id: string;
  line: string;
  direction: string;
  from: RouteStop;
  to: RouteStop;
  duration: string;
  segments: RouteSegment[];
};

type FastestPathRouteDetailsProps = {
  route: RouteSummary;
  selectedSegmentId: string | null;
  onSelectSegment: (segmentId: string) => void;
  onBackToOverview: () => void;
  onClose: () => void;
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

  return (
    <aside className="absolute left-6 top-6 z-[130] w-[360px] max-w-[94vw] rounded-[32px] bg-white p-5 shadow-2xl animate-fadeIn border border-neutral-100">
      <div className="flex items-center justify-between">
        <button
          className="rounded-full border border-neutral-200 p-2 text-neutral-700 transition hover:border-neutral-300"
          type="button"
          aria-label="Close route details"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
        <div className="flex-1 px-3">
          <div className="text-sm font-semibold text-neutral-800">
            {route.from.name} → {route.to.name}
          </div>
          <div className="text-xs text-neutral-400">Total: {route.duration}</div>
        </div>
        <div className="ml-2 text-xs text-neutral-500">
          {route.segments.length} segment{route.segments.length > 1 ? "s" : ""}
        </div>
      </div>

      {!selectedSegment ? (
        <div className="mt-5 space-y-3">
          <div className="text-xs uppercase tracking-wide text-neutral-400">Segments</div>
          {route.segments.map((segment, index) => {
            const firstStop = segment.stops[0];
            const lastStop = segment.stops[segment.stops.length - 1];
            const badgeColors: Record<string, string> = {
              train: "border-blue-200 text-blue-600",
              bus: "border-emerald-200 text-emerald-600",
              tram: "border-purple-200 text-purple-600",
              metro: "border-pink-200 text-pink-600",
              ferry: "border-cyan-200 text-cyan-600",
              cable: "border-yellow-200 text-yellow-600",
              walk: "border-neutral-200 text-neutral-600",
            };

            const badgeClass = badgeColors[segment.mode] ?? badgeColors.train;

            return (
              <button
                key={segment.id}
                type="button"
                onClick={() => onSelectSegment(segment.id)}
                className="w-full rounded-2xl border border-neutral-100 px-3 py-3 text-left transition hover:shadow-sm hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 flex items-center gap-3"
                aria-label={`Open segment ${index + 1} details`}
              >
                <ModeIcon mode={segment.mode} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm text-neutral-700">
                    <span className={`rounded-full border px-2 py-0.5 font-semibold ${badgeClass}`}>
                      {segment.line}
                    </span>
                    <span className="text-xs text-neutral-500">{segment.direction}</span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-400">
                    {firstStop?.time} {firstStop?.name} → {lastStop?.time} {lastStop?.name}
                  </div>
                </div>
                <div className="text-xs text-neutral-400">{segment.travelTime}</div>
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

          <div className="flex items-center gap-3">
            <ModeIcon mode={selectedSegment.mode} />
            <span className="rounded-full border border-red-400 px-2 py-0.5 text-xs font-semibold text-red-500">
              {selectedSegment.line}
            </span>
            <span className="text-xs text-neutral-500">{selectedSegment.direction}</span>
            <span className="ml-auto text-xs text-neutral-400">{selectedSegment.travelTime}</span>
          </div>

          <div className="relative pl-6">
            <div className="absolute left-[9px] top-2 bottom-2 w-px bg-neutral-200" />
            <div className="space-y-4">
              {selectedSegment.stops.map((stop, index) => (
                <div key={`${selectedSegment.id}-${index}`} className="flex items-start gap-3">
                  <div className="mt-1 h-4 w-4 rounded-full border border-neutral-400 bg-white" />
                  <div className="flex-1 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-neutral-800">{stop.name}</span>
                      <span className="text-xs text-neutral-500">{stop.time}</span>
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
