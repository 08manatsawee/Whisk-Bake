"use client";

import { useEffect, useMemo, useState } from "react";
import { use } from "react";
import { supabase } from "../../lib/supabaseClient";

// ---- matcha cafe color tokens ----
const COLORS = {
  matcha: "#5b7a4f",
  matchaDark: "#3f5a37",
  matchaLight: "#e7efe1",
  cream: "#faf6ec",
  text: "#2d2a20",
  warnBg: "#fff3e0",
  warnBorder: "#f59e0b",
  warnText: "#8a4b00",
};

const MAX_QTY_PER_ITEM = 5;
const MAX_ITEMS_PER_ORDER = 10;

function formatPrice(n) {
  return Number(n).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function OrderPage({ params }) {
  // Next.js: params is a Promise — must unwrap with use(), never params.tableNumber directly
  const { tableNumber } = use(params);

  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionId, setSessionId] = useState(null);
  const [sessionNotFound, setSessionNotFound] = useState(false);

  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [menuLoading, setMenuLoading] = useState(true);

  // cart: { [itemId]: quantity }
  const [cart, setCart] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // checkout ("เรียกเก็บเงิน") flow
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false);
  const [checkoutTotal, setCheckoutTotal] = useState(0);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutDone, setCheckoutDone] = useState(false);

  // ---- 1) find the open session for this table ----
  useEffect(() => {
    let cancelled = false;

    async function findSession() {
      setSessionLoading(true);
      setErrorMsg("");
      const tableNum = Number(tableNumber);

      const { data, error } = await supabase
        .from("sessions")
        .select("id")
        .eq("table_number", tableNum)
        .eq("status", "open")
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setErrorMsg("เกิดข้อผิดพลาดในการตรวจสอบโต๊ะ กรุณาลองใหม่");
        setSessionLoading(false);
        return;
      }

      if (!data) {
        setSessionNotFound(true);
        setSessionLoading(false);
        return;
      }

      setSessionId(data.id);
      setSessionLoading(false);
    }

    findSession();
    return () => {
      cancelled = true;
    };
  }, [tableNumber]);

  // ---- 2) load menu once we know the table has an open session ----
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    async function loadMenu() {
      setMenuLoading(true);
      const [{ data: cats, error: catErr }, { data: menuItems, error: itemErr }] =
        await Promise.all([
          supabase
            .from("menu_categories")
            .select("id, name, sort_order")
            .order("sort_order", { ascending: true }),
          supabase
            .from("menu_items")
            .select("id, category_id, name, price, description, is_available")
            .eq("is_available", true),
        ]);

      if (cancelled) return;

      if (catErr || itemErr) {
        setErrorMsg("โหลดเมนูไม่สำเร็จ กรุณาลองรีเฟรชหน้าใหม่");
        setMenuLoading(false);
        return;
      }

      setCategories(cats || []);
      setItems(menuItems || []);
      if (cats && cats.length > 0) {
        setActiveCategoryId(cats[0].id);
      }
      setMenuLoading(false);
    }

    loadMenu();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const cartEntries = useMemo(() => {
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, qty]) => {
        const item = items.find((it) => String(it.id) === String(itemId));
        return item ? { ...item, quantity: qty } : null;
      })
      .filter(Boolean);
  }, [cart, items]);

  const cartTotalQty = cartEntries.reduce((sum, e) => sum + e.quantity, 0);
  const cartTotalPrice = cartEntries.reduce(
    (sum, e) => sum + e.quantity * Number(e.price),
    0
  );

  function changeQty(itemId, delta) {
    setSubmitMsg("");
    setCart((prev) => {
      const current = prev[itemId] || 0;
      let next = current + delta;
      if (next < 0) next = 0;
      if (next > MAX_QTY_PER_ITEM) next = MAX_QTY_PER_ITEM;

      // enforce max 10 items total per submission
      const otherTotal = Object.entries(prev)
        .filter(([id]) => id !== String(itemId))
        .reduce((sum, [, q]) => sum + q, 0);
      if (otherTotal + next > MAX_ITEMS_PER_ORDER) {
        next = Math.max(0, MAX_ITEMS_PER_ORDER - otherTotal);
      }

      return { ...prev, [itemId]: next };
    });
  }

  async function handleSubmitOrder() {
    if (cartEntries.length === 0 || !sessionId) return;
    setSubmitting(true);
    setErrorMsg("");
    setSubmitMsg("");

    const orderItems = cartEntries.map((e) => ({
      name: e.name,
      quantity: e.quantity,
      price: Number(e.price),
    }));

    try {
      const { error } = await supabase.from("orders").insert({
        session_id: sessionId,
        table_number: Number(tableNumber),
        items: orderItems,
        status: "received",
      });

      if (error) throw error;

      setCart({});
      setSubmitMsg("✅ ส่งออเดอร์แล้ว");
      setTimeout(() => setSubmitMsg(""), 3000);
    } catch (err) {
      setErrorMsg(`ส่งออเดอร์ไม่สำเร็จ: ${err?.message || "กรุณาลองใหม่"}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOpenCheckout() {
    if (!sessionId) return;
    setErrorMsg("");
    const { data, error } = await supabase
      .from("orders")
      .select("items")
      .eq("session_id", sessionId);

    if (error) {
      setErrorMsg("คำนวณยอดไม่สำเร็จ กรุณาลองใหม่");
      return;
    }

    const total = (data || []).reduce((sum, row) => {
      const rowTotal = (row.items || []).reduce(
        (s, it) => s + Number(it.price) * Number(it.quantity),
        0
      );
      return sum + rowTotal;
    }, 0);

    setCheckoutTotal(total);
    setShowCheckoutConfirm(true);
  }

  async function handleConfirmCheckout() {
    if (!sessionId) return;
    setCheckoutLoading(true);
    setErrorMsg("");
    try {
      const { error } = await supabase
        .from("sessions")
        .update({ status: "closed" })
        .eq("id", sessionId)
        .eq("status", "open");

      if (error) throw error;

      setShowCheckoutConfirm(false);
      setCheckoutDone(true);
    } catch (err) {
      setErrorMsg(`ปิดโต๊ะไม่สำเร็จ: ${err?.message || "กรุณาแจ้งพนักงาน"}`);
    } finally {
      setCheckoutLoading(false);
    }
  }

  // ---------------------------------------------------------------------
  // render states
  // ---------------------------------------------------------------------

  if (sessionLoading) {
    return (
      <CenteredMessage>
        <p style={{ fontSize: "1.1rem" }}>กำลังตรวจสอบโต๊ะ...</p>
      </CenteredMessage>
    );
  }

  if (sessionNotFound) {
    return (
      <CenteredMessage>
        <div
          style={{
            background: COLORS.warnBg,
            border: `2px solid ${COLORS.warnBorder}`,
            borderRadius: "16px",
            padding: "1.5rem",
            maxWidth: "420px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "1.2rem", fontWeight: 800, color: COLORS.warnText, margin: 0 }}>
            ⚠️ โต๊ะนี้ยังไม่เปิดใช้งาน
          </p>
          <p style={{ fontSize: "1.05rem", color: COLORS.warnText, marginTop: "0.6rem" }}>
            กรุณาแจ้งพนักงาน
          </p>
        </div>
      </CenteredMessage>
    );
  }

  if (checkoutDone) {
    return (
      <CenteredMessage>
        <div
          style={{
            background: "#fff",
            border: `2px solid ${COLORS.matchaLight}`,
            borderRadius: "16px",
            padding: "2rem 1.5rem",
            maxWidth: "420px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "2rem", margin: 0 }}>🍵</p>
          <p
            style={{
              fontSize: "1.3rem",
              fontWeight: 800,
              color: COLORS.matchaDark,
              marginTop: "0.75rem",
            }}
          >
            ขอบคุณที่ใช้บริการคาเฟ่ Whisk & Bake
          </p>
        </div>
      </CenteredMessage>
    );
  }

  const itemsInActiveCategory = items.filter(
    (it) => it.category_id === activeCategoryId
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: COLORS.cream,
        color: COLORS.text,
        fontFamily: "system-ui, sans-serif",
        paddingBottom: cartEntries.length > 0 ? "7.5rem" : "1.5rem",
      }}
    >
      {/* ---- header ---- */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: COLORS.matcha,
          color: "#fff",
          padding: "1rem 1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.85 }}>Whisk & Bake</p>
          <p style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800 }}>
            โต๊ะ {tableNumber}
          </p>
        </div>
        <button
          onClick={handleOpenCheckout}
          style={{
            padding: "0.6rem 1rem",
            fontSize: "0.95rem",
            fontWeight: 700,
            color: COLORS.matchaDark,
            background: "#fff",
            border: "none",
            borderRadius: "10px",
            cursor: "pointer",
          }}
        >
          เรียกเก็บเงิน
        </button>
      </header>

      {errorMsg && (
        <div style={{ padding: "0.75rem 1.25rem" }}>
          <p
            style={{
              margin: 0,
              padding: "0.75rem 1rem",
              background: "#fde8e8",
              border: "2px solid #ef4444",
              borderRadius: "10px",
              color: "#9f1c1c",
              fontWeight: 600,
              fontSize: "0.95rem",
            }}
          >
            {errorMsg}
          </p>
        </div>
      )}

      {submitMsg && (
        <div style={{ padding: "0.75rem 1.25rem 0" }}>
          <p
            style={{
              margin: 0,
              padding: "0.75rem 1rem",
              background: COLORS.matchaLight,
              border: `2px solid ${COLORS.matcha}`,
              borderRadius: "10px",
              color: COLORS.matchaDark,
              fontWeight: 700,
              fontSize: "0.95rem",
              textAlign: "center",
            }}
          >
            {submitMsg}
          </p>
        </div>
      )}

      {menuLoading ? (
        <p style={{ textAlign: "center", padding: "2rem", fontSize: "1.05rem" }}>
          กำลังโหลดเมนู...
        </p>
      ) : (
        <>
          {/* ---- category tabs ---- */}
          <div
            style={{
              display: "flex",
              gap: "0.6rem",
              overflowX: "auto",
              padding: "1rem 1.25rem 0.5rem",
            }}
          >
            {categories.map((cat) => {
              const active = cat.id === activeCategoryId;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategoryId(cat.id)}
                  style={{
                    flexShrink: 0,
                    padding: "0.6rem 1.1rem",
                    fontSize: "1rem",
                    fontWeight: 700,
                    borderRadius: "999px",
                    border: `2px solid ${COLORS.matcha}`,
                    background: active ? COLORS.matcha : "#fff",
                    color: active ? "#fff" : COLORS.matcha,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {cat.name}
                </button>
              );
            })}
          </div>

          {/* ---- menu items ---- */}
          <div
            style={{
              padding: "0.75rem 1.25rem 1.5rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.9rem",
            }}
          >
            {itemsInActiveCategory.length === 0 && (
              <p style={{ color: "#7a7a6d", textAlign: "center", marginTop: "1rem" }}>
                ยังไม่มีเมนูในหมวดนี้
              </p>
            )}

            {itemsInActiveCategory.map((item) => {
              const qty = cart[item.id] || 0;
              return (
                <div
                  key={item.id}
                  style={{
                    background: "#fff",
                    border: `2px solid ${COLORS.matchaLight}`,
                    borderRadius: "14px",
                    padding: "1rem 1.1rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.75rem",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
                      {item.name}
                    </p>
                    {item.description && (
                      <p
                        style={{
                          margin: "0.2rem 0 0",
                          fontSize: "0.85rem",
                          color: "#7a7a6d",
                        }}
                      >
                        {item.description}
                      </p>
                    )}
                    <p
                      style={{
                        margin: "0.35rem 0 0",
                        fontSize: "1rem",
                        fontWeight: 700,
                        color: COLORS.matchaDark,
                      }}
                    >
                      ฿{formatPrice(item.price)}
                    </p>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                    <QtyButton
                      onClick={() => changeQty(item.id, -1)}
                      disabled={qty <= 0}
                      label="−"
                    />
                    <span
                      style={{
                        minWidth: "1.6rem",
                        textAlign: "center",
                        fontSize: "1.1rem",
                        fontWeight: 800,
                      }}
                    >
                      {qty}
                    </span>
                    <QtyButton
                      onClick={() => changeQty(item.id, 1)}
                      disabled={qty >= MAX_QTY_PER_ITEM || cartTotalQty >= MAX_ITEMS_PER_ORDER}
                      label="+"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ---- sticky cart summary ---- */}
      {cartEntries.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: COLORS.matchaDark,
            color: "#fff",
            padding: "1rem 1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            boxShadow: "0 -2px 12px rgba(0,0,0,0.15)",
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.85 }}>
              {cartTotalQty} รายการ {cartTotalQty >= MAX_ITEMS_PER_ORDER ? "(สูงสุดแล้ว)" : ""}
            </p>
            <p style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>
              ฿{formatPrice(cartTotalPrice)}
            </p>
          </div>
          <button
            onClick={handleSubmitOrder}
            disabled={submitting}
            style={{
              padding: "0.85rem 1.5rem",
              fontSize: "1.05rem",
              fontWeight: 800,
              color: COLORS.matchaDark,
              background: submitting ? "#cfd9c6" : "#fff",
              border: "none",
              borderRadius: "12px",
              cursor: submitting ? "default" : "pointer",
            }}
          >
            {submitting ? "กำลังส่ง..." : "ส่งออเดอร์"}
          </button>
        </div>
      )}

      {/* ---- checkout confirm modal ---- */}
      {showCheckoutConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1.25rem",
            zIndex: 20,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              padding: "1.5rem",
              maxWidth: "380px",
              width: "100%",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: "1.2rem", fontWeight: 800, margin: 0, color: COLORS.matchaDark }}>
              เรียกเก็บเงิน
            </p>
            <p style={{ fontSize: "1rem", color: COLORS.text, marginTop: "0.75rem" }}>
              ยอดรวมทั้งหมดของโต๊ะ {tableNumber}
            </p>
            <p
              style={{
                fontSize: "2rem",
                fontWeight: 800,
                color: COLORS.matchaDark,
                margin: "0.5rem 0 1.25rem",
              }}
            >
              ฿{formatPrice(checkoutTotal)}
            </p>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={() => setShowCheckoutConfirm(false)}
                disabled={checkoutLoading}
                style={{
                  flex: 1,
                  padding: "0.8rem",
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: COLORS.text,
                  background: "#fff",
                  border: `2px solid ${COLORS.matcha}`,
                  borderRadius: "10px",
                  cursor: checkoutLoading ? "default" : "pointer",
                }}
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirmCheckout}
                disabled={checkoutLoading}
                style={{
                  flex: 1,
                  padding: "0.8rem",
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "#fff",
                  background: COLORS.matcha,
                  border: "none",
                  borderRadius: "10px",
                  cursor: checkoutLoading ? "default" : "pointer",
                }}
              >
                {checkoutLoading ? "กำลังปิด..." : "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function QtyButton({ onClick, disabled, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "2.2rem",
        height: "2.2rem",
        borderRadius: "50%",
        border: `2px solid ${COLORS.matcha}`,
        background: disabled ? "#f1f1e9" : "#fff",
        color: disabled ? "#b7b7a8" : COLORS.matchaDark,
        fontSize: "1.2rem",
        fontWeight: 800,
        cursor: disabled ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {label}
    </button>
  );
}

function CenteredMessage({ children }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: COLORS.cream,
        color: COLORS.text,
        fontFamily: "system-ui, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      {children}
    </main>
  );
}
