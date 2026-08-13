"use client";

import { useState, useEffect } from "react";

export function StickersPanel() {
  const [loading, setLoading] = useState(true);
  const [presets, setPresets] = useState<any[]>([]);
  const [configs, setConfigs] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/line/stickers/configs");
      if (res.ok) {
        const data = await res.json();
        setPresets(data.presets || []);
        setConfigs(data.configs || []);
        setGroups(data.groups || []);
        setQueue(data.queue || []);
        setAudit(data.audit || []);
      } else {
        setMessage("ไม่สามารถโหลดข้อมูลสติกเกอร์ได้");
      }
    } catch {
      setMessage("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const toggleGroup = (id: string) => {
    setSelectedGroups((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  };

  const selectAll = () => {
    if (selectedGroups.length === groups.length) {
      setSelectedGroups([]);
    } else {
      setSelectedGroups(groups.map((g) => g.id));
    }
  };

  const handleManualBatch = async () => {
    if (selectedGroups.length === 0) return;
    const pkgId = "11538";
    const stkId = "51626520";
    if (!confirm(`ยืนยันการส่งสติกเกอร์ (Brown & Friends ตะเบ๊ะ) ไปยัง ${selectedGroups.length} กลุ่มที่เลือกพร้อมกันหรือไม่?`)) return;

    setMessage("กำลังส่งสติกเกอร์...");
    try {
      const res = await fetch("/api/line/stickers/manual-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupIds: selectedGroups,
          stickerPackageId: pkgId,
          stickerId: stkId,
          idempotencyKey: "batch-" + Date.now(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessage(`✅ จัดส่งสติกเกอร์ไปยัง ${data.totalSent} กลุ่มเรียบร้อยแล้ว`);
        setSelectedGroups([]);
        await fetchData();
      } else {
        const err = await res.json();
        setMessage(`❌ เกิดข้อผิดพลาด: ${err.error}`);
      }
    } catch {
      setMessage("❌ เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
  };

  if (loading) return <section className="line-control"><p>กำลังโหลดข้อมูลสติกเกอร์...</p></section>;

  return (
    <section className="line-control" style={{ marginTop: "1rem" }}>
      {message && (
        <div className="notice" role="status" style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span>ℹ️</span> {message}
          <button onClick={() => setMessage(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* HERO SECTION */}
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "white", padding: "1.75rem", borderRadius: "16px", marginBottom: "1.5rem", boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", padding: "0.25rem 0.6rem", borderRadius: "20px", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
              <span>🐻</span> LINE OFFICIAL STICKERS
            </div>
            <h2 style={{ fontSize: "1.65rem", margin: "0.2rem 0 0.5rem", fontWeight: 800 }}>ศูนย์ควบคุมสติกเกอร์ตอบรับอัตโนมัติ</h2>
            <p style={{ color: "#94a3b8", fontSize: "0.95rem", maxWidth: "650px", margin: 0 }}>
              ระบบส่งสติกเกอร์มาตรฐาน Brown & Friends ตะเบ๊ะ (Package 11538 / Sticker 51626520) ปิดท้ายรายงาน 35 วิ ฟรี 100%
            </p>
          </div>
          <button
            onClick={fetchData}
            style={{ background: "#334155", color: "white", border: "1px solid #475569", padding: "0.55rem 1rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            🔄 รีเฟรชข้อมูล
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1.25rem", marginBottom: "1.5rem" }}>
        {/* MANUAL BATCH SEND */}
        <div className="card" style={{ padding: "1.25rem", borderRadius: "14px", border: "1px solid var(--border)", background: "white" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem" }}>📲 ส่งสติกเกอร์แบบกลุ่ม (Manual Batch)</h3>
            <button onClick={selectAll} style={{ background: "none", border: "none", color: "#0284c7", fontWeight: 700, fontSize: "0.85rem", cursor: "pointer" }}>
              {selectedGroups.length === groups.length ? "ยกเลิกเลือกทั้งหมด" : "เลือกทั้งหมด"}
            </button>
          </div>
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: "0 0 0.75rem" }}>
            เลือกกลุ่มที่ต้องการให้บอตส่งสติกเกอร์ตอบรับเข้าไปทันทีในรอบถัดไป
          </p>

          <div style={{ maxHeight: "240px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "0.5rem", marginBottom: "1rem" }}>
            {groups.map((g) => (
              <label
                key={g.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  padding: "0.4rem 0.5rem",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  background: selectedGroups.includes(g.id) ? "rgba(56, 189, 248, 0.08)" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedGroups.includes(g.id)}
                  onChange={() => toggleGroup(g.id)}
                  style={{ width: "16px", height: "16px", cursor: "pointer" }}
                />
                <span style={{ fontWeight: 600, color: "#0f172a" }}>{g.group_name || "กลุ่มไม่ระบุชื่อ"}</span>
              </label>
            ))}
          </div>

          <button
            onClick={handleManualBatch}
            disabled={selectedGroups.length === 0}
            className="btn btn-primary"
            style={{ width: "100%", padding: "0.65rem", borderRadius: "8px", fontWeight: 700, cursor: "pointer" }}
          >
            🚀 ส่งสติกเกอร์ให้ {selectedGroups.length} กลุ่มที่เลือก
          </button>
        </div>

        {/* ACTIVE STICKER PRESET INFO */}
        <div className="card" style={{ padding: "1.25rem", borderRadius: "14px", border: "1px solid var(--border)", background: "white" }}>
          <h3 style={{ margin: "0 0 0.75rem", fontSize: "1.1rem" }}>🐻 สติกเกอร์ทางการที่ใช้งานอยู่</h3>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", background: "#f8fafc", padding: "1rem", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "1rem" }}>
            <div style={{ width: "60px", height: "60px", background: "white", borderRadius: "10px", display: "grid", placeItems: "center", fontSize: "2rem", border: "1px solid #cbd5e1" }}>
              🫡
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "#0f172a" }}>Brown & Friends (ตะเบ๊ะ / รับทราบ)</div>
              <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.2rem" }}>
                Package: <code>11538</code> · Sticker: <code>51626520</code>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 700, marginTop: "0.25rem" }}>
                ✓ รองรับ LINE Messaging API 100%
              </div>
            </div>
          </div>

          <div style={{ fontSize: "0.85rem", color: "#475569", lineHeight: 1.6 }}>
            💡 <strong>เงื่อนไขการส่งสติกเกอร์:</strong>
            <ul style={{ margin: "0.3rem 0 0", paddingLeft: "1.2rem" }}>
              <li>ส่งอัตโนมัติหลังรูป/ข้อความสุดท้าย <strong>35 วินาที</strong></li>
              <li>ใช้ LINE Reply Token <strong>ฟรี 100%</strong> ไม่เสียโควต้าข้อความ</li>
              <li>ไม่ตอบกลับสติกเกอร์ของ รปภ. (ป้องกันลูป)</li>
              <li>กลุ่มสั่งการล็อกปิดสติกเกอร์อัตโนมัติ</li>
            </ul>
          </div>
        </div>
      </div>

      {/* AUDIT LOG TABLE */}
      <div className="card" style={{ borderRadius: "14px", overflow: "hidden", border: "1px solid var(--border)", background: "white" }}>
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem" }}>📋 ประวัติการตอบกลับล่าสุด (Outbound Audit Log)</h3>
          <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>{audit.length} รายการ</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "0.75rem 1rem", textAlign: "left" }}>เวลา</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "left" }}>กลุ่ม</th>
                <th style={{ padding: "0.75rem 0.75rem", textAlign: "center" }}>ประเภท</th>
                <th style={{ padding: "0.75rem 0.75rem", textAlign: "center" }}>สถานะ</th>
                <th style={{ padding: "0.75rem 1rem", textAlign: "left" }}>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {audit.slice(0, 15).map((a) => {
                const g = groups.find((x) => x.id === a.group_id);
                return (
                  <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "0.6rem 1rem", color: "var(--muted)" }}>
                      {a.created_at ? new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(a.created_at)) : "-"}
                    </td>
                    <td style={{ padding: "0.6rem 1rem", fontWeight: 600 }}>{g ? g.group_name : a.group_id}</td>
                    <td style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>
                      <span style={{ background: "#f1f5f9", padding: "0.15rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem" }}>
                        {a.action_type}
                      </span>
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>
                      <span
                        style={{
                          background: a.status === "sent" ? "#dcfce7" : a.status === "failed" ? "#fee2e2" : "#fef9c3",
                          color: a.status === "sent" ? "#15803d" : a.status === "failed" ? "#b91c1c" : "#a16207",
                          padding: "0.15rem 0.5rem",
                          borderRadius: "4px",
                          fontWeight: 700,
                          fontSize: "0.75rem",
                        }}
                      >
                        {a.status === "sent" ? "✓ ส่งสำเร็จ" : a.status === "failed" ? "✕ ล้มเหลว" : "ข้าม"}
                      </span>
                    </td>
                    <td style={{ padding: "0.6rem 1rem", color: "var(--muted)" }}>{a.skip_reason || "-"}</td>
                  </tr>
                );
              })}
              {audit.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
                    ยังไม่มีประวัติการส่งสติกเกอร์
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
