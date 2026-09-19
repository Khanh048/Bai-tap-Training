# Hôm Nay Thế Nào?

> Sắp lịch theo năng lượng, không chỉ theo thời gian.

Ứng dụng web giúp người trẻ sắp xếp lịch cố định, việc linh động và khoảng nghỉ ngơi dựa trên mức năng lượng 0–100. Người dùng có thể dự báo năng lượng sau từng hoạt động, xác nhận cảm nhận thực tế và điều chỉnh phần còn lại của ngày.

## Chức năng MVP

- Landing page và giao diện responsive cho máy tính/điện thoại.
- Đăng ký, đăng nhập và đăng xuất bằng email/mật khẩu với Supabase Auth.
- Chế độ demo bằng `localStorage` khi chưa cấu hình Supabase.
- Spotlight product tour 4 bước làm sáng đúng khu vực đang được giới thiệu, tự mở một lần cho từng profile và có thể xem lại từ nút trợ giúp trên header. Trạng thái hoàn tất lưu cục bộ trong trình duyệt theo tài khoản, không đồng bộ qua Supabase hoặc thiết bị khác.
- Check-in năng lượng mỗi ngày theo thang 0–100, chọn chính xác mọi số nguyên.
- Tạo, tìm kiếm, lọc, sửa và xóa hoạt động.
- Hai kiểu lịch: cố định và linh hoạt; nghỉ ngơi là một nhóm hoạt động.
- Hoạt động có tác động dự kiến là mọi số nguyên từ -50 đến +50 năng lượng.
- Lịch lặp hằng tuần dành cho lịch cố định, có thể kết thúc theo ngày (inclusive) hoặc lặp vĩnh viễn; occurrence chỉ được tạo khi range lịch cần hiển thị.
- Sửa/xóa riêng một buổi, từ buổi hiện tại trở đi hoặc toàn bộ chuỗi.
- Đánh dấu nghỉ riêng một buổi mà không ảnh hưởng các tuần khác.
- Cảnh báo nhẹ nhàng khi lịch trùng giờ hoặc năng lượng dự kiến dưới 30.
- Sau hoạt động, thanh kéo mặc định ở mức dự kiến; số người dùng xác nhận sẽ làm mốc tính cho các hoạt động tiếp theo.
- Trang Hôm nay, lịch tuần và lịch tháng; có thể chuyển tới tháng/năm xa để đặt lịch.
- To-do là checklist của các khoảng lịch linh hoạt: mỗi To-do mới tạo một Activity cá nhân và liên kết hai chiều để lịch, năng lượng và trạng thái luôn đồng bộ.
- Nhắc hoạt động và To-do trước 15 phút bằng thông báo trình duyệt và thông báo trong ứng dụng.
- Hỏi lại khi hoạt động/To-do đã quá hạn: dời lịch, hủy hoặc giữ lại.
- Hoạt động đã qua luôn còn hiển thị, tự làm mờ theo thời gian hiện tại và vẫn có thể chỉnh sửa/thao tác mà không làm sai dự báo năng lượng.
- Sidebar hiển thị pin và trạng thái từ check-in hôm nay; nếu chưa check-in sẽ không giả định 70% là dữ liệu thật.
- Tuần bắt đầu từ thứ Hai, toàn bộ ngày giờ dùng múi giờ Việt Nam.
- Row Level Security: mỗi tài khoản chỉ truy cập dữ liệu của chính mình.

## Công nghệ

- Next.js App Router, React và TypeScript strict.
- Tailwind CSS v4.
- Supabase PostgreSQL, Auth và Row Level Security.
- Zod cho kiểm tra form.
- date-fns cho thao tác ngày giờ.
- Lucide React cho biểu tượng.
- Vercel để deploy.

## 1. Chạy ở chế độ demo

Yêu cầu Node.js 22 trở lên và npm.

```powershell
npm install
npm run dev
```

Mở `http://localhost:3000`, chọn **Bắt đầu ngay** → **Dùng thử ngay**. Khi không có `.env.local`, ứng dụng tự dùng `localStorage`.

Dữ liệu demo:

- Chỉ tồn tại trong trình duyệt hiện tại.
- Không đồng bộ giữa thiết bị hoặc tài khoản.
- Có thể mất khi xóa dữ liệu trình duyệt.
- Phù hợp để xem giao diện trước khi tạo Supabase.

## 2. Tạo Supabase miễn phí

1. Đăng nhập [Supabase](https://supabase.com/) và tạo project mới.
2. Mở **SQL Editor**.
3. Sao chép toàn bộ nội dung `supabase/migrations/001_initial_schema.sql` vào SQL Editor và chạy một lần.
4. Sau khi bước 3 hoàn tất, chạy `supabase/migrations/002_todos_reminders_calendar.sql`.
5. Tiếp tục chạy `supabase/migrations/003_integer_energy_remove_recovery.sql` để chuẩn hoá kiểu lịch và miền năng lượng.
6. Chạy `supabase/migrations/004_link_todos_to_activities.sql` để thêm liên kết Todo–Activity. Migration 004 không tự gán Activity cho Todo cũ; Todo legacy đang pending chỉ được liên kết khi người dùng chỉnh sửa, còn Todo đã xong/đã huỷ cần khôi phục trước.
7. Chạy `supabase/migrations/005_activity_series_end.sql` để thêm series master, exclusions, ngày kết thúc và lazy materialization. Năm migration bắt buộc chạy đúng thứ tự **001 → 002 → 003 → 004 → 005**.
8. Mở **Project Settings → API**.
9. Lấy **Project URL** và **Publishable key**.
10. Sao chép `.env.example` thành `.env.local`:

```powershell
Copy-Item .env.example .env.local
```

11. Điền hai giá trị:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

12. Khởi động lại ứng dụng.

Không đưa `service_role` key vào ứng dụng web, file `.env.local`, chat hoặc GitHub. `.env.local` đã được `.gitignore` loại trừ.

### Khi Todo báo chưa sẵn sàng

Dashboard vẫn tải check-in và lịch nếu phần schema Todo chưa có. Nếu bảng Todo/cột overdue/cột `activity_id` chưa tồn tại hoặc schema cache chưa cập nhật, màn hình Todo sẽ hướng dẫn chạy đủ **002 → 003 → 004** và có nút **Thử lại**. Với lỗi mạng, phiên đăng nhập hoặc RLS, ứng dụng giữ thông báo tương ứng thay vì quy thành lỗi migration. Sau khi chạy SQL trên Supabase, đợi schema API cập nhật rồi chọn **Thử lại**; không cần xoá dữ liệu.

### Khi lịch lặp báo chưa sẵn sàng

Nếu database chưa có `activity_series`, exclusions hoặc relation tương ứng, dashboard dừng tải lịch và hướng dẫn chạy `supabase/migrations/005_activity_series_end.sql`. Đây là lỗi schema bắt buộc, không có fallback tạo trước hữu hạn occurrence. Sau khi chạy migration 005, đợi schema API cập nhật rồi chọn **Thử lại**.

### Giới hạn Todo, lịch và nhắc việc

- Todo và lịch là dữ liệu nội bộ của ứng dụng; chưa đồng bộ Google Calendar hoặc dịch vụ lịch bên ngoài.
- Lịch lặp không tạo vô hạn row: repository chỉ materialize occurrence giao với range Today/Week/Month hoặc reminder đang yêu cầu.
- Nhắc việc chạy phía trình duyệt và chỉ hoạt động khi website cùng trình duyệt vẫn mở; chưa có background push, service worker hay ứng dụng native. Quyền notification vẫn phụ thuộc cài đặt của trình duyệt/hệ điều hành.
- Chế độ demo lưu Todo/lịch cục bộ nên không đồng bộ giữa tab, thiết bị hoặc tài khoản.

### Xác nhận email

Trong Supabase, mở **Authentication → Providers → Email**:

- Khi demo nhanh: có thể tạm tắt yêu cầu xác nhận email.
- Khi dùng thật: nên bật xác nhận email.

## 3. Kiểm tra trước khi nộp

```powershell
npx tsc --noEmit
npm run lint
npm run build
```

Luồng kiểm tra thủ công:

1. Tạo tài khoản và đăng nhập; xác nhận onboarding mở sau khi profile tải xong.
2. Đi qua đủ 4 bước bằng bàn phím, kiểm tra Trước/Tiếp theo, Escape/nút đóng và **Bỏ qua**. Reload không được tự mở lại; nút trợ giúp trên header vẫn mở lại từ bước đầu.
3. Đăng nhập tài khoản khác trên cùng trình duyệt và xác nhận onboarding dùng marker riêng. Lưu ý marker hoàn tất là browser-local theo tài khoản, không được đồng bộ qua Supabase hoặc thiết bị khác.
4. Check-in năng lượng hôm nay.
5. Tạo một lịch cố định lặp hằng tuần.
6. Tạo một việc linh động khiến năng lượng xuống dưới 30 và kiểm tra câu hỏi gợi ý.
7. Đánh dấu nghỉ riêng một buổi.
8. Hoàn thành một hoạt động, giữ hoặc kéo mức năng lượng thực tế.
9. Kiểm tra dự báo những hoạt động sau được tính lại.
10. Tạo một mục quá hạn, xác nhận prompt không chồng lên onboarding và xuất hiện sau khi tour đóng.
11. Kiểm tra tour trên điện thoại và với thiết lập giảm chuyển động.
12. Đăng nhập bằng tài khoản khác và xác nhận không thấy dữ liệu tài khoản đầu tiên.

## 4. GitHub private

Tạo repository private trên GitHub, sau đó trong thư mục dự án chạy:

```powershell
git init
git add package.json package-lock.json .npmrc tsconfig.json next.config.ts eslint.config.mjs postcss.config.mjs .gitignore .env.example README.md ARCHITECTURE.md src supabase
git commit -m "feat: build energy-aware planner MVP"
git branch -M main
git remote add origin <URL_REPOSITORY_PRIVATE>
git push -u origin main
```

Không thêm `.env.local` vào Git.

## 5. Deploy Vercel

1. Đăng nhập Vercel bằng GitHub.
2. Chọn **Add New → Project** và import repository private.
3. Framework Preset: **Next.js**.
4. Trong **Environment Variables**, thêm:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
5. Chọn **Deploy**.
6. Sau khi deploy, kiểm tra đăng ký, đăng nhập, CRUD, lịch lặp và phân quyền bằng hai tài khoản.

Nếu chưa thêm biến môi trường, bản Vercel vẫn chạy nhưng ở chế độ demo localStorage.

## Cấu trúc quan trọng

```text
src/
├── app/                    # Các trang landing, login, dashboard
├── components/             # Form, lịch, dialog và dashboard UI
└── lib/
    ├── energy.ts           # Thuật toán dự báo năng lượng
    ├── dates.ts            # Ngày giờ Việt Nam
    ├── repository.ts       # Hợp đồng dữ liệu dùng chung
    ├── repositories/       # localStorage và Supabase
    └── supabase/           # Supabase browser client
supabase/migrations/        # Schema PostgreSQL, trigger và RLS
```

Xem `ARCHITECTURE.md` để hiểu luồng Frontend → Backend/API → Database và các quyết định thiết kế.