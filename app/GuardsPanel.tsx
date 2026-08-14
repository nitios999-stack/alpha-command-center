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
  role: "regular" | "spare" | "head_guard" | "employer";
  active: number;
  createdAt: string;
  updatedAt: string;
};

type RecentSender = {
  senderKey: string;
  rawUserId?: string;
  groupId: string;
  groupName: string;
  siteId?: string;
  siteName?: string;
  lastSeenAt: string;
  messageType?: string;
  lastSummary?: string;
  messageCount: number;
  isBound: boolean;
  guardName?: string;
  displayName?: string;
  pictureUrl?: string | null;
  role?: string;
};

type GuardsPanelProps = {
  data: DashboardData | null;
  onRefresh: () => void;
};

const AVATAR_PRESETS = ["👮‍♂️", "👮‍♀️", "🛡️", "👑", "🕵️‍♂️", "🚗", "🚨", "👨‍✈️", "👔", "💼", "🏢"];

export function GuardsPanel({ data, onRefresh }: GuardsPanelProps) {
  const [guards, setGuards] = useState<GuardProfile[]>([]);
  const [recentSenders, setRecentSenders] = useState<RecentSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"sites" | "employers">("sites");
  const [siteSearch, setSiteSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showTokenSetting, setShowTokenSetting] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenStatus, setTokenStatus] = useState<{ configured: boolean; valid: boolean; botName?: string; basicId?: string; error?: string } | null>(null);
  const [testingToken, setTestingToken] = useState(false);

  // Form modal state
  const [showModal, setShowModal] = useState(false);
  const [editingGuard, setEditingGuard] = useState<GuardProfile | null>(null);
  const [formSiteId, setFormSiteId] = useState("");
  const [formName, setFormName] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formPictureUrl, setFormPictureUrl] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formShift, setFormShift] = useState<"morning" | "evening" | "all">("all");
  const [formRole, setFormRole] = useState<"regular" | "spare" | "head_guard" | "employer">("regular");

  const sites = data?.sites || [];

  const loadGuards = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/guards?includeSenders=true`);
      if (res.ok) {
        const json = await res.json();
        setGuards(json.guards || []);
        setRecentSenders(json.recentSenders || []);
      }
    } catch {
      setMessage("เกิดข้อผิดพลาดในการโหลดข้อมูล");
    }
    setLoading(false);
  };

  const checkTokenStatus = async () => {
    try {
      const res = await fetch("/api/command-center/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "get_line_token_status" }),
      });
      if (res.ok) {
        const json = await res.json();
        setTokenStatus(json);
      }
    } catch {}
  };

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    setTestingToken(true);
    try {
      const res = await fetch("/api/command-center/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "save_line_token", token: tokenInput.trim() }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setMessage(`🎉 เชื่อมต่อ LINE API สำเร็จ! บอท: ${json.botName || json.basicId}`);
        setTokenInput("");
        setShowTokenSetting(false);
        await checkTokenStatus();
        await loadGuards();
        onRefresh();
      } else {
        alert(`❌ ไม่สามารถเชื่อมต่อ Token ได้: ${json.error || "Token ไม่ถูกต้อง"}`);
      }
    } catch {
      alert("❌ เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setTestingToken(false);
  };

  const handleAutoSyncGuards = async () => {
    setSyncing(true);
    setMessage("⏳ กำลังเชื่อมต่อ LINE API ดึงชื่อ-รูปโปรไฟล์จริงทุกคน...");
    try {
      const res = await fetch("/api/guards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto_sync" }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setMessage(`🎉 ${data.message}`);
        await loadGuards();
        onRefresh();
      } else {
        setMessage(`❌ เกิดข้อผิดพลาด: ${data.error || "ไม่สามารถดึงข้อมูลได้"}`);
      }
    } catch {
      setMessage("❌ เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setSyncing(false);
  };

  const handleCleanSlateReset = async () => {
    if (!confirm("⚠️ ต้องการโละล้างประวัติจำลองและแชทเก่าทั้งหมดใช่หรือไม่?\n\n(ระบบจะลบเฉพาะข้อมูลตัวอย่างและรหัสแฮช เพื่อให้รายการสมาชิกแสดงเฉพาะโปรไฟล์ LINE จริงของทุกคน)")) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/guards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "purge_all_legacy" }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setMessage(`🗑️ ${data.message}`);
        await loadGuards();
        onRefresh();
      } else {
        setMessage(`❌ ไม่สามารถล้างได้: ${data.error || "เกิดข้อผิดพลาด"}`);
      }
    } catch {
      setMessage("❌ เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
    setSyncing(false);
  };

  useEffect(() => {
    loadGuards();
    checkTokenStatus();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadGuards();
      }
    }, 8_000);
    return () => window.clearInterval(timer);
  }, []);

  // Set default selected site
  useEffect(() => {
    if (selectedSiteId === "all" && sites.length > 0) {
      setSelectedSiteId(sites[0].id);
    }
  }, [sites, selectedSiteId]);

  const openAddModal = (siteId?: string) => {
    setEditingGuard(null);
    setFormSiteId(siteId || (selectedSiteId !== "all" ? selectedSiteId : sites[0]?.id || ""));
    setFormName("");
    setFormDisplayName("");
    setFormPictureUrl("");
    setFormPhone("");
    setFormShift("all");
    setFormRole(activeTab === "spares" ? "spare" : activeTab === "employers" ? "employer" : "regular");
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

  const handleToggleRole = async (guard: GuardProfile, newRole: "regular" | "spare" | "employer") => {
    try {
      const payload = {
        id: guard.id,
        siteId: newRole === "spare" ? "all" : guard.siteId,
        guardName: guard.guardName,
        displayName: guard.displayName,
        pictureUrl: guard.pictureUrl,
        phoneNumber: guard.phoneNumber,
        preferredShift: guard.preferredShift,
        role: newRole,
      };

      const res = await fetch("/api/guards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setMessage(`เปลี่ยนสถานะ "${guard.guardName}" เป็น ${newRole === 'employer' ? '👔 นายจ้าง (บอทเงียบ 100%)' : '👮‍♂️ รปภ. (เปิดบอทตอบ)'} สำเร็จ`);
        loadGuards();
        onRefresh();
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการเปลี่ยนสถานะ");
    }
  };

  const handleToggleShift = async (guard: GuardProfile, newShift: "morning" | "evening" | "all") => {
    try {
      const payload = {
        id: guard.id,
        siteId: guard.siteId,
        guardName: guard.guardName,
        displayName: guard.displayName,
        pictureUrl: guard.pictureUrl,
        phoneNumber: guard.phoneNumber,
        preferredShift: newShift,
        role: guard.role,
      };

      const res = await fetch("/api/guards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setMessage(`ปรับกะของ "${guard.guardName}" เป็น ${newShift === 'morning' ? '☀️ กะเช้า' : newShift === 'evening' ? '🌙 กะดึก' : '🔄 ทุกกะ'} สำเร็จ`);
        loadGuards();
        onRefresh();
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการเปลี่ยนกะ");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSiteId || !formName.trim()) {
      alert("กรุณาระบุชื่อจุดและชื่อ");
      return;
    }

    try {
      const payload = {
        id: editingGuard?.id || formDisplayName.trim() || undefined,
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
        setMessage("บันทึกข้อมูลเรียบร้อยแล้ว");
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
    if (!confirm(`ลบ “${guard.guardName}” ใช่หรือไม่?`)) return;
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

  const filteredSites = useMemo(() => {
    if (!siteSearch.trim()) return sites;
    const q = siteSearch.toLowerCase();
    return sites.filter((s) => s.siteName.toLowerCase().includes(q) || (s.customerName && s.customerName.toLowerCase().includes(q)));
  }, [sites, siteSearch]);

  const selectedSite = useMemo(() => {
    return sites.find((s) => s.id === selectedSiteId) || null;
  }, [sites, selectedSiteId]);

  const totalEmployersCount = useMemo(() => {
    return guards.filter((g) => g.role === "employer").length;
  }, [guards]);

  // Shift timings per site from database slots
  const siteShiftTimings = useMemo(() => {
    const map = new Map<string, { morning?: string; evening?: string }>();
    if (data?.slots) {
      for (const slot of data.slots) {
        const existing = map.get(slot.siteId) || {};
        if (slot.wave === "morning") existing.morning = slot.deadline;
        if (slot.wave === "evening") existing.evening = slot.deadline;
        map.set(slot.siteId, existing);
      }
    }
    return map;
  }, [data?.slots]);

  // Guards belonging to the selected site (or mapped to this site via webhook events)
  const siteGuards = useMemo(() => {
    if (activeTab === "employers") {
      return [];
    }
    return guards.filter((g) => {
      const belongs = g.siteId === selectedSiteId || (g.siteIds && g.siteIds.includes(selectedSiteId));
      return belongs && g.role !== "employer";
    });
  }, [guards, selectedSiteId, activeTab]);

  // Employers in the selected site (or all employers if activeTab === 'employers')
  const siteEmployers = useMemo(() => {
    if (activeTab === "employers") {
      return guards.filter((g) => g.role === "employer");
    }
    return guards.filter((g) => {
      const belongs = g.siteId === selectedSiteId || (g.siteIds && g.siteIds.includes(selectedSiteId));
      return belongs && g.role === "employer";
    });
  }, [guards, selectedSiteId, activeTab]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* HEADER SECTION */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 900, color: "#ffffff", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>👮‍♂️</span>
            <span>ทำเนียบเจ้าหน้าที่ รปภ. & นายจ้าง (LINE Auto-Sync)</span>
          </h2>
          <p style={{ margin: "0.25rem 0 0 0", color: "#94a3b8", fontSize: "0.85rem" }}>
            ระบบดึงรูปและชื่อโปรไฟล์ LINE จริงของทุกคนอัตโนมัติ และแยกนายจ้าง (บอทเงียบ 100%) กับ รปภ. (เช็คเวร)
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <button
            onClick={() => handleAutoSyncGuards()}
            disabled={syncing}
            style={{
              background: syncing ? "#334155" : "linear-gradient(135deg, #059669, #10b981)",
              color: "#ffffff",
              border: "none",
              padding: "0.55rem 1rem",
              borderRadius: "10px",
              fontWeight: 800,
              cursor: syncing ? "wait" : "pointer",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              boxShadow: "0 4px 14px rgba(16, 185, 129, 0.25)",
            }}
          >
            <span>{syncing ? "⏳" : "🔄"}</span>
            <span>{syncing ? "กำลังดึงโปรไฟล์..." : "ดึงโปรไฟล์ LINE อัตโนมัติ"}</span>
          </button>

          <button
            onClick={() => setShowTokenSetting(!showTokenSetting)}
            style={{
              background: "#1e293b",
              color: tokenStatus?.valid ? "#34d399" : "#cbd5e1",
              border: `1px solid ${tokenStatus?.valid ? "#059669" : "#334155"}`,
              padding: "0.55rem 0.9rem",
              borderRadius: "10px",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <span>🔑</span>
            <span>{tokenStatus?.valid ? `บอท: ${tokenStatus.botName || tokenStatus.basicId}` : "ตั้งค่า LINE Token"}</span>
          </button>

          <button
            onClick={() => handleCleanSlateReset()}
            disabled={syncing}
            style={{
              background: "transparent",
              color: "#f87171",
              border: "1px solid #7f1d1d",
              padding: "0.55rem 0.85rem",
              borderRadius: "10px",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: "0.82rem",
            }}
            title="โละล้างข้อมูลตัวอย่างจำลองเก่า เพื่อเตรียมรับโปรไฟล์ LINE จริง"
          >
            🗑️ โละล้างประวัติจำลอง
          </button>
        </div>
      </div>

      {/* TOKEN SETTINGS MODAL / ACCORDION */}
      {showTokenSetting && (
        <div style={{ background: "#0b1220", border: "1.5px solid #0284c7", borderRadius: "12px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h4 style={{ margin: 0, color: "#38bdf8", fontSize: "1rem", fontWeight: 800 }}>
              🔑 LINE Channel Access Token (สำหรับดึงรูปและชื่อโปรไฟล์ รปภ. / นายจ้าง)
            </h4>
            <button onClick={() => setShowTokenSetting(false)} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "1rem" }}>✕</button>
          </div>
          
          <form onSubmit={handleSaveToken} style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="password"
              placeholder="วาง LINE Channel Access Token (Long-lived)..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              style={{ flex: 1, background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "0.6rem 0.85rem", borderRadius: "8px", fontSize: "0.88rem" }}
            />
            <button
              type="submit"
              disabled={testingToken}
              style={{
                background: "#0284c7",
                color: "#ffffff",
                border: "none",
                padding: "0.6rem 1.25rem",
                borderRadius: "8px",
                fontWeight: 800,
                cursor: testingToken ? "wait" : "pointer",
                fontSize: "0.92rem",
              }}
            >
              {testingToken ? "⏳ ทดสอบ..." : "💾 บันทึกและทดสอบ"}
            </button>
          </form>

          {tokenStatus && (
            <div style={{ padding: "0.6rem 0.9rem", borderRadius: "8px", background: tokenStatus.valid ? "#064e3b" : "#450a0a", border: `1px solid ${tokenStatus.valid ? "#059669" : "#dc2626"}`, color: tokenStatus.valid ? "#a7f3d0" : "#fca5a5", fontSize: "0.85rem" }}>
              {tokenStatus.valid ? `🟢 เชื่อมต่อบอท: ${tokenStatus.botName || tokenStatus.basicId} สำเร็จ` : `🔴 ${tokenStatus.error || "Token ไม่ถูกต้องหรือหมดอายุ"}`}
            </div>
          )}
        </div>
      )}

      {message && (
        <div style={{ background: "#064e3b", color: "#a7f3d0", border: "1px solid #059669", padding: "0.75rem 1rem", borderRadius: "10px", fontSize: "0.9rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>● {message}</span>
          <button onClick={() => setMessage(null)} style={{ background: "transparent", border: "none", color: "#a7f3d0", cursor: "pointer", fontWeight: 800 }}>✕</button>
        </div>
      )}

      {/* MASTER-DETAIL SPLIT LAYOUT */}
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "1.25rem", alignItems: "start" }}>
        
        {/* LEFT COLUMN: SITES & GROUPS LIST */}
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "14px", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "800px", overflowY: "auto" }}>
          
          {/* VIEW TABS */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.35rem", background: "#1e293b", padding: "0.3rem", borderRadius: "8px" }}>
            <button
              onClick={() => setActiveTab("sites")}
              style={{
                background: activeTab === "sites" ? "#0284c7" : "transparent",
                color: activeTab === "sites" ? "#ffffff" : "#94a3b8",
                border: "none",
                padding: "0.45rem 0.2rem",
                borderRadius: "6px",
                fontWeight: 800,
                fontSize: "0.82rem",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              🏢 จุดตรวจ ({sites.length})
            </button>
            <button
              onClick={() => setActiveTab("employers")}
              style={{
                background: activeTab === "employers" ? "#f43f5e" : "transparent",
                color: activeTab === "employers" ? "#ffffff" : "#94a3b8",
                border: "none",
                padding: "0.45rem 0.2rem",
                borderRadius: "6px",
                fontWeight: 800,
                fontSize: "0.82rem",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              👔 นายจ้าง ({totalEmployersCount})
            </button>
          </div>

          {activeTab === "sites" && (
            <>
              {/* SEARCH BOX */}
              <input
                type="text"
                placeholder="🔍 ค้นหาชื่อจุดตรวจ..."
                value={siteSearch}
                onChange={(e) => setSiteSearch(e.target.value)}
                style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "0.55rem 0.75rem", borderRadius: "8px", fontSize: "0.84rem" }}
              />

              {/* SITE LIST ITEMS */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {filteredSites.map((site) => {
                  const isSelected = selectedSiteId === site.id;
                  const siteGuardsCount = guards.filter((g) => (g.siteId === site.id || (g.siteIds && g.siteIds.includes(site.id))) && g.role !== "employer").length;
                  const siteEmpCount = guards.filter((g) => (g.siteId === site.id || (g.siteIds && g.siteIds.includes(site.id))) && g.role === "employer").length;

                  return (
                    <div
                      key={site.id}
                      onClick={() => setSelectedSiteId(site.id)}
                      style={{
                        background: isSelected ? "linear-gradient(135deg, #1e293b, #0f172a)" : "#131c2e",
                        border: `1.5px solid ${isSelected ? "#38bdf8" : "#1e293b"}`,
                        borderRadius: "10px",
                        padding: "0.75rem 0.85rem",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.25rem",
                        transition: "all 0.15s ease",
                        boxShadow: isSelected ? "0 4px 12px rgba(56, 189, 248, 0.15)" : "none",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "0.88rem", fontWeight: 800, color: isSelected ? "#38bdf8" : "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          🏢 {site.siteName}
                        </span>
                        {isSelected && <span style={{ color: "#38bdf8", fontSize: "0.8rem" }}>▶</span>}
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.72rem", color: "#94a3b8" }}>
                        <span>{site.customerName || "กลุ่ม LINE"}</span>
                        <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
                          {siteGuardsCount > 0 && (
                            <span style={{ background: "#064e3b", color: "#a7f3d0", padding: "0.1rem 0.35rem", borderRadius: "6px", fontWeight: 800 }}>
                              👮 {siteGuardsCount}
                            </span>
                          )}
                          {siteEmpCount > 0 && (
                            <span style={{ background: "#4c0519", color: "#fecdd3", padding: "0.1rem 0.35rem", borderRadius: "6px", fontWeight: 800 }}>
                              👔 {siteEmpCount}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* SHIFT TIMINGS TAGS */}
                      {(() => {
                        const timings = siteShiftTimings.get(site.id);
                        if (!timings || (!timings.morning && !timings.evening)) return null;
                        return (
                          <div style={{ display: "flex", gap: "0.4rem", fontSize: "0.68rem", color: "#cbd5e1", marginTop: "0.15rem", borderTop: "1px dashed rgba(255,255,255,0.06)", paddingTop: "0.25rem" }}>
                            {timings.morning && <span style={{ color: "#fde047" }}>☀️ {timings.morning}</span>}
                            {timings.evening && <span style={{ color: "#a5b4fc" }}>🌙 {timings.evening}</span>}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {activeTab === "employers" && (
            <div style={{ color: "#94a3b8", fontSize: "0.82rem", lineHeight: 1.5, padding: "0.5rem 0" }}>
              💡 <strong>นายจ้าง / ลูกค้า</strong> เมื่อส่งข้อความหรือถามงานในกลุ่ม บอทจะ <strong>งดส่งสติกเกอร์ 100%</strong> เพื่อไม่ให้กลบแชท
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: SITE MEMBERS DETAIL */}
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "14px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          
          {/* DETAIL HEADER */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.75rem", borderBottom: "1px solid #1e293b", paddingBottom: "0.85rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "#ffffff", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span>{activeTab === "employers" ? "👔 รายชื่อนายจ้าง / ลูกค้าทั้งหมด" : `🏢 ${selectedSite?.siteName || "เลือกจุดตรวจ"}`}</span>
              </h3>
              
              {activeTab === "sites" && selectedSite && (
                <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>ลูกค้า: {selectedSite.customerName || "ทั่วไป"}</span>
                  
                  {/* SHIFT TIMINGS BANNER (LOADED DIRECTLY FROM DATABASE) */}
                  {(() => {
                    const timings = siteShiftTimings.get(selectedSiteId);
                    const morningTime = timings?.morning || "07:00";
                    const eveningTime = timings?.evening || "19:00";
                    return (
                      <div style={{ display: "flex", gap: "0.5rem", background: "#0b1220", padding: "0.25rem 0.6rem", borderRadius: "6px", border: "1px solid #1e293b", fontSize: "0.76rem" }}>
                        <span style={{ color: "#fde047", fontWeight: 700 }}>☀️ กะเช้า ({morningTime})</span>
                        <span style={{ color: "#475569" }}>|</span>
                        <span style={{ color: "#a5b4fc", fontWeight: 700 }}>🌙 กะดึก ({eveningTime})</span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            <button
              onClick={() => openAddModal(selectedSiteId !== "all" ? selectedSiteId : undefined)}
              style={{ background: "#0284c7", color: "#ffffff", border: "none", padding: "0.5rem 0.95rem", borderRadius: "8px", fontWeight: 800, cursor: "pointer", fontSize: "0.84rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
            >
              <span>➕</span>
              <span>เพิ่มคนในจุดนี้</span>
            </button>
          </div>

          {/* MEMBERS LIST */}
          {siteGuards.length === 0 && siteEmployers.length === 0 ? (
            <div style={{ background: "#0b1220", border: "1px dashed #334155", borderRadius: "12px", padding: "3rem 1.5rem", textAlign: "center", color: "#64748b" }}>
              <div style={{ fontSize: "2rem", marginBottom: "0.4rem" }}>👤</div>
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#94a3b8" }}>ยังไม่มีรายชื่อที่ลงทะเบียนในจุดนี้</div>
              <p style={{ fontSize: "0.8rem", marginTop: "0.25rem", color: "#64748b" }}>
                เมื่อมี รปภ. หรือนายจ้างส่งข้อความในกลุ่ม LINE ระบบจะดึงโปรไฟล์จริงมาให้อัตโนมัติ หรือกดปุ่ม "เพิ่มคนในจุดนี้" เพื่อลงทะเบียนล่วงหน้า
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              
              {/* GUARDS SECTION */}
              {siteGuards.length > 0 && (
                <div>
                  <div style={{ fontSize: "0.82rem", fontWeight: 800, color: "#34d399", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <span>👮‍♂️</span>
                    <span>รปภ. ประจำจุด ({siteGuards.length} นาย) — บอทตอบรับเวลาเข้าเวร</span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.75rem" }}>
                    {siteGuards.map((guard) => {
                      const shiftLabel = guard.preferredShift === "morning" ? "☀️ กะเช้า" : guard.preferredShift === "evening" ? "🌙 กะดึก" : "🔄 ทุกกะ";

                      return (
                        <div
                          key={guard.id}
                          style={{
                            background: "#131f37",
                            border: "1.5px solid #10b981",
                            borderRadius: "12px",
                            padding: "0.85rem",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.6rem",
                          }}
                        >
                          <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
                            {guard.pictureUrl && guard.pictureUrl.startsWith("http") ? (
                              <img src={guard.pictureUrl} alt={guard.guardName} style={{ width: "44px", height: "44px", borderRadius: "50%", objectFit: "cover", border: "2px solid #10b981" }} />
                            ) : (
                              <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", border: "2px solid #10b981" }}>
                                {guard.pictureUrl || "👮‍♂️"}
                              </div>
                            )}

                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {guard.guardName}
                              </div>
                              <div style={{ fontSize: "0.74rem", color: "#a7f3d0", fontWeight: 700 }}>
                                {shiftLabel}
                              </div>
                            </div>
                          </div>

                          {guard.displayName && (
                            <div style={{ fontSize: "0.72rem", color: "#94a3b8", background: "#0b1220", padding: "0.25rem 0.5rem", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span>💬 LINE: {guard.displayName}</span>
                              {guard.siteIds && guard.siteIds.length > 1 && (
                                <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: "0.68rem" }}>
                                  🌐 ส่งใน {guard.siteIds.length} จุด
                                </span>
                              )}
                            </div>
                          )}

                          {/* SHIFT & ACTION CONTROLS */}
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "0.5rem" }}>
                            {/* SHIFT SELECTOR */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.1fr", gap: "0.25rem" }}>
                              <button
                                onClick={() => handleToggleShift(guard, "morning")}
                                style={{
                                  background: guard.preferredShift === "morning" ? "#eab308" : "#1e293b",
                                  color: guard.preferredShift === "morning" ? "#713f12" : "#94a3b8",
                                  border: "none",
                                  padding: "0.28rem 0.2rem",
                                  borderRadius: "6px",
                                  fontSize: "0.7rem",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                  textAlign: "center",
                                }}
                              >
                                ☀️ กะเช้า
                              </button>
                              <button
                                onClick={() => handleToggleShift(guard, "evening")}
                                style={{
                                  background: guard.preferredShift === "evening" ? "#6366f1" : "#1e293b",
                                  color: guard.preferredShift === "evening" ? "#ffffff" : "#94a3b8",
                                  border: "none",
                                  padding: "0.28rem 0.2rem",
                                  borderRadius: "6px",
                                  fontSize: "0.7rem",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                  textAlign: "center",
                                }}
                              >
                                🌙 กะดึก
                              </button>
                              <button
                                onClick={() => handleToggleShift(guard, "all")}
                                style={{
                                  background: guard.preferredShift === "all" ? "#0284c7" : "#1e293b",
                                  color: guard.preferredShift === "all" ? "#ffffff" : "#94a3b8",
                                  border: "none",
                                  padding: "0.28rem 0.2rem",
                                  borderRadius: "6px",
                                  fontSize: "0.7rem",
                                  fontWeight: 800,
                                  cursor: "pointer",
                                  textAlign: "center",
                                }}
                              >
                                🔄 ทุกกะ
                              </button>
                            </div>

                            {/* ROLE & EDIT BUTTONS */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.3rem" }}>
                              <button
                                onClick={() => handleToggleRole(guard, "employer")}
                                style={{ background: "#881337", color: "#fecdd3", border: "1px solid #e11d48", padding: "0.25rem 0.55rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer" }}
                              >
                                👔 ปรับเป็นนายจ้าง
                              </button>

                              <div style={{ display: "flex", gap: "0.3rem" }}>
                                <button
                                  onClick={() => openEditModal(guard)}
                                  style={{ background: "#1e293b", border: "1px solid #334155", color: "#cbd5e1", padding: "0.25rem 0.5rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}
                                >
                                  ✏️ แก้ไข
                                </button>
                                <button
                                  onClick={() => handleDelete(guard)}
                                  style={{ background: "transparent", border: "1px solid #ef4444", color: "#f87171", padding: "0.25rem 0.45rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* EMPLOYERS SECTION */}
              {siteEmployers.length > 0 && (
                <div style={{ marginTop: siteGuards.length > 0 ? "0.75rem" : 0 }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 800, color: "#f87171", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <span>👔</span>
                    <span>นายจ้าง / ลูกค้าในกลุ่มนี้ ({siteEmployers.length} คน) — บอทเงียบ 100%</span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.75rem" }}>
                    {siteEmployers.map((emp) => (
                      <div
                        key={emp.id}
                        style={{
                          background: "#20121d",
                          border: "1.5px solid #f43f5e",
                          borderRadius: "12px",
                          padding: "0.85rem",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.6rem",
                        }}
                      >
                        <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
                          {emp.pictureUrl && emp.pictureUrl.startsWith("http") ? (
                            <img src={emp.pictureUrl} alt={emp.guardName} style={{ width: "44px", height: "44px", borderRadius: "50%", objectFit: "cover", border: "2px solid #f43f5e" }} />
                          ) : (
                            <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "#4c0519", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", border: "2px solid #f43f5e" }}>
                              {emp.pictureUrl || "👔"}
                            </div>
                          )}

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {emp.guardName}
                            </div>
                            <div style={{ fontSize: "0.74rem", color: "#fca5a5", fontWeight: 700 }}>
                              นายจ้าง / ผู้ว่าจ้าง (บอทเงียบ 100%)
                            </div>
                          </div>
                        </div>

                        {/* ACTION BUTTONS */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "0.5rem", gap: "0.3rem" }}>
                          <button
                            onClick={() => handleToggleRole(emp, "regular")}
                            style={{ background: "#065f46", color: "#a7f3d0", border: "1px solid #059669", padding: "0.25rem 0.55rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer" }}
                          >
                            👮‍♂️ ปรับเป็น รปภ.
                          </button>

                          <div style={{ display: "flex", gap: "0.3rem" }}>
                            <button
                              onClick={() => openEditModal(emp)}
                              style={{ background: "#1e293b", border: "1px solid #334155", color: "#cbd5e1", padding: "0.25rem 0.5rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}
                            >
                              ✏️ แก้ไข
                            </button>
                            <button
                              onClick={() => handleDelete(emp)}
                              style={{ background: "transparent", border: "1px solid #ef4444", color: "#f87171", padding: "0.25rem 0.45rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* FORM MODAL */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "1rem" }}>
          <div style={{ background: "#0f172a", border: "1.5px solid #334155", borderRadius: "16px", padding: "1.5rem", width: "100%", maxWidth: "480px", boxShadow: "0 10px 25px rgba(0,0,0,0.5)" }}>
            <h3 style={{ margin: "0 0 1rem 0", color: "#ffffff", fontSize: "1.15rem", fontWeight: 800 }}>
              {editingGuard ? "✏️ แก้ไขข้อมูล" : "➕ เพิ่ม รปภ. / นายจ้าง"}
            </h3>

            <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.3rem" }}>จุดตรวจประจำ / สังกัด *</label>
                <select
                  value={formSiteId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormSiteId(val);
                    if (val === "all") setFormRole("spare");
                  }}
                  required
                  style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "0.55rem", borderRadius: "8px", fontSize: "0.88rem", fontWeight: 700 }}
                >
                  <option value="all" style={{ fontWeight: 800, color: "#38bdf8" }}>🌐 สแปร์กลาง (เข้าแทนได้ทุกจุด)</option>
                  <option disabled>──────────────────────────</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.siteName} ({s.customerName})</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.3rem" }}>ชื่อ-นามสกุล หรือชื่อเรียก *</label>
                <input
                  type="text"
                  placeholder="เช่น นายสมชาย (รปภ.), คุณมานพ (ลูกค้า)"
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
                    <option value="all">🔄 ทั้งสองกะ / สแปร์</option>
                    <option value="morning">☀️ ผลัดเช้า</option>
                    <option value="evening">🌙 ผลัดดึก</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", color: "#94a3b8", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.3rem" }}>บทบาท / สิทธิ์บอท *</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as any)}
                    style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "0.55rem", borderRadius: "8px", fontSize: "0.88rem", fontWeight: 700 }}
                  >
                    <option value="regular">🛡️ รปภ. ประจำจุด (บอทตอบ)</option>
                    <option value="spare">🔄 รปภ. สแปร์กลาง (บอทตอบ)</option>
                    <option value="employer">👔 นายจ้าง / ลูกค้า (งดตอบ 100%)</option>
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
                  <label style={{ display: "block", color: "#94a3b8", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.3rem" }}>LINE User ID / ชื่อไลน์</label>
                  <input
                    type="text"
                    placeholder="เช่น U4af... หรือชื่อไลน์"
                    value={formDisplayName}
                    onChange={(e) => setFormDisplayName(e.target.value)}
                    style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "0.55rem", borderRadius: "8px", fontSize: "0.88rem" }}
                  />
                </div>
              </div>

              {/* AVATAR SELECTOR */}
              <div>
                <label style={{ display: "block", color: "#94a3b8", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.3rem" }}>เลือกไอคอน หรือใส่ URL รูปโปรไฟล์</label>
                <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.4rem" }}>
                  {AVATAR_PRESETS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => setFormPictureUrl(icon)}
                      style={{
                        fontSize: "1.2rem",
                        padding: "0.3rem 0.5rem",
                        background: formPictureUrl === icon ? "#0284c7" : "#1e293b",
                        border: "1px solid #334155",
                        borderRadius: "8px",
                        cursor: "pointer",
                      }}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="หรือวางลิงก์รูป https://..."
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
