"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import type { DashboardData } from "./page";

type EmployerInquiry = {
  id: string;
  groupId: string;
  siteName: string;
  senderName: string;
  senderKey: string | null;
  messageText: string;
  urgency: "p1_critical" | "p2_service" | "p3_general";
  category: string;
  status: "pending" | "acknowledged" | "dispatched" | "resolved";
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  dispatchedAt: string | null;
  resolvedAt: string | null;
  receivedAt: string;
  slaMinutes?: number;
};

type InquiriesPanelProps = {
  data: DashboardData | null;
  onRefresh: () => void;
};

export function InquiriesPanel({ data, onRefresh }: InquiriesPanelProps) {
  const [inquiries, setInquiries] = useState<EmployerInquiry[]>([]);
  const [stats, setStats] = useState({ total: 0, pendingP1: 0, pendingP2: 0, resolvedToday: 0 });
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [filterUrgency, setFilterUrgency] = useState<"all" | "p1_critical" | "p2_service" | "p3_general">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "acknowledged" | "resolved">("all");
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const prevP1CountRef = useRef(0);

  // Web Audio Synthesizer for alerts (0 quota / 0 external assets)
  const playAlertSound = (urgency: "p1_critical" | "p2_service") => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (urgency === "p1_critical") {
        // High-pitched double beep alarm for critical P1
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = "sawtooth";
        osc1.frequency.setValueAtTime(880, now);
        osc1.frequency.setValueAtTime(1100, now + 0.15);
        gain1.gain.setValueAtTime(0.3, now);
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.35);

        // Second tone
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "sawtooth";
        osc2.frequency.setValueAtTime(1100, now + 0.4);
        osc2.frequency.setValueAtTime(1320, now + 0.55);
        gain2.gain.setValueAtTime(0.3, now + 0.4);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.75);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.4);
        osc2.stop(now + 0.75);
      } else {
        // Gentle soft chime for P2 service
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.2); // A5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.5);
      }
    } catch {
      // Audio context might be restricted before user gesture
    }
  };

  const fetchInquiries = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/inquiries?limit=60");
      if (res.ok) {
        const json = await res.json();
        const newInquiries: EmployerInquiry[] = json.inquiries || [];
        const newStats = json.stats || { total: 0, pendingP1: 0, pendingP2: 0, resolvedToday: 0 };

        // Check if new P1 appeared
        if (newStats.pendingP1 > prevP1CountRef.current && prevP1CountRef.current !== 0) {
          playAlertSound("p1_critical");
        }
        prevP1CountRef.current = newStats.pendingP1;

        setInquiries(newInquiries);
        setStats(newStats);
      }
    } catch {
      if (!silent) setMessage("โหลดข้อความไม่สำเร็จ");
    }
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    fetchInquiries();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchInquiries(true);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [customReplyText, setCustomReplyText] = useState<{ [key: string]: string }>({});

  const handleSendReply = async (inquiryId: string, groupId: string, replyText: string) => {
    if (!replyText.trim()) return;
    setBusyId(inquiryId);
    try {
      const res = await fetch("/api/inquiries/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiryId,
          groupId,
          messageText: replyText,
          actor: "เจ้าหน้าที่ศูนย์สั่งการ",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`ส่งข้อความตอบกลับเข้า LINE เรียบร้อยแล้ว`);
        setActiveReplyId(null);
        setCustomReplyText((prev) => ({ ...prev, [inquiryId]: "" }));
        fetchInquiries(true);
        onRefresh();
      } else {
        alert(`ส่งไม่สำเร็จ: ${data.error || "เกิดข้อผิดพลาด"}`);
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setBusyId(null);
  };

  const handleAction = async (inquiryId: string, action: "acknowledged" | "dispatched" | "resolved") => {
    setBusyId(inquiryId);
    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiryId,
          action,
          actor: "เจ้าหน้าที่ศูนย์สั่งการ",
        }),
      });
      if (res.ok) {
        setMessage(action === "acknowledged" ? "รับเรื่องแล้ว" : action === "dispatched" ? "ส่งสายตรวจเข้าจุดแล้ว" : "ปิดเคสเรียบร้อยแล้ว");
        fetchInquiries(true);
        onRefresh();
      }
    } catch {
      alert("ทำรายการไม่สำเร็จ");
    }
    setBusyId(null);
  };

  const filteredInquiries = useMemo(() => {
    return inquiries.filter((inq) => {
      if (filterUrgency !== "all" && inq.urgency !== filterUrgency) return false;
      if (filterStatus === "pending" && (inq.status === "resolved")) return false;
      if (filterStatus === "acknowledged" && inq.status !== "acknowledged" && inq.status !== "dispatched") return false;
      if (filterStatus === "resolved" && inq.status !== "resolved") return false;
      return true;
    });
  }, [inquiries, filterUrgency, filterStatus]);

  const displayTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" }) + " น.";
    } catch {
      return iso;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* HEADER & LIVE STATS */}
      <div style={{ background: "#0b1220", padding: "1.25rem", borderRadius: "14px", border: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: "#ffffff" }}>
              💬 กล่องข้อความสดนายจ้าง (Employer Sentinel)
            </h2>
            <span style={{ background: "#10b981", color: "#ffffff", padding: "0.15rem 0.5rem", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 800 }}>
              🟢 Live Stream (0 Quota)
            </span>
          </div>
          <p style={{ margin: "0.3rem 0 0 0", color: "#94a3b8", fontSize: "0.85rem" }}>
            ตรวจจับข้อความและเรื่องร้องเรียนจากนายจ้างในกลุ่ม LINE สดแบบ Real-time พร้อมคัดกรองความด่วน P1/P2/P3 ไม่เสียโควต้า LINE
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{
              background: soundEnabled ? "#064e3b" : "#334155",
              color: soundEnabled ? "#a7f3d0" : "#94a3b8",
              border: `1px solid ${soundEnabled ? "#059669" : "#475569"}`,
              padding: "0.55rem 0.85rem",
              borderRadius: "8px",
              fontWeight: 800,
              cursor: "pointer",
              fontSize: "0.82rem",
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            <span>{soundEnabled ? "🔔 เปิดเสียงเตือน" : "🔕 ปิดเสียงเตือน"}</span>
          </button>

          <button
            onClick={() => fetchInquiries()}
            disabled={loading}
            style={{ background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", padding: "0.55rem 0.85rem", borderRadius: "8px", fontWeight: 700, cursor: "pointer", fontSize: "0.82rem" }}
          >
            {loading ? "🔄..." : "🔄 รีเฟรช"}
          </button>
        </div>
      </div>

      {/* KPI TILES */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
        <div style={{ background: stats.pendingP1 > 0 ? "#450a0a" : "#0f172a", border: `1.5px solid ${stats.pendingP1 > 0 ? "#ef4444" : "#1e293b"}`, borderRadius: "12px", padding: "1rem" }}>
          <div style={{ fontSize: "0.8rem", color: stats.pendingP1 > 0 ? "#fca5a5" : "#94a3b8", fontWeight: 700 }}>🔴 ด่วนวิกฤติ (P1) ค้างอยู่</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 900, color: stats.pendingP1 > 0 ? "#ef4444" : "#ffffff", marginTop: "0.2rem" }}>
            {stats.pendingP1} <small style={{ fontSize: "0.85rem", fontWeight: 700 }}>เคส</small>
          </div>
        </div>

        <div style={{ background: "#0f172a", border: "1.5px solid #1e293b", borderRadius: "12px", padding: "1rem" }}>
          <div style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 700 }}>🟡 งานบริการ (P2) ค้างอยู่</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#f59e0b", marginTop: "0.2rem" }}>
            {stats.pendingP2} <small style={{ fontSize: "0.85rem", fontWeight: 700 }}>เคส</small>
          </div>
        </div>

        <div style={{ background: "#0f172a", border: "1.5px solid #1e293b", borderRadius: "12px", padding: "1rem" }}>
          <div style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 700 }}>✅ แก้ปัญหาแล้ววันนี้</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#10b981", marginTop: "0.2rem" }}>
            {stats.resolvedToday} <small style={{ fontSize: "0.85rem", fontWeight: 700 }}>เคส</small>
          </div>
        </div>

        <div style={{ background: "#0f172a", border: "1.5px solid #1e293b", borderRadius: "12px", padding: "1rem" }}>
          <div style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 700 }}>📊 ข้อความทั้งหมดวันนี้</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#38bdf8", marginTop: "0.2rem" }}>
            {stats.total} <small style={{ fontSize: "0.85rem", fontWeight: 700 }}>ข้อความ</small>
          </div>
        </div>
      </div>

      {message && (
        <div style={{ background: "#064e3b", color: "#a7f3d0", border: "1px solid #059669", padding: "0.75rem 1rem", borderRadius: "10px", fontSize: "0.9rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>● {message}</span>
          <button onClick={() => setMessage(null)} style={{ background: "transparent", border: "none", color: "#a7f3d0", cursor: "pointer", fontWeight: 800 }}>✕</button>
        </div>
      )}

      {/* FILTER TABS */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", background: "#0f172a", padding: "0.5rem", borderRadius: "10px", border: "1px solid #1e293b" }}>
        <button
          onClick={() => setFilterUrgency("all")}
          style={{ padding: "0.45rem 0.8rem", borderRadius: "6px", border: "none", fontWeight: 800, fontSize: "0.8rem", cursor: "pointer", background: filterUrgency === "all" ? "#0284c7" : "transparent", color: filterUrgency === "all" ? "#ffffff" : "#94a3b8" }}
        >
          🌐 ทุกระดับ
        </button>
        <button
          onClick={() => setFilterUrgency("p1_critical")}
          style={{ padding: "0.45rem 0.8rem", borderRadius: "6px", border: "none", fontWeight: 800, fontSize: "0.8rem", cursor: "pointer", background: filterUrgency === "p1_critical" ? "#dc2626" : "transparent", color: filterUrgency === "p1_critical" ? "#ffffff" : "#f87171" }}
        >
          🔴 ด่วนวิกฤติ (P1)
        </button>
        <button
          onClick={() => setFilterUrgency("p2_service")}
          style={{ padding: "0.45rem 0.8rem", borderRadius: "6px", border: "none", fontWeight: 800, fontSize: "0.8rem", cursor: "pointer", background: filterUrgency === "p2_service" ? "#d97706" : "transparent", color: filterUrgency === "p2_service" ? "#ffffff" : "#fbbf24" }}
        >
          🟡 งานบริการ (P2)
        </button>
        <button
          onClick={() => setFilterUrgency("p3_general")}
          style={{ padding: "0.45rem 0.8rem", borderRadius: "6px", border: "none", fontWeight: 800, fontSize: "0.8rem", cursor: "pointer", background: filterUrgency === "p3_general" ? "#475569" : "transparent", color: filterUrgency === "p3_general" ? "#ffffff" : "#94a3b8" }}
        >
          ⚪ ทั่วไป (P3)
        </button>

        <div style={{ marginLeft: "auto", display: "flex", gap: "0.4rem" }}>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            style={{ background: "#1e293b", border: "1px solid #334155", color: "#cbd5e1", padding: "0.4rem 0.7rem", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 700 }}
          >
            <option value="all">สถานะ: ทั้งหมด</option>
            <option value="pending">สถานะ: รอสั่งการ/กำลังแก้</option>
            <option value="acknowledged">สถานะ: รับเรื่องแล้ว</option>
            <option value="resolved">สถานะ: ปิดเคสแล้ว</option>
          </select>
        </div>
      </div>

      {/* INQUIRIES STREAM CARDS */}
      {filteredInquiries.length === 0 ? (
        <div style={{ background: "#0b1220", border: "1px dashed #334155", borderRadius: "14px", padding: "3.5rem", textAlign: "center", color: "#64748b" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>💬</div>
          <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#94a3b8" }}>ยังไม่มีข้อความเข้าใหม่</div>
          <p style={{ fontSize: "0.85rem", marginTop: "0.3rem" }}>เมื่อนายจ้างหรือลูกบ้านพิมพ์ข้อความในกลุ่ม LINE ระบบจะดักจับและส่งขึ้นหน้านี้ทันทีแบบ Real-Time</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {filteredInquiries.map((inq) => {
            const isP1 = inq.urgency === "p1_critical";
            const isP2 = inq.urgency === "p2_service";
            const isResolved = inq.status === "resolved";
            const isDispatched = inq.status === "dispatched";
            const isAcknowledged = inq.status === "acknowledged";
            const isPending = inq.status === "pending";

            const borderColor = isResolved ? "#1e293b" : isP1 ? "#ef4444" : isP2 ? "#f59e0b" : "#334155";
            const bgCard = isResolved ? "#0b1220" : isP1 ? "#1c0a0a" : isP2 ? "#17120a" : "#0f172a";

            return (
              <div
                key={inq.id}
                style={{
                  background: bgCard,
                  border: `1.5px solid ${borderColor}`,
                  borderRadius: "14px",
                  padding: "1.1rem",
                  boxShadow: isP1 && !isResolved ? "0 0 15px rgba(239, 68, 68, 0.25)" : "0 2px 8px rgba(0,0,0,0.15)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.65rem",
                  transition: "all 0.2s ease",
                }}
              >
                {/* HEADER ROW */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "1.05rem", fontWeight: 800, color: "#ffffff" }}>
                        🏢 {inq.siteName}
                      </span>
                      {isP1 ? (
                        <span style={{ background: "#7f1d1d", color: "#fecaca", border: "1px solid #dc2626", padding: "0.15rem 0.5rem", borderRadius: "20px", fontSize: "0.72rem", fontWeight: 800 }}>
                          🔴 ด่วนวิกฤติ (P1)
                        </span>
                      ) : isP2 ? (
                        <span style={{ background: "#78350f", color: "#fde68a", border: "1px solid #d97706", padding: "0.15rem 0.5rem", borderRadius: "20px", fontSize: "0.72rem", fontWeight: 800 }}>
                          🟡 งานบริการ (P2)
                        </span>
                      ) : (
                        <span style={{ background: "#1e293b", color: "#94a3b8", padding: "0.15rem 0.5rem", borderRadius: "20px", fontSize: "0.72rem", fontWeight: 700 }}>
                          ⚪ ทั่วไป (P3)
                        </span>
                      )}

                      {/* STATUS BADGE */}
                      {isResolved ? (
                        <span style={{ background: "#064e3b", color: "#a7f3d0", padding: "0.15rem 0.5rem", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 800 }}>
                          ✅ ปิดเคสแล้ว
                        </span>
                      ) : isDispatched ? (
                        <span style={{ background: "#1e3a8a", color: "#bfdbfe", padding: "0.15rem 0.5rem", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 800 }}>
                          🚗 ส่งสายตรวจเข้าจุดแล้ว
                        </span>
                      ) : isAcknowledged ? (
                        <span style={{ background: "#312e81", color: "#c7d2fe", padding: "0.15rem 0.5rem", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 800 }}>
                          👁️ รับเรื่องแล้ว
                        </span>
                      ) : (
                        <span style={{ background: "#881337", color: "#fecdd3", padding: "0.15rem 0.5rem", borderRadius: "12px", fontSize: "0.72rem", fontWeight: 800 }}>
                          ⏳ รอสั่งการ
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.25rem", display: "flex", gap: "0.5rem" }}>
                      <span>👤 ผู้ส่ง: <strong style={{ color: "#e2e8f0" }}>{inq.senderName}</strong></span>
                      <span>•</span>
                      <span>⏰ {displayTime(inq.receivedAt)}</span>
                    </div>
                  </div>

                  {/* SLA TIMER */}
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 800, color: (inq.slaMinutes ?? 0) > 15 && !isResolved ? "#f87171" : "#94a3b8" }}>
                      ⏱️ ผ่านไป {inq.slaMinutes ?? 0} นาที
                    </span>
                  </div>
                </div>

                {/* MESSAGE BODY */}
                <div style={{ background: "rgba(0,0,0,0.3)", padding: "0.85rem 1rem", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.06)", fontSize: "0.95rem", color: "#f8fafc", lineHeight: "1.45" }}>
                  "{inq.messageText}"
                </div>

                {/* SMART QUICK-REPLY PRESETS & WEB-TO-LINE CHAT */}
                <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: "0.6rem 0.8rem", borderRadius: "10px", border: "1px solid rgba(56, 189, 248, 0.15)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 800, color: "#38bdf8", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                      <span>⚡</span>
                      <span>Smart Quick-Reply ตอบกลับนายจ้างทันที (เข้ากลุ่ม LINE):</span>
                    </div>
                    <button
                      onClick={() => setActiveReplyId(activeReplyId === inq.id ? null : inq.id)}
                      style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "0.72rem", cursor: "pointer", textDecoration: "underline" }}
                    >
                      {activeReplyId === inq.id ? "▲ ซ่อนช่องพิมพ์" : "💬 พิมพ์ข้อความเอง..."}
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                    <button
                      onClick={() => handleSendReply(inq.id, inq.groupId, "รับทราบครับ ประสานงานเจ้าหน้าที่ รปภ. ประจำจุดตรวจสอบให้ทันทีครับ")}
                      disabled={busyId === inq.id}
                      style={{ background: "#0c4a6e", color: "#bae6fd", border: "1px solid #0284c7", padding: "0.28rem 0.6rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}
                    >
                      📦 รับทราบ ประสานงาน รปภ. ตรวจสอบทันที
                    </button>
                    <button
                      onClick={() => handleSendReply(inq.id, inq.groupId, "รับทราบครับ กำลังส่งเจ้าหน้าที่เข้าอำนวยความสะดวกและดูแลพื้นที่ครับ")}
                      disabled={busyId === inq.id}
                      style={{ background: "#1e1b4b", color: "#c7d2fe", border: "1px solid #4f46e5", padding: "0.28rem 0.6rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}
                    >
                      🚗 รับทราบ กำลังส่งเจ้าหน้าที่เข้าดูแล
                    </button>
                    <button
                      onClick={() => handleSendReply(inq.id, inq.groupId, "รับทราบครับ ได้แจ้ง รปภ. หน้าป้อมอำนวยความสะดวกและแลกบัตรเรียบร้อยครับ")}
                      disabled={busyId === inq.id}
                      style={{ background: "#064e3b", color: "#a7f3d0", border: "1px solid #059669", padding: "0.28rem 0.6rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}
                    >
                      🛠️ รับทราบ แจ้ง รปภ. อำนวยความสะดวกแล้ว
                    </button>
                    <button
                      onClick={() => handleSendReply(inq.id, inq.groupId, "รับทราบข้อความเรียบร้อยครับ ขอบคุณที่แจ้งข้อมูลให้ศูนย์สั่งการทราบครับผม")}
                      disabled={busyId === inq.id}
                      style={{ background: "#334155", color: "#f1f5f9", border: "1px solid #475569", padding: "0.28rem 0.6rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}
                    >
                      💬 รับทราบ ขอบคุณที่แจ้งข้อมูลครับ
                    </button>
                  </div>

                  {/* EXPANDABLE CUSTOM CHAT BOX */}
                  {activeReplyId === inq.id && (
                    <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.3rem" }}>
                      <input
                        type="text"
                        placeholder="พิมพ์ข้อความที่ต้องการส่งเข้ากลุ่ม LINE นี้โดยตรง..."
                        value={customReplyText[inq.id] || ""}
                        onChange={(e) => setCustomReplyText({ ...customReplyText, [inq.id]: e.target.value })}
                        style={{ flex: 1, background: "#1e293b", border: "1px solid #0284c7", color: "#ffffff", padding: "0.4rem 0.75rem", borderRadius: "6px", fontSize: "0.82rem" }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleSendReply(inq.id, inq.groupId, customReplyText[inq.id] || "");
                          }
                        }}
                      />
                      <button
                        onClick={() => handleSendReply(inq.id, inq.groupId, customReplyText[inq.id] || "")}
                        disabled={busyId === inq.id || !(customReplyText[inq.id] || "").trim()}
                        style={{ background: "linear-gradient(135deg, #0284c7, #0369a1)", color: "#ffffff", border: "none", padding: "0.4rem 0.9rem", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 800, cursor: "pointer" }}
                      >
                        📤 ส่งเข้า LINE
                      </button>
                    </div>
                  )}
                </div>

                {/* ACTION BAR */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "0.6rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                    {inq.acknowledgedBy && <span>ผู้ดูแล: <strong style={{ color: "#38bdf8" }}>{inq.acknowledgedBy}</strong></span>}
                  </div>

                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                    {/* QUICK ROLE CLASSIFICATION BUTTONS */}
                    <button
                      onClick={async () => {
                        const sKey = inq.senderKey || inq.id;
                        await fetch("/api/guards", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            id: sKey,
                            guardName: inq.senderName,
                            displayName: inq.senderName,
                            role: "regular",
                            siteId: inq.groupId,
                          }),
                        });
                        setMessage(`✅ ยืนยัน "${inq.senderName}" เป็น รปภ. ประจำจุด เรียบร้อยแล้ว`);
                      }}
                      style={{ background: "#064e3b", color: "#a7f3d0", border: "1px solid #059669", padding: "0.35rem 0.65rem", borderRadius: "6px", fontSize: "0.74rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.25rem" }}
                      title="ยืนยันผู้ส่งคนนี้เป็น รปภ. เพื่อเปิดระบบบอทตรวจเวร"
                    >
                      <span>👮‍♂️</span>
                      <span>ยืนยันเป็น รปภ.</span>
                    </button>
                    <button
                      onClick={async () => {
                        const sKey = inq.senderKey || inq.id;
                        await fetch("/api/guards", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            id: sKey,
                            guardName: inq.senderName,
                            displayName: inq.senderName,
                            role: "employer",
                            siteId: inq.groupId,
                          }),
                        });
                        setMessage(`👔 ตั้ง "${inq.senderName}" เป็นนายจ้าง (งดตอบสติกเกอร์ 100%) เรียบร้อยแล้ว`);
                      }}
                      style={{ background: "#4c0519", color: "#fecdd3", border: "1px solid #e11d48", padding: "0.35rem 0.65rem", borderRadius: "6px", fontSize: "0.74rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.25rem" }}
                      title="ตั้งเป็นนายจ้าง บอทจะงดส่งสติกเกอร์ 100%"
                    >
                      <span>👔</span>
                      <span>ตั้งเป็นนายจ้าง</span>
                    </button>

                    {isPending && (
                      <button
                        onClick={() => handleAction(inq.id, "acknowledged")}
                        disabled={busyId === inq.id}
                        style={{ background: "#0284c7", color: "#ffffff", border: "none", padding: "0.35rem 0.75rem", borderRadius: "6px", fontSize: "0.76rem", fontWeight: 800, cursor: "pointer" }}
                      >
                        👁️ รับเรื่อง
                      </button>
                    )}

                    {!isDispatched && !isResolved && (
                      <button
                        onClick={() => handleAction(inq.id, "dispatched")}
                        disabled={busyId === inq.id}
                        style={{ background: "#4f46e5", color: "#ffffff", border: "none", padding: "0.35rem 0.75rem", borderRadius: "6px", fontSize: "0.76rem", fontWeight: 800, cursor: "pointer" }}
                      >
                        🚗 ส่งสายตรวจเข้าจุด
                      </button>
                    )}

                    {!isResolved && (
                      <button
                        onClick={() => handleAction(inq.id, "resolved")}
                        disabled={busyId === inq.id}
                        style={{ background: "#10b981", color: "#ffffff", border: "none", padding: "0.35rem 0.75rem", borderRadius: "6px", fontSize: "0.76rem", fontWeight: 800, cursor: "pointer" }}
                      >
                        ✅ ปิดเคส
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
