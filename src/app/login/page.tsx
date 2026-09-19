import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { AuthForm } from "@/app/login/auth-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-cream-50 px-5 py-6 sm:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between"><Brand compact /><Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-600 hover:text-sage-800"><ArrowLeft size={16} />Trang chủ</Link></div>
      <section className="mx-auto grid max-w-6xl items-center gap-12 py-12 lg:grid-cols-[1fr_.8fr] lg:py-20">
        <div className="hidden lg:block"><span className="eyebrow">Một nhịp sống vừa sức</span><h2 className="mt-5 max-w-xl text-5xl font-bold leading-[1.08] tracking-tight text-ink-900">Lịch của bạn có thể <span className="text-sage-700">hiểu bạn</span> hơn.</h2><p className="mt-6 max-w-lg text-lg leading-8 text-ink-600">Chọn việc cần làm, dự báo năng lượng còn lại và điều chỉnh trước khi một ngày trở nên quá tải.</p><div className="mt-10 rounded-3xl border border-sage-200 bg-sage-100/60 p-6"><p className="text-sm font-bold text-sage-900">Nhắc nhỏ cho hôm nay</p><p className="mt-2 text-lg leading-7 text-sage-900">“Nghỉ ngơi không làm lịch chậm lại. Nó giúp mình đi tiếp.”</p></div></div>
        <div className="flex justify-center lg:justify-end"><AuthForm /></div>
      </section>
    </main>
  );
}
