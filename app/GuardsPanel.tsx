"use client";

import { useState, useEffect, useMemo } from "react";
import type { DashboardData } from "./page";

type GuardProfile = {
  id: string;
  siteId: string;
  siteName?: string;
  guardName: string;
  displayName: string | null;
  pictureUrl: string | null;
  phoneNumber: string | null;
  preferredShift: "morning" | "evening" | "all";
  role: "regular" | "spare" | "head_guard";
  active: number;
  createdAt: string;
  updatedAt: string;
};

type RecentSender = {
  senderKey: string;
  groupId: string;
  groupName: string;
  lastSeenAt: string;
  messageType?: string;
};

type GuardsPanelProps = {
  data: DashboardData | null;
  onRefresh: () => void;
};

export function GuardsPanel({ data, onRefresh }: GuardsPanelProps) {
  const [guards, setGuards] = useState<GuardProfile[]>([]);
  const [recentSenders, setRecentSenders] = useState<RecentSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  // Form modal state
  const [showModal, setShowModal] = useState(false);
  const [editingGuard, setEditingGuard] = useState<GuardProfile | null>(null);
  const [formSiteId, setFormSiteId] = useState("");
  const [formName, setFormName] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formPictureUrl, setFormPictureUrl] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formShift, setFormShift] = useState<"morning" | "evening" | "all">("all");
  const [formRole, setFormRole] = useState<"regular" | "spare" | "head_guard">("regular");

  const sites = data?.sites || [];

  const loadGuards = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/guards?includeSenders=true");
      if (res.ok) {
        const json = await res.json();
        setGuards(json.guards || []);
        setRecentSenders(json.recentSenders || []);
      }
    } catch {
      setMessage("เกิดข้อผิดพลาดในการโหลดทำเนียบ รปภ.");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadGuards();
  }, []);

  const openAddModal = (defaultSiteId?: string, senderPrefill?: RecentSender) => {
    setEditingGuard(null);
    setFormSiteId(defaultSiteId || (sites[0]?.id ?? ""));
    setFormName(senderPrefill ? `รปภ. (${senderPrefill.senderKey.slice(0, 6)})` : "");
    setFormDisplayName(senderPrefill?.senderKey || "");
    setFormPictureUrl("");
    setFormPhone("");
    setFormShift("all");
    setFormRole("regular");
    setShowModal(true);
  };

  const openEditModal = (guard: GuardProfile) => {
    setEditingGuard(guard);
    setFormSiteId(guard.siteId);
    setFormName(guard.guardName);
    setFormDisplayName(guard.displayName || "");
    setFormPictureUrl(guard.pictureUrl || "");
    setFormPhone(guard.phoneNumber || "");
    setFormShift(guard.preferredShift);
    setFormRole(guard.role);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSiteId || !formName.trim()) {
      alert("กรุณาระบุชื่อจุดและชื่อ รปภ.");
      return;
    }

    try {
      const payload = {
        id: editingGuard?.id,
        siteId: formSiteId,
        guardName: formName.trim(),
        displayName: formDisplayName.trim() || undefined,
        pictureUrl: formPictureUrl.trim() || undefined,
        phoneNumber: formPhone.trim() || undefined,
        preferredShift: formShift,
        role: formRole,
      };

      const res = await fetch("/api/guards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowModal(false);
        setMessage("บันทึกข้อมูล รปภ. เรียบร้อยแล้ว");
        loadGuards();
        onRefresh();
      } else {
        const json = await res.json();
        alert(json.error || "บันทึกไม่สำเร็จ");
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการบันทึก");
    }
  };

  const handleDelete = async (guard: GuardProfile) => {
    if (!confirm(`ลบหรือปิดใช้งาน รปภ. “${guard.guardName}” ใช่หรือไม่?`)) return;
    try {
      const res = await fetch(`/api/guards?id=${encodeURIComponent(guard.id)}`, { method: "DELETE" });
      if (res.ok) {
        setMessage(`ลบ ${guard.guardName} แล้ว`);
        loadGuards();
        onRefresh();
      }
    } catch {
      alert("ลบไม่สำเร็จ");
    }
  };

  // Filter guards
  const filteredGuards = useMemo(() => {
    return guards.filter((g) => {
      if (selectedSiteId !== "all" && g.siteId !== selectedSiteId) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          g.guardName.toLowerCase().includes(q) ||
          (g.siteName && g.siteName.toLowerCase().includes(q)) ||
          (g.phoneNumber && g.phoneNumber.includes(q)) ||
          (g.displayName && g.displayName.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [guards, selectedSiteId, search]);

  // Group by site
  const siteMap = useMemo(() => {
    const map = new Map<string, string>();
    sites.forEach((s) => map.set(s.id, s.siteName));
    return map;
  }, [sites]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* HEADER BAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", background: "#0b1220", padding: "1.25rem", borderRadius: "14px", border: "1px solid #1e293b" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: "#ffffff", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>👮</span> ทำเนียบ รปภ. ประจำจุด (Multi-Guard Directory)
          </h2>
          <p style={{ margin: "0.3rem 0 0 0", color: "#94a3b8", fontSize: "0.85rem" }}>
            จัดการคนประจำ กะเช้า/กะดึก และสแปร์สำรองต่อจุด พร้อมดึงชื่อ-รูป LINE เชื่อมต่อระบบเช็คเข้าเวรอัตโนมัติ (0 Quota)
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => openAddModal()}
            style={{ background: "#0284c7", color: "#ffffff", border: "none", padding: "0.6rem 1.1rem", borderRadius: "8px", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.88rem" }}
          >
            <span>➕</span> เพิ่ม รปภ. ใหม่
          </button>
          <button
            onClick={loadGuards}
            disabled={loading}
            style={{ background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", padding: "0.6rem 0.9rem", borderRadius: "8px", fontWeight: 700, cursor: "pointer" }}
          >
            {loading ? "🔄..." : "🔄 รีเฟรช"}
          </button>
        </div>
      </div>

      {message && (
        <div style={{ background: "#064e3b", color: "#a7f3d0", border: "1px solid #059669", padding: "0.75rem 1rem", borderRadius: "10px", fontSize: "0.9rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>● {message}</span>
          <button onClick={() => setMessage(null)} style={{ background: "transparent", border: "none", color: "#a7f3d0", cursor: "pointer", fontWeight: 800 }}>✕</button>
        </div>
      )}

      {/* QUICK BIND / RECENT SENDER DISCOVERY */}
      {recentSenders.length > 0 && (
        <div style={{ background: "#1e1b4b", border: "1px solid #4338ca", borderRadius: "14px", padding: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 800, color: "#c7d2fe", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span>📡</span> ตรวจพบผู้ส่งรายงานสดใน LINE ล่าสุด ({recentSenders.length} บัญชี) — คลิกเพื่อผูกตัวตนเข้าจุด
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.4rem" }}>
            {recentSenders.slice(0, 8).map((sender) => (
              <div
                key={sender.senderKey + sender.groupId}
                onClick={() => openAddModal(undefined, sender)}
                style={{
                  background: "#312e81",
                  border: "1px solid #4f46e5",
                  borderRadius: "8px",
                  padding: "0.45rem 0.75rem",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontSize: "0.78rem",
                  color: "#e0e7ff",
                }}
              >
                <span>👤</span>
                <span style={{ fontWeight: 700 }}>{sender.groupName}</span>
                <span style={{ color: "#a5b4fc", fontSize: "0.7rem" }}>({sender.senderKey.slice(0, 6)})</span>
                <span style={{ background: "#4338ca", padding: "0.1rem 0.35rem", borderRadius: "4px", fontSize: "0.68rem" }}>+ ผูก</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FILTERS */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="🔍 ค้นหาชื่อ รปภ. / จุด / เบอร์โทร..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: "220px", background: "#0f172a", border: "1px solid #334155", color: "#ffffff", padding: "0.6rem 0.9rem", borderRadius: "8px", fontSize: "0.88rem" }}
        />
        <select
          value={selectedSiteId}
          onChange={(e) => setSelectedSiteId(e.target.value)}
          style={{ background: "#0f172a", border: "1px solid #334155", color: "#ffffff", padding: "0.6rem 0.9rem", borderRadius: "8px", fontSize: "0.88rem", fontWeight: 700 }}
        >
          <option value="all">🏢 จุดตรวจทั้งหมด ({sites.length} จุด)</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.siteName} ({site.customerName})
            </option>
          ))}
        </select>
      </div>

      {/* GUARDS GRID */}
      {filteredGuards.length === 0 ? (
        <div style={{ background: "#0b1220", border: "1px dashed #334155", borderRadius: "14px", padding: "3rem", textAlign: "center", color: "#64748b" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>👮</div>
          <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#94a3b8" }}>ยังไม่มีข้อมูล รปภ. ในจุดที่เลือก</div>
          <p style={{ fontSize: "0.85rem", marginTop: "0.3rem" }}>กดปุ่ม "เพิ่ม รปภ. ใหม่" เพื่อบันทึกคนประจำกะ หรือคลิกเลือกจากบัญชีที่ส่งรายงานล่าสุดด้านบน</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
          {filteredGuards.map((guard) => {
            const siteName = guard.siteName || siteMap.get(guard.siteId) || "ไม่ระบุจุด";
            const shiftLabel = guard.preferredShift === "morning" ? "☀️ กะเช้า" : guard.preferredShift === "evening" ? "🌙 กะดึก" : "🔄 เข้าได้ทุกกะ";
            const roleLabel = guard.role === "head_guard" ? "👑 หัวหน้าชุด" : guard.role === "spare" ? "🔄 สแปร์แทน" : "🛡️ คนประจำ";
            const roleColor = guard.role === "head_guard" ? "#f59e0b" : guard.role === "spare" ? "#38bdf8" : "#10b981";

            return (
              <div
                key={guard.id}
                style={{
                  background: "#0f172a",
                  border: "1px solid #1e293b",
                  borderRadius: "14px",
                  padding: "1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                }}
              >
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  {/* AVATAR */}
                  {guard.pictureUrl ? (
                    <img
                      src={guard.pictureUrl}
                      alt={guard.guardName}
                      style={{ width: "48px", height: "48px", borderRadius: "50%", objectFit: "cover", border: "2px solid #0284c7" }}
                    />
                  ) : (
                    <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", border: "2px solid #334155" }}>
                      👮
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#ffffff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {guard.guardName}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "#38bdf8", fontWeight: 700 }}>
                      🏢 {siteName}
                    </div>
                  </div>

                  <span style={{ fontSize: "0.72rem", fontWeight: 800, padding: "0.2rem 0.55rem", borderRadius: "12px", border: `1px solid ${roleColor}`, color: roleColor, background: "rgba(0,0,0,0.2)" }}>
                    {roleLabel}
                  </span>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", fontSize: "0.78rem" }}>
                  <span style={{ background: "#1e293b", color: "#94a3b8", padding: "0.2rem 0.5rem", borderRadius: "6px" }}>
                    {shiftLabel}
                  </span>
                  {guard.phoneNumber && (
                    <span style={{ background: "#1e293b", color: "#cbd5e1", padding: "0.2rem 0.5rem", borderRadius: "6px" }}>
                      📞 {guard.phoneNumber}
                    </span>
                  )}
                  {guard.displayName && (
                    <span style={{ background: "#1e293b", color: "#a5b4fc", padding: "0.2rem 0.5rem", borderRadius: "6px" }}>
                      💬 LINE: {guard.displayName}
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.4rem", borderTop: "1px solid #1e293b", paddingTop: "0.6rem" }}>
                  <button
                    onClick={() => openEditModal(guard)}
                    style={{ background: "#1e293b", border: "1px solid #334155", color: "#cbd5e1", padding: "0.35rem 0.7rem", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}
                  >
                    ✏️ แก้ไข
                  </button>
                  <button
                    onClick={() => handleDelete(guard)}
                    style={{ background: "transparent", border: "1px solid #ef4444", color: "#f87171", padding: "0.35rem 0.6rem", borderRadius: "6px", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer" }}
                  >
                    🗑️ ลบ
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "1rem" }}>
          <div style={{ background: "#0f172a", border: "1.5px solid #334155", borderRadius: "16px", padding: "1.5rem", width: "100%", maxWidth: "480px", boxShadow: "0 10px 25px rgba(0,0,0,0.5)" }}>
            <h3 style={{ margin: "0 0 1rem 0", color: "#ffffff", fontSize: "1.15rem", fontWeight: 800 }}>
              {editingGuard ? "✏️ แก้ไขข้อมูล รปภ." : "➕ เพิ่ม รปภ. ประจำจุด"}
            </h3>

            <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.3rem" }}>จุดตรวจประจำ *</label>
                <select
                  value={formSiteId}
                  onChange={(e) => setFormSiteId(e.target.value)}
                  required
                  style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "0.55rem", borderRadius: "8px", fontSize: "0.88rem" }}
                >
                  <option value="">-- เลือกจุดตรวจ --</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.siteName} ({s.customerName})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.3rem" }}>ชื่อ-นามสกุลจริง *</label>
                <input
                  type="text"
                  placeholder="เช่น นายสมชาย สายตรวจ"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "0.55rem", borderRadius: "8px", fontSize: "0.88rem" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", color: "#94a3b8", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.3rem" }}>กะประจำ</label>
                  <select
                    value={formShift}
                    onChange={(e) => setFormShift(e.target.value as any)}
                    style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "0.55rem", borderRadius: "8px", fontSize: "0.88rem" }}
                  >
                    <option value="all">🔄 ทั้งสองกะ</option>
                    <option value="morning">☀️ ผลัดเช้า</option>
                    <option value="evening">🌙 ผลัดดึก</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", color: "#94a3b8", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.3rem" }}>ประเภทกำลังพล</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as any)}
                    style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "0.55rem", borderRadius: "8px", fontSize: "0.88rem" }}
                  >
                    <option value="regular">🛡️ คนประจำจุด</option>
                    <option value="spare">🔄 สแปร์แทนเวร</option>
                    <option value="head_guard">👑 หัวหน้าชุด/ป้อม</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", color: "#94a3b8", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.3rem" }}>เบอร์โทรศัพท์</label>
                  <input
                    type="text"
                    placeholder="08X-XXX-XXXX"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "0.55rem", borderRadius: "8px", fontSize: "0.88rem" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", color: "#94a3b8", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.3rem" }}>ชื่อใน LINE / User ID</label>
                  <input
                    type="text"
                    placeholder="ชื่อที่แสดงใน LINE"
                    value={formDisplayName}
                    onChange={(e) => setFormDisplayName(e.target.value)}
                    style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "0.55rem", borderRadius: "8px", fontSize: "0.88rem" }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.3rem" }}>URL รูปโปรไฟล์ (ถ้ามี)</label>
                <input
                  type="text"
                  placeholder="https://profile.line-scdn.net/..."
                  value={formPictureUrl}
                  onChange={(e) => setFormPictureUrl(e.target.value)}
                  style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "0.55rem", borderRadius: "8px", fontSize: "0.88rem" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", marginTop: "1rem" }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{ background: "#334155", color: "#cbd5e1", border: "none", padding: "0.6rem 1rem", borderRadius: "8px", fontWeight: 700, cursor: "pointer" }}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  style={{ background: "#0284c7", color: "#ffffff", border: "none", padding: "0.6rem 1.2rem", borderRadius: "8px", fontWeight: 800, cursor: "pointer" }}
                >
                  💾 บันทึกข้อมูล
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
