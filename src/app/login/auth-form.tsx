"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { z } from "zod";
import { DemoBadge } from "@/components/brand";
import { isSupabaseConfigured } from "@/lib/repository";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const schema = z.object({
  email: z.email("Email chưa đúng định dạng."),
  password: z.string().min(6, "Mật khẩu cần ít nhất 6 ký tự."),
  displayName: z.string().trim().min(2, "Tên hiển thị cần ít nhất 2 ký tự.").optional(),
});

export function AuthForm() {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    setError(""); setMessage("");
    const values = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      displayName: mode === "signup" ? String(formData.get("displayName") ?? "") : undefined,
    };
    if (!configured) { router.push("/dashboard"); return; }
    const parsed = schema.safeParse(values);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Vui lòng kiểm tra thông tin."); return; }
    setBusy(true);
    try {
      const client = getSupabaseBrowserClient();
      if (mode === "signin") {
        const { error: authError } = await client.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
        if (authError) setError("Không thể đăng nhập. Hãy kiểm tra email và mật khẩu.");
        else { router.push("/dashboard"); router.refresh(); }
      } else {
        const { data, error: authError } = await client.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { data: { display_name: parsed.data.displayName } },
        });
        if (authError) {
          setError(authError.message === "email rate limit exceeded"
            ? "Bạn đã thử đăng ký quá nhiều lần. Hãy đợi một lúc hoặc tắt xác nhận email trong Supabase."
            : authError.message);
        } else if (data.session) {
          router.push("/dashboard");
          router.refresh();
        } else {
          setMessage("Đã tạo tài khoản. Hãy kiểm tra email để xác nhận nếu dự án yêu cầu.");
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chưa thể kết nối đến dịch vụ đăng nhập.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-md rounded-[2rem] border border-sage-200 bg-white p-6 shadow-[0_24px_70px_rgba(35,61,50,.12)] sm:p-8">
      {!configured && <div className="mb-5 flex items-center justify-between rounded-2xl bg-amber-50 p-3"><DemoBadge /><span className="text-xs text-amber-900">Không cần tài khoản</span></div>}
      <div className="mb-7 grid grid-cols-2 rounded-xl bg-sage-50 p-1" role="tablist" aria-label="Chọn hình thức xác thực">
        {(["signin", "signup"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={mode === item} onClick={() => { setMode(item); setError(""); }} className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${mode === item ? "bg-white text-sage-900 shadow-sm" : "text-sage-600"}`}>{item === "signin" ? "Đăng nhập" : "Đăng ký"}</button>)}
      </div>
      <h1 className="text-2xl font-bold text-ink-900">{mode === "signin" ? "Chào bạn quay lại" : "Bắt đầu nhẹ nhàng"}</h1>
      <p className="mt-2 text-sm leading-6 text-ink-600">{mode === "signin" ? "Đăng nhập để tiếp tục lắng nghe năng lượng của mình." : "Tạo tài khoản để đồng bộ lịch và check-in."}</p>
      <form action={submit} className="mt-6 space-y-4">
        {mode === "signup" && <label className="block text-sm font-semibold text-ink-800">Bạn muốn được gọi là gì?<input name="displayName" autoComplete="name" className="field mt-2" placeholder="Ví dụ: An" /></label>}
        <label className="block text-sm font-semibold text-ink-800">Email<input name="email" type="email" autoComplete="email" className="field mt-2" placeholder="ban@example.com" /></label>
        <label className="block text-sm font-semibold text-ink-800">Mật khẩu<span className="relative mt-2 block"><input name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} className="field pr-12" placeholder="Ít nhất 6 ký tự" /><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-ink-500" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="rounded-xl bg-sage-50 px-4 py-3 text-sm text-sage-800">{message}</p>}
        <button disabled={busy} className="button-primary w-full" type="submit">{busy && <LoaderCircle className="animate-spin" size={18} />}{configured ? (mode === "signin" ? "Đăng nhập" : "Tạo tài khoản") : "Dùng thử ngay"}</button>
      </form>
      {configured && <p className="mt-5 text-center text-xs leading-5 text-ink-500">Bằng việc tiếp tục, bạn đồng ý dành một chút thời gian lắng nghe chính mình.</p>}
    </div>
  );
}
