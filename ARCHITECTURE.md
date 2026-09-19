# Kiến trúc — Hôm Nay Thế Nào?

## 1. Bức tranh tổng thể

```mermaid
flowchart LR
    U[Người dùng] --> FE[Next.js UI]
    FE --> R[EnergyRepository]
    R -->|Chưa có cấu hình| DEMO[localStorage demo]
    R -->|Đã có cấu hình| SB[Supabase JavaScript Client]
    SB --> AUTH[Supabase Auth]
    SB --> API[PostgREST API]
    API --> RLS[Row Level Security]
    RLS --> DB[(PostgreSQL)]
```

- **Frontend:** các trang và component Next.js hiển thị lịch, form và năng lượng.
- **Backend/API:** Supabase Auth xử lý tài khoản; PostgREST cung cấp API từ PostgreSQL.
- **Database:** PostgreSQL lưu profile, check-in và hoạt động.
- **Bảo mật:** Row Level Security kiểm tra `auth.uid()` trước mọi thao tác dữ liệu.
- **Demo:** cùng giao diện và nghiệp vụ nhưng lưu trong localStorage thông qua một repository khác.

## 2. Vì sao chọn stack này?

### Next.js

Một project có thể chứa toàn bộ giao diện và logic ứng dụng, deploy trực tiếp lên Vercel. Điều này phù hợp với bài tập một ngày hơn việc tách frontend và backend thành hai server.

### Supabase

Supabase cung cấp PostgreSQL, đăng nhập, API và phân quyền miễn phí. Dự án vẫn thể hiện đầy đủ luồng FE–API–DB mà không phải tự vận hành server riêng.

### Repository pattern

UI chỉ làm việc với `EnergyRepository`, không biết dữ liệu đến từ localStorage hay Supabase. Nhờ đó:

- Có thể xem ứng dụng ngay khi chưa tạo Supabase.
- Logic giao diện không bị lặp.
- Có thể thay nguồn dữ liệu mà ít ảnh hưởng component.

Đánh đổi: demo localStorage không có đồng bộ, giao dịch server hoặc bảo mật đa người dùng.

## 3. Mô hình dữ liệu

```mermaid
erDiagram
    AUTH_USERS ||--|| PROFILES : has
    AUTH_USERS ||--o{ DAILY_CHECKINS : records
    AUTH_USERS ||--o{ ACTIVITIES : owns
    AUTH_USERS ||--o{ TODOS : owns

    PROFILES {
        uuid id PK
        text display_name
        smallint default_energy
    }

    DAILY_CHECKINS {
        uuid id PK
        uuid user_id FK
        date checkin_date
        smallint energy_level
        text note
    }

    ACTIVITIES {
        uuid id PK
        uuid user_id FK
        text title
        text category
        text schedule_type
        timestamptz starts_at
        timestamptz ends_at
        smallint expected_impact
        smallint actual_energy_after
        text status
        uuid series_id
        text recurrence
        integer occurrence_index
        timestamptz overdue_acknowledged_at
    }

    TODOS {
        uuid id PK
        uuid user_id FK
        text title
        date scheduled_date
        timestamptz due_at
        text status
        uuid activity_id FK
        timestamptz completed_at
        timestamptz overdue_acknowledged_at
    }
```

### Triển khai schema Supabase

Project Supabase mới phải chạy đầy đủ migration trong SQL Editor theo đúng thứ tự:

1. `supabase/migrations/001_initial_schema.sql` — profile, check-in, hoạt động và RLS nền tảng.
2. `supabase/migrations/002_todos_reminders_calendar.sql` — Todo, overdue acknowledgement, index và RLS bổ sung.

3. `supabase/migrations/003_integer_energy_remove_recovery.sql` — chuyển dữ liệu `recovery` cũ sang `flexible`, giới hạn lịch còn `fixed`/`flexible`, và cho phép mọi mức năng lượng nguyên trong miền hợp lệ.
4. `supabase/migrations/004_link_todos_to_activities.sql` — thêm `todos.activity_id` nullable, FK `on delete set null` và unique partial index theo user/activity.

Dashboard yêu cầu chạy đúng **001 → 002 → 003 → 004** để dùng Todo. Các request profile/check-in/lịch là core và vẫn render nếu schema Todo/overdue chưa sẵn sàng; màn Todo hiển thị hướng dẫn cùng retry riêng. Migration 004 không backfill giá trị legacy tuỳ ý: Todo cũ giữ `activity_id = null`; Todo pending được liên kết ở lần chỉnh sửa kế tiếp, còn Todo inactive phải được khôi phục trước để tránh tạo Activity đang chạy cho checklist đã đóng.

### Hợp đồng lịch và năng lượng

- `schedule_type` chỉ có `fixed` và `flexible`. Giá trị legacy `recovery` được demo parser và migration 003 chuẩn hóa thành `flexible` trước khi kiểm tra; nội dung nghỉ ngơi vẫn được biểu diễn bằng `category = rest`.
- `default_energy`, `energy_level` và `actual_energy_after` nhận mọi số nguyên từ 0 đến 100.
- `expected_impact` nhận mọi số nguyên từ -50 đến 50. UI, demo repository và PostgreSQL cùng bảo vệ các miền này; không còn quy tắc chia hết cho 5.
- Demo parser đánh dấu dữ liệu legacy đã chuẩn hóa để ghi lại canonical value, tránh reset hoặc làm mất blob localStorage hợp lệ.

### Lịch lặp

Một lịch lặp hằng tuần tạo 12 bản ghi có cùng `series_id`. `occurrence_index` từ 0 đến 11 là thứ tự bất biến, dùng để xác định:

- `single`: chỉ một buổi.
- `future`: buổi đang chọn và những buổi có index lớn hơn.
- `all`: toàn bộ series.

Việc dùng index thay vì giờ bắt đầu giúp phạm vi vẫn đúng khi một buổi đã được dời sang ngày khác.

## 4. Thuật toán năng lượng

```text
current = clamp(round(năng lượng check-in hoặc mặc định 70), 0, 100)

với từng hoạt động theo thứ tự thời gian:
    predicted_before = current

    nếu hoạt động đã nghỉ hoặc bị hủy:
        predicted_after = current
    nếu đã hoàn thành và có số thực tế:
        predicted_after = clamp(round(actual_energy_after), 0, 100)
    ngược lại:
        predicted_after = clamp(round(current + expected_impact), 0, 100)

    current = predicted_after
```

Mọi đầu vào năng lượng là số nguyên: mức profile/check-in/thực tế từ 0–100 và tác động dự kiến từ -50–50.

Ví dụ:

```text
Check-in: 75
Đi học -20       → dự kiến 55
Người dùng kéo thực tế về 40
Làm bài nhóm -15 → dự kiến mới 25, không phải 40 theo dự báo cũ
```

Bộ lọc chỉ ẩn/hiện hoạt động; nó không làm thay đổi phép tính năng lượng thực tế của ngày.

## 5. Luồng dữ liệu

### Onboarding người mới

```text
Dashboard tải profile
→ tạo key hom-nay-the-nao:onboarding:v1:<profile.id>
→ chưa hoàn tất: tự mở spotlight tour 4 bước đúng một lần
→ làm sáng lần lượt check-in, điều khiển lịch, Todo và chuông nhắc việc
→ hoàn tất, bỏ qua hoặc đóng: ghi marker rồi đóng tour
→ nút trợ giúp trên header: mở lại tour mà không xoá marker
```

Onboarding chỉ dùng `Profile.id` do `EnergyRepository` trả về nên UI không phân nhánh giữa demo và Supabase. Marker hoàn tất nằm trong `localStorage` của trình duyệt, được tách riêng theo profile; nếu storage bị chặn, `sessionStorage` và bộ nhớ phiên ngăn tour mở lặp. Đây là tuỳ chọn UI browser-local, không phải dữ liệu database, không chịu RLS và không đồng bộ Supabase hay thiết bị khác. Khi tour đang mở, prompt quá hạn được giữ lại để hiển thị sau, tránh hai dialog chồng nhau.

### Tạo hoạt động

```mermaid
sequenceDiagram
    participant U as Người dùng
    participant F as ActivityForm
    participant R as Repository
    participant D as Database

    U->>F: Nhập lịch và tác động dự kiến
    F->>F: Zod kiểm tra dữ liệu
    F->>F: Kiểm tra trùng giờ / pin dưới 30
    U->>F: Xác nhận lưu
    F->>R: createActivity
    R->>D: Insert 1 hoặc 12 occurrence
    D-->>R: Hoạt động đã lưu
    R-->>F: Reload dashboard
```

### Todo liên kết Activity

- Mỗi Todo mới tạo đúng một Activity `personal`/`flexible`/`none`; Activity là nguồn duy nhất cho calendar, reminder và dự báo năng lượng.
- `todos.activity_id` nullable để dữ liệu cũ vẫn hợp lệ. Chỉnh Todo legacy đang pending sẽ tạo Activity và gắn liên kết; Todo inactive cần khôi phục trước.
- Tạo Todo dùng bù trừ: nếu insert Todo lỗi, Activity vừa tạo bị xoá và lỗi rollback (nếu có) được báo rõ. Các update hai bản ghi khôi phục snapshot Activity nếu bước Todo thất bại; xoá cặp liên kết dùng database function nguyên tử trên Supabase và một lần ghi trong demo.
- Chỉnh title/ngày/giờ/thời lượng/tác động/ghi chú đồng bộ sang Activity; chỉnh lịch đồng bộ title/ngày/giờ/ghi chú về Todo.
- Hoàn thành luôn đi qua xác nhận năng lượng của Activity rồi hoàn thành cả hai. Huỷ/khôi phục map sang `cancelled`/`scheduled` và xoá năng lượng thực tế khi khôi phục.
- Todo liên kết bị loại khỏi Todo overdue/reminder để Activity là nguồn prompt duy nhất. Xoá Todo xoá Activity; xoá Activity liên kết qua UI xoá Todo. FK `on delete set null` là lớp an toàn nếu Activity bị xoá ngoài luồng UI.

### Hoàn thành hoạt động

1. UI tính mức năng lượng dự kiến sau hoạt động.
2. Dialog đặt slider tại mức đó.
3. Người dùng giữ nguyên hoặc kéo sang mức thực tế.
4. Repository lưu `status = completed` và `actual_energy_after`.
5. Dashboard tải lại và tính phần còn lại từ số thực tế.

## 6. Phân quyền

Mỗi bảng nghiệp vụ bật Row Level Security:

```text
profiles.id = auth.uid()
daily_checkins.user_id = auth.uid()
activities.user_id = auth.uid()
todos.user_id = auth.uid()
```

Trình duyệt chỉ dùng publishable key. Key này không thể bỏ qua RLS. `service_role` không xuất hiện trong source hoặc biến môi trường frontend.

## 7. Ngày giờ

- Database lưu ISO timestamp theo UTC.
- Giao diện parse và hiển thị theo `Asia/Ho_Chi_Minh`.
- Tuần bắt đầu thứ Hai.
- Dashboard tự làm mới khi tab được focus, trở lại trạng thái visible hoặc qua nửa đêm Việt Nam.

## 8. Giới hạn hiện tại

- Lịch lặp tạo trước 12 tuần, chưa phải recurrence vô hạn.
- Todo và lịch chỉ tồn tại trong planner, chưa đồng bộ Google Calendar hay dịch vụ lịch bên ngoài.
- Reminder được quét phía client mỗi 30 giây và khi tab active; website cùng trình duyệt phải còn mở. Chưa có background push/service worker, và notification phụ thuộc quyền của trình duyệt/hệ điều hành.
- Chưa tự động kéo thả hoặc tự quyết định lịch thay người dùng.
- Cảnh báo năng lượng chỉ là gợi ý, không phải chẩn đoán sức khỏe.
- Chế độ demo dùng localStorage nên không đồng bộ nhiều tab/thiết bị hoặc tài khoản.
- Chưa có ứng dụng native.

## 9. Hướng mở rộng

1. Gợi ý ngày nhẹ hơn cho lịch linh động.
2. Học chênh lệch giữa dự kiến và thực tế theo từng loại hoạt động.
3. Đồng bộ Google Calendar.
4. PWA và thông báo check-in.
5. Biểu đồ xu hướng tuần/tháng.
6. Database function cho các thao tác chuỗi lịch phức tạp và optimistic concurrency.