"use client";

import { useState } from "react";
import { CheckCircle2, LoaderCircle, Minus, Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { clampEnergy } from "@/lib/energy";
import type { ForecastActivity } from "@/lib/types";

export function EnergyDialog({ activity, onClose, onSave }: { activity: ForecastActivity | null; onClose: () => void; onSave: (energy: number) => Promise<void> }) {
  const [energy, setEnergy] = useState(clampEnergy(activity?.predicted_after ?? 70));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      await onSave(energy);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chưa thể lưu cảm nhận.");
    } finally {
      setBusy(false);
    }
  }
  return <Modal open={Boolean(activity)} onClose={onClose} closeDisabled={busy} title="Xong rồi, hiện tại bạn thế nào?" description={activity?.title} size="sm"><div className="text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-sage-100 text-sage-700"><CheckCircle2 size={28} /></span><p className="mt-4 text-sm leading-6 text-ink-600">Mức dự kiến là <strong>{activity?.predicted_after}%</strong>. Chọn mọi số nguyên từ 0 đến 100 để ghi đúng cảm nhận.</p><strong className="mt-5 block text-4xl text-sage-800">{energy}%</strong><input aria-label="Năng lượng thực tế sau hoạt động" type="range" min="0" max="100" step="1" value={energy} onChange={(event) => setEnergy(Number(event.target.value))} className="energy-range mt-5" /><div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-ink-400">Cạn pin</span><div className="energy-stepper"><button type="button" disabled={energy <= 0} onClick={() => setEnergy((value) => clampEnergy(value - 1))} aria-label="Giảm 1 năng lượng"><Minus size={15} /></button><input aria-label="Năng lượng thực tế chính xác" type="number" min="0" max="100" step="1" value={energy} onChange={(event) => setEnergy(clampEnergy(Number(event.target.value)))} /><span>%</span><button type="button" disabled={energy >= 100} onClick={() => setEnergy((value) => clampEnergy(value + 1))} aria-label="Tăng 1 năng lượng"><Plus size={15} /></button></div><span className="text-xs text-ink-400">Rất ổn</span></div><div className="mt-4 flex flex-wrap justify-center gap-2">{[20, 40, 60, 80, 100].map((value) => <button key={value} type="button" onClick={() => setEnergy(value)} className={`chip ${energy === value ? "chip-active" : ""}`}>{value}%</button>)}</div>{error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={busy} onClick={() => void save()} className="button-primary mt-7 w-full">{busy && <LoaderCircle className="animate-spin" size={17} />}Lưu cảm nhận</button></div></Modal>;
}
