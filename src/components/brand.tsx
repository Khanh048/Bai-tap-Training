import Link from "next/link";
import { BatteryCharging } from "lucide-react";
import { clsx } from "clsx";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sage-700" aria-label="Hôm Nay Thế Nào? - Trang chủ">
      <span className="grid size-10 place-items-center rounded-2xl bg-sage-700 text-cream-50 shadow-sm"><BatteryCharging size={22} /></span>
      <span className={clsx("font-bold tracking-tight text-ink-900", compact ? "text-lg" : "text-xl")}>Hôm Nay Thế Nào?</span>
    </Link>
  );
}

export function DemoBadge() {
  return <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">Chế độ demo</span>;
}
