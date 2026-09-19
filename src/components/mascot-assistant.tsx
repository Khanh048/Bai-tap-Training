"use client";

import { useState, type FormEvent } from "react";
import { BookOpen, Send, Sparkles } from "lucide-react";
import { MascotAvatar } from "@/components/mascot-avatar";
import { Modal } from "@/components/ui/modal";

interface MascotAssistantProps {
  open: boolean;
  onClose: () => void;
  onStartTour: () => void;
}

const quickQuestions = [
  "Mình check-in năng lượng thế nào?",
  "Lịch cố định lặp đến bao giờ?",
  "Todo và lịch liên kết ra sao?",
  "Làm gì khi có việc quá hạn?",
] as const;

function normalizeQuestion(value: string): string {
  return value
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAny(value: string, keywords: readonly string[]): boolean {
  const tokens = new Set(value.split(" "));
  return keywords.some((keyword) => keyword.includes(" ") ? value.includes(keyword) : tokens.has(keyword));
}

function guideFor(question: string): string {
  const normalized = normalizeQuestion(question);
  if (matchesAny(normalized, ["qua han", "tre han", "da qua gio", "overdue"])) {
    return "Khi một hoạt động hoặc Todo quá hạn, ứng dụng sẽ hỏi bạn chọn một trong ba cách: Dời lịch, Huỷ, hoặc Giữ lại. Nếu dời, hãy chọn ngày giờ hợp lệ ở tương lai.";
  }
  if (matchesAny(normalized, ["nhac", "reminder", "notification", "thong bao", "quyen", "chuong"])) {
    return "Chọn biểu tượng chuông trên header để cấp quyền thông báo. Khi trang vẫn đang mở, ứng dụng quét định kỳ và nhắc trước 15 phút; quyền bị chặn thì bạn cần bật lại trong cài đặt trình duyệt.";
  }
  if (matchesAny(normalized, ["lap", "co dinh", "vinh vien", "ket thuc", "hang tuan"])) {
    return "Trong form hoạt động, chọn lịch Cố định rồi bật lặp hằng tuần. Bạn có thể đặt ngày kết thúc (ngày đó vẫn được tính) hoặc chọn lặp vĩnh viễn; khi sửa/xoá, ứng dụng sẽ hỏi phạm vi một buổi, từ buổi này, hay cả chuỗi.";
  }
  if (matchesAny(normalized, ["check in", "checkin", "nang luong", "muc pin", "pin", "energy"])) {
    return "Ở màn Hôm nay, kéo thanh, nhập số hoặc chọn mốc 0–100 trong thẻ Check-in. Màu giao diện và dự báo cuối ngày sẽ xem trước theo số bạn chọn; nhấn Lưu để ghi trạng thái của ngày đang xem.";
  }
  if (matchesAny(normalized, ["todo", "to do", "viec can lam", "checklist"])) {
    return "Mở Việc cần làm ở thanh bên. Todo mới hoặc đã liên kết được gắn với một khoảng lịch linh hoạt để thời gian, năng lượng và trạng thái đồng bộ. Todo cũ chưa liên kết có thể được nối với lịch khi bạn chỉnh sửa; bạn cũng có thể thêm nhanh, hoàn thành, huỷ, khôi phục hoặc xoá.";
  }
  if (matchesAny(normalized, ["lich", "ngay", "tuan", "thang", "calendar", "hom nay"])) {
    return "Dùng cụm Ngày · Tuần · Tháng phía trên lịch, hai nút mũi tên để đổi khoảng, Về hôm nay để quay lại, hoặc ô Đi đến tháng khi cần xem xa hơn.";
  }
  return "Mình chỉ hỗ trợ hướng dẫn các mục đang có trong ứng dụng: check-in năng lượng, lịch Ngày/Tuần/Tháng, lịch cố định lặp, Todo, reminder và xử lý quá hạn. Bạn thử hỏi về một mục trong danh sách nhé.";
}

export function MascotAssistant({ open, onClose, onStartTour }: MascotAssistantProps) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("Chào bạn, mình là Koboyo. Hỏi mình cách dùng một mục trong ứng dụng nhé!");

  function reset() {
    setQuestion("");
    setAnswer("Chào bạn, mình là Koboyo. Hỏi mình cách dùng một mục trong ứng dụng nhé!");
  }

  function close() {
    reset();
    onClose();
  }

  function startTour() {
    reset();
    onStartTour();
  }

  function ask(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setAnswer(guideFor(trimmed));
    setQuestion("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    ask(question);
  }

  return <Modal open={open} onClose={close} title="Koboyo trợ giúp" description="Hướng dẫn ngay trong máy, không gửi câu hỏi ra ngoài" size="md">
    <div id="mascot-assistant-content" className="space-y-5">
      <div className="mascot-dialogue-row">
        <MascotAvatar size={92} decorative className="mascot-assistant-avatar" />
        <p className="mascot-speech-bubble" role="status" aria-live="polite">{answer}</p>
      </div>
      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-bold text-ink-700"><Sparkles size={16} />Câu hỏi nhanh</p>
        <div className="flex flex-wrap gap-2">{quickQuestions.map((item) => <button key={item} type="button" className="chip text-left" onClick={() => ask(item)}>{item}</button>)}</div>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <label className="min-w-0 flex-1"><span className="sr-only">Câu hỏi về cách dùng ứng dụng</span><input data-modal-autofocus value={question} onChange={(event) => setQuestion(event.target.value)} className="field" placeholder="Ví dụ: Bật reminder ở đâu?" autoComplete="off" /></label>
        <button type="submit" className="button-primary shrink-0" disabled={!question.trim()}><Send size={17} />Hỏi Koboyo</button>
      </form>
      <div className="assistant-tour-cta"><div><p className="font-bold text-ink-900">Muốn xem trực tiếp?</p><p className="mt-1 text-sm text-ink-500">Mở lại tour 4 bước với spotlight và điều khiển bàn phím.</p></div><button type="button" className="button-secondary shrink-0" onClick={startTour}><BookOpen size={17} />Xem tour 4 bước</button></div>
      <p className="text-xs leading-5 text-ink-400">Koboyo chỉ dùng luật từ khoá cố định, không phải AI và không lưu lịch sử trò chuyện.</p>
    </div>
  </Modal>;
}
