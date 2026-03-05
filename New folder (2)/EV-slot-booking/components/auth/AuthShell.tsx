"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { hashPin } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Vehicle = {
  id: string;
  nickname: string;
  license_plate: string;
  ev_model: string;
  battery_capacity_kwh: number;
  supported_ports: string[];
};

type PinState = "none" | "needs-setup" | "exists";

export function AuthShell() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [pinState, setPinState] = useState<PinState>("none");
  const [isPinDialogOpen, setIsPinDialogOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [isSavingPin, setIsSavingPin] = useState(false);

  const [isLocked, setIsLocked] = useState(false);
  const [unlockPin, setUnlockPin] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(false);

  const [isAddingVehicle, setIsAddingVehicle] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({
    nickname: "",
    license_plate: "",
    ev_model: "",
    battery_capacity_kwh: "",
    supported_ports: ""
  });
  const [vehicleError, setVehicleError] = useState<string | null>(null);

  const currentUserId = user?.id ?? null;

  useEffect(() => {
    let ignore = false;

    async function loadSession() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (!ignore) {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user?.email) {
          setEmail(session.user.email);
        }
      }
    }

    loadSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setAuthError(null);
      setAuthMessage(null);
    });

    return () => {
      ignore = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    async function ensureUserAndPin() {
      await supabase.from("users").upsert(
        {
          id: user!.id,
          email: user!.email
        },
        { onConflict: "id" }
      );

      const { data: pinRow, error } = await supabase
        .from("pins")
        .select("user_id")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (error) {
        console.error(error);
        return;
      }

      if (!pinRow) {
        setPinState("needs-setup");
        setIsPinDialogOpen(true);
        setIsLocked(false);
      } else {
        setPinState("exists");
        const unlockedFlag =
          typeof window !== "undefined"
            ? window.sessionStorage.getItem("evhud-unlocked")
            : null;
        setIsLocked(unlockedFlag ? false : true);
      }
    }

    ensureUserAndPin();
  }, [user]);

  useEffect(() => {
    if (!currentUserId) return;
    setIsLoadingVehicles(true);

    supabase
      .from("vehicles")
      .select(
        "id,nickname,license_plate,ev_model,battery_capacity_kwh,supported_ports"
      )
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
        } else if (data) {
          setVehicles(
            data.map((v) => ({
              ...v,
              supported_ports: v.supported_ports ?? []
            }))
          );
        }
        setIsLoadingVehicles(false);
      });
  }, [currentUserId]);

  const hasVehicles = useMemo(() => vehicles.length > 0, [vehicles]);

  async function handleSendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthMessage(null);

    if (!email) {
      setAuthError("Please enter your email.");
      return;
    }

    try {
      setIsSendingLink(true);
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo:
            typeof window !== "undefined"
              ? `${window.location.origin}`
              : undefined
        }
      });
      if (error) {
        setAuthError(error.message);
      } else {
        setAuthMessage(
          "Magic link sent. Check your email to complete sign-in."
        );
      }
    } catch (err) {
      console.error(err);
      setAuthError("Unexpected error sending magic link.");
    } finally {
      setIsSendingLink(false);
    }
  }

  async function handleSavePin(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setPinError(null);

    if (!pin || !pinConfirm) {
      setPinError("Enter and confirm your 4-digit PIN.");
      return;
    }
    if (pin !== pinConfirm) {
      setPinError("PIN entries do not match.");
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setPinError("PIN must be exactly 4 digits.");
      return;
    }

    try {
      setIsSavingPin(true);
      const pinHash = await hashPin(pin);
      const { error } = await supabase.from("pins").upsert(
        {
          user_id: user.id,
          pin_hash: pinHash
        },
        { onConflict: "user_id" }
      );
      if (error) {
        setPinError(error.message);
        return;
      }
      setPinState("exists");
      setIsPinDialogOpen(false);
      setPin("");
      setPinConfirm("");
      setIsLocked(false);
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("evhud-unlocked", "1");
      }
    } catch (err) {
      console.error(err);
      setPinError("Unexpected error saving PIN.");
    } finally {
      setIsSavingPin(false);
    }
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setUnlockError(null);
    if (!/^\d{4}$/.test(unlockPin)) {
      setUnlockError("Enter your 4-digit PIN.");
      return;
    }

    const pinHash = await hashPin(unlockPin);
    const { data, error } = await supabase
      .from("pins")
      .select("pin_hash")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error(error);
      setUnlockError("Unable to verify PIN right now.");
      return;
    }

    if (!data || data.pin_hash !== pinHash) {
      setUnlockError("Incorrect PIN.");
      return;
    }

    setIsLocked(false);
    setUnlockPin("");
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("evhud-unlocked", "1");
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setVehicles([]);
    setPinState("none");
    setIsLocked(false);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem("evhud-unlocked");
    }
  }

  async function handleAddVehicle(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUserId) return;

    setVehicleError(null);

    const capacity = Number(vehicleForm.battery_capacity_kwh);
    if (!vehicleForm.nickname || !vehicleForm.license_plate) {
      setVehicleError("Nickname and license plate are required.");
      return;
    }
    if (!Number.isFinite(capacity) || capacity <= 0) {
      setVehicleError("Enter a valid battery capacity in kWh.");
      return;
    }

    const ports = vehicleForm.supported_ports
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    try {
      setIsAddingVehicle(true);
      const { data, error } = await supabase
        .from("vehicles")
        .insert({
          user_id: currentUserId,
          nickname: vehicleForm.nickname,
          license_plate: vehicleForm.license_plate,
          ev_model: vehicleForm.ev_model || "Custom EV",
          battery_capacity_kwh: capacity,
          supported_ports: ports
        })
        .select(
          "id,nickname,license_plate,ev_model,battery_capacity_kwh,supported_ports"
        )
        .single();

      if (error) {
        setVehicleError(error.message);
        return;
      }

      if (data) {
        setVehicles((prev) => [
          ...prev,
          {
            ...data,
            supported_ports: data.supported_ports ?? []
          }
        ]);
        setVehicleForm({
          nickname: "",
          license_plate: "",
          ev_model: "",
          battery_capacity_kwh: "",
          supported_ports: ""
        });
      }
    } catch (err) {
      console.error(err);
      setVehicleError("Unexpected error adding vehicle.");
    } finally {
      setIsAddingVehicle(false);
    }
  }

  if (!session || !user) {
    return (
      <Card className="flex flex-col justify-between">
        <CardHeader>
          <CardTitle>Email sign-in</CardTitle>
          <CardDescription>
            One-tap magic link login. PIN is added after your first sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={handleSendMagicLink}>
            <div className="space-y-1.5">
              <Label htmlFor="email">Work or personal email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@domain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            {authError && (
              <p className="text-xs text-accent-crimson">{authError}</p>
            )}
            {authMessage && (
              <p className="text-xs text-accent-emerald">{authMessage}</p>
            )}
            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-muted-foreground">
                A secure sign-in link will be sent to your inbox.
              </p>
              <Button
                type="submit"
                size="sm"
                disabled={isSendingLink}
              >
                {isSendingLink ? "Sending…" : "Send link"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="relative">
      {pinState === "needs-setup" && isPinDialogOpen && (
        <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900/95 p-5 shadow-card">
            <h2 className="text-sm font-semibold tracking-tight">
              Create a quick-access PIN
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Use a 4-digit code to unlock EV Drive HUD on this device.
            </p>
            <form className="mt-4 space-y-3" onSubmit={handleSavePin}>
              <div className="space-y-1.5">
                <Label htmlFor="pin">4-digit PIN</Label>
                <Input
                  id="pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pin-confirm">Confirm PIN</Label>
                <Input
                  id="pin-confirm"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value)}
                />
              </div>
              {pinError && (
                <p className="text-xs text-accent-crimson">{pinError}</p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsPinDialogOpen(false);
                    setPinState("none");
                  }}
                >
                  Not now
                </Button>
                <Button type="submit" size="sm" disabled={isSavingPin}>
                  {isSavingPin ? "Saving…" : "Save PIN"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pinState === "exists" && isLocked && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-black/80 backdrop-blur">
          <div className="w-full max-w-xs rounded-lg border border-slate-800 bg-slate-950/95 p-5 shadow-card">
            <h2 className="text-sm font-semibold tracking-tight">
              Welcome back
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Enter your 4-digit PIN to unlock your dashboard.
            </p>
            <form className="mt-4 space-y-3" onSubmit={handleUnlock}>
              <div className="space-y-1.5">
                <Label htmlFor="unlock-pin">PIN</Label>
                <Input
                  id="unlock-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={unlockPin}
                  onChange={(e) => setUnlockPin(e.target.value)}
                  autoFocus
                />
              </div>
              {unlockError && (
                <p className="text-xs text-accent-crimson">{unlockError}</p>
              )}
              <div className="flex justify-end pt-1">
                <Button type="submit" size="sm">
                  Unlock
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Card className="relative">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>Driver profile</CardTitle>
              <CardDescription>
                Signed in as{" "}
                <span className="text-slate-200">{user.email}</span>
              </CardDescription>
            </div>
            <div className="flex flex-col items-end gap-1">
              {pinState === "exists" && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-slate-700/80 bg-slate-900/80 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isLocked ? "bg-slate-600" : "bg-accent-emerald"
                    }`}
                  />
                  {isLocked ? "Locked" : "PIN Active"}
                </button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
              >
                Sign out
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <section>
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Vehicles
                </h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIsAddingVehicle(true)}
                >
                  Add vehicle
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {isLoadingVehicles && (
                  <p className="text-xs text-muted-foreground">
                    Loading vehicles…
                  </p>
                )}
                {!isLoadingVehicles && !hasVehicles && (
                  <p className="text-xs text-muted-foreground">
                    No vehicles yet. Add your primary EV to unlock drive mode
                    and smart booking.
                  </p>
                )}
                {vehicles.map((vehicle) => (
                  <div
                    key={vehicle.id}
                    className="flex items-start justify-between rounded-md border border-slate-800/80 bg-slate-900/80 px-3 py-2"
                  >
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-slate-100">
                        {vehicle.nickname}{" "}
                        <span className="text-[11px] text-muted-foreground">
                          · {vehicle.ev_model}
                        </span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Plate {vehicle.license_plate} ·{" "}
                        {vehicle.battery_capacity_kwh} kWh pack
                      </p>
                      {vehicle.supported_ports.length > 0 && (
                        <p className="text-[10px] text-slate-400">
                          Ports: {vehicle.supported_ports.join(" · ")}
                        </p>
                      )}
                    </div>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                      Primary
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {isAddingVehicle && (
              <section className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
                <h3 className="text-xs font-semibold text-slate-100">
                  New vehicle
                </h3>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Keep details concise. You can refine later.
                </p>
                <form className="mt-3 space-y-2.5" onSubmit={handleAddVehicle}>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="nickname">Nickname</Label>
                      <Input
                        id="nickname"
                        value={vehicleForm.nickname}
                        onChange={(e) =>
                          setVehicleForm((f) => ({
                            ...f,
                            nickname: e.target.value
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="license">License plate</Label>
                      <Input
                        id="license"
                        value={vehicleForm.license_plate}
                        onChange={(e) =>
                          setVehicleForm((f) => ({
                            ...f,
                            license_plate: e.target.value.toUpperCase()
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="model">EV model</Label>
                    <Input
                      id="model"
                      placeholder="e.g. Model 3 Long Range"
                      value={vehicleForm.ev_model}
                      onChange={(e) =>
                        setVehicleForm((f) => ({
                          ...f,
                          ev_model: e.target.value
                        }))
                      }
                    />
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="capacity">Battery (kWh)</Label>
                      <Input
                        id="capacity"
                        type="number"
                        step="1"
                        min="1"
                        value={vehicleForm.battery_capacity_kwh}
                        onChange={(e) =>
                          setVehicleForm((f) => ({
                            ...f,
                            battery_capacity_kwh: e.target.value
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ports">
                        Supported ports (comma separated)
                      </Label>
                      <Input
                        id="ports"
                        placeholder="Type 2, CCS, CHAdeMO"
                        value={vehicleForm.supported_ports}
                        onChange={(e) =>
                          setVehicleForm((f) => ({
                            ...f,
                            supported_ports: e.target.value
                          }))
                        }
                      />
                    </div>
                  </div>
                  {vehicleError && (
                    <p className="text-xs text-accent-crimson">
                      {vehicleError}
                    </p>
                  )}
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setIsAddingVehicle(false);
                        setVehicleError(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" disabled={isAddingVehicle}>
                      {isAddingVehicle ? "Saving…" : "Save vehicle"}
                    </Button>
                  </div>
                </form>
              </section>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

