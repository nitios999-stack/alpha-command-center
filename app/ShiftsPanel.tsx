"use client";

import { useState, useEffect } from "react";

export function ShiftsPanel() {
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<any[]>([]);
  const [unmanagedGroups, setUnmanagedGroups] = useState<any[]>([]);
  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [commandTargetGroupId, setCommandTargetGroupId] = useState<string>("");
  const [commandTargetGroupName, setCommandTargetGroupName] = useState<string | null>(null);
  const [currentWave, setCurrentWave] = useState<"morning" | "evening">("morning");
  const [currentWaveLabel, setCurrentWaveLabel] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  
  // Missing check-in alert state
  const [alertSummary, setAlertSummary] = useState<any | null>(null);
  const [checkingAlert, setCheckingAlert] = useState(false);

  // Silent / Inactivity alert state
  const [silentSummary, setSilentSummary] = useState<any | null>(null);
  const [checkingSilent, setCheckingSilent] = useState(false);

  // Views & Filters
  const [search, setSearch] = useState("");
  const [shiftFilter, setShiftFilter] = useState<"all" | "morning_only" | "night_only" | "both">("all");
  const [activeView, setActiveView] = useState<"all_shifts" | "silent_groups">("all_shifts");

  // Selection for importing unmanaged groups
  const [selectedUnmanaged, setSelectedUnmanaged] = useState<string[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);

  // Custom/Recover Command Group Form
  const [showCustomCommandModal, setShowCustomCommandModal] = useState(false);
  const [customGroupName, setCustomGroupName] = useState("สนง.สายตรวจ ALPHA COP");
  const [customGroupId, setCustomGroupId] = useState("");
  const [discoveredGroups, setDiscoveredGroups] = useState<any[]>([]);
  const [loadingDiscovered, setLoadingDiscovered] = useState(false);

  const fetchDiscoveredGroups = async () => {
    setLoadingDiscovered(true);
    try {
      const res = await fetch("/api/line/groups/discover");
      if (res.ok) {
        const data = await res.json();
        setDiscoveredGroups(data.groups || []);
      }
    } catch {
      // ignore
    }
    setLoadingDiscovered(false);
  };

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/line/shifts/config");
      if (res.ok) {
        const data = await res.json();
        setConfigs(data.configs || []);
        setUnmanagedGroups(data.unmanagedGroups || []);
        setAllGroups(data.allGroups || []);
        setCommandTargetGroupId(data.commandTargetGroupId || "");
        setCommandTargetGroupName(data.commandTargetGroupName || null);
        setCurrentWave(data.currentWave || "morning");
        setCurrentWaveLabel(data.currentWaveLabel || "");
      } else {
        setMessage("ไม่สามารถโหลดข้อมูลเวลากะได้");
      }
    } catch {
      setMessage("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setLoading(false);
  };

  const checkMissingShifts = async (sendAlert = false) => {
    setCheckingAlert(true);
    try {
      const res = await fetch(`/api/line/shifts/check${sendAlert ? "?send=true" : ""}`, {
        method: sendAlert ? "POST" : "GET",
      });
      const data = await res.json();
      if (res.ok) {
        setAlertSummary(data);
        if (sendAlert) {
          setMessage(data.ok ? `✅ ส่งการ์ดเตือนจุดขาดเวรเข้ากลุ่มสั่งการเรียบร้อยแล้ว!` : `❌ ส่งไม่สำเร็จ: ${data.error}`);
        }
      }
    } catch {
      setMessage("เกิดข้อผิดพลาดในการตรวจสอบจุดขาดเวร");
    }
    setCheckingAlert(false);
  };

  const sendWaveAttendanceAlert = async (wave: "morning" | "evening") => {
    const waveName = wave === "morning" ? "ผลัดเช้า" : "ผลัดดึก";
    if (!window.confirm(`ส่งรายงานสรุปจุดค้างเข้าเวร (${waveName}) ลงกลุ่มสั่งการใช่หรือไม่?`)) return;
    setCheckingAlert(true);
    try {
      const res = await fetch("/api/line/shifts/send-attendance-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wave }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setMessage(`✅ ส่งรายงานสรุปจุดค้างเข้าเวร (${waveName}) ลงกลุ่มสั่งการเรียบร้อยแล้ว!`);
      } else {
        setMessage(`❌ ส่งไม่สำเร็จ: ${data.error || "เกิดข้อผิดพลาด"}`);
      }
    } catch {
      setMessage("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setCheckingAlert(false);
  };

  const batchApproveWaveShifts = async (wave: "morning" | "evening" | "all") => {
    const waveName = wave === "morning" ? "ผลัดเช้า" : wave === "evening" ? "ผลัดดึก" : "ทุกผลัด";
    if (!window.confirm(`⚡ ยืนยันการอนุมัติเข้าเวรทั้งผลัด (${waveName}) สำหรับจุดตรวจทั้งหมดที่มีรูปภาพใช่หรือไม่?`)) return;
    setLoading(true);
    try {
      const res = await fetch("/api/line/shifts/batch-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wave, actor: "สายตรวจ (อนุมัติผ่านเว็บ 1-Tap)" }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setMessage(`⚡ ${data.message || `อนุมัติสำเร็จ ${data.count} จุด`}`);
        await fetchConfigs();
        await checkMissingShifts(false);
      } else {
        setMessage(`❌ เกิดข้อผิดพลาด: ${data.error || "ไม่สามารถอนุมัติได้"}`);
      }
    } catch {
      setMessage("❌ เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setLoading(false);
  };

  const checkSilentGroups = async (sendAlert = false) => {
    setCheckingSilent(true);
    try {
      const res = await fetch(`/api/line/shifts/silent`, {
        method: sendAlert ? "POST" : "GET",
      });
      const data = await res.json();
      if (res.ok) {
        setSilentSummary(data);
        if (sendAlert) {
          setMessage(data.ok ? `✅ ส่งการ์ดแจ้งเตือนจุดเงียบเข้ากลุ่มสั่งการแล้ว!` : `❌ ส่งไม่สำเร็จ: ${data.error}`);
        }
      }
    } catch {
      setMessage("เกิดข้อผิดพลาดในการตรวจสอบจุดเงียบ");
    }
    setCheckingSilent(false);
  };

  useEffect(() => {
    fetchConfigs();
    checkMissingShifts(false);
    checkSilentGroups(false);
  }, []);

  const handleSaveCommandGroup = async () => {
    if (!commandTargetGroupId) return alert("กรุณาเลือกกลุ่มไลน์สั่งการ");
    try {
      const res = await fetch("/api/line/shifts/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_command_group",
          groupId: commandTargetGroupId,
          actor: "web-admin",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCommandTargetGroupName(data.groupName);
        setMessage(`🎯 ${data.message}`);
        await fetchConfigs();
      } else {
        setMessage(`❌ เกิดข้อผิดพลาด: ${data.error}`);
      }
    } catch {
      setMessage("❌ เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
  };

  const handleRegisterCustomCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customGroupId.trim()) return alert("กรุณาระบุ LINE Group ID");
    setLoading(true);
    try {
      const res = await fetch("/api/line/shifts/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "register_custom_group",
          groupId: customGroupId.trim(),
          groupName: customGroupName.trim(),
          isCommandRoom: true,
          actor: "web-admin",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`🎉 ${data.message}`);
        setShowCustomCommandModal(false);
        setCustomGroupId("");
        await fetchConfigs();
      } else {
        setMessage(`❌ เกิดข้อผิดพลาด: ${data.error}`);
      }
    } catch {
      setMessage("❌ เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setLoading(false);
  };

  const handleToggleAutoReply = async (groupId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    setSavingId(groupId);
    try {
      const res = await fetch("/api/line/shifts/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_auto_reply",
          groupId,
          enabled: newStatus,
          actor: "web-admin",
        }),
      });
      if (res.ok) {
        setConfigs((prev) =>
          prev.map((c) => (c.groupId === groupId ? { ...c, autoReplyEnabled: newStatus } : c))
        );
        setMessage(newStatus ? "🤖 เปิดสติกเกอร์ตอบกลับ 35 วิ" : "🔇 ปิดสติกเกอร์กลุ่มนี้แล้ว");
      }
    } catch {
      setMessage("❌ เกิดข้อผิดพลาดในการเปลี่ยนสถานะ");
    }
    setSavingId(null);
  };

  const handleToggleAllAutoReply = async (enabled: boolean) => {
    if (!confirm(`ยืนยันการ${enabled ? "เปิด" : "ปิด"}ระบบตอบกลับสติกเกอร์อัตโนมัติทุกกลุ่มหรือไม่?`)) return;
    setLoading(true);
    try {
      const res = await fetch("/api/line/shifts/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_all_auto_reply",
          enabled,
          actor: "web-admin",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`🎉 ${data.message}`);
        await fetchConfigs();
      }
    } catch {
      setMessage("❌ เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setLoading(false);
  };

  const handleImportSelected = async () => {
    if (selectedUnmanaged.length === 0) return alert("กรุณาเลือกกลุ่มที่ต้องการนำเข้า");
    setLoading(true);
    try {
      const res = await fetch("/api/line/shifts/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import_selected_groups",
          groupIds: selectedUnmanaged,
          actor: "web-admin",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`🎉 ${data.message}`);
        setSelectedUnmanaged([]);
        setShowImportModal(false);
        await fetchConfigs();
      } else {
        setMessage(`❌ เกิดข้อผิดพลาด: ${data.error}`);
      }
    } catch {
      setMessage("❌ เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setLoading(false);
  };

  const toggleSelectUnmanaged = (id: string) => {
    setSelectedUnmanaged((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllUnmanaged = () => {
    if (selectedUnmanaged.length === unmanagedGroups.length) {
      setSelectedUnmanaged([]);
    } else {
      setSelectedUnmanaged(unmanagedGroups.map((g) => g.groupId));
    }
  };

  const handleUpdateShift = async (groupId: string, updates: any) => {
    setSavingId(groupId);
    try {
      const target = configs.find((c) => c.groupId === groupId);
      const payload = {
        groupId,
        hasMorningShift: updates.hasMorningShift !== undefined ? updates.hasMorningShift : target.hasMorningShift,
        morningDeadline: updates.morningDeadline !== undefined ? updates.morningDeadline : target.morningDeadline,
        hasEveningShift: updates.hasEveningShift !== undefined ? updates.hasEveningShift : target.hasEveningShift,
        eveningDeadline: updates.eveningDeadline !== undefined ? updates.eveningDeadline : target.eveningDeadline,
        actor: "web-admin",
      };

      const res = await fetch("/api/line/shifts/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setConfigs((prev) =>
          prev.map((c) => (c.groupId === groupId ? { ...c, ...payload } : c))
        );
        setMessage("✅ บันทึกเวลากะเรียบร้อยแล้ว");
      } else {
        setMessage("❌ บันทึกไม่สำเร็จ");
      }
    } catch {
      setMessage("❌ เกิดข้อผิดพลาดในการบันทึก");
    }
    setSavingId(null);
  };

  const handleBulkPreset = async (preset: string, customMorning?: string, customEvening?: string) => {
    if (!confirm(`ยืนยันการตั้งค่าเวลากะรูปแบบ "${preset}" ให้กับทุกกลุ่มพร้อมกันหรือไม่?`)) return;
    setLoading(true);
    try {
      const res = await fetch("/api/line/shifts/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_preset",
          preset,
          morningDeadline: customMorning,
          eveningDeadline: customEvening,
          actor: "web-admin",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(`🎉 ${data.message}`);
        await fetchConfigs();
      } else {
        setMessage(`❌ เกิดข้อผิดพลาด: ${data.error}`);
      }
    } catch {
      setMessage("❌ เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setLoading(false);
  };

  // Group Filters based on Wave & Search
  const filteredConfigs = configs.filter((c) => {
    const matchesSearch = (c.groupName || "").toLowerCase().includes(search.toLowerCase()) ||
                          (c.customerName || "").toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;

    if (shiftFilter === "morning_only") return c.hasMorningShift;
    if (shiftFilter === "night_only") return c.hasEveningShift;
    if (shiftFilter === "both") return c.hasMorningShift && c.hasEveningShift;
    return true;
  });

  const silentInShiftGroups = configs.filter(
    (c) => c.isConfigured && !c.isCommandRoom && c.isInActiveShift && c.shiftState === "active_silent"
  );

  const offShiftGroups = configs.filter(
    (c) => c.isConfigured && !c.isCommandRoom && !c.isInActiveShift
  );

  const totalAutoReplyActive = configs.filter((c) => c.autoReplyEnabled && !c.isCommandRoom).length;

  return (
    <section className="line-control" style={{ marginTop: "1.5rem" }}>
      {message && (
        <div className="notice" role="status" style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span>ℹ️</span> {message}
          <button onClick={() => setMessage(null)} style={{ marginLeft: "auto", cursor: "pointer", background: "none", border: "none", fontSize: "1rem" }}>
            ✕
          </button>
        </div>
      )}

      {/* HERO SECTION */}
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "white", padding: "1.75rem", borderRadius: "16px", marginBottom: "1.5rem", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", padding: "0.25rem 0.6rem", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
              <span>🛡️</span> ALPHA COMMAND CENTER · {currentWaveLabel || (currentWave === "evening" ? "ผลัดดึก" : "ผลัดเช้า")}
            </div>
            <h2 style={{ fontSize: "1.65rem", margin: "0.2rem 0 0.5rem", fontWeight: 800 }}>ศูนย์จัดการเวลากะและตรวจจับกลุ่มเงียบ</h2>
            <p style={{ color: "#94a3b8", fontSize: "0.95rem", maxWidth: "680px", margin: 0 }}>
              แยกการตรวจกะเช้า-ดึกชัดเจน ตรวจจับกลุ่มที่เงียบนานเกินรอบตรวจ (เฉพาะกลุ่มที่อยู่ในเวลากะ) พร้อมส่งสรุปจุดขาดเข้ากลุ่มสั่งการ
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <a
              href="/patrol"
              target="_blank"
              rel="noopener noreferrer"
              style={{ background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)", color: "white", textDecoration: "none", padding: "0.65rem 1.15rem", borderRadius: "10px", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.4rem", boxShadow: "0 4px 12px rgba(2, 132, 199, 0.4)" }}
            >
              <span>📱</span> แผงตรวจสายตรวจ (มือถือ)
            </a>
            <button
              onClick={() => { setShowCustomCommandModal(true); fetchDiscoveredGroups(); }}
              style={{ background: "#334155", color: "white", border: "1px solid #475569", padding: "0.65rem 1rem", borderRadius: "10px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <span>➕</span> ค้นหา/กู้คืนกลุ่มสั่งการ
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              style={{ background: "#38bdf8", color: "#0f172a", border: "none", padding: "0.65rem 1.25rem", borderRadius: "10px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem", boxShadow: "0 4px 12px rgba(56, 189, 248, 0.3)" }}
            >
              <span>📥</span> ดึงกลุ่ม LINE OA เข้าสู่ระบบ ({unmanagedGroups.length})
            </button>
          </div>
        </div>
      </div>

      {/* SHIFT SEPARATION & VIEW SWITCHER BAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.25rem" }}>
        {/* SHIFT SELECTOR BUTTONS */}
        <div style={{ display: "inline-flex", background: "white", padding: "4px", borderRadius: "12px", border: "1px solid var(--border)", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
          <button
            onClick={() => setShiftFilter("all")}
            style={{
              padding: "0.5rem 1.1rem",
              borderRadius: "8px",
              border: "none",
              fontWeight: 700,
              fontSize: "0.9rem",
              cursor: "pointer",
              background: shiftFilter === "all" ? "#0f172a" : "transparent",
              color: shiftFilter === "all" ? "white" : "#64748b",
            }}
          >
            🌐 ทุกกะ ({configs.length})
          </button>
          <button
            onClick={() => setShiftFilter("morning_only")}
            style={{
              padding: "0.5rem 1.1rem",
              borderRadius: "8px",
              border: "none",
              fontWeight: 700,
              fontSize: "0.9rem",
              cursor: "pointer",
              background: shiftFilter === "morning_only" ? "#eab308" : "transparent",
              color: shiftFilter === "morning_only" ? "#713f12" : "#64748b",
            }}
          >
            ☀️ กะเช้าเท่านั้น ({configs.filter((c) => c.hasMorningShift).length})
          </button>
          <button
            onClick={() => setShiftFilter("night_only")}
            style={{
              padding: "0.5rem 1.1rem",
              borderRadius: "8px",
              border: "none",
              fontWeight: 700,
              fontSize: "0.9rem",
              cursor: "pointer",
              background: shiftFilter === "night_only" ? "#6366f1" : "transparent",
              color: shiftFilter === "night_only" ? "white" : "#64748b",
            }}
          >
            🌙 กะดึกเท่านั้น ({configs.filter((c) => c.hasEveningShift).length})
          </button>
        </div>

        {/* SECTION VIEW TABS */}
        <div style={{ display: "inline-flex", gap: "0.5rem" }}>
          <button
            onClick={() => setActiveView("all_shifts")}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "10px",
              border: "1px solid var(--border)",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: "pointer",
              background: activeView === "all_shifts" ? "#0f172a" : "white",
              color: activeView === "all_shifts" ? "white" : "#475569",
            }}
          >
            📋 ตารางเวลากะทั้งหมด
          </button>
          <button
            onClick={() => setActiveView("silent_groups")}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "10px",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: "pointer",
              background: activeView === "silent_groups" ? "#ef4444" : "#fef2f2",
              color: activeView === "silent_groups" ? "white" : "#b91c1c",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <span>🔇</span> ตรวจจุดเงียบ ({silentInShiftGroups.length})
          </button>
        </div>
      </div>

      {/* COMMAND CENTER GROUP SELECTOR & STATUS BAR */}
      <div className="card" style={{ marginBottom: "1.5rem", borderRadius: "14px", padding: "1.25rem", border: "1px solid var(--border)", background: "var(--card-bg, #ffffff)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div style={{ flex: "1 1 320px" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: "0.35rem" }}>
              🎯 กลุ่มไลน์ศูนย์สั่งการ (รับแจ้งเตือนจุดขาดเวรและจุดเงียบ · ปิดสติกเกอร์ 100%)
            </label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <select
                value={commandTargetGroupId}
                onChange={(e) => setCommandTargetGroupId(e.target.value)}
                style={{ padding: "0.55rem 0.85rem", borderRadius: "8px", border: "1px solid var(--border)", width: "100%", maxWidth: "420px", fontSize: "0.9rem", fontWeight: 600 }}
              >
                <option value="">-- เลือกกลุ่มไลน์สั่งการ --</option>
                {allGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleSaveCommandGroup}
                className="btn btn-primary"
                style={{ padding: "0.55rem 1.1rem", borderRadius: "8px", cursor: "pointer", whiteSpace: "nowrap", fontWeight: 600 }}
              >
                บันทึกกลุ่มสั่งการ
              </button>
            </div>
            {commandTargetGroupName && (
              <div style={{ marginTop: "0.4rem", fontSize: "0.85rem", color: "#16a34a", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <span>✓</span> กลุ่มสั่งการปัจจุบัน: <strong>{commandTargetGroupName}</strong> 
                <span style={{ background: "#dcfce7", color: "#15803d", padding: "0.1rem 0.4rem", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 700 }}>
                  🔒 ปิดสติกเกอร์เด็ดขาด
                </span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              onClick={() => { checkMissingShifts(false); checkSilentGroups(false); }}
              disabled={checkingAlert || checkingSilent}
              className="btn btn-secondary"
              style={{ padding: "0.55rem 1rem", borderRadius: "8px", cursor: "pointer", fontSize: "0.88rem", fontWeight: 600 }}
            >
              🔄 ตรวจสอบสถานะสด
            </button>
            <button
              onClick={() => batchApproveWaveShifts(currentWave || "all")}
              disabled={loading}
              style={{ background: "#10b981", color: "white", border: "none", padding: "0.55rem 1.1rem", borderRadius: "8px", cursor: "pointer", fontWeight: 700, fontSize: "0.88rem", display: "inline-flex", alignItems: "center", gap: "0.4rem", boxShadow: "0 2px 6px rgba(16, 185, 129, 0.25)" }}
            >
              <span>⚡</span> อนุมัติเข้าเวรทั้งผลัด ({currentWaveLabel || "ผลัดปัจจุบัน"})
            </button>
            <button
              onClick={() => sendWaveAttendanceAlert("morning")}
              disabled={checkingAlert}
              style={{ background: "#eab308", color: "#713f12", border: "none", padding: "0.55rem 1.1rem", borderRadius: "8px", cursor: "pointer", fontWeight: 700, fontSize: "0.88rem", display: "inline-flex", alignItems: "center", gap: "0.4rem", boxShadow: "0 2px 6px rgba(234, 179, 8, 0.25)" }}
            >
              <span>☀️</span> ส่งสรุปกะเช้าลงกลุ่มสั่งการ
            </button>
            <button
              onClick={() => sendWaveAttendanceAlert("evening")}
              disabled={checkingAlert}
              style={{ background: "#6366f1", color: "white", border: "none", padding: "0.55rem 1.1rem", borderRadius: "8px", cursor: "pointer", fontWeight: 700, fontSize: "0.88rem", display: "inline-flex", alignItems: "center", gap: "0.4rem", boxShadow: "0 2px 6px rgba(99, 102, 241, 0.25)" }}
            >
              <span>🌙</span> ส่งสรุปกะดึกลงกลุ่มสั่งการ
            </button>
            {silentInShiftGroups.length > 0 && (
              <button
                onClick={() => checkSilentGroups(true)}
                disabled={checkingSilent}
                style={{ background: "#f97316", color: "white", padding: "0.55rem 1.1rem", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.88rem" }}
              >
                🔇 ส่งเตือนจุดเงียบ ({silentInShiftGroups.length})
              </button>
            )}
          </div>
        </div>

        {/* INTERACTIVE LINE CHAT COMMANDS BANNER */}
        <div style={{ marginTop: "1rem", paddingTop: "0.85rem", borderTop: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", background: "#f8fafc", padding: "0.85rem 1.15rem", borderRadius: "10px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
            <span style={{ fontSize: "1.35rem", marginTop: "2px" }}>💡</span>
            <div style={{ fontSize: "0.86rem", color: "#334155", lineHeight: "1.6" }}>
              <strong>ระบบสั่งการและระบุกำลังพลผ่าน LINE สด:</strong>
              <div style={{ marginTop: "0.25rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                <span>• พิมพ์ <code style={{ background: "#e2e8f0", padding: "0.15rem 0.4rem", borderRadius: "4px", color: "#0f172a" }}>สรุปกะเช้า</code> หรือ <code style={{ background: "#e2e8f0", padding: "0.15rem 0.4rem", borderRadius: "4px", color: "#0f172a" }}>สรุปกะดึก</code> เพื่อรับการ์ดสรุปยอดรายบุคคล</span>
                <span>• คนประจำมา: พิมพ์ <code style={{ background: "#dcfce7", padding: "0.15rem 0.4rem", borderRadius: "4px", color: "#15803d", fontWeight: 700 }}>ยืนยัน [ลำดับ]</code> หรือแตะปุ่ม <strong>[🔘 คนประจำ]</strong></span>
                <span>• สแปร์มาแทน: พิมพ์ <code style={{ background: "#fef3c7", padding: "0.15rem 0.4rem", borderRadius: "4px", color: "#b45309", fontWeight: 700 }}>สแปร์ [ลำดับ]</code> หรือแตะปุ่ม <strong>[🔄 สแปร์แทน]</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* VIEW: SILENT / INACTIVE GROUPS AUDIT VIEW */}
      {activeView === "silent_groups" && (
        <div className="card" style={{ marginBottom: "1.5rem", borderRadius: "14px", padding: "1.25rem", border: "1px solid rgba(239, 68, 68, 0.2)", background: "white" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div>
              <h3 style={{ margin: 0, color: "#dc2626", fontSize: "1.15rem" }}>
                🔇 รายงานจุดที่เงียบนานเกินรอบตรวจ ({silentInShiftGroups.length} จุด)
              </h3>
              <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", color: "#64748b" }}>
                เฉพาะจุดที่อยู่ในเวลากะปัจจุบัน ({currentWaveLabel || "ผลัดปัจจุบัน"}) และขาดการส่งรายงานเกิน 2 ชั่วโมง
              </p>
            </div>
            {silentInShiftGroups.length > 0 && (
              <button
                onClick={() => checkSilentGroups(true)}
                disabled={checkingSilent}
                style={{ background: "#dc2626", color: "white", border: "none", padding: "0.5rem 1rem", borderRadius: "8px", fontWeight: 700, cursor: "pointer" }}
              >
                📲 ส่งเตือนจุดเงียบเข้ากลุ่มสั่งการ
              </button>
            )}
          </div>

          <div style={{ display: "grid", gap: "0.75rem" }}>
            {silentInShiftGroups.map((g) => {
              const hours = g.silentHours;
              const mins = g.silentMinutes % 60;
              const timeAgoText = hours > 0 ? `${hours} ชม. ${mins} นาที` : `${mins} นาที`;
              return (
                <div
                  key={g.groupId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.75rem 1rem",
                    borderRadius: "10px",
                    border: "1px solid #fee2e2",
                    background: "#fff5f5",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: "#991b1b", fontSize: "0.95rem" }}>{g.groupName}</div>
                    <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.15rem" }}>
                      🏢 {g.customerName} · รอบตรวจ: ทุก {g.intervalHours} ชม.
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#dc2626", fontWeight: 700, fontSize: "0.9rem" }}>
                      ⚠️ ขาดส่งมาแล้ว {timeAgoText}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.1rem" }}>
                      ส่งล่าสุด: {g.lastSeenAt ? new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(new Date(g.lastSeenAt)) : "ไม่พบประวัติ"}
                      {g.lastSender ? ` (โดย ${g.lastSender.slice(0, 8)}...)` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
            {silentInShiftGroups.length === 0 && (
              <div style={{ padding: "2.5rem", textAlign: "center", color: "#16a34a", fontWeight: 600 }}>
                🎉 ทุกจุดในกะนี้ส่งรายงานตรงเวลาอย่างต่อเนื่อง ไม่มีจุดเงียบผิดปกติ!
              </div>
            )}
          </div>

          {/* OFF SHIFT NOTICE */}
          {offShiftGroups.length > 0 && (
            <div style={{ marginTop: "1.25rem", padding: "0.75rem 1rem", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.8rem", color: "#64748b" }}>
              💡 <strong>หมายเหตุ:</strong> มีอีก <strong>{offShiftGroups.length} กลุ่ม</strong> ที่อยู่นอกเวลากะปฏิบัติงานขณะนี้ (ระบบคัดแยกออก ไม่นับเป็นจุดเงียบ)
            </div>
          )}
        </div>
      )}

      {/* VIEW: ALL SHIFTS CONFIG TABLE */}
      {activeView === "all_shifts" && (
        <>
          {/* BULK PRESETS & MASTER AUTO-REPLY BAR */}
          <div className="card" style={{ marginBottom: "1.5rem", borderRadius: "14px", padding: "1.25rem", border: "1px solid var(--border)", background: "var(--card-bg, #ffffff)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.05rem" }}>⚡ ตั้งค่าเวลากะด่วน และ สติกเกอร์ตอบกลับ</h3>
                <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0.15rem 0 0" }}>
                  เปิดสติกเกอร์ตอบกลับอัตโนมัติ <strong>{totalAutoReplyActive} / {configs.length} กลุ่ม</strong> (ส่งหลังรูปสุดท้าย 35 วิ)
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                <button
                  onClick={() => handleToggleAllAutoReply(true)}
                  style={{ background: "#dcfce7", color: "#15803d", border: "1px solid #86efac", padding: "0.4rem 0.75rem", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer" }}
                >
                  🤖 เปิดตอบกลับทุกกลุ่ม
                </button>
                <button
                  onClick={() => handleToggleAllAutoReply(false)}
                  style={{ background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5", padding: "0.4rem 0.75rem", borderRadius: "6px", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer" }}
                >
                  🔇 ปิดตอบกลับทั้งหมด
                </button>
                <button
                  onClick={() => handleBulkPreset("24h_07_19")}
                  className="btn btn-secondary"
                  style={{ padding: "0.4rem 0.75rem", fontSize: "0.85rem", cursor: "pointer" }}
                >
                  ☀️ 2 กะ (07:00 / 19:00)
                </button>
                <button
                  onClick={() => handleBulkPreset("night_only_18")}
                  className="btn btn-secondary"
                  style={{ padding: "0.4rem 0.75rem", fontSize: "0.85rem", cursor: "pointer" }}
                >
                  🌙 ดึกล้วน (18:00)
                </button>
              </div>
            </div>

            {/* SEARCH & FILTER BAR */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: "1 1 280px" }}>
                <input
                  type="text"
                  placeholder="🔍 ค้นหาชื่อกลุ่ม / หน่วยงาน / ลูกค้า..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ padding: "0.45rem 0.75rem", borderRadius: "8px", border: "1px solid var(--border)", width: "100%", maxWidth: "320px", fontSize: "0.9rem" }}
                />
                <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{filteredConfigs.length} กลุ่ม</span>
              </div>
            </div>
          </div>

          {/* SHIFTS & AUTO-REPLY CONFIG TABLE */}
          <div className="card" style={{ borderRadius: "14px", overflow: "hidden", border: "1px solid var(--border)" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid var(--border)" }}>
                    <th style={{ padding: "0.85rem 1rem", textAlign: "left" }}>กลุ่มไลน์ / หน่วยงาน</th>
                    <th style={{ padding: "0.85rem 0.75rem", textAlign: "center", width: "150px" }}>สถานะการส่งสด</th>
                    <th style={{ padding: "0.85rem 0.75rem", textAlign: "center", width: "140px" }}>🤖 สติกเกอร์ 35 วิ</th>
                    <th style={{ padding: "0.85rem 0.75rem", textAlign: "center", width: "160px" }}>☀️ ผลัดเช้า</th>
                    <th style={{ padding: "0.85rem 0.75rem", textAlign: "center", width: "160px" }}>🌙 ผลัดดึก</th>
                    <th style={{ padding: "0.85rem 1rem", textAlign: "center", width: "110px" }}>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConfigs.map((c) => (
                    <tr key={c.groupId} style={{ borderBottom: "1px solid var(--border)" }}>
                      {/* GROUP INFO */}
                      <td style={{ padding: "0.85rem 1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span style={{ fontWeight: 700, color: "#0f172a" }}>{c.groupName}</span>
                          {c.isCommandRoom && (
                            <span style={{ background: "#dbeafe", color: "#1e40af", padding: "0.1rem 0.4rem", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 700 }}>
                              🎯 ศูนย์สั่งการ
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.15rem" }}>
                          🏢 {c.customerName}
                        </div>
                      </td>

                      {/* LIVE ACTIVITY STATUS */}
                      <td style={{ padding: "0.85rem 0.75rem", textAlign: "center" }}>
                        {c.isCommandRoom ? (
                          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>ศูนย์สั่งการ</span>
                        ) : !c.isInActiveShift ? (
                          <span style={{ fontSize: "0.75rem", color: "#94a3b8", background: "#f1f5f9", padding: "0.15rem 0.45rem", borderRadius: "6px" }}>
                            ⚪ พักกะ
                          </span>
                        ) : c.shiftState === "active_silent" ? (
                          <span style={{ fontSize: "0.75rem", color: "#b91c1c", background: "#fee2e2", padding: "0.15rem 0.45rem", borderRadius: "6px", fontWeight: 700 }}>
                            ⚠️ เงียบ {c.silentHours} ชม.
                          </span>
                        ) : (
                          <span style={{ fontSize: "0.75rem", color: "#15803d", background: "#dcfce7", padding: "0.15rem 0.45rem", borderRadius: "6px", fontWeight: 700 }}>
                            🟢 ปกติ ({c.silentMinutes} น. ที่แล้ว)
                          </span>
                        )}
                      </td>

                      {/* AUTO REPLY TOGGLE */}
                      <td style={{ padding: "0.85rem 0.75rem", textAlign: "center" }}>
                        {c.isCommandRoom ? (
                          <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 600, background: "#f1f5f9", padding: "0.2rem 0.5rem", borderRadius: "6px" }}>
                            🔒 ปิดถาวร
                          </span>
                        ) : (
                          <button
                            onClick={() => handleToggleAutoReply(c.groupId, c.autoReplyEnabled)}
                            disabled={savingId === c.groupId}
                            style={{
                              background: c.autoReplyEnabled ? "#dcfce7" : "#f1f5f9",
                              color: c.autoReplyEnabled ? "#15803d" : "#64748b",
                              border: `1px solid ${c.autoReplyEnabled ? "#86efac" : "#cbd5e1"}`,
                              padding: "0.2rem 0.5rem",
                              borderRadius: "20px",
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "0.2rem",
                            }}
                          >
                            <span>{c.autoReplyEnabled ? "🟢 35 วิ" : "⚪ ปิด"}</span>
                          </button>
                        )}
                      </td>

                      {/* MORNING SHIFT */}
                      <td style={{ padding: "0.85rem 0.75rem", textAlign: "center", background: c.hasMorningShift ? "rgba(234, 179, 8, 0.03)" : "transparent" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                          <input
                            type="checkbox"
                            checked={c.hasMorningShift}
                            onChange={(e) => handleUpdateShift(c.groupId, { hasMorningShift: e.target.checked })}
                            style={{ cursor: "pointer", width: "16px", height: "16px" }}
                          />
                          <input
                            type="time"
                            value={c.morningDeadline}
                            disabled={!c.hasMorningShift}
                            onChange={(e) => {
                              const val = e.target.value;
                              setConfigs((prev) =>
                                prev.map((item) => (item.groupId === c.groupId ? { ...item, morningDeadline: val } : item))
                              );
                            }}
                            onBlur={(e) => handleUpdateShift(c.groupId, { morningDeadline: e.target.value })}
                            style={{
                              padding: "0.3rem 0.5rem",
                              borderRadius: "6px",
                              border: "1px solid var(--border)",
                              fontSize: "0.85rem",
                              fontWeight: 600,
                              opacity: c.hasMorningShift ? 1 : 0.35,
                              background: c.hasMorningShift ? "white" : "#f1f5f9",
                            }}
                          />
                        </div>
                      </td>

                      {/* EVENING SHIFT */}
                      <td style={{ padding: "0.85rem 0.75rem", textAlign: "center", background: c.hasEveningShift ? "rgba(99, 102, 241, 0.03)" : "transparent" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                          <input
                            type="checkbox"
                            checked={c.hasEveningShift}
                            onChange={(e) => handleUpdateShift(c.groupId, { hasEveningShift: e.target.checked })}
                            style={{ cursor: "pointer", width: "16px", height: "16px" }}
                          />
                          <input
                            type="time"
                            value={c.eveningDeadline}
                            disabled={!c.hasEveningShift}
                            onChange={(e) => {
                              const val = e.target.value;
                              setConfigs((prev) =>
                                prev.map((item) => (item.groupId === c.groupId ? { ...item, eveningDeadline: val } : item))
                              );
                            }}
                            onBlur={(e) => handleUpdateShift(c.groupId, { eveningDeadline: e.target.value })}
                            style={{
                              padding: "0.3rem 0.5rem",
                              borderRadius: "6px",
                              border: "1px solid var(--border)",
                              fontSize: "0.85rem",
                              fontWeight: 600,
                              opacity: c.hasEveningShift ? 1 : 0.35,
                              background: c.hasEveningShift ? "white" : "#f1f5f9",
                            }}
                          />
                        </div>
                      </td>

                      {/* STATUS / AUTO SAVE */}
                      <td style={{ padding: "0.85rem 1rem", textAlign: "center" }}>
                        {savingId === c.groupId ? (
                          <span style={{ fontSize: "0.8rem", color: "#38bdf8", fontWeight: 600 }}>⏳ กำลังบันทึก...</span>
                        ) : (
                          <span style={{ fontSize: "0.8rem", color: "#16a34a", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
                            <span>✓</span> พร้อม
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* MODAL: CUSTOM / RECOVER COMMAND GROUP */}
      {showCustomCommandModal && (
        <div className="modal-backdrop" role="presentation" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div className="modal-card" style={{ background: "white", padding: "1.5rem", borderRadius: "16px", maxWidth: "580px", width: "92%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.25rem" }}>🎯 ค้นหาและระบุกลุ่มไลน์ศูนย์สั่งการ</h3>
                <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0.25rem 0 0" }}>
                  เลือกจากกลุ่มที่เคยตรวจพบในระบบ หรือระบุชื่อและ Group ID โดยตรง (ระบบจะปิดสติกเกอร์ในกลุ่มนี้ 100%)
                </p>
              </div>
              <button onClick={() => setShowCustomCommandModal(false)} style={{ background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer" }}>
                ✕
              </button>
            </div>

            {/* AUTO DISCOVERY LIST */}
            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e293b" }}>
                  🔍 กลุ่มที่ตรวจพบในฐานข้อมูลทั้งหมด ({discoveredGroups.length})
                </span>
                <button
                  type="button"
                  onClick={fetchDiscoveredGroups}
                  disabled={loadingDiscovered}
                  style={{ background: "none", border: "none", color: "#0284c7", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" }}
                >
                  {loadingDiscovered ? "กำลังค้นหา..." : "🔄 สแกนใหม่"}
                </button>
              </div>

              <div style={{ maxHeight: "200px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "0.4rem" }}>
                {loadingDiscovered ? (
                  <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>
                    ⏳ กำลังค้นหากลุ่มทั้งหมดในฐานข้อมูลและเชื่อมต่อ LINE...
                  </div>
                ) : discoveredGroups.length === 0 ? (
                  <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--muted)", fontSize: "0.85rem" }}>
                    ยังไม่พบกลุ่มในประวัติ Webhook คุณสามารถพิมพ์ Group ID ด้านล่างได้เลยครับ
                  </div>
                ) : (
                  discoveredGroups.map((g) => (
                    <div
                      key={g.groupId}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.5rem 0.6rem",
                        borderRadius: "8px",
                        borderBottom: "1px solid #f1f5f9",
                        background: g.isCommandCandidate ? "rgba(56, 189, 248, 0.08)" : "transparent",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0, paddingRight: "0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {g.groupName}
                          </span>
                          {g.isCommandCandidate && (
                            <span style={{ background: "#38bdf8", color: "#0f172a", fontSize: "0.65rem", fontWeight: 800, padding: "0.1rem 0.35rem", borderRadius: "4px" }}>
                              แนะนำ
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--muted)", fontFamily: "monospace" }}>
                          ID: {g.groupId}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomGroupId(g.groupId);
                          setCustomGroupName(g.groupName);
                        }}
                        style={{
                          background: customGroupId === g.groupId ? "#0f172a" : "#f1f5f9",
                          color: customGroupId === g.groupId ? "white" : "#334155",
                          border: "1px solid #cbd5e1",
                          padding: "0.3rem 0.65rem",
                          borderRadius: "6px",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {customGroupId === g.groupId ? "✓ เลือกแล้ว" : "⚡ เลือกกลุ่มนี้"}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <form onSubmit={handleRegisterCustomCommand} style={{ display: "grid", gap: "0.85rem" }}>
              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: "0.25rem" }}>
                  ชื่อกลุ่มสั่งการ
                </label>
                <input
                  type="text"
                  required
                  value={customGroupName}
                  onChange={(e) => setCustomGroupName(e.target.value)}
                  placeholder="เช่น สนง.สายตรวจ ALPHA COP"
                  style={{ width: "100%", padding: "0.55rem 0.75rem", borderRadius: "8px", border: "1px solid var(--border)", fontSize: "0.9rem" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "#475569", display: "block", marginBottom: "0.25rem" }}>
                  LINE Group ID <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  value={customGroupId}
                  onChange={(e) => setCustomGroupId(e.target.value)}
                  placeholder="เช่น C1234567890abcdef..."
                  style={{ width: "100%", padding: "0.55rem 0.75rem", borderRadius: "8px", border: "1px solid var(--border)", fontSize: "0.9rem", fontFamily: "monospace" }}
                />
                <small style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "0.2rem", display: "block" }}>
                  💡 ระบบตัดคำว่า /chat/ และ URL ส่วนเกินออกให้อัตโนมัติ ปลอดภัย 100%
                </small>
              </div>

              <div style={{ background: "#f8fafc", padding: "0.75rem", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.85rem", color: "#334155" }}>
                🔒 <strong>การันตีความปลอดภัย:</strong> บอตจะไม่ส่งสติกเกอร์ตอบรับอัตโนมัติเข้าไปในกลุ่มสั่งการนี้เด็ดขาด โดยจะส่งเฉพาะสรุปจุดขาดเวรและข้อความรายงานเท่านั้น
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button type="button" onClick={() => setShowCustomCommandModal(false)} className="btn btn-secondary" style={{ padding: "0.55rem 1rem", borderRadius: "8px", cursor: "pointer" }}>
                  ยกเลิก
                </button>
                <button type="submit" className="btn btn-primary" style={{ padding: "0.55rem 1.25rem", borderRadius: "8px", cursor: "pointer", fontWeight: 700 }}>
                  ✓ ตั้งเป็นกลุ่มสั่งการทันที
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: IMPORT UNMANAGED LINE GROUPS */}
      {showImportModal && (
        <div className="modal-backdrop" role="presentation" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div className="modal-card" style={{ background: "white", padding: "1.5rem", borderRadius: "16px", maxWidth: "600px", width: "90%", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.25rem" }}>📥 ดึงกลุ่ม LINE OA เข้าสู่ระบบตรวจเวร</h3>
                <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0.25rem 0 0" }}>
                  เลือกกลุ่มที่ตรวจพบจาก LINE Webhook เพื่อเปิดใช้งานและกำหนดเวลากะ
                </p>
              </div>
              <button onClick={() => setShowImportModal(false)} style={{ background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer" }}>
                ✕
              </button>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <button onClick={selectAllUnmanaged} className="btn btn-secondary" style={{ padding: "0.35rem 0.75rem", fontSize: "0.85rem", cursor: "pointer" }}>
                {selectedUnmanaged.length === unmanagedGroups.length ? "✕ ยกเลิกเลือกทั้งหมด" : "✓ เลือกทั้งหมด"}
              </button>
              <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                เลือกแล้ว {selectedUnmanaged.length} / {unmanagedGroups.length} กลุ่ม
              </span>
            </div>

            <div style={{ overflowY: "auto", flex: 1, border: "1px solid var(--border)", borderRadius: "10px", padding: "0.5rem", marginBottom: "1.25rem" }}>
              {unmanagedGroups.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
                  ✅ นำเข้าครบทุกกลุ่มในทะเบียนแล้ว ไม่มีกลุ่มตกค้าง
                </div>
              ) : (
                unmanagedGroups.map((g) => (
                  <label
                    key={g.groupId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.6rem 0.75rem",
                      borderBottom: "1px solid #f1f5f9",
                      cursor: "pointer",
                      borderRadius: "6px",
                      background: selectedUnmanaged.includes(g.groupId) ? "rgba(56, 189, 248, 0.08)" : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedUnmanaged.includes(g.groupId)}
                      onChange={() => toggleSelectUnmanaged(g.groupId)}
                      style={{ width: "16px", height: "16px", cursor: "pointer" }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{g.groupName}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>ID: {g.groupId}</div>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button onClick={() => setShowImportModal(false)} className="btn btn-secondary" style={{ padding: "0.55rem 1rem", borderRadius: "8px", cursor: "pointer" }}>
                ยกเลิก
              </button>
              <button
                onClick={handleImportSelected}
                disabled={selectedUnmanaged.length === 0}
                className="btn btn-primary"
                style={{ padding: "0.55rem 1.25rem", borderRadius: "8px", cursor: "pointer", fontWeight: 700 }}
              >
                ➕ นำเข้า {selectedUnmanaged.length} กลุ่มที่เลือก
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
