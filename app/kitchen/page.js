"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

// ---- matcha cafe color tokens ----
const COLORS = {
  matcha: "#5b7a4f",
  matchaDark: "#3f5a37",
  matchaLight: "#e7efe1",
  cream: "#faf6ec",
  text: "#2d2a20",
  preparingBg: "#fff3e0",
  preparingBorder: "#f59e0b",
  preparingText: "#8a4b00",
};

const ACTIVE_STATUSES = ["received", "preparing"];

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

export default function KitchenPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const busyIdsRef = useRef(new Set());

  // ---- initial load: received + preparing, oldest -> newest ----
  useEffect(() => {
    let cancelled = false;

    async function loadOrders() {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select("id, session_id, table_number, items, status, created_at")
        .in("status", ACTIVE_STATUSES)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (error) {
        setErrorMsg("โหลดออเดอร์ไม่สำเร็จ กรุณารีเฟรชหน้าใหม่");
        setLoading(false);
        return;
      }

      setOrders(data || []);
      setLoading(false);
    }

    loadOrders();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- realtime: subscribe to INSERT + UPDATE on orders ----
  useEffect(() => {
    const channel = supabase
      .channel("kitchen-orders")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const newOrder = payload.new;
          if (!ACTIVE_STATUSES.includes(newOrder.status)) return;
          setOrders((prev) => {
            if (prev.some((o) => o.id === newOrder.id)) return prev;
            return [...prev, newOrder];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const updated = payload.new;

          // served (or any non-active status) -> remove from screen
          if (!ACTIVE_STATUSES.includes(updated.status)) {
            setOrders((prev) => prev.filter((o) => o.id !== updated.id));
            return;
          }

          setOrders((prev) => {
            const exists = prev.some((o) => o.id === updated.id);
            if (exists) {
              return prev.map((o) => (o.id === updated.id ? updated : o));
            }
            // e.g. status moved back into an active state from elsewhere
            return [...prev, updated];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function updateStatus(orderId, nextStatus) {
    if (busyIdsRef.current.has(orderId)) return;
    busyIdsRef.current.add(orderId);
    setErrorMsg("");

    // optimistic UI update
    if (nextStatus === "served") {
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } else {
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
      );
    }

    const { error } = await supabase
      .from("orders")
      .update({ status: nextStatus })
      .eq("id", orderId);

    busyIdsRef.current.delete(orderId);

    if (error) {
      setErrorMsg(`อัปเดตสถานะไม่สำเร็จ (โต๊ะออเดอร์ ${orderId}): ${error.message}`);
    }
  }

  // newest order shown at the top of the grid, while the underlying
  // fetch/realtime list stays sorted oldest -> newest
  const displayOrders = [...orders].reverse();

  return (
    <main
      style={{
        minHeight: "100vh",
        background: COLORS.cream,
        color: COLORS.text,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header
        style={{
          background: COLORS.matcha,
          color: "#fff",
          padding: "1.25rem 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: "0.9rem", opacity: 0.85 }}>Whisk & Bake</p>
          <p style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800 }}>จอครัว / บาร์ชง</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              width: "0.65rem",
              height: "0.65rem",
              borderRadius: "50%",
              background: "#7cff8f",
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: "1rem", fontWeight: 600 }}>
            {displayOrders.length} ออเดอร์
          </span>
        </div>
      </header>

      {errorMsg && (
        <p
          style={{
            margin: "1rem 1.5rem 0",
            padding: "0.75rem 1rem",
            background: "#fde8e8",
            border: "2px solid #ef4444",
            borderRadius: "10px",
            color: "#9f1c1c",
            fontWeight: 600,
          }}
        >
          {errorMsg}
        </p>
      )}

      {loading ? (
        <p style={{ textAlign: "center", padding: "3rem", fontSize: "1.2rem" }}>
          กำลังโหลดออเดอร์...
        </p>
      ) : displayOrders.length === 0 ? (
        <p style={{ textAlign: "center", padding: "3rem", fontSize: "1.3rem", color: "#7a7a6d" }}>
          ยังไม่มีออเดอร์ค้างอยู่ ☕️
        </p>
      ) : (
        <div
          style={{
            padding: "1.5rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "1.25rem",
          }}
        >
          {displayOrders.map((order) => {
            const isPreparing = order.status === "preparing";
            return (
              <div
                key={order.id}
                style={{
                  background: isPreparing ? COLORS.preparingBg : "#fff",
                  border: `3px solid ${isPreparing ? COLORS.preparingBorder : COLORS.matchaLight}`,
                  borderRadius: "18px",
                  padding: "1.25rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "2rem",
                      fontWeight: 900,
                      color: isPreparing ? COLORS.preparingText : COLORS.matchaDark,
                    }}
                  >
                    โต๊ะ {order.table_number}
                  </p>
                  <p style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "#7a7a6d" }}>
                    {formatTime(order.created_at)}
                  </p>
                </div>

                {isPreparing && (
                  <span
                    style={{
                      alignSelf: "flex-start",
                      fontSize: "0.85rem",
                      fontWeight: 800,
                      color: "#fff",
                      background: COLORS.preparingBorder,
                      padding: "0.25rem 0.7rem",
                      borderRadius: "999px",
                    }}
                  >
                    กำลังทำ
                  </span>
                )}

                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {(order.items || []).map((it, idx) => (
                    <li
                      key={idx}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "1.15rem",
                        fontWeight: 600,
                      }}
                    >
                      <span>{it.name}</span>
                      <span>× {it.quantity}</span>
                    </li>
                  ))}
                </ul>

                <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.5rem" }}>
                  {!isPreparing && (
                    <button
                      onClick={() => updateStatus(order.id, "preparing")}
                      style={{
                        flex: 1,
                        padding: "0.85rem",
                        fontSize: "1.05rem",
                        fontWeight: 800,
                        color: "#fff",
                        background: COLORS.matcha,
                        border: "none",
                        borderRadius: "12px",
                        cursor: "pointer",
                      }}
                    >
                      เริ่มชง/ทำ
                    </button>
                  )}
                  <button
                    onClick={() => updateStatus(order.id, "served")}
                    style={{
                      flex: 1,
                      padding: "0.85rem",
                      fontSize: "1.05rem",
                      fontWeight: 800,
                      color: isPreparing ? "#fff" : COLORS.matchaDark,
                      background: isPreparing ? COLORS.preparingBorder : COLORS.matchaLight,
                      border: "none",
                      borderRadius: "12px",
                      cursor: "pointer",
                    }}
                  >
                    จัดเสิร์ฟแล้ว
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
