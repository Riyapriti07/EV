import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { MapShell } from "@/components/map/MapShell";
import { BookingShell } from "@/components/booking/BookingShell";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col gap-4 rounded-lg border border-border bg-slate-900/60 p-6 shadow-card">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            EV Drive HUD
          </h1>
          <p className="text-sm text-muted-foreground">
            Charging slot booking & real-time range awareness.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/drive"
            className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:border-slate-500 hover:text-slate-100"
          >
            Open Drive Mode
          </Link>
        </div>
      </header>
      <section className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)]">
        <AuthShell />
        <div className="flex flex-col">
          <MapShell />
          <BookingShell />
        </div>
      </section>
    </div>
  );
}

