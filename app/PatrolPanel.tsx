"use client";

import { useState, useEffect, useMemo } from "react";
import type { CoverageSlot, DashboardData } from "./page";

type PatrolPanelProps = {
  data: DashboardData | null;
  loading: boolean;
  onRefresh: () => void;
  onAction: (payload: Record<string, unknown>, key: string, successMessage: string) => Promise<any>;
};

export default function PatrolPanel({ data, loading, onRefresh, onAction }: PatrolPanelProps) {
  const [wave, setWave] = useState<"morning" | "evening" | "all">("morning");
  const [filterTab, setFilterTab] = useState<"pending" | "confirmed" | "all">("pending");
  const [search, setSearch] = useState("");
  const [currentTime, setCurrentTime] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busySlotId, setBusySlotId] = useState<string | null>(null);

  // Modal for Custom Spare Name
  const [spareSlot, setSpareSlot] = useState<CoverageSlot | null>(null);
  const [spareName, setSpareName] = useState("");

  // Live Digital Clock
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

  // Filter slots
  const allSlots = data?.slots || [];
  const waveSlots = useMemo(() => {
    return allSlots.filter((s) => {
      if (wave === "all") return true;
      return s.wave === wave;
    });
  }, [allSlots, wave]);

  // Headcount Stats
  const stats = useMemo(() => {
    let total = waveSlots.length;
    let confirmedRegular = 0;
    let confirmedSpare = 0;
    let missing = 0;

    waveSlots.forEach((s) => {
      const isConfirmed = s.state === "confirmed";
      const isSpare = Boolean(s.source && s.source.includes("สแปร์")) || s.assignmentType === "spare";
      if (isConfirmed) {
        if (isSpare) confirmedSpare++;
        else confirmedRegular++;
      } else {
        missing++;
      }
    });

    const confirmed = confirmedRegular + confirmedSpare;
    const progressPercent = total > 0 ? Math.round((confirmed / total) * 100) : 100;

    return { total, confirmed, confirmedRegular, confirmedSpare, missing, progressPercent };
  }, [waveSlots]);

  // Display Slots
  const displaySlots = useMemo(() => {
    return waveSlots.filter((s) => {
      const isConfirmed = s.state === "confirmed";
      if (filterTab === "pending" && isConfirmed) return false;
      if (filterTab === "confirmed" && !isConfirmed) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matches = s.siteName.toLowerCase().includes(q) ||
                        s.postName.toLowerCase().includes(q) ||
                        (s.assignedGuard || "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [waveSlots, filterTab, search]);

  // Handle 1-Tap Regular Confirm
  const handleConfirmRegular = async (slot: CoverageSlot) => {
    setBusySlotId(slot.id);
    try {
      await onAction(
        { type: "confirm", slotId: slot.id, source: "สายตรวจ (คนประจำ)" },
        `patrol-confirm-${slot.id}`,
        `✅ ยืนยัน [คนประจำ: ${slot.assignedGuard || slot.siteName}] เรียบร้อยแล้ว`
      );
      setNotice(`✅ บันทึกเข้าเวร [${slot.siteName}] แล้ว`);
      setTimeout(() => setNotice(null), 3000);
    } finally {
      setBusySlotId(null);
    }
  };

  // Handle 1-Tap Spare Confirm
  const handleConfirmSpare = async (slotId: string, customName?: string) => {
    setBusySlotId(slotId);
    try {
      await onAction(
        { type: "replace", slotId, assignedGuard: customName || "รปภ. สแปร์แทนเวร" },
        `patrol-spare-${slotId}`,
        `🔄 ยืนยัน [สแปร์แทน: ${customName || "สแปร์แทนเวร"}] สำเร็จ!`
      );
      setNotice(`🔄 บันทึกสแปร์แทน [${customName || "สแปร์แทนเวร"}] แล้ว`);
      setTimeout(() => setNotice(null), 3000);
      setSpareSlot(null);
      setSpareName("");
    } finally {
      setBusySlotId(null);
    }
  };

  // Handle 1-Tap Batch Approve
  const handleBatchApprove = async () => {
    const waveLabel = wave === "evening" ? "ผลัดดึก" : wave === "morning" ? "ผลัดเช้า" : "ทุกผลัด";
    if (!window.confirm(`⚡ ยืนยันการอนุมัติเข้าเวรทั้งผลัด (${waveLabel}) สำหรับทุกจุดที่ค้างอยู่หรือไม่?`)) return;

    await onAction(
      { type: "batch_approve", wave },
      "patrol-batch-approve",
      `⚡ อนุมัติเข้าเวรทั้งผลัด (${waveLabel}) เรียบร้อยแล้ว`
    );
    setNotice(`⚡ อนุมัติเข้าเวรทั้งผลัดสำเร็จ! 🎉`);
    setTimeout(() => setNotice(null), 4000);
  };

  return (
    <div style={{ maxWidth: "600px", margin: "0 auto", padding: "0.5rem 0.75rem 5rem 0.75rem", fontFamily: "system-ui, -apple-system, sans-serif", color: "#f1f5f9" }}>
      
      {/* TOAST NOTICE */}
      {notice && (
        <div style={{ background: "#065f46", border: "1px solid #059669", color: "#ecfdf5", padding: "0.75rem 1rem", borderRadius: "12px", fontSize: "0.88rem", fontWeight: 700, marginBottom: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 15px rgba(6,95,70,0.4)" }}>
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} style={{ background: "none", border: "none", color: "#a7f3d0", fontSize: "1.1rem", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* STICKY TOP STATUS BAR */}
      <div style={{ background: "linear-gradient(135deg, #131b2e 0%, #1e293b 100%)", border: "1.5px solid #334155", borderRadius: "16px", padding: "1.15rem", marginBottom: "1rem", boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
        
        {/* WAVE SWITCHER & LIVE CLOCK */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
          <div style={{ display: "inline-flex", background: "#090d16", padding: "3px", borderRadius: "10px", border: "1px solid #1e293b" }}>
            <button
              onClick={() => setWave("morning")}
              style={{ padding: "0.4rem 0.85rem", borderRadius: "7px", border: "none", fontSize: "0.82rem", fontWeight: 800, cursor: "pointer", background: wave === "morning" ? "#eab308" : "transparent", color: wave === "morning" ? "#713f12" : "#94a3b8" }}
            >
              ☀️ ผลัดเช้า
            </button>
            <button
              onClick={() => setWave("evening")}
              style={{ padding: "0.4rem 0.85rem", borderRadius: "7px", border: "none", fontSize: "0.82rem", fontWeight: 800, cursor: "pointer", background: wave === "evening" ? "#6366f1" : "transparent", color: wave === "evening" ? "#ffffff" : "#94a3b8" }}
            >
              🌙 ผลัดดึก
            </button>
            <button
              onClick={() => setWave("all")}
              style={{ padding: "0.4rem 0.75rem", borderRadius: "7px", border: "none", fontSize: "0.82rem", fontWeight: 800, cursor: "pointer", background: wave === "all" ? "#0284c7" : "transparent", color: wave === "all" ? "#ffffff" : "#94a3b8" }}
            >
              🌐 ทั้งวัน
            </button>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 600 }}>⏰ ซิงค์สด</div>
            <div style={{ fontSize: "0.92rem", color: "#38bdf8", fontWeight: 800 }}>{currentTime || "--:--:--"}</div>
          </div>
        </div>

        {/* PROGRESS BAR & HEADCOUNT */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
          <span style={{ fontSize: "0.88rem", color: "#cbd5e1", fontWeight: 700 }}>กำลังพลเข้าเวรจริง:</span>
          <span style={{ fontSize: "1.35rem", fontWeight: 900, color: stats.progressPercent === 100 ? "#10b981" : "#38bdf8" }}>
            {stats.confirmed} / {stats.total} นาย <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>({stats.progressPercent}%)</span>
          </span>
        </div>

        <div style={{ width: "100%", height: "10px", background: "#090d16", borderRadius: "20px", overflow: "hidden", border: "1px solid #334155", marginBottom: "0.85rem" }}>
          <div style={{ width: `${stats.progressPercent}%`, height: "100%", background: stats.progressPercent === 100 ? "linear-gradient(90deg, #10b981, #34d399)" : "linear-gradient(90deg, #0284c7, #38bdf8)", borderRadius: "20px", transition: "width 0.4s ease" }} />
        </div>

        {/* BADGES SUMMARY */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", textAlign: "center" }}>
          <div style={{ background: "#090d16", padding: "0.5rem 0.25rem", borderRadius: "8px", border: "1px solid #1e293b" }}>
            <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>👮 ประจำ</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#10b981" }}>{stats.confirmedRegular}</div>
          </div>
          <div style={{ background: "#090d16", padding: "0.5rem 0.25rem", borderRadius: "8px", border: "1px solid #1e293b" }}>
            <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>🔄 สแปร์แทน</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#f59e0b" }}>{stats.confirmedSpare}</div>
          </div>
          <div style={{ background: "#090d16", padding: "0.5rem 0.25rem", borderRadius: "8px", border: "1px solid #1e293b" }}>
            <div style={{ fontSize: "0.7rem", color: "#94a3b8" }}>🚨 ยังไม่เข้า</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: stats.missing > 0 ? "#ef4444" : "#10b981" }}>{stats.missing}</div>
          </div>
        </div>

        {/* 1-TAP BATCH APPROVE BUTTON */}
        {stats.missing > 0 && (
          <button
            onClick={handleBatchApprove}
            disabled={loading}
            style={{ marginTop: "0.85rem", width: "100%", background: "linear-gradient(135deg, #059669 0%, #10b981 100%)", color: "#ffffff", border: "none", borderRadius: "10px", padding: "0.75rem", fontSize: "0.95rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", boxShadow: "0 4px 14px rgba(16, 185, 129, 0.4)" }}
          >
            <span>⚡</span> อนุมัติเข้าเวรทั้งผลัด ({stats.missing} นาย)
          </button>
        )}
      </div>

      {/* SEARCH BAR */}
      <div style={{ marginBottom: "0.85rem" }}>
        <input
          type="text"
          placeholder="🔍 ค้นหาชื่อจุด, ป้อม, หรือชื่อ รปภ...."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", background: "#131b2e", border: "1px solid #334155", borderRadius: "10px", padding: "0.7rem 1rem", color: "#ffffff", fontSize: "0.9rem" }}
        />
      </div>

      {/* SEGMENTED FILTER TABS */}
      <div style={{ display: "flex", background: "#090d16", padding: "4px", borderRadius: "12px", border: "1px solid #1e293b", marginBottom: "1rem" }}>
        <button
          onClick={() => setFilterTab("pending")}
          style={{ flex: 1, padding: "0.6rem 0.25rem", borderRadius: "8px", border: "none", fontWeight: 800, fontSize: "0.85rem", cursor: "pointer", background: filterTab === "pending" ? "#dc2626" : "transparent", color: filterTab === "pending" ? "#ffffff" : "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}
        >
          <span>🚨 ค้างตรวจ</span>
          <span style={{ background: filterTab === "pending" ? "rgba(0,0,0,0.25)" : "#334155", padding: "0.1rem 0.45rem", borderRadius: "10px", fontSize: "0.75rem" }}>
            {stats.missing}
          </span>
        </button>
        <button
          onClick={() => setFilterTab("confirmed")}
          style={{ flex: 1, padding: "0.6rem 0.25rem", borderRadius: "8px", border: "none", fontWeight: 800, fontSize: "0.85rem", cursor: "pointer", background: filterTab === "confirmed" ? "#059669" : "transparent", color: filterTab === "confirmed" ? "#ffffff" : "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}
        >
          <span>🟢 ผ่านแล้ว</span>
          <span style={{ background: filterTab === "confirmed" ? "rgba(0,0,0,0.25)" : "#334155", padding: "0.1rem 0.45rem", borderRadius: "10px", fontSize: "0.75rem" }}>
            {stats.confirmed}
          </span>
        </button>
        <button
          onClick={() => setFilterTab("all")}
          style={{ flex: 1, padding: "0.6rem 0.25rem", borderRadius: "8px", border: "none", fontWeight: 800, fontSize: "0.85rem", cursor: "pointer", background: filterTab === "all" ? "#0284c7" : "transparent", color: filterTab === "all" ? "#ffffff" : "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}
        >
          <span>🌐 ทั้งหมด</span>
          <span style={{ background: filterTab === "all" ? "rgba(0,0,0,0.25)" : "#334155", padding: "0.1rem 0.45rem", borderRadius: "10px", fontSize: "0.75rem" }}>
            {stats.total}
          </span>
        </button>
      </div>

      {/* SLOT CARDS */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {displaySlots.map((slot, index) => {
          const isConfirmed = slot.state === "confirmed";
          const isSpare = Boolean(slot.source && slot.source.includes("สแปร์")) || slot.assignmentType === "spare";
          const isLeave = slot.state === "replacement_required" || (slot.source && slot.source.includes("แจ้งลา"));
          const isLate = !isConfirmed && slot.lateMinutes > 0;
          const isBusy = busySlotId === slot.id;

          const borderColor = isConfirmed
            ? (isSpare ? "#f59e0b" : "#10b981")
            : isLeave
            ? "#ef4444"
            : isLate
            ? "#ef4444"
            : "#334155";

          return (
            <div
              key={slot.id}
              style={{ background: "#131b2e", border: `1.5px solid ${borderColor}`, borderRadius: "14px", padding: "1rem", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}
            >
              {/* CARD HEADER */}
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
                  {isConfirmed ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", background: isSpare ? "#78350f" : "#064e3b", color: isSpare ? "#fde68a" : "#a7f3d0", padding: "0.25rem 0.6rem", borderRadius: "20px", fontSize: "0.72rem", fontWeight: 800, border: isSpare ? "1px solid #b45309" : "1px solid #059669" }}>
                      {isSpare ? "🔄 สแปร์แทน" : "✅ เข้าแล้ว (ประจำ)"}
                    </span>
                  ) : isLeave ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", background: "#7f1d1d", color: "#fecaca", padding: "0.25rem 0.6rem", borderRadius: "20px", fontSize: "0.72rem", fontWeight: 800, border: "1px solid #ef4444" }}>
                      🏥 แจ้งลา (ต้องการสแปร์ด่วน)
                    </span>
                  ) : isLate ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", background: "#7f1d1d", color: "#fecaca", padding: "0.25rem 0.6rem", borderRadius: "20px", fontSize: "0.72rem", fontWeight: 800, border: "1px solid #b91c1c" }}>
                      🚨 สาย {slot.lateMinutes} นาที
                    </span>
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", background: "#1e293b", color: "#94a3b8", padding: "0.25rem 0.6rem", borderRadius: "20px", fontSize: "0.72rem", fontWeight: 700 }}>
                      ⏳ กำหนด {slot.deadline} น.
                    </span>
                  )}
                </div>
              </div>

              {/* GUARD INFO & REPORT DETAILS */}
              <div style={{ background: "#090d16", borderRadius: "8px", padding: "0.6rem 0.75rem", marginBottom: "0.75rem", border: "1px solid #1e293b", fontSize: "0.82rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                  <span style={{ color: "#94a3b8" }}>รปภ. ประจำ:</span>
                  <span style={{ fontWeight: 700, color: "#ffffff" }}>{slot.assignedGuard || "รปภ. ประจำจุด"}</span>
                </div>
                {slot.reportedAt && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#38bdf8", fontWeight: 700 }}>
                    <span>📸 เวลาส่งรายงาน:</span>
                    <span>{slot.reportedAt} น.</span>
                  </div>
                )}
                {slot.source && (
                  <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "0.2rem" }}>
                    ℹ️ บันทึก: {slot.source}
                  </div>
                )}
              </div>

              {/* 1-TAP ACTION BUTTONS */}
              {!isConfirmed && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                  <button
                    onClick={() => handleConfirmRegular(slot)}
                    disabled={isBusy}
                    style={{ background: "#059669", color: "#ffffff", border: "none", borderRadius: "10px", padding: "0.7rem 0.5rem", fontSize: "0.88rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.35rem", boxShadow: "0 2px 8px rgba(5, 150, 105, 0.4)" }}
                  >
                    <span>✅</span> คนประจำเข้า
                  </button>
                  <button
                    onClick={() => setSpareSlot(slot)}
                    disabled={isBusy}
                    style={{ background: "#d97706", color: "#ffffff", border: "none", borderRadius: "10px", padding: "0.7rem 0.5rem", fontSize: "0.88rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.35rem", boxShadow: "0 2px 8px rgba(217, 119, 6, 0.4)" }}
                  >
                    <span>🔄</span> สแปร์มาแทน
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* SPARE MODAL */}
      {spareSlot && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "#131b2e", border: "1.5px solid #d97706", borderRadius: "16px", padding: "1.25rem", maxWidth: "420px", width: "100%", boxShadow: "0 10px 30px rgba(0,0,0,0.5)" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "#f59e0b", margin: "0 0 0.5rem 0" }}>
              🔄 บันทึก รปภ. สแปร์แทนเวร
            </h3>
            <p style={{ fontSize: "0.85rem", color: "#94a3b8", margin: "0 0 1rem 0" }}>
              จุด: <strong>{spareSlot.siteName} ({spareSlot.postName})</strong>
            </p>
            <input
              type="text"
              placeholder="พิมพ์ชื่อ รปภ. สแปร์ (หรือเว้นว่างไว้)..."
              value={spareName}
              onChange={(e) => setSpareName(e.target.value)}
              style={{ width: "100%", background: "#090d16", border: "1px solid #334155", borderRadius: "8px", padding: "0.75rem", color: "#ffffff", fontSize: "0.95rem", marginBottom: "1rem" }}
              autoFocus
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button onClick={() => setSpareSlot(null)} style={{ background: "#334155", color: "#ffffff", border: "none", borderRadius: "8px", padding: "0.6rem 1rem", fontWeight: 700, cursor: "pointer" }}>
                ยกเลิก
              </button>
              <button onClick={() => handleConfirmSpare(spareSlot.id, spareName)} style={{ background: "#d97706", color: "#ffffff", border: "none", borderRadius: "8px", padding: "0.6rem 1.25rem", fontWeight: 800, cursor: "pointer" }}>
                บันทึกสแปร์เข้าเวร
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
