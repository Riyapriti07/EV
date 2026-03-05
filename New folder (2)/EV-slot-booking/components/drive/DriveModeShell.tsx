"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Station, Vehicle } from "@/components/map/types";

type DetourState = {
  station: Station;
  maxReachKm: number;
} | null;

type AlertStatus = "idle" | "active" | "rerouting" | "routed";

const KM_PER_PERCENT = 3; // 1% battery ≈ 3 km

export function DriveModeShell() {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [destination, setDestination] = useState<Station | null>(null);
  const [batteryPercent, setBatteryPercent] = useState<number>(100);
  const [alertStatus, setAlertStatus] = useState<AlertStatus>("idle");
  const [detour, setDetour] = useState<DetourState>(null);
  const [alertError, setAlertError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadContext() {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || cancelled) return;

      const [vehicleRes, stationsRes] = await Promise.all([
        supabase
          .from("vehicles")
          .select(
            "id,nickname,ev_model,battery_capacity_kwh,supported_ports"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: true })
          .limit(1),
        supabase
          .from("stations")
          .select(
            "id,name,latitude,longitude,address,distance_km,is_supercharger,cost_per_kwh,ports(id,port_type,power_kw,is_available)"
          )
          .order("distance_km", { ascending: true })
      ]);

      if (cancelled) return;

      if (vehicleRes.data && vehicleRes.data.length > 0) {
        const v = vehicleRes.data[0];
        setVehicle({
          ...v,
          supported_ports: v.supported_ports ?? []
        });
      }

      if (stationsRes.data && stationsRes.data.length > 0) {
        const allStations: Station[] = stationsRes.data.map((s) => ({
          ...s,
          ports: (s as any).ports ?? []
        }));
        setStations(allStations);
        const withPorts = allStations.filter((s) =>
          s.ports.some((p) => p.is_available)
        );
        const farthest =
          withPorts.length > 0
            ? withPorts[withPorts.length - 1]
            : allStations[allStations.length - 1];
        setDestination(farthest ?? null);
      }
    }

    loadContext();
    return () => {
      cancelled = true;
    };
  }, []);

  const destinationDistanceKm = useMemo(() => {
    if (!destination || destination.distance_km == null) return 45;
    return destination.distance_km;
  }, [destination]);

  const maxRangeKm = useMemo(
    () => batteryPercent * KM_PER_PERCENT,
    [batteryPercent]
  );

  const rangeMarginKm = 5;

  useEffect(() => {
    if (!destination) return;

    const needsAlert =
      maxRangeKm < destinationDistanceKm + rangeMarginKm;

    if (needsAlert && alertStatus === "idle") {
      const candidates = stations.filter((s) => {
        if (s.distance_km == null) return false;
        const hasAvailable = s.ports.some((p) => p.is_available);
        const withinRange = s.distance_km <= maxRangeKm;
        const enRoute = s.distance_km < destinationDistanceKm;
        return hasAvailable && withinRange && enRoute;
      });

      if (candidates.length > 0) {
        const closest = [...candidates].sort(
          (a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0)
        )[0];
        setDetour({
          station: closest,
          maxReachKm: maxRangeKm
        });
      } else {
        setDetour(null);
      }

      setAlertStatus("active");
    }

    if (!needsAlert && alertStatus !== "idle") {
      setAlertStatus("idle");
      setDetour(null);
      setAlertError(null);
    }
  }, [
    destination,
    destinationDistanceKm,
    maxRangeKm,
    stations,
    alertStatus
  ]);

  const riskLabel = useMemo(() => {
    const ratio = maxRangeKm / destinationDistanceKm;
    if (ratio >= 2) return "Comfortable";
    if (ratio >= 1.2) return "Safe";
    if (ratio >= 1) return "Tight";
    return "Critical";
  }, [maxRangeKm, destinationDistanceKm]);

  const riskBadgeVariant =
    riskLabel === "Critical" ? "danger" : riskLabel === "Tight" ? "outline" : "success";

  async function handleRerouteAndBook() {
    if (!detour || !vehicle) return;
    setAlertError(null);
    setAlertStatus("rerouting");

    const {
      data: { session }
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      setAlertError("You must be signed in to reroute and book.");
      setAlertStatus("active");
      return;
    }

    const detourStation = detour.station;
    const availablePorts = detourStation.ports.filter(
      (p) => p.is_available
    );
    if (availablePorts.length === 0) {
      setAlertError(
        "Detour station is no longer available. Try adjusting the slider."
      );
      setAlertStatus("active");
      return;
    }

    const port = availablePorts[0];

    const startLocal = new Date(Date.now() + 5 * 60 * 1000);
    const endLocal = new Date(
      startLocal.getTime() + 60 * 60 * 1000
    );
    const startIso = startLocal.toISOString();
    const endIso = endLocal.toISOString();

    const { data: conflicts, error: conflictErr } = await supabase
      .from("bookings")
      .select("id")
      .eq("port_id", port.id)
      .eq("status", "confirmed")
      .gt("end_time", startIso)
      .lt("start_time", endIso);

    if (conflictErr) {
      console.error(conflictErr);
      setAlertError(
        "Could not validate detour availability. Please try again."
      );
      setAlertStatus("active");
      return;
    }

    if (conflicts && conflicts.length > 0) {
      setAlertError(
        "Detour port just filled up. Move the slider slightly to recalc."
      );
      setAlertStatus("active");
      return;
    }

    const { error: insertErr } = await supabase.from("bookings").insert({
      user_id: user.id,
      vehicle_id: vehicle.id,
      port_id: port.id,
      start_time: startIso,
      end_time: endIso,
      status: "confirmed"
    });

    if (insertErr) {
      console.error(insertErr);
      setAlertError(
        "Unable to auto-book detour. Please try manual booking."
      );
      setAlertStatus("active");
      return;
    }

    setDestination(detourStation);
    setAlertStatus("routed");
  }

  return (
    <div className="relative flex flex-col gap-4 rounded-lg border border-border bg-slate-950/90 p-5 shadow-card">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
            Drive Mode
          </p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">
            Range-aware navigation
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Simulated in-car HUD with live battery range and detour intelligence.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant="outline">
            {vehicle
              ? `${vehicle.nickname} · ${vehicle.battery_capacity_kwh} kWh`
              : "Add a vehicle to unlock"}
          </Badge>
          <Badge variant={riskBadgeVariant}>
            {riskLabel.toUpperCase()}
          </Badge>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
        <Card className="border-slate-800/90 bg-slate-950/80">
          <CardHeader>
            <CardTitle className="text-sm">Route overview</CardTitle>
            <CardDescription>
              From city center to{" "}
              {destination ? destination.name : "selected station"} (
              {destinationDistanceKm.toFixed(1)} km).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative h-28 overflow-hidden rounded-lg border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-black">
              <div className="absolute inset-0 opacity-40">
                <div className="absolute left-4 top-1/2 h-[1px] w-[80%] -translate-y-1/2 bg-gradient-to-r from-slate-500 via-slate-100 to-transparent" />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full border border-slate-400 bg-slate-900 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-200">
                  You
                </div>
                <div className="absolute right-6 top-1/2 -translate-y-1/2 rounded-full border border-slate-500 bg-slate-900 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-100">
                  {destination ? "Station" : "Destination"}
                </div>
              </div>
              <div className="relative flex h-full flex-col justify-between p-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Battery</span>
                  <span className="font-mono text-sm text-slate-100">
                    {batteryPercent.toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <div>
                    <p className="text-slate-400">Estimated range</p>
                    <p className="font-medium text-slate-100">
                      {maxRangeKm.toFixed(0)} km
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-400">Trip distance</p>
                    <p className="font-medium text-slate-100">
                      {destinationDistanceKm.toFixed(1)} km
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-[11px]">
              <div className="rounded-md border border-slate-800 bg-slate-950/70 p-2">
                <p className="text-slate-400">Headroom</p>
                <p className="mt-1 font-semibold text-slate-100">
                  {(maxRangeKm - destinationDistanceKm).toFixed(1)} km
                </p>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/70 p-2">
                <p className="text-slate-400">Rule of thumb</p>
                <p className="mt-1 text-[10px] text-slate-300">
                  1% ≈ {KM_PER_PERCENT} km · keep at least {rangeMarginKm} km safety.
                </p>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-950/70 p-2">
                <p className="text-slate-400">Destination</p>
                <p className="mt-1 text-[10px] text-slate-200">
                  {destination
                    ? destination.name
                    : "Select a vehicle to bind route."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800/90 bg-slate-950/80">
          <CardHeader>
            <CardTitle className="text-sm">
              Simulate battery drain
            </CardTitle>
            <CardDescription>
              Demo-only control that drives range and alert logic.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400">
                  Battery level ({batteryPercent.toFixed(0)}%)
                </span>
                <span className="font-mono text-xs text-slate-100">
                  {maxRangeKm.toFixed(0)} km reach
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={batteryPercent}
                onChange={(e) =>
                  setBatteryPercent(Number(e.target.value))
                }
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-800"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>0%</span>
                <span>100%</span>
              </div>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-950/80 p-2 text-[11px] text-slate-300">
              <p>
                Drag the slider down until the range drops beneath the trip
                distance; the system will raise a{" "}
                <span className="text-accent-crimson">
                  CRITICAL
                </span>{" "}
                alert and propose a detour.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {alertStatus === "active" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur">
          <div className="w-full max-w-md rounded-lg border border-accent-crimson/60 bg-slate-950/95 p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.25em] text-accent-crimson">
                  Critical alert
                </p>
                <h2 className="mt-1 text-sm font-semibold text-slate-50">
                  CRITICAL ALERT: Insufficient Range.
                </h2>
              </div>
              <Badge variant="danger">Range risk</Badge>
            </div>
            <p className="mt-3 text-xs text-slate-200">
              Current battery level cannot reach the destination station. You
              must detour immediately.
            </p>
            <div className="mt-3 rounded-md border border-accent-crimson/40 bg-slate-950/80 p-3 text-[11px] text-slate-200">
              {detour ? (
                <>
                  <p className="font-semibold text-slate-50">
                    Recommended detour · {detour.station.name}
                  </p>
                  <p className="mt-1 text-slate-300">
                    Approx.{" "}
                    {detour.station.distance_km
                      ? detour.station.distance_km.toFixed(1)
                      : "—"}{" "}
                    km from your current path, within your simulated range of{" "}
                    {detour.maxReachKm.toFixed(0)} km.
                  </p>
                  <p className="mt-1 text-slate-400">
                    Slots available:{" "}
                    {
                      detour.station.ports.filter(
                        (p) => p.is_available
                      ).length
                    }{" "}
                    / {detour.station.ports.length}
                  </p>
                </>
              ) : (
                <p className="text-slate-300">
                  No safe detour stations are within your current simulated
                  range. Increase battery or reduce trip distance.
                </p>
              )}
            </div>
            {alertError && (
              <p className="mt-2 text-[11px] text-accent-crimson">
                {alertError}
              </p>
            )}
            <div className="mt-4 flex justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAlertStatus("idle");
                  setAlertError(null);
                  setDetour(null);
                }}
              >
                Dismiss
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!detour || (alertStatus as string) === "rerouting"}
                onClick={handleRerouteAndBook}
                className="flex-1 bg-accent-crimson text-slate-50 hover:bg-red-500"
              >
                {(alertStatus as string) === "rerouting"
                  ? "Rerouting & booking…"
                  : "REROUTE & BOOK NOW"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {alertStatus === "routed" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center">
          <span className="rounded-full border border-accent-emerald/60 bg-slate-950/95 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-accent-emerald">
            Detour booked · destination updated
          </span>
        </div>
      )}
    </div>
  );
}

