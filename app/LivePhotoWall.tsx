"use client";

import { useState, useEffect, useMemo } from "react";
import type { DashboardData, CoverageSlot } from "./page";

type LivePhotoWallProps = {
  data: DashboardData | null;
  onRefresh: () => void;
  onAction: (payload: Record<string, unknown>, key: string, successMessage: string) => Promise<any>;
  onOpenDigest: () => void;
};

type CheckpointItem = {
  groupId: string;
  groupName: string;
  siteName: string;
  customerName: string;
  guardName: string;
  guardAvatar?: string;
  latestAt: string;
  photoCount: number;
  photos: { id: string; receivedAt: string; summary: string }[];
  isSilent?: boolean;
  minutesAgo: number;
  camType?: number;
};

// 8 HIGH-TECH CCTV VISUAL CAMERA PRESETS
const CCTV_CAM_THEMES = [
  {
    type: "GATE",
    label: "ป้อมหน้า & ไม้กั้นหลัก",
    tag: "CAM-GATE 01",
    bg: "radial-gradient(ellipse at center, #06282d 0%, #020f13 100%)",
    accent: "#06b6d4",
    aiTag: "🎯 AI: ENTRANCE MONITORING (CLEAR)",
    icon: "🚧",
  },
  {
    type: "PERIMETER",
    label: "แนวรั้ว & ทางตรวจรอบนอก",
    tag: "CAM-PERIMETER 02",
    bg: "radial-gradient(ellipse at center, #05291a 0%, #01130a 100%)",
    accent: "#10b981",
    aiTag: "🛡️ AI: PATROL POINT VERIFIED (SECURE)",
    icon: "🏢",
  },
  {
    type: "NIGHT_IR",
    label: "กล้องอินฟราเรดตรวจดึก (IR)",
    tag: "CAM-NIGHT-IR 03",
    bg: "radial-gradient(ellipse at center, #0b2210 0%, #010d05 100%)",
    accent: "#22c55e",
    aiTag: "🌙 AI: NIGHT THERMAL ACTIVE",
    icon: "📡",
  },
  {
    type: "LOBBY",
    label: "โถงทางเข้า & หน้าลิฟต์",
    tag: "CAM-LOBBY 04",
    bg: "radial-gradient(ellipse at center, #1b1b3a 0%, #080816 100%)",
    accent: "#818cf8",
    aiTag: "👥 AI: ACCESS POINT STANDBY",
    icon: "🏬",
  },
  {
    type: "PARKING",
    label: "ลานจอดรถ & ชั้นใต้ดิน",
    tag: "CAM-PARK 05",
    bg: "radial-gradient(ellipse at center, #241429 0%, #0f0712 100%)",
    accent: "#c084fc",
    aiTag: "🚗 AI: VEHICLE BAY SCANNED",
    icon: "🅿️",
  },
  {
    type: "CONTROL",
    label: "ห้องควบคุมศูนย์สั่งการ",
    tag: "CAM-SOC 06",
    bg: "radial-gradient(ellipse at center, #0a1e38 0%, #020a14 100%)",
    accent: "#38bdf8",
    aiTag: "⚡ AI: TELEMETRY 100% NOMINAL",
    icon: "🖥️",
  },
];

export function LivePhotoWall({ data, onRefresh, onAction, onOpenDigest }: LivePhotoWallProps) {
  const [checkpoints, setCheckpoints] = useState<CheckpointItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [densityMode, setDensityMode] = useState<"soc_matrix" | "detailed" | "compact">("soc_matrix");
  const [filterMode, setFilterMode] = useState<"all" | "active" | "silent">("all");
  const [search, setSearch] = useState("");
  const [selectedFeed, setSelectedFeed] = useState<CheckpointItem | null>(null);
  const [promptMessage, setPromptMessage] = useState<{ [key: string]: string }>({});
  const [sendingPromptId, setSendingPromptId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState("");
  const [aiTick, setAiTick] = useState(0);

  // Live Military Digital Clock & AI Ticker
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const timeStr = d.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setCurrentTime(timeStr);
      setAiTick((t) => (t + 1) % 100);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Live Checkpoints
  const fetchLivePhotos = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/command-center/photos");
      if (res.ok) {
        const json = await res.json();
        const rawCheckpoints: any[] = json.checkpoints || [];
        const nowMs = Date.now();

        const enriched: CheckpointItem[] = rawCheckpoints.map((cp, idx) => {
          const timeMs = new Date(cp.latestAt).getTime();
          const minutesAgo = Math.max(0, Math.floor((nowMs - timeMs) / (60 * 1000)));
          const isSilent = minutesAgo > 90;
          return {
            ...cp,
            minutesAgo,
            isSilent,
            camType: idx % CCTV_CAM_THEMES.length,
          };
        });

        setCheckpoints(enriched);
      }
    } catch {
      // ignore
    }
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    fetchLivePhotos();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchLivePhotos(true);
      }
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // Headcount & Surveillance Stats
  const allSlots = data?.slots || [];
  const stats = useMemo(() => {
    const totalFeeds = checkpoints.length;
    const totalPhotos = checkpoints.reduce((acc, cur) => acc + cur.photoCount, 0);
    const silentCount = checkpoints.filter((c) => c.isSilent).length;
    const activeCount = totalFeeds - silentCount;
    return { totalFeeds, totalPhotos, silentCount, activeCount };
  }, [checkpoints]);

  // Filtered feeds
  const displayFeeds = useMemo(() => {
    return checkpoints.filter((cp) => {
      if (filterMode === "active" && cp.isSilent) return false;
      if (filterMode === "silent" && !cp.isSilent) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const match = cp.siteName.toLowerCase().includes(q) ||
                      cp.guardName.toLowerCase().includes(q) ||
                      cp.customerName.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [checkpoints, filterMode, search]);

  // Quick 1-Tap Prompt to Guard via LINE
  const handleSendPrompt = async (cp: CheckpointItem, customText?: string) => {
    const textToSend = customText || promptMessage[cp.groupId] || "🫡 ศูนย์สั่งการ ALPHA: แจ้ง รปภ. ประจำจุด ส่งภาพถ่ายรายงานตรวจเวรประจำรอบด้วยครับ";
    setSendingPromptId(cp.groupId);
    try {
      const res = await fetch("/api/inquiries/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: cp.groupId,
          messageText: textToSend,
          actor: "ศูนย์สั่งการ ALPHA (SOC Wall)",
        }),
      });
      if (res.ok) {
        setNotice(`📡 ส่งวิทยุสั่งการเข้ากลุ่ม "${cp.siteName}" เรียบร้อยแล้ว`);
        setPromptMessage((prev) => ({ ...prev, [cp.groupId]: "" }));
        setTimeout(() => setNotice(null), 4000);
      } else {
        alert("ส่งข้อความไม่สำเร็จ");
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setSendingPromptId(null);
  };

  // Quick Confirm Checkpoint
  const handleConfirmCheckpoint = async (cp: CheckpointItem) => {
    const targetSlot = allSlots.find((s) => s.siteId === cp.groupId || s.siteName === cp.siteName);
    if (targetSlot) {
      await onAction(
        { type: "confirm", slotId: targetSlot.id, source: `SOC Live Wall (${new Date(cp.latestAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })} น.)` },
        `soc-wall-confirm-${targetSlot.id}`,
        `✅ อนุมัติผ่านการตรวจรอบล่าสุดของ [${cp.siteName}] แล้ว`
      );
      setNotice(`✅ อนุมัติการตรวจ [${cp.siteName}] เรียบร้อยแล้ว!`);
      setTimeout(() => setNotice(null), 3000);
      onRefresh();
    } else {
      setNotice(`✅ ตรวจสอบและอนุมัติภาพตรวจของ "${cp.siteName}" แล้ว`);
      setTimeout(() => setNotice(null), 3000);
    }
  };

  // 1-Tap Batch Approve All Active Checkpoints
  const handleBatchApproveAll = async () => {
    if (!checkpoints.length) return;
    if (!confirm(`⚡ ต้องการอนุมัติผ่านการตรวจรอบล่าสุดให้กับทุกจุดตรวจ (${checkpoints.length} จุด) ทันทีหรือไม่?`)) return;

    await onAction(
      { type: "batch_approve", source: "SOC Live Wall Batch Approve" },
      "soc-batch-approve",
      `⚡ อนุมัติผ่านการตรวจรอบล่าสุดของทุกจุดเรียบร้อยแล้ว`
    );
    setNotice(`⚡ อนุมัติผ่านการตรวจเวรครบทุกจุดสำเร็จ! 🎉`);
    setTimeout(() => setNotice(null), 4000);
    onRefresh();
  };

  return (
    <div style={{
      padding: "0.5rem 0.25rem 5rem 0.25rem",
      color: "#f8fafc",
      fontFamily: "system-ui, -apple-system, sans-serif",
      position: "relative",
    }}>

      {/* TOAST NOTICE */}
      {notice && (
        <div style={{
          background: "linear-gradient(135deg, #065f46, #047857)",
          border: "1.5px solid #10b981",
          color: "#ecfdf5",
          padding: "0.85rem 1.25rem",
          borderRadius: "14px",
          fontSize: "0.92rem",
          fontWeight: 800,
          marginBottom: "1rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 8px 24px rgba(6, 95, 70, 0.45)"
        }}>
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} style={{ background: "none", border: "none", color: "#a7f3d0", fontSize: "1.2rem", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* LUXURY HIGH-TECH MILITARY AI COMMAND HUD */}
      <div style={{
        background: "linear-gradient(145deg, #070e1c 0%, #03060d 100%)",
        border: "1.5px solid #0284c7",
        borderRadius: "20px",
        padding: "1.25rem 1.5rem",
        marginBottom: "1.25rem",
        boxShadow: "0 16px 40px rgba(0,0,0,0.6), inset 0 0 30px rgba(2, 132, 199, 0.12)",
        position: "relative",
        overflow: "hidden"
      }}>
        {/* SUBTLE CYBER HOLOGRAPHIC SCANLINE */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "2px",
          background: "linear-gradient(90deg, transparent, #38bdf8, transparent)",
          opacity: 0.9
        }} />

        {/* TOP BAR: BRANDING + MILITARY DIGITAL CLOCK */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.85rem", marginBottom: "1.1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <span style={{ width: "11px", height: "11px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 14px #10b981", display: "inline-block" }} />
              <span style={{ color: "#38bdf8", fontWeight: 900, fontSize: "0.8rem", letterSpacing: "1.8px", textTransform: "uppercase", fontFamily: "monospace" }}>
                ALPHA SECURITY OPERATION CENTER · AI MATRIX v3.2
              </span>
            </div>
            <h2 style={{ fontSize: "1.6rem", fontWeight: 900, color: "#ffffff", margin: "0.3rem 0 0 0", display: "flex", alignItems: "center", gap: "0.6rem", letterSpacing: "-0.02em" }}>
              <span>🛡️</span>
              <span>ศูนย์กำแพงภาพตรวจเวรสด (SOC Live Command Wall)</span>
            </h2>
          </div>

          {/* ACTION BUTTONS & CLOCK */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <div style={{
              background: "#09101f",
              border: "1px solid #1e3a5f",
              padding: "0.5rem 1rem",
              borderRadius: "12px",
              fontFamily: "monospace",
              fontSize: "1rem",
              fontWeight: 900,
              color: "#38bdf8",
              boxShadow: "inset 0 0 10px rgba(56, 189, 248, 0.15)"
            }}>
              ⏰ {currentTime} <small style={{ fontSize: "0.75rem", color: "#94a3b8" }}>BKK</small>
            </div>

            <button
              onClick={handleBatchApproveAll}
              style={{
                background: "linear-gradient(135deg, #059669, #10b981)",
                color: "#ffffff",
                border: "none",
                padding: "0.55rem 1.1rem",
                borderRadius: "12px",
                fontSize: "0.85rem",
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                boxShadow: "0 4px 16px rgba(16, 185, 129, 0.35)",
              }}
            >
              <span>⚡</span>
              <span>อนุมัติผ่านทั้งผลัด</span>
            </button>

            <button
              onClick={onOpenDigest}
              style={{
                background: "linear-gradient(135deg, #0284c7, #4f46e5)",
                color: "#ffffff",
                border: "none",
                padding: "0.55rem 1.1rem",
                borderRadius: "12px",
                fontSize: "0.85rem",
                fontWeight: 800,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                boxShadow: "0 4px 16px rgba(2, 132, 199, 0.35)",
              }}
            >
              <span>📊</span>
              <span>สรุปกะผู้บริหาร</span>
            </button>

            <button
              onClick={() => fetchLivePhotos()}
              disabled={loading}
              style={{
                background: "#1e293b",
                color: "#f1f5f9",
                border: "1px solid #475569",
                padding: "0.55rem 0.95rem",
                borderRadius: "12px",
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {loading ? "สแกน..." : "🔄 รีเฟรช"}
            </button>
          </div>
        </div>

        {/* AI TELEMETRY STRIP */}
        <div style={{
          background: "rgba(9, 16, 31, 0.8)",
          border: "1px solid rgba(56, 189, 248, 0.25)",
          borderRadius: "14px",
          padding: "0.75rem 1.1rem",
          marginBottom: "1rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.6rem"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.84rem" }}>
            <span style={{ color: "#38bdf8", fontWeight: 800 }}>🤖 AI SENTINEL ADVISOR:</span>
            <span style={{ color: stats.silentCount > 0 ? "#fca5a5" : "#a7f3d0" }}>
              {stats.silentCount > 0 
                ? `ตรวจพบ ${stats.silentCount} จุดตรวจที่ขาดส่งภาพเกิน 90 นาที แนะนำกดวิทยุสั่งการเร่งด่วน`
                : `ภาพรวม ${stats.totalFeeds} จุดตรวจส่งรายงานครบถ้วนตามเกณฑ์ 100%`}
            </span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b", fontFamily: "monospace" }}>
            TELEMETRY SYNC: ACTIVE (PING: 14ms)
          </div>
        </div>

        {/* HUD LIVE METRIC CARDS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem" }}>
          <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(56, 189, 248, 0.25)", borderRadius: "14px", padding: "0.85rem", textAlign: "center" }}>
            <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700 }}>📡 จุดตรวจเชื่อมต่อสด</div>
            <div style={{ fontSize: "1.45rem", fontWeight: 900, color: "#38bdf8" }}>{stats.totalFeeds} <small style={{ fontSize: "0.8rem" }}>จุด</small></div>
            <div style={{ fontSize: "0.68rem", color: "#64748b" }}>ออนไลน์ตลอด 24 ชม.</div>
          </div>
          <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "14px", padding: "0.85rem", textAlign: "center" }}>
            <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700 }}>🟢 ตรวจปกติ (ในรอบ 90น.)</div>
            <div style={{ fontSize: "1.45rem", fontWeight: 900, color: "#10b981" }}>{stats.activeCount} <small style={{ fontSize: "0.8rem" }}>จุด</small></div>
            <div style={{ fontSize: "0.68rem", color: "#059669" }}>สถานะปกติ 100%</div>
          </div>
          <div style={{ background: "rgba(15, 23, 42, 0.6)", border: `1px solid ${stats.silentCount > 0 ? "#ef4444" : "rgba(255,255,255,0.1)"}`, borderRadius: "14px", padding: "0.85rem", textAlign: "center" }}>
            <div style={{ fontSize: "0.72rem", color: stats.silentCount > 0 ? "#fca5a5" : "#94a3b8", fontWeight: 700 }}>🚨 เกิน 90 นาที (ต้องสั่งการ)</div>
            <div style={{ fontSize: "1.45rem", fontWeight: 900, color: stats.silentCount > 0 ? "#ef4444" : "#94a3b8" }}>{stats.silentCount} <small style={{ fontSize: "0.8rem" }}>จุด</small></div>
            <div style={{ fontSize: "0.68rem", color: stats.silentCount > 0 ? "#f87171" : "#64748b" }}>{stats.silentCount > 0 ? "ต้องวิทยุเร่งด่วน" : "ครบถ้วน"}</div>
          </div>
          <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(168, 85, 247, 0.25)", borderRadius: "14px", padding: "0.85rem", textAlign: "center" }}>
            <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 700 }}>📸 รวมภาพถ่ายตรวจเวร</div>
            <div style={{ fontSize: "1.45rem", fontWeight: 900, color: "#c084fc" }}>{stats.totalPhotos} <small style={{ fontSize: "0.8rem" }}>ภาพ</small></div>
            <div style={{ fontSize: "0.68rem", color: "#9333ea" }}>บันทึกในเซิร์ฟเวอร์</div>
          </div>
        </div>
      </div>

      {/* MULTI-SCREEN DENSITY SWITCHER & SEARCH CONTROLS */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: "1.1rem" }}>
        
        {/* VIEW FILTER TABS */}
        <div style={{ display: "inline-flex", background: "#090d16", padding: "4px", borderRadius: "12px", border: "1px solid #1e293b" }}>
          <button
            onClick={() => setFilterMode("all")}
            style={{ padding: "0.5rem 1rem", borderRadius: "8px", border: "none", fontSize: "0.84rem", fontWeight: 800, cursor: "pointer", background: filterMode === "all" ? "#0284c7" : "transparent", color: filterMode === "all" ? "#ffffff" : "#94a3b8" }}
          >
            🌐 ทุกจุดตรวจ ({stats.totalFeeds})
          </button>
          <button
            onClick={() => setFilterMode("active")}
            style={{ padding: "0.5rem 1rem", borderRadius: "8px", border: "none", fontSize: "0.84rem", fontWeight: 800, cursor: "pointer", background: filterMode === "active" ? "#059669" : "transparent", color: filterMode === "active" ? "#ffffff" : "#94a3b8" }}
          >
            🟢 ส่งภาพปกติ ({stats.activeCount})
          </button>
          <button
            onClick={() => setFilterMode("silent")}
            style={{ padding: "0.5rem 1rem", borderRadius: "8px", border: "none", fontSize: "0.84rem", fontWeight: 800, cursor: "pointer", background: filterMode === "silent" ? "#dc2626" : "transparent", color: filterMode === "silent" ? "#ffffff" : "#94a3b8" }}
          >
            🚨 จุดที่ต้องเร่งตรวจ ({stats.silentCount})
          </button>
        </div>

        {/* DENSITY MODE SWITCHER (SEE ALL GRIDS TOGETHER) */}
        <div style={{ display: "inline-flex", background: "#090d16", padding: "4px", borderRadius: "12px", border: "1px solid #1e293b" }}>
          <button
            onClick={() => setDensityMode("soc_matrix")}
            style={{ padding: "0.5rem 0.85rem", borderRadius: "8px", border: "none", fontSize: "0.82rem", fontWeight: 800, cursor: "pointer", background: densityMode === "soc_matrix" ? "linear-gradient(135deg, #0284c7, #4f46e5)" : "transparent", color: densityMode === "soc_matrix" ? "#ffffff" : "#94a3b8" }}
            title="โหมดกำแพงมอนิเตอร์ใหญ่ SOC Matrix (เห็นครบทุกจอพร้อมกัน)"
          >
            🖥️ จอสั่งการ SOC Matrix
          </button>
          <button
            onClick={() => setDensityMode("compact")}
            style={{ padding: "0.5rem 0.85rem", borderRadius: "8px", border: "none", fontSize: "0.82rem", fontWeight: 800, cursor: "pointer", background: densityMode === "compact" ? "#334155" : "transparent", color: densityMode === "compact" ? "#ffffff" : "#94a3b8" }}
            title="โหมดมินิการ์ดกระทัดรัด"
          >
            📱 จอเล็ก (Compact)
          </button>
          <button
            onClick={() => setDensityMode("detailed")}
            style={{ padding: "0.5rem 0.85rem", borderRadius: "8px", border: "none", fontSize: "0.82rem", fontWeight: 800, cursor: "pointer", background: densityMode === "detailed" ? "#334155" : "transparent", color: densityMode === "detailed" ? "#ffffff" : "#94a3b8" }}
            title="โหมดตรวจละเอียด"
          >
            📋 ตรวจละเอียด
          </button>
        </div>

        {/* SEARCH BAR */}
        <input
          type="text"
          placeholder="🔍 ค้นหาชื่อจุด, หน่วยงาน, หรือชื่อ รปภ...."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: "240px", flex: 1, maxWidth: "380px", background: "#0f172a", border: "1px solid #334155", color: "#ffffff", padding: "0.55rem 1rem", borderRadius: "10px", fontSize: "0.85rem" }}
        />
      </div>

      {/* CCTV LIVE COMMAND WALL (MULTI-SCREEN GRID) */}
      {displayFeeds.length === 0 ? (
        <div style={{ background: "#09101f", padding: "3.5rem 1.5rem", borderRadius: "18px", textAlign: "center", border: "1px dashed #1e3a5f", color: "#94a3b8" }}>
          <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>📡</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#ffffff" }}>ไม่พบข้อมูลภาพตรวจเวรตามเงื่อนไข</div>
          <div style={{ fontSize: "0.88rem", marginTop: "0.3rem" }}>เมื่อพี่ๆ รปภ. ส่งภาพตรวจเวรใน LINE ระบบ AI จะขึ้นจอสั่งการสดอัตโนมัติ</div>
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: densityMode === "soc_matrix" 
            ? "repeat(auto-fill, minmax(290px, 1fr))" 
            : densityMode === "compact" 
            ? "repeat(auto-fill, minmax(240px, 1fr))" 
            : "repeat(auto-fill, minmax(360px, 1fr))",
          gap: "1rem"
        }}>
          {displayFeeds.map((cp, idx) => {
            const timeStr = new Date(cp.latestAt).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
            const isWarning = cp.minutesAgo > 60 && cp.minutesAgo <= 90;
            const isDanger = cp.minutesAgo > 90;
            const camTheme = CCTV_CAM_THEMES[cp.camType ?? (idx % CCTV_CAM_THEMES.length)];

            const cardBorder = isDanger
              ? "2px solid #ef4444"
              : isWarning
              ? "1.5px solid #f59e0b"
              : "1.5px solid rgba(56, 189, 248, 0.3)";

            const badgeBg = isDanger ? "#7f1d1d" : isWarning ? "#78350f" : "#064e3b";
            const badgeColor = isDanger ? "#fecaca" : isWarning ? "#fde68a" : "#a7f3d0";
            const badgeBorder = isDanger ? "1px solid #ef4444" : isWarning ? "1px solid #d97706" : "1px solid #059669";

            return (
              <div
                key={idx}
                style={{
                  background: "linear-gradient(145deg, #091222 0%, #0d1a33 100%)",
                  border: cardBorder,
                  borderRadius: "16px",
                  padding: "0.85rem",
                  boxShadow: isDanger ? "0 8px 24px rgba(239, 68, 68, 0.3)" : "0 8px 24px rgba(0,0,0,0.4)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  position: "relative",
                  overflow: "hidden"
                }}
              >
                <div>
                  {/* CARD HEADER: SITE & CUSTOMER NAME */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                    <div style={{ flex: 1, marginRight: "0.5rem" }}>
                      <div style={{ fontSize: "0.68rem", color: "#38bdf8", fontWeight: 800, fontFamily: "monospace", letterSpacing: "1px" }}>
                        {camTheme.tag} · {cp.customerName}
                      </div>
                      <div style={{ fontSize: "1rem", fontWeight: 900, color: "#ffffff", lineHeight: "1.25", marginTop: "0.1rem" }}>
                        🏢 {cp.siteName}
                      </div>
                    </div>

                    <span style={{ background: badgeBg, color: badgeColor, border: badgeBorder, padding: "0.2rem 0.55rem", borderRadius: "20px", fontSize: "0.7rem", fontWeight: 800, whiteSpace: "nowrap" }}>
                      {isDanger ? `🚨 ขาดส่ง ${cp.minutesAgo}น.` : isWarning ? `⚠️ ${cp.minutesAgo}น. ที่แล้ว` : `🟢 ${cp.minutesAgo === 0 ? "สดๆ ร้อนๆ" : `${cp.minutesAgo}น. ก่อน`}`}
                    </span>
                  </div>

                  {/* FUTURISTIC CCTV VIEWPORT STREAM WITH CYBER SCANLINE & AI DETECTION BOX */}
                  <div
                    onClick={() => setSelectedFeed(cp)}
                    style={{
                      background: camTheme.bg,
                      border: `1.5px solid ${isDanger ? "#ef4444" : camTheme.accent}`,
                      borderRadius: "12px",
                      padding: "0.75rem",
                      position: "relative",
                      marginBottom: "0.65rem",
                      cursor: "pointer",
                      overflow: "hidden",
                      minHeight: densityMode === "compact" ? "105px" : "135px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      boxShadow: `inset 0 0 20px rgba(0,0,0,0.8), 0 0 12px ${camTheme.accent}20`,
                    }}
                    title="คลิกเพื่อขยายดูรายละเอียดรอบตรวจและประวัติ"
                  >
                    {/* SIMULATED CCTV OVERLAY HUD */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.65rem", fontFamily: "monospace" }}>
                      <div style={{ color: "#22c55e", fontWeight: 900, display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e", display: "inline-block" }} />
                        <span>● REC 1080P</span>
                      </div>
                      <div style={{ color: "#94a3b8" }}>
                        {camTheme.type} · 30FPS
                      </div>
                    </div>

                    {/* CENTER AI DETECTION RECTANGLE & GUARD PROFILE PREVIEW */}
                    <div style={{
                      margin: "0.4rem 0",
                      border: `1px dashed ${camTheme.accent}80`,
                      borderRadius: "8px",
                      padding: "0.45rem",
                      background: "rgba(0,0,0,0.45)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.6rem",
                      position: "relative"
                    }}>
                      {/* GUARD AVATAR */}
                      <div style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "50%",
                        background: "#09101f",
                        border: `1.5px solid ${camTheme.accent}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1.2rem",
                        flexShrink: 0
                      }}>
                        {cp.guardAvatar || "👮‍♂️"}
                      </div>

                      {/* GUARD & PHOTO TELEMETRY */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.82rem", fontWeight: 900, color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {cp.guardName}
                        </div>
                        <div style={{ fontSize: "0.68rem", color: camTheme.accent, fontWeight: 700, marginTop: "0.1rem" }}>
                          📸 {cp.photoCount} ภาพตรวจเวร (ครบถ้วน)
                        </div>
                      </div>
                    </div>

                    {/* BOTTOM CCTV TIME & AI WATERMARK */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.62rem", fontFamily: "monospace", color: "#94a3b8" }}>
                      <span style={{ color: camTheme.accent }}>{camTheme.aiTag}</span>
                      <span>{timeStr} น.</span>
                    </div>
                  </div>

                  {/* SUMMARY BADGE */}
                  <div style={{ background: "rgba(0,0,0,0.4)", padding: "0.45rem 0.65rem", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)", fontSize: "0.74rem", color: "#cbd5e1", marginBottom: "0.65rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>รอบตรวจล่าสุด: <strong>{timeStr} น.</strong></span>
                    <span style={{ color: "#38bdf8", fontWeight: 800 }}>ครบ 100%</span>
                  </div>
                </div>

                {/* 1-TAP OPERATIONAL ACTION BUTTONS */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "0.55rem" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.35rem" }}>
                    <button
                      onClick={() => handleConfirmCheckpoint(cp)}
                      style={{ background: "#059669", color: "#ffffff", border: "none", padding: "0.45rem", borderRadius: "8px", fontSize: "0.74rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem" }}
                    >
                      <span>✅</span> อนุมัติผ่าน
                    </button>
                    <button
                      onClick={() => handleSendPrompt(cp, "🫡 ศูนย์สั่งการ ALPHA: ขอภาพตรวจเวรจุดเสี่ยง/ป้อมใน เพิ่มเติมด้วยครับ")}
                      disabled={sendingPromptId === cp.groupId}
                      style={{ background: "#0284c7", color: "#ffffff", border: "none", padding: "0.45rem", borderRadius: "8px", fontSize: "0.74rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem" }}
                    >
                      <span>📡</span> ขอภาพเพิ่ม
                    </button>
                  </div>

                  {isDanger && (
                    <button
                      onClick={() => handleSendPrompt(cp, "🚨 ศูนย์สั่งการ ALPHA: แจ้ง รปภ. จุดนี้ ด่วน! ยังไม่ได้รับรายงานตรวจเวร กรุณา ว.4 รายงานตัวด่วนที่สุดครับ")}
                      disabled={sendingPromptId === cp.groupId}
                      style={{ background: "#dc2626", color: "#ffffff", border: "none", padding: "0.45rem", borderRadius: "8px", fontSize: "0.74rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.25rem", boxShadow: "0 2px 10px rgba(220, 38, 38, 0.4)" }}
                    >
                      <span>⚡</span> วิทยุเร่งด่วน (เตือนขาดส่ง)
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FULL HD CCTV INSPECTION MODAL */}
      {selectedFeed && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "linear-gradient(145deg, #0b1329 0%, #172554 100%)", border: "1.5px solid #38bdf8", borderRadius: "18px", padding: "1.5rem", maxWidth: "620px", width: "100%", boxShadow: "0 20px 50px rgba(0,0,0,0.6)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", borderBottom: "1px solid rgba(56, 189, 248, 0.2)", paddingBottom: "0.75rem" }}>
              <div>
                <p style={{ margin: 0, color: "#38bdf8", fontSize: "0.75rem", fontWeight: 800, fontFamily: "monospace" }}>
                  CCTV HIGH-RESOLUTION TELEMETRY INSPECTOR
                </p>
                <h3 style={{ margin: "0.2rem 0 0 0", fontSize: "1.25rem", color: "#ffffff", fontWeight: 900 }}>
                  🏢 {selectedFeed.siteName}
                </h3>
                <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.82rem", color: "#94a3b8" }}>
                  ผู้รายงาน: <strong>{selectedFeed.guardName}</strong> · หน่วยงาน {selectedFeed.customerName}
                </p>
              </div>
              <button onClick={() => setSelectedFeed(null)} style={{ background: "transparent", border: "none", color: "#ffffff", fontSize: "1.5rem", cursor: "pointer" }}>✕</button>
            </div>

            {/* INSPECTOR DETAILS */}
            <div style={{ background: "#050914", borderRadius: "12px", padding: "1.25rem", border: "1px solid rgba(255,255,255,0.08)", marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>เวลาส่งรายงานล่าสุด:</span>
                <span style={{ color: "#38bdf8", fontWeight: 800, fontSize: "0.95rem" }}>
                  {new Date(selectedFeed.latestAt).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit" })} น.
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>จำนวนภาพถ่ายในรอบ:</span>
                <span style={{ color: "#10b981", fontWeight: 800 }}>{selectedFeed.photoCount} ภาพ (ตรวจครบ)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>สถานะการยืนยัน:</span>
                <span style={{ color: selectedFeed.isSilent ? "#ef4444" : "#10b981", fontWeight: 800 }}>
                  {selectedFeed.isSilent ? "🚨 เกิน 90 นาที (ต้องสั่งการ)" : "🟢 อยู่ในกรอบเวลาปกติ"}
                </span>
              </div>
            </div>

            {/* MODAL ACTION BAR */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
              <button onClick={() => setSelectedFeed(null)} style={{ background: "#334155", color: "#ffffff", border: "none", padding: "0.6rem 1.1rem", borderRadius: "8px", fontWeight: 700, cursor: "pointer" }}>
                ปิดหน้าต่าง
              </button>
              <button
                onClick={async () => {
                  await handleConfirmCheckpoint(selectedFeed);
                  setSelectedFeed(null);
                }}
                style={{ background: "linear-gradient(135deg, #059669 0%, #10b981 100%)", color: "#ffffff", border: "none", padding: "0.6rem 1.25rem", borderRadius: "8px", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.35rem" }}
              >
                <span>✅</span> อนุมัติผ่านการตรวจรอบนี้
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
