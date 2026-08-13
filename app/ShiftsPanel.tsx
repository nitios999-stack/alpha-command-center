"use client";

import { useState, useEffect } from "react";

export function ShiftsPanel() {
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<any[]>([]);
  const [unmanagedGroups, setUnmanagedGroups] = useState<any[]>([]);
  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [commandTargetGroupId, setCommandTargetGroupId] = useState<string>("");
  const [commandTargetGroupName, setCommandTargetGroupName] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [alertSummary, setAlertSummary] = useState<any | null>(null);
  const [checkingAlert, setCheckingAlert] = useState(false);
  const [search, setSearch] = useState("");
  const [shiftFilter, setShiftFilter] = useState<"all" | "both" | "night_only" | "morning_only">("all");

  // Selection for importing unmanaged groups
  const [selectedUnmanaged, setSelectedUnmanaged] = useState<string[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);

  // Custom/Recover Command Group Form
  const [showCustomCommandModal, setShowCustomCommandModal] = useState(false);
  const [customGroupName, setCustomGroupName] = useState("สนง.สายตรวจ ALPHA COP");
  const [customGroupId, setCustomGroupId] = useState("");

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
          setMessage(data.ok ? `✅ ส่งการ์ดแจ้งเตือนเข้ากลุ่มสั่งการเรียบร้อยแล้ว!` : `❌ ส่งไม่สำเร็จ: ${data.error}`);
        }
      }
    } catch {
      setMessage("เกิดข้อผิดพลาดในการตรวจสอบจุดขาดเวร");
    }
    setCheckingAlert(false);
  };

  useEffect(() => {
    fetchConfigs();
    checkMissingShifts(false);
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

  const filteredConfigs = configs.filter((c) => {
    const matchesSearch = (c.groupName || "").toLowerCase().includes(search.toLowerCase()) ||
                          (c.customerName || "").toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (shiftFilter === "both") return c.hasMorningShift && c.hasEveningShift;
    if (shiftFilter === "night_only") return !c.hasMorningShift && c.hasEveningShift;
    if (shiftFilter === "morning_only") return c.hasMorningShift && !c.hasEveningShift;
    return true;
  });

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
              <span>🛡️</span> ALPHA COMMAND CENTER
            </div>
            <h2 style={{ fontSize: "1.65rem", margin: "0.2rem 0 0.5rem", fontWeight: 800 }}>ศูนย์จัดการเวลากะและตอบกลับอัตโนมัติ</h2>
            <p style={{ color: "#94a3b8", fontSize: "0.95rem", maxWidth: "650px", margin: 0 }}>
              ระบบเปิดตอบกลับสติกเกอร์ 35 วิ อัตโนมัติในตัว (ฟรี 100%) สามารถเปิด/ปิดอิสระรายกลุ่ม และสรุปจุดขาดเวรเข้ากลุ่มสั่งการ
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              onClick={() => setShowCustomCommandModal(true)}
              style={{ background: "#334155", color: "white", border: "1px solid #475569", padding: "0.65rem 1rem", borderRadius: "10px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <span>➕</span> ระบุ/กู้คืนกลุ่มสั่งการ
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

      {/* COMMAND CENTER GROUP SELECTOR & STATUS BAR */}
      <div className="card" style={{ marginBottom: "1.5rem", borderRadius: "14px", padding: "1.25rem", border: "1px solid var(--border)", background: "var(--card-bg, #ffffff)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div style={{ flex: "1 1 320px" }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", display: "block", marginBottom: "0.35rem" }}>
              🎯 กลุ่มไลน์ศูนย์สั่งการ (รับการแจ้งเตือนสรุปจุดขาดเวร · ปิดสติกเกอร์ 100%)
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
                  🔒 ปิดสติกเกอร์ในกลุ่มนี้เด็ดขาด
                </span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={() => checkMissingShifts(false)}
              disabled={checkingAlert}
              className="btn btn-secondary"
              style={{ padding: "0.55rem 1rem", borderRadius: "8px", cursor: "pointer", fontSize: "0.9rem" }}
            >
              🔄 ตรวจสอบสถานะสด
            </button>
            {alertSummary?.hasMissing && (
              <button
                onClick={() => checkMissingShifts(true)}
                disabled={checkingAlert}
                className="btn btn-primary"
                style={{ background: "#ef4444", color: "white", padding: "0.55rem 1.1rem", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 700, fontSize: "0.9rem" }}
              >
                🚨 ส่งการ์ดเตือนจุดขาดเวร ({alertSummary.missingCount})
              </button>
            )}
          </div>
        </div>

        {/* LIVE MISSING LIST */}
        {alertSummary?.missingSlots && alertSummary.missingSlots.length > 0 && (
          <div style={{ marginTop: "1rem", background: "rgba(239, 68, 68, 0.06)", border: "1px solid rgba(239, 68, 68, 0.2)", padding: "0.85rem 1rem", borderRadius: "10px" }}>
            <strong style={{ color: "#dc2626", fontSize: "0.9rem", display: "block", marginBottom: "0.4rem" }}>
              ⚠️ จุดที่ยังไม่ส่งรายงานเข้าเวร (เลยกำหนดเวลาแล้ว):
            </strong>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.5rem" }}>
              {alertSummary.missingSlots.map((s: any, idx: number) => (
                <div key={idx} style={{ fontSize: "0.85rem", background: "white", padding: "0.4rem 0.6rem", borderRadius: "6px", border: "1px solid rgba(239, 68, 68, 0.15)" }}>
                  🔴 <strong>{s.site_name}</strong> <span style={{ color: "#dc2626" }}>({s.deadline} น. - สาย {s.late_minutes || 0} นาที)</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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

          <div style={{ display: "flex", gap: "0.3rem", fontSize: "0.85rem" }}>
            <button
              onClick={() => setShiftFilter("all")}
              style={{ padding: "0.35rem 0.7rem", borderRadius: "6px", border: "1px solid var(--border)", background: shiftFilter === "all" ? "#0f172a" : "white", color: shiftFilter === "all" ? "white" : "inherit", cursor: "pointer" }}
            >
              ทั้งหมด ({configs.length})
            </button>
            <button
              onClick={() => setShiftFilter("both")}
              style={{ padding: "0.35rem 0.7rem", borderRadius: "6px", border: "1px solid var(--border)", background: shiftFilter === "both" ? "#0f172a" : "white", color: shiftFilter === "both" ? "white" : "inherit", cursor: "pointer" }}
            >
              ☀️🌙 2 กะ
            </button>
            <button
              onClick={() => setShiftFilter("night_only")}
              style={{ padding: "0.35rem 0.7rem", borderRadius: "6px", border: "1px solid var(--border)", background: shiftFilter === "night_only" ? "#0f172a" : "white", color: shiftFilter === "night_only" ? "white" : "inherit", cursor: "pointer" }}
            >
              🌙 ดึกอย่างเดียว
            </button>
            <button
              onClick={() => setShiftFilter("morning_only")}
              style={{ padding: "0.35rem 0.7rem", borderRadius: "6px", border: "1px solid var(--border)", background: shiftFilter === "morning_only" ? "#0f172a" : "white", color: shiftFilter === "morning_only" ? "white" : "inherit", cursor: "pointer" }}
            >
              ☀️ เช้าอย่างเดียว
            </button>
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
                <th style={{ padding: "0.85rem 0.75rem", textAlign: "center", width: "160px" }}>🤖 สติกเกอร์ 35 วิ</th>
                <th style={{ padding: "0.85rem 0.75rem", textAlign: "center", width: "170px" }}>☀️ ผลัดเช้า</th>
                <th style={{ padding: "0.85rem 0.75rem", textAlign: "center", width: "170px" }}>🌙 ผลัดดึก</th>
                <th style={{ padding: "0.85rem 1rem", textAlign: "center", width: "120px" }}>สถานะ</th>
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

                  {/* AUTO REPLY TOGGLE */}
                  <td style={{ padding: "0.85rem 0.75rem", textAlign: "center" }}>
                    {c.isCommandRoom ? (
                      <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 600, background: "#f1f5f9", padding: "0.2rem 0.5rem", borderRadius: "6px" }}>
                        🔒 ปิดถาวร (สั่งการ)
                      </span>
                    ) : (
                      <button
                        onClick={() => handleToggleAutoReply(c.groupId, c.autoReplyEnabled)}
                        disabled={savingId === c.groupId}
                        style={{
                          background: c.autoReplyEnabled ? "#dcfce7" : "#f1f5f9",
                          color: c.autoReplyEnabled ? "#15803d" : "#64748b",
                          border: `1px solid ${c.autoReplyEnabled ? "#86efac" : "#cbd5e1"}`,
                          padding: "0.25rem 0.6rem",
                          borderRadius: "20px",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                        }}
                      >
                        <span>{c.autoReplyEnabled ? "🟢 เปิด (35 วิ)" : "⚪ ปิด"}</span>
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

      {/* MODAL: CUSTOM / RECOVER COMMAND GROUP */}
      {showCustomCommandModal && (
        <div className="modal-backdrop" role="presentation" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div className="modal-card" style={{ background: "white", padding: "1.5rem", borderRadius: "16px", maxWidth: "520px", width: "90%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.25rem" }}>🎯 ระบุ/กู้คืนกลุ่มไลน์ศูนย์สั่งการ</h3>
                <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0.25rem 0 0" }}>
                  ใส่ชื่อกลุ่มและ Group ID เพื่อตั้งเป็นกลุ่มสั่งการหลัก (ระบบจะปิดสติกเกอร์ในกลุ่มนี้ 100% ส่งเฉพาะข้อความสั่งการเท่านั้น)
                </p>
              </div>
              <button onClick={() => setShowCustomCommandModal(false)} style={{ background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer" }}>
                ✕
              </button>
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
                  💡 นำ LINE Group ID ที่บอตเคยรับมาวาง หรือหากเคยได้รับ Webhook ระบบจะเชื่อมให้ทันที
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
