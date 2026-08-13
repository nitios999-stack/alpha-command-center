"use client";

import { useState, useEffect } from "react";

export function ShiftsPanel() {
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<any[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [alertSummary, setAlertSummary] = useState<any | null>(null);
  const [checkingAlert, setCheckingAlert] = useState(false);
  const [search, setSearch] = useState("");

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/line/shifts/config");
      if (res.ok) {
        const data = await res.json();
        setConfigs(data.configs || []);
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
          setMessage(data.ok ? "✅ ส่งการ์ดแจ้งเตือนเข้ากลุ่มสั่งการเรียบร้อยแล้ว!" : `❌ ส่งไม่สำเร็จ: ${data.error}`);
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

  const filteredConfigs = configs.filter((c) =>
    (c.groupName || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <section className="line-control" style={{ marginTop: "2rem" }}>
      {message && (
        <div className="notice" role="status" style={{ marginBottom: "1rem" }}>
          <span>ℹ️</span> {message}{" "}
          <button onClick={() => setMessage(null)} style={{ marginLeft: "auto", cursor: "pointer" }}>
            ✕
          </button>
        </div>
      )}

      <div className="line-control-hero" style={{ background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)", color: "white", padding: "1.5rem", borderRadius: "12px", marginBottom: "1.5rem" }}>
        <div>
          <p className="eyebrow" style={{ color: "#38bdf8", fontWeight: "bold" }}>SHIFT & ATTENDANCE ENGINE</p>
          <h2 style={{ fontSize: "1.5rem", margin: "0.25rem 0" }}>จัดการเวลากะและตรวจจับการเข้าเวร รปภ.</h2>
          <p style={{ color: "#94a3b8", fontSize: "0.95rem" }}>
            ระบบจะตรวจสอบการส่งรายงานเข้าเวรล่วงหน้า 1 ชั่วโมง หากเลยเวลาเข้าเวรแล้วยังไม่มีรายงาน ระบบจะแจ้งเตือนจุดขาดเวรเข้ากลุ่มสั่งการอัตโนมัติ
          </p>
        </div>
      </div>

      {/* ALERT MONITOR CARD */}
      <div className="card" style={{ marginBottom: "1.5rem", border: alertSummary?.hasMissing ? "2px solid #ef4444" : "1px solid var(--border)", borderRadius: "12px", padding: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {alertSummary?.hasMissing ? "🚨 ตรวจพบจุดที่ยังไม่เข้าเวร!" : "✅ สถานะการเข้าเวรวันนี้"}
            </h3>
            <p style={{ margin: "0.25rem 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>
              เข้าเวรแล้ว {alertSummary?.confirmedSites || 0} จากทั้งหมด {alertSummary?.totalSites || 0} จุด ({alertSummary?.missingCount || 0} จุดที่ยังไม่ส่ง)
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={() => checkMissingShifts(false)}
              disabled={checkingAlert}
              className="btn btn-secondary"
              style={{ padding: "0.5rem 1rem", borderRadius: "8px", cursor: "pointer" }}
            >
              🔄 ตรวจสอบสด
            </button>
            {alertSummary?.hasMissing && (
              <button
                onClick={() => checkMissingShifts(true)}
                disabled={checkingAlert}
                className="btn btn-primary"
                style={{ background: "#ef4444", color: "white", padding: "0.5rem 1rem", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "bold" }}
              >
                📲 ส่งแจ้งเตือนเข้ากลุ่มสั่งการทันที
              </button>
            )}
          </div>
        </div>

        {alertSummary?.missingSlots && alertSummary.missingSlots.length > 0 && (
          <div style={{ marginTop: "1rem", background: "rgba(239, 68, 68, 0.05)", padding: "0.75rem", borderRadius: "8px" }}>
            <strong style={{ color: "#ef4444", fontSize: "0.9rem" }}>รายชื่อจุดที่ยังขาดรายงาน:</strong>
            <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem", fontSize: "0.85rem" }}>
              {alertSummary.missingSlots.map((s: any, idx: number) => (
                <li key={idx} style={{ marginBottom: "0.25rem" }}>
                  <strong>{s.site_name}</strong> (เวลากำหนด {s.deadline} น. - สาย {s.late_minutes || 0} นาที)
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* BULK PRESETS & SEARCH */}
      <div className="card" style={{ marginBottom: "1.5rem", borderRadius: "12px", padding: "1.25rem" }}>
        <h3 style={{ marginTop: 0 }}>⚡ ตั้งค่าเวลากะด่วน (ทุกกลุ่มพร้อมกัน)</h3>
        <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>เลือกรูปแบบกะที่ใช้บ่อย เพื่อตั้งค่าให้ครบทุกกลุ่มในคลิกเดียว:</p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <button
            onClick={() => handleBulkPreset("24h_07_19")}
            className="btn btn-secondary"
            style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", cursor: "pointer" }}
          >
            ☀️ 2 กะมาตรฐาน (07:00 / 19:00)
          </button>
          <button
            onClick={() => handleBulkPreset("24h_06_18")}
            className="btn btn-secondary"
            style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", cursor: "pointer" }}
          >
            ☀️ 2 กะเร็ว (06:00 / 18:00)
          </button>
          <button
            onClick={() => handleBulkPreset("night_only_18")}
            className="btn btn-secondary"
            style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", cursor: "pointer" }}
          >
            🌙 กะดึกอย่างเดียว (18:00)
          </button>
          <button
            onClick={() => handleBulkPreset("night_only_19")}
            className="btn btn-secondary"
            style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", cursor: "pointer" }}
          >
            🌙 กะดึกอย่างเดียว (19:00)
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1rem" }}>
          <input
            type="text"
            placeholder="🔍 ค้นหาชื่อกลุ่ม / หน่วยงาน..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: "0.5rem 0.75rem", borderRadius: "8px", border: "1px solid var(--border)", width: "100%", maxWidth: "350px" }}
          />
          <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>พบ {filteredConfigs.length} กลุ่ม</span>
        </div>
      </div>

      {/* SHIFT CONFIG TABLE */}
      <div className="card" style={{ borderRadius: "12px", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ background: "var(--header-bg, #f8fafc)", borderBottom: "2px solid var(--border)" }}>
                <th style={{ padding: "0.75rem", textAlign: "left" }}>กลุ่มไลน์ / หน่วยงาน</th>
                <th style={{ padding: "0.75rem", textAlign: "center" }}>☀️ กะเช้า</th>
                <th style={{ padding: "0.75rem", textAlign: "center" }}>เวลาเข้าเวรเช้า</th>
                <th style={{ padding: "0.75rem", textAlign: "center" }}>🌙 กะดึก</th>
                <th style={{ padding: "0.75rem", textAlign: "center" }}>เวลาเข้าเวรดึก</th>
                <th style={{ padding: "0.75rem", textAlign: "center" }}>การบันทึก</th>
              </tr>
            </thead>
            <tbody>
              {filteredConfigs.map((c) => (
                <tr key={c.groupId} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.75rem" }}>
                    <div style={{ fontWeight: "bold" }}>{c.groupName || `กลุ่ม ${c.groupId.slice(-6)}`}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{c.customerName}</div>
                  </td>

                  {/* MORNING SHIFT */}
                  <td style={{ padding: "0.75rem", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={c.hasMorningShift}
                      onChange={(e) => handleUpdateShift(c.groupId, { hasMorningShift: e.target.checked })}
                    />
                  </td>
                  <td style={{ padding: "0.75rem", textAlign: "center" }}>
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
                      style={{ padding: "0.25rem 0.5rem", borderRadius: "6px", border: "1px solid var(--border)", opacity: c.hasMorningShift ? 1 : 0.4 }}
                    />
                  </td>

                  {/* EVENING SHIFT */}
                  <td style={{ padding: "0.75rem", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={c.hasEveningShift}
                      onChange={(e) => handleUpdateShift(c.groupId, { hasEveningShift: e.target.checked })}
                    />
                  </td>
                  <td style={{ padding: "0.75rem", textAlign: "center" }}>
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
                      style={{ padding: "0.25rem 0.5rem", borderRadius: "6px", border: "1px solid var(--border)", opacity: c.hasEveningShift ? 1 : 0.4 }}
                    />
                  </td>

                  {/* STATUS / SAVE */}
                  <td style={{ padding: "0.75rem", textAlign: "center" }}>
                    {savingId === c.groupId ? (
                      <span style={{ fontSize: "0.8rem", color: "#38bdf8" }}>⏳ กำลังบันทึก...</span>
                    ) : (
                      <span style={{ fontSize: "0.8rem", color: "#22c55e" }}>✓ บันทึกอัตโนมัติ</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
