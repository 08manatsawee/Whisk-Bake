# Whisk & Bake

ระบบสั่งอาหารสำหรับร้านคาเฟ่มัทฉะ "Whisk & Bake" สร้างด้วย Next.js (App Router, JavaScript)
เชื่อมต่อฐานข้อมูลผ่าน Supabase และ deploy บน Vercel

## Stack

- Next.js (App Router, JavaScript — ไม่ใช่ TypeScript)
- React / React DOM
- Supabase (`@supabase/supabase-js`)
- Deploy: Vercel

## Environment Variables

สร้างไฟล์ `.env.local` (ไม่ต้อง commit) โดยอ้างอิงจาก `.env.local.example`:

```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Client ถูกสร้างไว้แล้วที่ `lib/supabaseClient.js` และ import ใช้งานได้ทันที:

```js
import { supabase } from "@/lib/supabaseClient";
```

## Getting Started

```bash
npm install
npm run dev
```

เปิด http://localhost:3000 — หน้าแรกมีลิงก์ไปยัง `/generate-qr` และ `/kitchen` เพื่อทดสอบว่า deploy สำเร็จ

## Deploy

Push ขึ้น GitHub แล้วเชื่อมกับ Vercel ตามปกติ อย่าลืมตั้งค่า environment variables
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) ใน Vercel Project Settings ด้วย

## ⚠️ สำคัญ: Dynamic Route Params เป็น Promise (Next.js เวอร์ชันล่าสุด)

โปรเจกต์นี้ใช้ **Next.js เวอร์ชันล่าสุด** ซึ่งเปลี่ยนพฤติกรรมของ Dynamic Route:
`params` (และ `searchParams`) ใน Server/Client Component **เป็น Promise แล้ว ไม่ใช่ object ธรรมดา**
ต้อง unwrap ก่อนใช้งานเสมอ มิฉะนั้นจะได้ error หรือ `undefined`

### ตัวอย่างที่ถูกต้อง

**Server Component** — ใช้ `await`:

```js
// app/table/[tableNumber]/page.js
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

**อย่าทำแบบนี้ (ผิด — ใช้แบบ object ตรงๆ ไม่ unwrap):**

```js
// ❌ ผิด ใช้ไม่ได้กับเวอร์ชันล่าสุด
export default function TablePage({ params }) {
  return <div>Table: {params.tableNumber}</div>;
}
```

กฎนี้ใช้กับทุก dynamic route ในโปรเจกต์นี้ (เช่นหน้า session ของลูกค้าตาม `table_number`
หรือหน้ารายละเอียด order ตาม `id`) — ถ้าสร้างไฟล์ dynamic route ใหม่ ให้จำกฎนี้ไว้เสมอ

## Database Schema (มีอยู่แล้วใน Supabase — ไม่ต้องสร้างใหม่)

ตารางเหล่านี้มีอยู่แล้วในฐานข้อมูล Supabase ของโปรเจกต์นี้ ให้อ้างอิงชื่อ column ให้ตรงเวลาต่อยอดโค้ด:

### `sessions`
| column          | type      |
|-----------------|-----------|
| id              | —         |
| table_number    | —         |
| customer_count  | —         |
| status          | —         |
| created_at      | —         |

### `menu_categories`
| column      | type |
|-------------|------|
| id          | —    |
| name        | —    |
| sort_order  | —    |

### `menu_items`
| column        | type |
|---------------|------|
| id            | —    |
| category_id   | —    |
| name          | —    |
| price         | —    |
| description   | —    |
| is_available  | —    |

### `orders`
| column       | type  |
|--------------|-------|
| id           | —     |
| session_id   | —     |
| table_number | —     |
| items        | jsonb |
| status       | —     |
| created_at   | —     |

## Project Structure

```
whisk-and-bake/
├── app/
│   ├── layout.js
│   ├── page.js              # หน้าแรก — ชื่อร้าน + ลิงก์ /generate-qr, /kitchen
│   ├── generate-qr/
│   │   └── page.js
│   └── kitchen/
│       └── page.js
├── lib/
│   └── supabaseClient.js    # Supabase client (env vars)
├── next.config.js
├── package.json
├── .env.local.example
└── .gitignore
```  
