import { DriveModeShell } from "@/components/drive/DriveModeShell";

export default function DrivePage() {
  return (
    <div className="flex min-h-[80vh] flex-col gap-4 rounded-lg border border-border bg-slate-900/80 p-5 shadow-card">
      <DriveModeShell />
    </div>
  );
}

