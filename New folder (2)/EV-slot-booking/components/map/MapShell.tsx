"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { LatLngExpression } from "leaflet";
import { supabase } from "@/lib/supabaseClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Station, Vehicle } from "./types";

// This is the magic line that fixes the server-side rendering crash!
const DynamicMap = dynamic(() => import("./MapViewInner"), {
  ssr: false,
});

const BANGALORE_CENTER: LatLngExpression = [12.9716, 77.5946];

export function MapShell() {
  const [primaryVehicle, setPrimaryVehicle] = useState<Vehicle | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPrimaryVehicle() {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || cancelled) return;

      const { data, error } = await supabase
        .from("vehicles")
        .select(
          "id,nickname,ev_model,battery_capacity_kwh,supported_ports"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);

      if (error) {
        console.error(error);
        return;
      }

      if (data && data.length > 0) {
        const v = data[0];
        setPrimaryVehicle({
          ...v,
          supported_ports: v.supported_ports ?? []
        });
      }
    }

    loadPrimaryVehicle();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function seedStationsIfNeeded() {
      const { data: existing, error } = await supabase
        .from("stations")
        .select("id")
        .limit(1);

      if (error) {
        console.error(error);
        setError("Unable to load stations.");
        setLoading(false);
        return;
      }

      if (existing && existing.length > 0) {
        return;
      }

      // 10 realistic stations around Bengaluru with approximate distances/costs.
      const seedStations = [
        {
          name: "MG Road UltraCharge Hub",
          latitude: 12.9731,
          longitude: 77.6070,
          address: "MG Road, Bengaluru",
          distance_km: 1.4,
          is_supercharger: true,
          cost_per_kwh: 16.5,
          ports: [
            { port_type: "CCS", power_kw: 120, is_available: true },
            { port_type: "CCS", power_kw: 120, is_available: true },
            { port_type: "Type 2", power_kw: 22, is_available: false }
          ]
        },
        {
          name: "Indiranagar EV Plaza",
          latitude: 12.9784,
          longitude: 77.6408,
          address: "CMH Road, Indiranagar",
          distance_km: 5.1,
          is_supercharger: false,
          cost_per_kwh: 15.0,
          ports: [
            { port_type: "Type 2", power_kw: 22, is_available: true },
            { port_type: "Type 2", power_kw: 22, is_available: true },
            { port_type: "CCS", power_kw: 50, is_available: true }
          ]
        },
        {
          name: "Whitefield TechPark Chargers",
          latitude: 12.9698,
          longitude: 77.7499,
          address: "ITPL Main Road, Whitefield",
          distance_km: 18.7,
          is_supercharger: true,
          cost_per_kwh: 17.2,
          ports: [
            { port_type: "CCS", power_kw: 150, is_available: true },
            { port_type: "CCS", power_kw: 150, is_available: false },
            { port_type: "CHAdeMO", power_kw: 50, is_available: true }
          ]
        },
        {
          name: "Electronic City ExpressCharge",
          latitude: 12.8438,
          longitude: 77.6630,
          address: "NH 44, Electronic City",
          distance_km: 20.5,
          is_supercharger: true,
          cost_per_kwh: 18.0,
          ports: [
            { port_type: "CCS", power_kw: 120, is_available: true },
            { port_type: "CCS", power_kw: 120, is_available: true },
            { port_type: "Type 2", power_kw: 11, is_available: true }
          ]
        },
        {
          name: "Koramangala High Street Station",
          latitude: 12.9352,
          longitude: 77.6140,
          address: "80 Ft Road, Koramangala",
          distance_km: 5.8,
          is_supercharger: false,
          cost_per_kwh: 15.8,
          ports: [
            { port_type: "Type 2", power_kw: 22, is_available: false },
            { port_type: "Type 2", power_kw: 22, is_available: true },
            { port_type: "CCS", power_kw: 60, is_available: true }
          ]
        },
        {
          name: "Hebbal Lakeside Chargers",
          latitude: 13.0358,
          longitude: 77.5970,
          address: "Hebbal Outer Ring Road",
          distance_km: 10.2,
          is_supercharger: false,
          cost_per_kwh: 14.9,
          ports: [
            { port_type: "Type 2", power_kw: 11, is_available: true },
            { port_type: "Type 2", power_kw: 11, is_available: true },
            { port_type: "CCS", power_kw: 60, is_available: false }
          ]
        },
        {
          name: "Yeshwanthpur Metro ChargePoint",
          latitude: 13.0185,
          longitude: 77.5560,
          address: "Near Yeshwanthpur Metro Station",
          distance_km: 9.4,
          is_supercharger: false,
          cost_per_kwh: 15.2,
          ports: [
            { port_type: "Type 2", power_kw: 22, is_available: true },
            { port_type: "CHAdeMO", power_kw: 50, is_available: true }
          ]
        },
        {
          name: "Banashankari Ring Road Hub",
          latitude: 12.9180,
          longitude: 77.5735,
          address: "Outer Ring Road, Banashankari",
          distance_km: 9.8,
          is_supercharger: false,
          cost_per_kwh: 14.5,
          ports: [
            { port_type: "Type 2", power_kw: 11, is_available: true },
            { port_type: "Type 2", power_kw: 11, is_available: false },
            { port_type: "CCS", power_kw: 50, is_available: true }
          ]
        },
        {
          name: "Airport Express Superfast",
          latitude: 13.1986,
          longitude: 77.7066,
          address: "Airport Road, Devanahalli",
          distance_km: 34.5,
          is_supercharger: true,
          cost_per_kwh: 19.5,
          ports: [
            { port_type: "CCS", power_kw: 180, is_available: true },
            { port_type: "CCS", power_kw: 180, is_available: true },
            { port_type: "CHAdeMO", power_kw: 50, is_available: false }
          ]
        },
        {
          name: "HSR Layout NightBay",
          latitude: 12.9110,
          longitude: 77.6412,
          address: "27th Main, HSR Layout",
          distance_km: 8.6,
          is_supercharger: false,
          cost_per_kwh: 15.6,
          ports: [
            { port_type: "Type 2", power_kw: 7.4, is_available: true },
            { port_type: "Type 2", power_kw: 7.4, is_available: true },
            { port_type: "CCS", power_kw: 60, is_available: true }
          ]
        }
      ];

      const stationInserts = seedStations.map((s) => ({
        name: s.name,
        latitude: s.latitude,
        longitude: s.longitude,
        address: s.address,
        distance_km: s.distance_km,
        is_supercharger: s.is_supercharger,
        cost_per_kwh: s.cost_per_kwh
      }));

      const { data: insertedStations, error: insertErr } = await supabase
        .from("stations")
        .insert(stationInserts)
        .select("id,name");

      if (insertErr) {
        console.error(insertErr);
        setError("Unable to seed stations.");
        setLoading(false);
        return;
      }

      if (!insertedStations) return;

      const portsPayload: Array<{
        station_id: string;
        port_type: string;
        power_kw: number;
        is_available: boolean;
      }> = [];

      insertedStations.forEach((row) => {
        const seed = seedStations.find((s) => s.name === row.name);
        if (!seed) return;
        seed.ports.forEach((p) => {
          portsPayload.push({
            station_id: row.id,
            port_type: p.port_type,
            power_kw: p.power_kw,
            is_available: p.is_available
          });
        });
      });

      if (portsPayload.length > 0) {
        const { error: portsErr } = await supabase
          .from("ports")
          .insert(portsPayload);
        if (portsErr) {
          console.error(portsErr);
        }
      }
    }

    async function loadStations() {
      setLoading(true);
      setError(null);

      await seedStationsIfNeeded();

      const { data, error } = await supabase
        .from("stations")
        .select(
          "id,name,latitude,longitude,address,distance_km,is_supercharger,cost_per_kwh,ports(id,port_type,power_kw,is_available)"
        )
        .order("distance_km", { ascending: true });

      if (error) {
        console.error(error);
        if (!cancelled) {
          setError("Unable to load stations.");
          setLoading(false);
        }
        return;
      }

      if (!cancelled && data) {
        setStations(
          data.map((s) => ({
            ...s,
            ports: (s as any).ports ?? []
          }))
        );
        setLoading(false);
      }
    }

    loadStations();

    return () => {
      cancelled = true;
    };
  }, []);

  const headerVehicleLabel = useMemo(() => {
    if (!primaryVehicle) return "Add a vehicle to unlock smart estimates.";
    return `${primaryVehicle.nickname} · ${primaryVehicle.battery_capacity_kwh} kWh · ${primaryVehicle.ev_model}`;
  }, [primaryVehicle]);

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle>Map · Nearby chargers</CardTitle>
            <CardDescription>
              MG Road–centric view of Bengaluru with seeded stations.
            </CardDescription>
          </div>
          <Badge variant={primaryVehicle ? "success" : "muted"}>
            {primaryVehicle ? "Drive data linked" : "Vehicle needed"}
          </Badge>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {headerVehicleLabel}
        </p>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        {error && (
          <div className="flex h-64 items-center justify-center text-xs text-accent-crimson">
            {error}
          </div>
        )}
        {!error && (
          <div className="h-[360px] overflow-hidden rounded-b-lg border-t border-slate-800">
            <DynamicMap
              center={BANGALORE_CENTER}
              stations={stations}
              vehicle={primaryVehicle}
              loading={loading}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}