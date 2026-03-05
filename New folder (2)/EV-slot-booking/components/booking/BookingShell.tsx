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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Station, Vehicle, Port } from "@/components/map/types";

type BookingStatus = "idle" | "submitting" | "success" | "error";

type BookingRecord = {
  id: string;
  start_time: string;
  end_time: string;
  station_name: string;
  port_type: string;
};

function toLocalDateTimeInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function generateQrPattern(id: string): number[][] {
  const size = 21;
  const grid: number[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }).fill(0) as number[]
  );
  const hash = Array.from(id).reduce(
    (acc, ch, idx) => (acc + ch.charCodeAt(0) * (idx + 3)) % 9973,
    0
  );

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = (x * 31 + y * 17 + hash) % 7;
      grid[y][x] = v % 2 === 0 ? 1 : 0;
    }
  }

  const markFinder = (ox: number, oy: number) => {
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const border = x === 0 || y === 0 || x === 6 || y === 6;
        const inner = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        grid[oy + y][ox + x] = border || inner ? 1 : 0;
      }
    }
  };

  markFinder(0, 0);
  markFinder(size - 7, 0);
  markFinder(0, size - 7);

  return grid;
}

export function BookingShell() {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [selectedPortId, setSelectedPortId] = useState<string>("");
  const [startAt, setStartAt] = useState<string>(() =>
    toLocalDateTimeInputValue(new Date(Date.now() + 15 * 60 * 1000))
  );
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [status, setStatus] = useState<BookingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastBooking, setLastBooking] = useState<BookingRecord | null>(null);

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

      if (!cancelled) {
        if (vehicleRes.data && vehicleRes.data.length > 0) {
          const v = vehicleRes.data[0];
          setVehicle({
            ...v,
            supported_ports: v.supported_ports ?? []
          });
        }
        if (stationsRes.data) {
          setStations(
            stationsRes.data.map((s) => ({
              ...s,
              ports: (s as any).ports ?? []
            }))
          );
        }
      }
    }

    loadContext();
    return () => {
      cancelled = true;
    };
  }, []);

  const availableStations = useMemo(
    () =>
      stations.filter((s) =>
        s.ports.some((p) => p.is_available)
      ),
    [stations]
  );

  const selectedStation = useMemo(
    () => stations.find((s) => s.id === selectedStationId) ?? null,
    [stations, selectedStationId]
  );

  const stationPorts: Port[] = useMemo(() => {
    if (!selectedStation) return [];
    return selectedStation.ports.filter((p) => p.is_available);
  }, [selectedStation]);

  const canBook = useMemo(() => {
    return (
      !!vehicle &&
      !!selectedStation &&
      !!selectedPortId &&
      !!startAt &&
      durationMinutes > 0 &&
      durationMinutes <= 120
    );
  }, [vehicle, selectedStation, selectedPortId, startAt, durationMinutes]);

  useEffect(() => {
    if (stationPorts.length === 0) {
      setSelectedPortId("");
      return;
    }
    if (!stationPorts.find((p) => p.id === selectedPortId)) {
      setSelectedPortId(stationPorts[0].id);
    }
  }, [stationPorts, selectedPortId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("idle");

    if (!canBook || !vehicle || !selectedStation) {
      setError("Select a vehicle, station, port, and time slot.");
      return;
    }
    if (durationMinutes > 120) {
      setError("Bookings are limited to 2 hours.");
      return;
    }

    const {
      data: { session }
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      setError("You need to be signed in to book a slot.");
      return;
    }

    const startLocal = new Date(startAt);
    const endLocal = new Date(
      startLocal.getTime() + durationMinutes * 60 * 1000
    );

    const startIso = startLocal.toISOString();
    const endIso = endLocal.toISOString();

    setStatus("submitting");

    const { data: conflicts, error: conflictErr } = await supabase
      .from("bookings")
      .select("id,start_time,end_time")
      .eq("port_id", selectedPortId)
      .eq("status", "confirmed")
      .gt("end_time", startIso)
      .lt("start_time", endIso);

    if (conflictErr) {
      console.error(conflictErr);
      setError("Unable to validate availability. Try again.");
      setStatus("error");
      return;
    }

    if (conflicts && conflicts.length > 0) {
      setError(
        "This port is already booked for the selected interval. Choose a different time or port."
      );
      setStatus("error");
      return;
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("bookings")
      .insert({
        user_id: user.id,
        vehicle_id: vehicle.id,
        port_id: selectedPortId,
        start_time: startIso,
        end_time: endIso,
        status: "confirmed"
      })
      .select("id,start_time,end_time")
      .single();

    if (insertErr || !inserted) {
      console.error(insertErr);
      setError("Could not create booking. Please retry.");
      setStatus("error");
      return;
    }

    const bookedPort = stationPorts.find((p) => p.id === selectedPortId);

    setLastBooking({
      id: inserted.id,
      start_time: inserted.start_time,
      end_time: inserted.end_time,
      station_name: selectedStation.name,
      port_type: bookedPort?.port_type ?? "Port"
    });
    setStatus("success");
  }

  const qrGrid = useMemo(
    () => (lastBooking ? generateQrPattern(lastBooking.id) : []),
    [lastBooking]
  );

  return (
    <Card className="mt-3 border-slate-800/90 bg-slate-950/80">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>Booking</CardTitle>
            <CardDescription>
              Reserve a specific port for a 2-hour window or less.
            </CardDescription>
          </div>
          <Badge variant={lastBooking ? "success" : "muted"}>
            {lastBooking ? "Booked" : "Ready"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!vehicle && (
          <p className="text-xs text-muted-foreground">
            Add a vehicle in the driver profile panel to unlock booking.
          </p>
        )}
        {vehicle && (
          <form
            className="grid gap-3 text-xs md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
            onSubmit={handleSubmit}
          >
            <div className="space-y-2">
              <div className="space-y-1">
                <Label>Station</Label>
                <select
                  className="h-9 w-full rounded-md border border-slate-700/80 bg-slate-900/80 px-2 text-xs text-slate-100 outline-none focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-accent-emerald"
                  value={selectedStationId}
                  onChange={(e) => setSelectedStationId(e.target.value)}
                >
                  <option value="">Select station…</option>
                  {availableStations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{" "}
                      {s.distance_km
                        ? `· ${s.distance_km.toFixed(1)} km`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] gap-2">
                <div className="space-y-1">
                  <Label>Port</Label>
                  <select
                    className="h-9 w-full rounded-md border border-slate-700/80 bg-slate-900/80 px-2 text-xs text-slate-100 outline-none focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-accent-emerald"
                    value={selectedPortId}
                    onChange={(e) => setSelectedPortId(e.target.value)}
                    disabled={!selectedStation}
                  >
                    {stationPorts.length === 0 && (
                      <option value="">No available ports</option>
                    )}
                    {stationPorts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.port_type} · {p.power_kw} kW
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Duration</Label>
                  <select
                    className="h-9 w-full rounded-md border border-slate-700/80 bg-slate-900/80 px-2 text-xs text-slate-100 outline-none focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-accent-emerald"
                    value={durationMinutes}
                    onChange={(e) =>
                      setDurationMinutes(Number(e.target.value))
                    }
                  >
                    <option value={30}>30 min</option>
                    <option value={60}>60 min</option>
                    <option value={90}>90 min</option>
                    <option value={120}>120 min</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Start time</Label>
                <Input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  min={toLocalDateTimeInputValue(new Date())}
                />
                <p className="text-[10px] text-muted-foreground">
                  Local time · we&apos;ll block overlapping slots per port.
                </p>
              </div>
              {error && (
                <p className="text-[11px] text-accent-crimson">{error}</p>
              )}
              <div className="flex justify-end pt-1">
                <Button
                  type="submit"
                  size="sm"
                  disabled={!canBook || status === "submitting"}
                >
                  {status === "submitting"
                    ? "Booking…"
                    : "Confirm booking"}
                </Button>
              </div>
            </div>
            <div className="space-y-2 rounded-md border border-slate-800 bg-slate-950/80 p-3">
              <p className="text-[11px] font-semibold text-slate-100">
                Booking confirmation
              </p>
              {!lastBooking && (
                <p className="text-[11px] text-muted-foreground">
                  Once confirmed, you&apos;ll see a QR-style token and
                  booking ID here—ready for a kiosk or valet check.
                </p>
              )}
              {lastBooking && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="flex h-28 w-28 items-center justify-center rounded-md border border-slate-700 bg-slate-900">
                      <div className="grid h-24 w-24 grid-cols-21 grid-rows-21 overflow-hidden bg-slate-100">
                        {qrGrid.map((row, y) =>
                          row.map((cell, x) => (
                            <div
                              key={`${x}-${y}`}
                              className={
                                cell
                                  ? "bg-slate-950"
                                  : "bg-slate-100"
                              }
                            />
                          ))
                        )}
                      </div>
                    </div>
                    <div className="flex-1 space-y-1 text-[11px]">
                      <p className="font-semibold text-slate-100">
                        {lastBooking.station_name}
                      </p>
                      <p className="text-slate-400">
                        {new Date(
                          lastBooking.start_time
                        ).toLocaleString()}{" "}
                        →{" "}
                        {new Date(
                          lastBooking.end_time
                        ).toLocaleTimeString()}
                      </p>
                      <p className="text-slate-400">
                        Port: {lastBooking.port_type}
                      </p>
                      <p className="text-slate-500">
                        Booking ID:
                        <span className="ml-1 font-mono text-[10px]">
                          {lastBooking.id.slice(0, 8)}…
                        </span>
                      </p>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Present this code at the station if required. Your slot
                    is locked for the selected window only.
                  </p>
                </div>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

