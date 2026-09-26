# CLAUDE.md

บริบทโปรเจกต์นี้สำหรับ Claude (หรือ AI assistant อื่น) เมื่อทำงานต่อในโค้ดนี้

## โปรเจกต์

**Whisk & Bake** — ระบบสั่งอาหารสำหรับร้านคาเฟ่มัทฉะ
Stack: Next.js (App Router, **JavaScript** — ไม่ใช่ TypeScript) + Supabase + deploy บน Vercel

## ⚠️ สำคัญ: Dynamic Route Params เป็น Promise (Next.js เวอร์ชันล่าสุด)

โปรเจกต์นี้ใช้ **Next.js เวอร์ชันล่าสุด** ซึ่ง `params` (และ `searchParams`) ใน
Server/Client Component **เป็น Promise แล้ว ไม่ใช่ object ธรรมดา** ต้อง unwrap ก่อนใช้งานเสมอ

**Server Component** — ใช้ `await`:

```js
export default async function TablePage({ params }) {
  const { tableNumber } = await params;
  return <div>Table: {tableNumber}</div>;
}
```

**Client Component** — ใช้ `use()` จาก React:

```js
"use client";
import { use } from "react";

export default function TablePage({ params }) {
  const { tableNumber } = use(params);
  return <div>Table: {tableNumber}</div>;
}
```

**อย่าทำแบบนี้ (ผิด):**

```js
// ❌ params.tableNumber ตรงๆ ใช้ไม่ได้กับเวอร์ชันล่าสุด
export default function TablePage({ params }) {
  return <div>Table: {params.tableNumber}</div>;
}
```

กฎนี้ใช้กับทุก dynamic route ในโปรเจกต์นี้ (เช่นหน้า session ของลูกค้าตาม `table_number`
หรือหน้ารายละเอียด order ตาม `id`)

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Client อยู่ที่ `lib/supabaseClient.js`, import ใช้งานด้วย:

```js
import { supabase } from "@/lib/supabaseClient";
```

## Database Schema (มีอยู่แล้วใน Supabase — ห้ามสร้างใหม่)

- **sessions**: `id`, `table_number`, `customer_count`, `status`, `created_at`
- **menu_categories**: `id`, `name`, `sort_order`
- **menu_items**: `id`, `category_id`, `name`, `price`, `description`, `is_available`
- **orders**: `id`, `session_id`, `table_number`, `items` (jsonb), `status`, `created_at`

## หน้าที่มีอยู่แล้ว

- `app/page.js` — หน้าแรก แสดงชื่อร้าน + ลิงก์ `/generate-qr`, `/kitchen`
- `app/generate-qr/page.js` — หน้าพนักงานเปิดโต๊ะ + สร้าง QR (เช็ก session ค้าง, ปิด session เดิม, insert session ใหม่, แสดง QR ชี้ไป `/order/[table_number]`)
- `app/kitchen/page.js` — placeholder รอทำหน้า order queue ให้ครัว (ดึงจากตาราง `orders`)
