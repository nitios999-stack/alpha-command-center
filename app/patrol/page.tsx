"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";

type PatrolSlot = {
  id: string;
  siteId: string;
  siteName: string;
  postName: string;
  slotLabel: string;
  assignedGuard: string;
  actualGuardName: string;
  isSpare: boolean;
  state: string;
  isConfirmed: boolean;
  deadline: string;
  reportedAt: string | null;
  source: string | null;
  isLate: boolean;
  lateMinutes: number;
  wave: "morning" | "evening";
  hasReportedPhoto: boolean;
  updatedAt: string;
};

type ShiftStats = {
  total: number;
  confirmed: number;
  confirmedRegular: number;
  confirmedSpare: number;
  missing: number;
  progressPercent: number;
};

export default function PatrolDeckPage() {
  const [wave, setWave] = useState<"morning" | "evening" | "all">("morning");
  const [filterTab, setFilterTab] = useState<"pending" | "confirmed" | "all">("pending");
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState<ShiftStats>({
    total: 0,
    confirmed: 0,
    confirmedRegular: 0,
    confirmedSpare: 0,
    missing: 0,
    progressPercent: 0,
  });
  const [slots, setSlots] = useState<PatrolSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionSlotId, setActionSlotId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState("");
  const [todayDate, setTodayDate] = useState("");

  // Modal for Custom Spare Guard Name
  const [spareModalSlot, setSpareModalSlot] = useState<PatrolSlot | null>(null);
  const [customSpareName, setCustomSpareName] = useState("");

  // Digital clock
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const timeStr = d.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setCurrentTime(timeStr);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchPatrolData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch(`/api/patrol/shifts?wave=${wave}`);
      const data = await res.json();
      if (res.ok && data.ok) {
        setStats(data.stats);
        setSlots(data.slots);
        setTodayDate(data.today);
        if (isManual) {
          setNotice("🔄 อัปเดตข้อมูลสดเรียบร้อยแล้ว");
          setTimeout(() => setNotice(null), 3000);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [wave]);

  useEffect(() => {
    fetchPatrolData();
    // Auto-poll every 15 seconds for hands-free live updates
    const interval = setInterval(() => {
      fetchPatrolData();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchPatrolData]);

  // Handle 1-Tap Regular Confirm
  const handleConfirmRegular = async (slot: PatrolSlot) => {
    setActionSlotId(slot.id);
    try {
      const res = await fetch("/api/patrol/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId: slot.id,
          guardType: "regular",
          actor: "สายตรวจ (แผงตรวจมือถือ: คนประจำ)",
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setNotice(`✅ บันทึก [คนประจำ: ${slot.assignedGuard || slot.siteName}] เรียบร้อยแล้ว`);
        setTimeout(() => setNotice(null), 3500);
        await fetchPatrolData();
      } else {
        alert(data.error || "เกิดข้อผิดพลาด");
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setActionSlotId(null);
    }
  };

  // Handle 1-Tap Spare Confirm (Quick or via Modal)
  const handleConfirmSpare = async (slotId: string, spareName?: string) => {
    setActionSlotId(slotId);
    try {
      const res = await fetch("/api/patrol/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotId,
          guardType: "spare",
          spareName: spareName || "รปภ. สแปร์แทนเวร",
          actor: `สายตรวจ (แผงตรวจมือถือ: สแปร์ ${spareName || ""})`,
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setNotice(`🔄 บันทึก [สแปร์แทน: ${spareName || "สแปร์แทนเวร"}] สำเร็จ!`);
        setTimeout(() => setNotice(null), 3500);
        setSpareModalSlot(null);
        setCustomSpareName("");
        await fetchPatrolData();
      } else {
        alert(data.error || "เกิดข้อผิดพลาด");
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setActionSlotId(null);
    }
  };

  // Handle 1-Tap Batch Approve
  const handleBatchApprove = async () => {
    const waveLabel = wave === "evening" ? "ผลัดดึก" : wave === "morning" ? "ผลัดเช้า" : "ทุกผลัด";
    if (!window.confirm(`⚡ ยืนยันการอนุมัติเข้าเวรทั้งผลัด (${waveLabel}) สำหรับทุกจุดที่ค้างอยู่หรือไม่?`)) return;
    
    setRefreshing(true);
    try {
      const res = await fetch("/api/patrol/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "batch_approve",
          wave,
          actor: "สายตรวจ (อนุมัติทั้งผลัดผ่าน Patrol Deck)",
        }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setNotice(`⚡ อนุมัติเข้าเวรผ่านทั้งผลัดสำเร็จ ${data.count || ""} จุด! 🎉`);
        setTimeout(() => setNotice(null), 4000);
        await fetchPatrolData();
      } else {
        alert(data.error || "เกิดข้อผิดพลาด");
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setRefreshing(false);
    }
  };

  // Filter slots
  const filteredSlots = useMemo(() => {
    return slots.filter((s) => {
      // Tab filter
      if (filterTab === "pending" && s.isConfirmed) return false;
      if (filterTab === "confirmed" && !s.isConfirmed) return false;

      // Search filter
      if (search.trim()) {
        const query = search.toLowerCase();
        const matches = s.siteName.toLowerCase().includes(query) ||
                        s.postName.toLowerCase().includes(query) ||
                        s.assignedGuard.toLowerCase().includes(query);
        if (!matches) return false;
      }

      return true;
    });
  }, [slots, filterTab, search]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#090d16",
      color: "#f1f5f9",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      paddingBottom: "80px",
    }}>
      {/* STICKY TOP APP BAR */}
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(9, 13, 22, 0.92)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid #1e293b",
        padding: "0.85rem 1rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div style={{
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, #0284c7, #0369a1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.2rem",
            boxShadow: "0 2px 10px rgba(2, 132, 199, 0.4)",
          }}>
            🛡️
          </div>
          <div>
            <h1 style={{ fontSize: "1rem", fontWeight: 800, margin: 0, letterSpacing: "0.02em", color: "#ffffff" }}>
              ALPHA PATROL DECK
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.72rem", color: "#94a3b8" }}>
              <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "#10b981", animation: "pulse 2s infinite" }} />
              <span suppressHydrationWarning>ซิงค์สด {currentTime || "--:--:--"}</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <button
            onClick={() => fetchPatrolData(true)}
            disabled={refreshing}
            style={{
              background: "#1e293b",
              border: "1px solid #334155",
              color: "#e2e8f0",
              borderRadius: "8px",
              padding: "0.45rem 0.75rem",
              fontSize: "0.8rem",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
            }}
          >
            <span style={{ display: "inline-block", transform: refreshing ? "rotate(180deg)" : "none", transition: "transform 0.3s" }}>🔄</span>
            {refreshing ? "กำลังซิงค์" : "รีเฟรช"}
          </button>
          <Link
            href="/"
            style={{
              background: "transparent",
              border: "1px solid #334155",
              color: "#94a3b8",
              borderRadius: "8px",
              padding: "0.45rem 0.65rem",
              fontSize: "0.8rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            💻 บอร์ดใหญ่
          </Link>
        </div>
      </header>

      {/* CONTAINER */}
      <main style={{ maxWidth: "560px", margin: "0 auto", padding: "1rem" }}>
        
        {/* TOAST NOTICE */}
        {notice && (
          <div style={{
            background: "#065f46",
            border: "1px solid #059669",
            color: "#ecfdf5",
            padding: "0.75rem 1rem",
            borderRadius: "12px",
            fontSize: "0.88rem",
            fontWeight: 700,
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 4px 15px rgba(6, 95, 70, 0.4)",
          }}>
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} style={{ background: "none", border: "none", color: "#a7f3d0", fontSize: "1rem", cursor: "pointer" }}>✕</button>
          </div>
        )}

        {/* HERO LIVE HEADCOUNT METER CARD */}
        <div style={{
          background: "linear-gradient(135deg, #131b2e 0%, #1e293b 100%)",
          border: "1px solid #334155",
          borderRadius: "16px",
          padding: "1.15rem",
          marginBottom: "1rem",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }}>
          {/* WAVE SWITCHER PILLS */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
            <div style={{ display: "inline-flex", background: "#090d16", padding: "3px", borderRadius: "10px", border: "1px solid #1e293b" }}>
              <button
                onClick={() => setWave("morning")}
                style={{
                  padding: "0.35rem 0.75rem",
                  borderRadius: "7px",
                  border: "none",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: wave === "morning" ? "#eab308" : "transparent",
                  color: wave === "morning" ? "#713f12" : "#94a3b8",
                }}
              >
                ☀️ ผลัดเช้า
              </button>
              <button
                onClick={() => setWave("evening")}
                style={{
                  padding: "0.35rem 0.75rem",
                  borderRadius: "7px",
                  border: "none",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: wave === "evening" ? "#6366f1" : "transparent",
                  color: wave === "evening" ? "#ffffff" : "#94a3b8",
                }}
              >
                🌙 ผลัดดึก
              </button>
              <button
                onClick={() => setWave("all")}
                style={{
                  padding: "0.35rem 0.65rem",
                  borderRadius: "7px",
                  border: "none",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: wave === "all" ? "#0284c7" : "transparent",
                  color: wave === "all" ? "#ffffff" : "#94a3b8",
                }}
              >
                🌐 ทั้งวัน
              </button>
            </div>

            <div style={{ fontSize: "0.78rem", color: "#94a3b8", fontWeight: 600 }}>
              📅 {todayDate || "วันนี้"}
            </div>
          </div>

          {/* PROGRESS BAR & STATS */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
            <span style={{ fontSize: "0.85rem", color: "#cbd5e1", fontWeight: 700 }}>
              ยอดกำลังพลเข้าเวรจริง:
            </span>
            <span style={{ fontSize: "1.35rem", fontWeight: 900, color: stats.progressPercent === 100 ? "#10b981" : "#38bdf8" }}>
              {stats.confirmed} / {stats.total} นาย <span style={{ fontSize: "0.9rem", color: "#94a3b8" }}>({stats.progressPercent}%)</span>
            </span>
          </div>

          {/* PROGRESS BAR TRACK */}
          <div style={{ width: "100%", height: "10px", background: "#090d16", borderRadius: "20px", overflow: "hidden", border: "1px solid #334155", marginBottom: "0.85rem" }}>
            <div style={{
              width: `${stats.progressPercent}%`,
              height: "100%",
              background: stats.progressPercent === 100
                ? "linear-gradient(90deg, #10b981, #34d399)"
                : "linear-gradient(90deg, #0284c7, #38bdf8)",
              borderRadius: "20px",
              transition: "width 0.4s ease",
            }} />
          </div>

          {/* BADGES SUMMARY */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", textAlign: "center" }}>
            <div style={{ background: "#090d16", padding: "0.5rem 0.25rem", borderRadius: "8px", border: "1px solid #1e293b" }}>
              <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>👮 ประจำ</div>
              <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#10b981" }}>{stats.confirmedRegular}</div>
            </div>
            <div style={{ background: "#090d16", padding: "0.5rem 0.25rem", borderRadius: "8px", border: "1px solid #1e293b" }}>
              <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>🔄 สแปร์แทน</div>
              <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#f59e0b" }}>{stats.confirmedSpare}</div>
            </div>
            <div style={{ background: "#090d16", padding: "0.5rem 0.25rem", borderRadius: "8px", border: "1px solid #1e293b" }}>
              <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>🚨 ยังไม่เข้า</div>
              <div style={{ fontSize: "1.05rem", fontWeight: 800, color: stats.missing > 0 ? "#ef4444" : "#10b981" }}>{stats.missing}</div>
            </div>
          </div>

          {/* BATCH APPROVE 1-TAP BUTTON */}
          {stats.missing > 0 && (
            <button
              onClick={handleBatchApprove}
              disabled={refreshing}
              style={{
                marginTop: "0.85rem",
                width: "100%",
                background: "linear-gradient(135deg, #059669 0%, #10b981 100%)",
                color: "#ffffff",
                border: "none",
                borderRadius: "10px",
                padding: "0.75rem",
                fontSize: "0.95rem",
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                boxShadow: "0 4px 14px rgba(16, 185, 129, 0.4)",
              }}
            >
              <span>⚡</span> อนุมัติเข้าเวรทั้งผลัด ({stats.missing} นาย)
            </button>
          )}
        </div>

        {/* SEARCH BOX */}
        <div style={{ marginBottom: "0.75rem" }}>
          <input
            type="text"
            placeholder="🔍 ค้นหาชื่อจุด, ป้อม, หรือชื่อ รปภ...."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              background: "#131b2e",
              border: "1px solid #334155",
              color: "#ffffff",
              padding: "0.65rem 1rem",
              borderRadius: "10px",
              fontSize: "0.88rem",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* SEGMENTED TAB SWITCHER */}
        <div style={{ display: "flex", background: "#131b2e", padding: "4px", borderRadius: "12px", border: "1px solid #1e293b", marginBottom: "1rem" }}>
          <button
            onClick={() => setFilterTab("pending")}
            style={{
              flex: 1,
              padding: "0.6rem 0.25rem",
              borderRadius: "8px",
              border: "none",
              fontWeight: 800,
              fontSize: "0.85rem",
              cursor: "pointer",
              background: filterTab === "pending" ? "#ef4444" : "transparent",
              color: filterTab === "pending" ? "#ffffff" : "#94a3b8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.3rem",
            }}
          >
            <span>🚨 ค้างตรวจ</span>
            <span style={{
              background: filterTab === "pending" ? "rgba(0,0,0,0.25)" : "#334155",
              padding: "0.1rem 0.45rem",
              borderRadius: "10px",
              fontSize: "0.75rem",
            }}>
              {stats.missing}
            </span>
          </button>

          <button
            onClick={() => setFilterTab("confirmed")}
            style={{
              flex: 1,
              padding: "0.6rem 0.25rem",
              borderRadius: "8px",
              border: "none",
              fontWeight: 800,
              fontSize: "0.85rem",
              cursor: "pointer",
              background: filterTab === "confirmed" ? "#10b981" : "transparent",
              color: filterTab === "confirmed" ? "#ffffff" : "#94a3b8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.3rem",
            }}
          >
            <span>🟢 ผ่านแล้ว</span>
            <span style={{
              background: filterTab === "confirmed" ? "rgba(0,0,0,0.25)" : "#334155",
              padding: "0.1rem 0.45rem",
              borderRadius: "10px",
              fontSize: "0.75rem",
            }}>
              {stats.confirmed}
            </span>
          </button>

          <button
            onClick={() => setFilterTab("all")}
            style={{
              flex: 1,
              padding: "0.6rem 0.25rem",
              borderRadius: "8px",
              border: "none",
              fontWeight: 800,
              fontSize: "0.85rem",
              cursor: "pointer",
              background: filterTab === "all" ? "#0284c7" : "transparent",
              color: filterTab === "all" ? "#ffffff" : "#94a3b8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.3rem",
            }}
          >
            <span>🌐 ทั้งหมด</span>
            <span style={{
              background: filterTab === "all" ? "rgba(0,0,0,0.25)" : "#334155",
              padding: "0.1rem 0.45rem",
              borderRadius: "10px",
              fontSize: "0.75rem",
            }}>
              {stats.total}
            </span>
          </button>
        </div>

        {/* LOADING SPINNER */}
        {loading && (
          <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "#94a3b8" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>⏳</div>
            <div>กำลังโหลดข้อมูลสายตรวจสด...</div>
          </div>
        )}

        {/* EMPTY STATE */}
        {!loading && filteredSlots.length === 0 && (
          <div style={{
            background: "#131b2e",
            border: "1px dashed #334155",
            borderRadius: "16px",
            padding: "2.5rem 1rem",
            textAlign: "center",
            color: "#94a3b8",
          }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>
              {filterTab === "pending" ? "🎉" : "📋"}
            </div>
            <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#ffffff", marginBottom: "0.25rem" }}>
              {filterTab === "pending"
                ? "ยอดเยี่ยม! ไม่มีจุดค้างตรวจแล้ว ครบ 100%"
                : "ไม่พบรายการจุดตรวจที่ค้นหา"}
            </div>
            <p style={{ fontSize: "0.85rem", margin: 0 }}>
              {filterTab === "pending"
                ? "รปภ. ทุกป้อมรายงานตัวเข้าเวรเรียบร้อยแล้วครับ 🫡"
                : "ลองเปลี่ยนคำค้นหาหรือสลับแท็บเพื่อดูรายการ"}
            </p>
          </div>
        )}

        {/* CARDS LIST */}
        <div style={{ display: "grid", gap: "0.85rem" }}>
          {filteredSlots.map((slot, index) => {
            const isProcessing = actionSlotId === slot.id;
            const borderColor = slot.isConfirmed
              ? (slot.isSpare ? "#f59e0b" : "#10b981")
              : (slot.isLate ? "#ef4444" : "#334155");

            return (
              <div
                key={slot.id}
                style={{
                  background: "#131b2e",
                  border: `1.5px solid ${borderColor}`,
                  borderRadius: "14px",
                  padding: "1rem",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                  transition: "all 0.2s ease",
                }}
              >
                {/* CARD HEADER: SITE & STATUS BADGE */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <div>
                    <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#ffffff", lineHeight: "1.3" }}>
                      {index + 1}. {slot.siteName}
                    </div>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.78rem", color: "#38bdf8", fontWeight: 700, marginTop: "0.2rem" }}>
                      <span>📍</span> {slot.postName} · {slot.slotLabel}
                    </div>
                  </div>

                  {/* STATUS BADGE */}
                  <div>
                    {slot.isConfirmed ? (
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        background: slot.isSpare ? "#78350f" : "#064e3b",
                        color: slot.isSpare ? "#fde68a" : "#a7f3d0",
                        padding: "0.25rem 0.6rem",
                        borderRadius: "20px",
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        border: slot.isSpare ? "1px solid #b45309" : "1px solid #059669",
                      }}>
                        {slot.isSpare ? "🔄 สแปร์แทน" : "✅ เข้าแล้ว (ประจำ)"}
                      </span>
                    ) : slot.state === "replacement_required" || slot.source?.includes("แจ้งลา") ? (
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        background: "#7f1d1d",
                        color: "#fecaca",
                        padding: "0.25rem 0.6rem",
                        borderRadius: "20px",
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        border: "1px solid #ef4444",
                      }}>
                        🏥 แจ้งลา (ต้องการสแปร์ด่วน)
                      </span>
                    ) : slot.isLate ? (
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        background: "#7f1d1d",
                        color: "#fecaca",
                        padding: "0.25rem 0.6rem",
                        borderRadius: "20px",
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        border: "1px solid #b91c1c",
                      }}>
                        🚨 สาย {slot.lateMinutes} นาที
                      </span>
                    ) : (
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        background: "#1e293b",
                        color: "#94a3b8",
                        padding: "0.25rem 0.6rem",
                        borderRadius: "20px",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                      }}>
                        ⏳ รอเข้า (กำหนด {slot.deadline} น.)
                      </span>
                    )}
                  </div>
                </div>

                {/* GUARD INFO & PHOTO SIGNAL */}
                <div style={{
                  background: "#090d16",
                  padding: "0.6rem 0.75rem",
                  borderRadius: "8px",
                  fontSize: "0.82rem",
                  color: "#cbd5e1",
                  marginBottom: "0.85rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.4rem",
                }}>
                  <div>
                    <span style={{ color: "#94a3b8" }}>รปภ. ประจำ: </span>
                    <strong style={{ color: "#ffffff" }}>{slot.assignedGuard}</strong>
                    {slot.isSpare && slot.actualGuardName && (
                      <div style={{ color: "#f59e0b", fontSize: "0.78rem", marginTop: "2px" }}>
                        ↳ คนมาจริง: <strong>{slot.actualGuardName}</strong>
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: "0.75rem" }}>
                    {slot.reportedAt ? (
                      <span style={{ color: "#10b981", fontWeight: 700 }}>
                        📸 ส่งรูปแล้ว {slot.reportedAt} น.
                      </span>
                    ) : (
                      <span style={{ color: "#f59e0b" }}>
                        ⏳ ยังไม่ได้รับรูป
                      </span>
                    )}
                  </div>
                </div>

                {/* ACTION BUTTONS (MOBILE THUMB TARGETS) */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  <button
                    onClick={() => handleConfirmRegular(slot)}
                    disabled={isProcessing}
                    style={{
                      height: "46px",
                      background: slot.isConfirmed && !slot.isSpare
                        ? "#064e3b"
                        : "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                      color: "#ffffff",
                      border: slot.isConfirmed && !slot.isSpare ? "1px solid #10b981" : "none",
                      borderRadius: "10px",
                      fontWeight: 800,
                      fontSize: "0.88rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.35rem",
                      boxShadow: "0 2px 8px rgba(2, 132, 199, 0.3)",
                      opacity: isProcessing ? 0.6 : 1,
                    }}
                  >
                    <span>✅</span> คนประจำเข้า
                  </button>

                  <button
                    onClick={() => {
                      setSpareModalSlot(slot);
                      setCustomSpareName("");
                    }}
                    disabled={isProcessing}
                    style={{
                      height: "46px",
                      background: slot.isConfirmed && slot.isSpare
                        ? "#78350f"
                        : "#334155",
                      color: "#ffffff",
                      border: slot.isConfirmed && slot.isSpare ? "1px solid #f59e0b" : "1px solid #475569",
                      borderRadius: "10px",
                      fontWeight: 700,
                      fontSize: "0.88rem",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.35rem",
                      opacity: isProcessing ? 0.6 : 1,
                    }}
                  >
                    <span>🔄</span> สแปร์มาแทน
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* MODAL: INPUT SPARE GUARD NAME */}
      {spareModalSlot && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.75)",
          backdropFilter: "blur(6px)",
          zIndex: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
        }}>
          <div style={{
            background: "#131b2e",
            border: "1px solid #334155",
            borderRadius: "18px",
            padding: "1.25rem",
            width: "100%",
            maxWidth: "420px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.85rem" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#f59e0b", fontWeight: 800 }}>
                  🔄 ระบุ รปภ. สแปร์เข้าแทนเวร
                </h3>
                <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "#94a3b8" }}>
                  จุด: {spareModalSlot.siteName} ({spareModalSlot.postName})
                </p>
              </div>
              <button
                onClick={() => setSpareModalSlot(null)}
                style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "1.2rem", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", color: "#cbd5e1", fontWeight: 600, marginBottom: "0.4rem" }}>
                ชื่อ รปภ. สแปร์ที่มาแทน (ไม่ใส่ก็ได้):
              </label>
              <input
                type="text"
                placeholder="เช่น นายประสิทธิ์ (สแปร์), สแปร์กะดึก"
                value={customSpareName}
                onChange={(e) => setCustomSpareName(e.target.value)}
                style={{
                  width: "100%",
                  background: "#090d16",
                  border: "1px solid #475569",
                  color: "#ffffff",
                  padding: "0.65rem 0.85rem",
                  borderRadius: "8px",
                  fontSize: "0.95rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
                autoFocus
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <button
                onClick={() => handleConfirmSpare(spareModalSlot.id, customSpareName.trim() || undefined)}
                style={{
                  padding: "0.7rem",
                  borderRadius: "8px",
                  border: "none",
                  background: "linear-gradient(135deg, #d97706, #b45309)",
                  color: "#ffffff",
                  fontWeight: 800,
                  fontSize: "0.9rem",
                  cursor: "pointer",
                }}
              >
                บันทึกสแปร์ทันที
              </button>
              <button
                onClick={() => setSpareModalSlot(null)}
                style={{
                  padding: "0.7rem",
                  borderRadius: "8px",
                  border: "1px solid #475569",
                  background: "#1e293b",
                  color: "#cbd5e1",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  cursor: "pointer",
                }}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
