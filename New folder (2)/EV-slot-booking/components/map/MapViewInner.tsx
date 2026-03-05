"use client";

import "leaflet/dist/leaflet.css";

import { useMemo } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer
} from "react-leaflet";
import L, { type DivIcon, type LatLngExpression } from "leaflet";
import type { Vehicle, Station } from "./types";
import { Badge } from "@/components/ui/badge";

type Props = {
  center: LatLngExpression;
  stations: Station[];
  vehicle: Vehicle | null;
  loading: boolean;
};

function createMarkerIcon(
  available: number,
  total: number
): DivIcon {
  const ratio = total === 0 ? 0 : available / total;
  const isHealthy = ratio >= 0.5;
  const accent = isHealthy ? "#10B981" : "#EF4444";

  return L.divIcon({
    className: "",
    html: `
      <div style="
        display:flex;
        flex-direction:column;
        align-items:center;
        gap:4px;
      ">
        <div style="
          padding:4px 8px;
          border-radius:999px;
          border:1px solid rgba(148, 163, 184, 0.7);
          background:rgba(15, 23, 42, 0.96);
          box-shadow:0 10px 30px rgba(15, 23, 42, 0.9);
          color:#E5E7EB;
          font-size:10px;
          font-weight:600;
          letter-spacing:0.16em;
          text-transform:uppercase;
        ">
          <span style="color:${accent}">${available}</span> / ${total}
        </div>
        <div style="
          width:2px;
          height:10px;
          background:linear-gradient(to bottom, ${accent}, transparent);
        "></div>
      </div>
    `,
    iconSize: [60, 40],
    iconAnchor: [30, 40],
    popupAnchor: [0, -40]
  });
}

function estimateFullChargeHours(
  vehicleCapacityKwh: number,
  portPowerKw: number
): number {
  if (!vehicleCapacityKwh || !portPowerKw) return 0;
  return vehicleCapacityKwh / portPowerKw;
}

export default function MapViewInner({
  center,
  stations,
  vehicle,
  loading
}: Props) {
  const stationMarkers = useMemo(
    () =>
      stations.map((station) => {
        const total = station.ports.length;
        const available = station.ports.filter((p) => p.is_available)
          .length;

        const icon = createMarkerIcon(available, total);

        const supportedPorts = Array.from(
          new Set(station.ports.map((p) => p.port_type))
        );

        const matchingPorts =
          vehicle && vehicle.supported_ports.length > 0
            ? station.ports.filter((p) =>
                vehicle.supported_ports.includes(p.port_type)
              )
            : station.ports;

        const bestPort =
          matchingPorts.length > 0
            ? matchingPorts.reduce((max, p) =>
                p.power_kw > max.power_kw ? p : max
              )
            : null;

        const etaHours =
          vehicle && bestPort
            ? estimateFullChargeHours(
                vehicle.battery_capacity_kwh,
                bestPort.power_kw
              )
            : 0;

        const etaLabel =
          etaHours > 0
            ? `${Math.floor(etaHours)}h ${Math.round(
                (etaHours % 1) * 60
              )}m`
            : "—";

        return {
          station,
          total,
          available,
          icon,
          supportedPorts,
          bestPort,
          etaLabel
        };
      }),
    [stations, vehicle]
  );

  return (
    <MapContainer
      center={center}
      zoom={11}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%", background: "#020617" }}
      className="leaflet-grayscale"
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution=""
      />
      {stationMarkers.map(
        ({
          station,
          total,
          available,
          icon,
          supportedPorts,
          bestPort,
          etaLabel
        }) => (
          <Marker
            key={station.id}
            position={[station.latitude, station.longitude]}
            icon={icon}
          >
            <Popup>
              <div className="w-[260px] rounded-lg border border-slate-800 bg-slate-950/95 p-3 shadow-card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-100">
                      {station.name}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {station.address ?? "Bengaluru"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge
                      variant={
                        available > 0 ? "success" : "danger"
                      }
                    >
                      {available > 0 ? "Slots open" : "Full"}
                    </Badge>
                    <Badge variant="outline">
                      {station.distance_km
                        ? `${station.distance_km.toFixed(1)} km`
                        : "— km"}
                    </Badge>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                  <div className="space-y-1">
                    <p className="text-slate-400">Availability</p>
                    <p>
                      {available} / {total} ports online
                    </p>
                    <p className="text-slate-500">
                      Types: {supportedPorts.join(" · ")}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-slate-400">Pricing</p>
                    <p>₹ {station.cost_per_kwh.toFixed(1)} / kWh</p>
                    <p className="text-slate-500">
                      {station.is_supercharger
                        ? "Superfast DC hub"
                        : "Mixed AC / DC"}
                    </p>
                  </div>
                </div>
                <div className="mt-2 rounded-md border border-slate-800 bg-slate-900/80 p-2 text-[11px] text-slate-300">
                  <div className="flex items-center justify-between">
                    <p className="text-slate-400">
                      Est. time to full
                    </p>
                    <span className="text-xs font-semibold text-slate-100">
                      {etaLabel}
                    </span>
                  </div>
                  {vehicle && bestPort && (
                    <p className="mt-1 text-[10px] text-slate-500">
                      Based on {vehicle.nickname} (
                      {vehicle.battery_capacity_kwh} kWh) at{" "}
                      {bestPort.power_kw} kW{" "}
                      {bestPort.port_type} connector.
                    </p>
                  )}
                  {!vehicle && (
                    <p className="mt-1 text-[10px] text-slate-500">
                      Add a vehicle in the profile panel to see
                      tailored charge times.
                    </p>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        )
      )}
      {loading && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="rounded-full border border-slate-700/80 bg-slate-950/90 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">
            Loading stations…
          </span>
        </div>
      )}
    </MapContainer>
  );
}

