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

const AVATAR_PRESETS = [
  "👮‍♂️", "👮‍♀️", "🛡️", "👑", "🕵️‍♂️", "🚗", "🚨", "👨‍✈️", "👔", "💼", "🏢"
];

export function GuardsPanel({ data, onRefresh }: GuardsPanelProps) {
  const [guards, setGuards] = useState<GuardProfile[]>([]);
  const [recentSenders, setRecentSenders] = useState<RecentSender[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"all" | "regular" | "spares" | "employers" | "discovery">("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showTokenSetting, setShowTokenSetting] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenStatus, setTokenStatus] = useState<{ configured: boolean; valid: boolean; botName?: string; basicId?: string; error?: string } | null>(null);
  const [testingToken, setTestingToken] = useState(false);

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
        setMessage(`🎉 เชื่อมต่อ LINE API สำเร็จ! บอท: ${json.botName || json.basicId} (ระบบเริ่มซิงค์โปรไฟล์ LINE จริง)`);
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
      const res = await fetch(`/api/guards?includeSenders=true&siteId=${encodeURIComponent(selectedSiteId)}`);
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

  const handleAutoSyncGuards = async () => {
    setSyncing(true);
    setMessage("⏳ กำลังเชื่อมต่อ LINE API ดึงชื่อ-รูปโปรไฟล์จริงทุกคนในทุกกลุ่ม LINE...");
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

  const handlePurgePlaceholders = async () => {
    if (!confirm("⚠️ ต้องการโละล้างข้อมูลจำลอง/ชื่อชั่วคราวเก่าทั้งหมดใช่หรือไม่?\n\n(ระบบจะลบเฉพาะรายการจำลองที่ชื่อ 'รปภ. ประจำ...' และไอดีตัวอย่าง เพื่อเตรียมรับโปรไฟล์ LINE จริงของทุกคน)")) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/guards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "wipe_placeholders" }),
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
  }, [selectedSiteId]);

  const openAddModal = (defaultSiteId?: string, senderPrefill?: RecentSender) => {
    setEditingGuard(null);
    const initialSite = defaultSiteId || (senderPrefill?.siteId || (sites[0]?.id ?? ""));
    setFormSiteId(initialSite);
    setFormName(senderPrefill?.guardName || (senderPrefill ? (senderPrefill.displayName || `รปภ. (${senderPrefill.senderKey.slice(0, 6)})`) : ""));
    setFormDisplayName(senderPrefill?.rawUserId || senderPrefill?.senderKey || "");
    setFormPictureUrl(senderPrefill?.pictureUrl || "");
    setFormPhone("");
    setFormShift(senderPrefill?.role === "spare" ? "all" : "all");
    setFormRole(senderPrefill?.role === "spare" ? "spare" : senderPrefill?.role === "employer" ? "employer" : "regular");
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

  // Instant Quick Bind without opening modal
  const handleQuickBind = async (
    sender: RecentSender,
    role: "regular" | "spare" | "head_guard" | "employer",
    shift: "morning" | "evening" | "all",
    isGlobalSpare = false
  ) => {
    const siteIdToUse = isGlobalSpare ? "all" : (sender.siteId || formSiteId || sites[0]?.id || "all");
    const roleLabel = isGlobalSpare 
      ? "สแปร์กลาง (บอทตอบสติกเกอร์)" 
      : role === "employer"
      ? "นายจ้าง/ลูกค้า (บอทเงียบ 100%)"
      : role === "spare" 
      ? "สแปร์ประจำจุด" 
      : shift === "morning" 
      ? "รปภ. กะเช้า" 
      : "รปภ. กะดึก";
    
    const resolvedName = sender.guardName || sender.displayName || (role === "employer" ? `นายจ้าง (${sender.senderKey.slice(0, 6)})` : `รปภ. (${sender.senderKey.slice(0, 6)})`);
    const idToUse = sender.rawUserId || sender.senderKey;

    try {
      const payload = {
        id: idToUse,
        siteId: siteIdToUse,
        guardName: resolvedName,
        displayName: sender.displayName || sender.guardName || resolvedName,
        pictureUrl: sender.pictureUrl || undefined,
        preferredShift: shift,
        role: isGlobalSpare ? "spare" : role,
      };

      const res = await fetch("/api/guards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setMessage(`ผูก "${resolvedName}" เป็น ${roleLabel} สำเร็จแล้ว!`);
        loadGuards();
        onRefresh();
      } else {
        const json = await res.json();
        alert(json.error || "ผูกไม่สำเร็จ");
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการผูกตัวตน");
    }
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
        setMessage(`เปลี่ยนบทบาท "${guard.guardName}" เป็น ${newRole === 'employer' ? '👔 นายจ้าง (บอทเงียบ 100%)' : '👮‍♂️ รปภ. (บอทตอบ)'} สำเร็จ`);
        loadGuards();
        onRefresh();
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการเปลี่ยนบทบาท");
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSiteId || !formName.trim()) {
      alert("กรุณาระบุชื่อจุดและชื่อ รปภ.");
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
    if (!confirm(`ลบหรือปิดใช้งาน “${guard.guardName}” ใช่หรือไม่?`)) return;
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

  // Group by site
  const siteMap = useMemo(() => {
    const map = new Map<string, string>();
    map.set("all", "🌐 สแปร์กลาง (ทุกจุด/ทุกกลุ่ม)");
    sites.forEach((s) => map.set(s.id, s.siteName));
    return map;
  }, [sites]);

  // Filter guards
  const filteredGuards = useMemo(() => {
    return guards.filter((g) => {
      if (activeTab === "spares" && g.role !== "spare" && g.siteId !== "all") return false;
      if (activeTab === "regular" && (g.role === "spare" || g.siteId === "all" || g.role === "employer")) return false;
      if (activeTab === "employers" && g.role !== "employer") return false;
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
  }, [guards, activeTab, search]);

  const globalSparesCount = useMemo(() => {
    return guards.filter((g) => g.role === "spare" || g.siteId === "all").length;
  }, [guards]);

  const employersCount = useMemo(() => {
    return guards.filter((g) => g.role === "employer").length;
  }, [guards]);

  const regularGuardsCount = useMemo(() => {
    return guards.filter((g) => g.role !== "spare" && g.siteId !== "all" && g.role !== "employer").length;
  }, [guards]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* HEADER BAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem", background: "#0b1220", padding: "1.25rem", borderRadius: "14px", border: "1px solid #1e293b" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: "#ffffff", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>👮</span> ทำเนียบ รปภ. จริง & คัดแยกนายจ้าง (Smart Profile & Anti-Spam Classification)
          </h2>
          <p style={{ margin: "0.3rem 0 0 0", color: "#94a3b8", fontSize: "0.85rem" }}>
            ดึงโปรไฟล์ LINE จริงเพื่อคัดแยก <strong>รปภ. (บอทตอบสติกเกอร์เข้าเวร)</strong> ออกจาก <strong>นายจ้าง/คนแปลกหน้า (บอทเงียบ 100% ไม่กวนแชท)</strong>
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            onClick={handleAutoSyncGuards}
            disabled={syncing}
            style={{
              background: syncing ? "#475569" : "linear-gradient(135deg, #10b981, #059669)",
              color: "#ffffff",
              border: "none",
              padding: "0.6rem 1.15rem",
              borderRadius: "8px",
              fontWeight: 900,
              cursor: syncing ? "wait" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              fontSize: "0.9rem",
              boxShadow: "0 4px 12px rgba(16, 185, 129, 0.35)",
            }}
          >
            <span>{syncing ? "⏳" : "⚡"}</span>
            <span>{syncing ? "กำลังดึงโปรไฟล์ LINE..." : "ดึงโปรไฟล์ LINE จริงทุกคน (Live Sync)"}</span>
          </button>

          <button
            onClick={handlePurgePlaceholders}
            disabled={syncing}
            style={{
              background: "transparent",
              color: "#f87171",
              border: "1px solid #dc2626",
              padding: "0.6rem 0.95rem",
              borderRadius: "8px",
              fontWeight: 800,
              cursor: syncing ? "wait" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              fontSize: "0.88rem",
            }}
          >
            <span>🗑️</span>
            <span>โละข้อมูลจำลองเก่า (Reset Placeholders)</span>
          </button>

          <button
            onClick={() => setShowTokenSetting((s) => !s)}
            style={{
              background: tokenStatus?.valid ? "#1e293b" : "#dc2626",
              color: "#ffffff",
              border: `1px solid ${tokenStatus?.valid ? "#334155" : "#ef4444"}`,
              padding: "0.6rem 0.95rem",
              borderRadius: "8px",
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              fontSize: "0.88rem",
            }}
          >
            <span>{tokenStatus?.valid ? "🟢" : "🔑"}</span>
            <span>{tokenStatus?.valid ? `LINE Bot: ${tokenStatus.botName || tokenStatus.basicId || "เชื่อมแล้ว"}` : "ตั้งค่า LINE Token (จำเป็น)"}</span>
          </button>

          <button
            onClick={() => openAddModal()}
            style={{ background: "#0284c7", color: "#ffffff", border: "none", padding: "0.6rem 1.1rem", borderRadius: "8px", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.88rem" }}
          >
            <span>➕</span> เพิ่ม รปภ. / นายจ้าง
          </button>

          <button
            onClick={loadGuards}
            disabled={loading || syncing}
            style={{ background: "#1e293b", color: "#94a3b8", border: "1px solid #334155", padding: "0.6rem 0.9rem", borderRadius: "8px", fontWeight: 700, cursor: "pointer" }}
          >
            {loading ? "🔄..." : "🔄 รีเฟรช"}
          </button>
        </div>
      </div>

      {/* SMART BOT POLICY BANNER */}
      <div style={{ background: "linear-gradient(135deg, #0f172a, #1e1b4b)", border: "1.5px solid #4338ca", borderRadius: "14px", padding: "1rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.3rem" }}>👮‍♂️</span>
            <div>
              <div style={{ fontSize: "0.86rem", fontWeight: 800, color: "#34d399" }}>รปภ. ประจำ / สแปร์กลาง</div>
              <div style={{ fontSize: "0.74rem", color: "#a7f3d0" }}>บอทส่งสติกเกอร์ตอบรับ และบันทึกเวลาเข้าเวร</div>
            </div>
          </div>

          <div style={{ width: "1px", height: "30px", background: "rgba(255,255,255,0.15)" }} />

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.3rem" }}>👔</span>
            <div>
              <div style={{ fontSize: "0.86rem", fontWeight: 800, color: "#f87171" }}>นายจ้าง / ลูกค้า (Employer)</div>
              <div style={{ fontSize: "0.74rem", color: "#fca5a5" }}>บอทเงียบ 100% (งดตอบสติกเกอร์) เพื่อเปิดทางให้เห็นแชทคุยงาน</div>
            </div>
          </div>

          <div style={{ width: "1px", height: "30px", background: "rgba(255,255,255,0.15)" }} />

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.3rem" }}>❓</span>
            <div>
              <div style={{ fontSize: "0.86rem", fontWeight: 800, color: "#cbd5e1" }}>คนแปลกหน้า / ยังไม่ระบุ</div>
              <div style={{ fontSize: "0.74rem", color: "#94a3b8" }}>บอทเงียบ 100% ไม่ตอบอัตโนมัติ</div>
            </div>
          </div>
        </div>
      </div>

      {showTokenSetting && (
        <div style={{ background: "#0f172a", border: "2px solid #6366f1", borderRadius: "14px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.85rem", boxShadow: "0 8px 24px rgba(99, 102, 241, 0.2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, color: "#ffffff", fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span>🔑</span> ตั้งค่า LINE Channel Access Token (เชื่อมต่อดึงชื่อและรูปโปรไฟล์จริง)
            </h3>
            <button onClick={() => setShowTokenSetting(false)} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "1.2rem", fontWeight: 800 }}>✕</button>
          </div>

          <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.5 }}>
            คัดลอก <strong>Channel access token (long-lived)</strong> จาก <a href="https://developers.line.biz/console/" target="_blank" rel="noreferrer" style={{ color: "#38bdf8", textDecoration: "underline" }}>LINE Developers Console</a> (แท็บ Messaging API) มาวางในช่องด้านล่าง แล้วกดบันทึก ระบบจะทดสอบและดึงชื่อจริงพร้อมรูปของ รปภ. ให้ทันทีครับ
          </p>

          <form onSubmit={handleSaveToken} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="วาง LINE Channel Access Token ที่นี่..."
              required
              style={{ flex: 1, minWidth: "280px", background: "#1e293b", border: "1px solid #475569", color: "#ffffff", padding: "0.7rem 1rem", borderRadius: "8px", fontSize: "0.9rem" }}
            />
            <button
              type="submit"
              disabled={testingToken}
              style={{
                background: testingToken ? "#475569" : "linear-gradient(135deg, #6366f1, #4f46e5)",
                color: "#ffffff",
                border: "none",
                padding: "0.7rem 1.4rem",
                borderRadius: "8px",
                fontWeight: 800,
                cursor: testingToken ? "wait" : "pointer",
                fontSize: "0.92rem",
              }}
            >
              {testingToken ? "⏳ กำลังทดสอบ..." : "💾 บันทึกและทดสอบเชื่อมต่อ LINE API"}
            </button>
          </form>

          {tokenStatus && (
            <div style={{ padding: "0.6rem 0.9rem", borderRadius: "8px", background: tokenStatus.valid ? "#064e3b" : "#450a0a", border: `1px solid ${tokenStatus.valid ? "#059669" : "#dc2626"}`, color: tokenStatus.valid ? "#a7f3d0" : "#fca5a5", fontSize: "0.85rem" }}>
              {tokenStatus.valid ? `🟢 เชื่อมต่อบอท: ${tokenStatus.botName || tokenStatus.basicId} (@${tokenStatus.basicId}) สำเร็จ 100%` : `🔴 ${tokenStatus.error || "Token ไม่ถูกต้องหรือหมดอายุ (401)"}`}
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

      {/* FILTER & SITE SWITCHER */}
      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "14px", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: "260px" }}>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 800, color: "#94a3b8", marginBottom: "0.3rem" }}>
              🏢 เลือกดูรายจุดตรวจ (หรือดึงรายชื่อแยกตามกลุ่ม LINE)
            </label>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "0.6rem 0.9rem", borderRadius: "8px", fontSize: "0.92rem", fontWeight: 800 }}
            >
              <option value="all">🌐 ดูทุกจุดตรวจ & สแปร์กลางทั้งหมด ({sites.length} จุด)</option>
              <option value="spares_only">🔄 สแปร์กลาง / สแปร์แทนเวร (เฉพาะสแปร์)</option>
              <option value="employers_only">👔 นายจ้าง / ผู้ว่าจ้าง (เฉพาะนายจ้าง)</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  🏢 {site.siteName} ({site.customerName})
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: "220px" }}>
            <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 800, color: "#94a3b8", marginBottom: "0.3rem" }}>
              🔍 ค้นหาชื่อ รปภ. / นายจ้าง / เบอร์โทร
            </label>
            <input
              type="text"
              placeholder="พิมพ์ชื่อหรือเบอร์เพื่อค้นหา..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "0.6rem 0.9rem", borderRadius: "8px", fontSize: "0.88rem" }}
            />
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", borderTop: "1px solid #1e293b", paddingTop: "0.75rem" }}>
          <button
            onClick={() => setActiveTab("all")}
            style={{
              background: activeTab === "all" ? "#0284c7" : "transparent",
              color: activeTab === "all" ? "#ffffff" : "#94a3b8",
              border: "none",
              padding: "0.45rem 0.85rem",
              borderRadius: "6px",
              fontWeight: 800,
              fontSize: "0.82rem",
              cursor: "pointer",
            }}
          >
            📋 ทั้งหมด ({guards.length})
          </button>
          <button
            onClick={() => setActiveTab("regular")}
            style={{
              background: activeTab === "regular" ? "#10b981" : "transparent",
              color: activeTab === "regular" ? "#ffffff" : "#94a3b8",
              border: "none",
              padding: "0.45rem 0.85rem",
              borderRadius: "6px",
              fontWeight: 800,
              fontSize: "0.82rem",
              cursor: "pointer",
            }}
          >
            👮‍♂️ รปภ. ประจำจุด ({regularGuardsCount})
          </button>
          <button
            onClick={() => setActiveTab("spares")}
            style={{
              background: activeTab === "spares" ? "#38bdf8" : "transparent",
              color: activeTab === "spares" ? "#0f172a" : "#38bdf8",
              border: "none",
              padding: "0.45rem 0.85rem",
              borderRadius: "6px",
              fontWeight: 800,
              fontSize: "0.82rem",
              cursor: "pointer",
            }}
          >
            🌐 สแปร์กลาง ({globalSparesCount})
          </button>
          <button
            onClick={() => setActiveTab("employers")}
            style={{
              background: activeTab === "employers" ? "#f43f5e" : "transparent",
              color: activeTab === "employers" ? "#ffffff" : "#fda4af",
              border: "none",
              padding: "0.45rem 0.85rem",
              borderRadius: "6px",
              fontWeight: 800,
              fontSize: "0.82rem",
              cursor: "pointer",
            }}
          >
            👔 นายจ้าง / ลูกค้า ({employersCount})
          </button>
          <button
            onClick={() => setActiveTab("discovery")}
            style={{
              background: activeTab === "discovery" ? "#8b5cf6" : "transparent",
              color: activeTab === "discovery" ? "#ffffff" : "#c4b5fd",
              border: "none",
              padding: "0.45rem 0.85rem",
              borderRadius: "6px",
              fontWeight: 800,
              fontSize: "0.82rem",
              cursor: "pointer",
            }}
          >
            📡 บัญชีที่ตรวจพบใน LINE ({recentSenders.length})
          </button>
        </div>
      </div>

      {/* DISCOVERY SECTION (GROUP-BY-GROUP LINE DISCOVERY) */}
      {(activeTab === "discovery" || activeTab === "all") && recentSenders.length > 0 && (
        <div style={{ background: "#1e1b4b", border: "1.5px solid #4338ca", borderRadius: "14px", padding: "1.1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "#ffffff", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span>📡</span> ตรวจพบผู้ส่งรายงานในกลุ่ม LINE ({recentSenders.length} บัญชี)
              </span>
              <span style={{ color: "#c7d2fe", fontSize: "0.78rem" }}>
                คลิกปุ่มด้านล่างเพื่อคัดแยกเป็น <strong>รปภ. (บอทตอบ)</strong> หรือ <strong>นายจ้าง (บอทเงียบ 100%)</strong>
              </span>
            </div>

            <button
              onClick={handleAutoSyncGuards}
              disabled={syncing}
              style={{
                background: syncing ? "#475569" : "#4f46e5",
                color: "#ffffff",
                border: "1px solid #818cf8",
                padding: "0.45rem 0.9rem",
                borderRadius: "8px",
                fontWeight: 800,
                fontSize: "0.82rem",
                cursor: syncing ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              <span>{syncing ? "⏳" : "⚡"}</span>
              <span>{syncing ? "กำลังดึงข้อมูล..." : "ดึงโปรไฟล์ LINE จริงทุกคน (Auto-Fetch)"}</span>
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: "0.75rem" }}>
            {recentSenders.slice(0, 30).map((sender) => {
              const isBound = sender.isBound;
              const hasRealName = Boolean(sender.guardName && !sender.guardName.startsWith("รปภ. ประจำ") && !sender.guardName.startsWith("รปภ. สแปร์") && !/^U-[A-F0-9]{16}$/i.test(sender.guardName) && !/^U[0-9a-fA-F]{32}$/i.test(sender.guardName));
              
              const displayTitle = hasRealName 
                ? sender.guardName!
                : (sender.displayName && !/^U-[A-F0-9]{16}$/i.test(sender.displayName) && !/^U[0-9a-fA-F]{32}$/i.test(sender.displayName))
                ? sender.displayName
                : (sender.rawUserId ? `LINE Member (${sender.rawUserId.slice(0, 8)})` : `LINE Member (${sender.senderKey.slice(0, 6)})`);
              
              const isEmployer = sender.role === "employer";
              const isSpare = sender.role === "spare";
              const isRegular = sender.role === "regular" || sender.role === "head_guard";
              const roleTag = isEmployer 
                ? "👔 นายจ้าง (งดตอบบอท)" 
                : isSpare 
                ? "🌐 สแปร์กลาง (บอทตอบ)" 
                : isRegular 
                ? "👮‍♂️ รปภ. (บอทตอบ)" 
                : "❓ ยังไม่ระบุ (บอทเงียบ 100%)";
              const roleTagColor = isEmployer ? "#f43f5e" : isSpare ? "#38bdf8" : isRegular ? "#10b981" : "#94a3b8";

              return (
                <div
                  key={sender.senderKey + sender.groupId}
                  style={{
                    background: isEmployer ? "#20121d" : isBound ? "#1e1e38" : "#312e81",
                    border: `1.5px solid ${isEmployer ? "#f43f5e" : isBound ? "#4b5563" : "#6366f1"}`,
                    borderRadius: "12px",
                    padding: "0.85rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.6rem",
                  }}
                >
                  <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
                    {/* AVATAR */}
                    {sender.pictureUrl && sender.pictureUrl.startsWith("http") ? (
                      <img
                        src={sender.pictureUrl}
                        alt={displayTitle}
                        style={{ width: "44px", height: "44px", borderRadius: "50%", objectFit: "cover", border: `2px solid ${roleTagColor}` }}
                      />
                    ) : (
                      <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: isEmployer ? "#4c0519" : isBound ? "#1e293b" : "#4338ca", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", border: `2px solid ${roleTagColor}` }}>
                        {isEmployer ? "👔" : isBound ? "👮‍♂️" : "👤"}
                      </div>
                    )}

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {displayTitle}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "#a5b4fc", marginTop: "0.1rem" }}>
                        🏢 {sender.siteName || sender.groupName} · ส่งมา {sender.messageCount} ครั้ง
                      </div>
                    </div>

                    <span style={{ background: "rgba(0,0,0,0.3)", color: roleTagColor, border: `1px solid ${roleTagColor}`, padding: "0.15rem 0.45rem", borderRadius: "8px", fontSize: "0.68rem", fontWeight: 800, whiteSpace: "nowrap" }}>
                      {roleTag}
                    </span>
                  </div>

                  {/* 1-CLICK QUICK BIND BUTTONS */}
                  <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "0.45rem" }}>
                    <button
                      onClick={() => handleQuickBind(sender, "regular", "morning")}
                      style={{ background: "#0284c7", color: "#ffffff", border: "none", padding: "0.3rem 0.55rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer" }}
                    >
                      ☀️ ผูกกะเช้า
                    </button>
                    <button
                      onClick={() => handleQuickBind(sender, "regular", "evening")}
                      style={{ background: "#334155", color: "#f1f5f9", border: "1px solid #475569", padding: "0.3rem 0.55rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer" }}
                    >
                      🌙 ผูกกะดึก
                    </button>
                    <button
                      onClick={() => handleQuickBind(sender, "spare", "all", true)}
                      style={{ background: "#4f46e5", color: "#ffffff", border: "none", padding: "0.3rem 0.55rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer" }}
                    >
                      🌐 สแปร์กลาง
                    </button>
                    <button
                      onClick={() => handleQuickBind(sender, "employer", "all")}
                      style={{ background: "#e11d48", color: "#ffffff", border: "none", padding: "0.3rem 0.55rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer" }}
                    >
                      👔 นายจ้าง (งดตอบบอท)
                    </button>
                    <button
                      onClick={() => openAddModal(sender.siteId, sender)}
                      style={{ background: "transparent", border: "1px solid #a5b4fc", color: "#c7d2fe", padding: "0.3rem 0.55rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer", marginLeft: "auto" }}
                    >
                      ✏️ แต่งชื่อ
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* GUARDS & EMPLOYERS DIRECTORY GRID */}
      {activeTab !== "discovery" && (
        <>
          {filteredGuards.length === 0 ? (
            <div style={{ background: "#0b1220", border: "1px dashed #334155", borderRadius: "14px", padding: "3.5rem", textAlign: "center", color: "#64748b" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>👮</div>
              <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#94a3b8" }}>ยังไม่มีข้อมูลในหมวดที่เลือก</div>
              <p style={{ fontSize: "0.85rem", marginTop: "0.3rem" }}>
                กดปุ่ม "ดึงโปรไฟล์ LINE จริงทุกคน" หรือคลิกปุ่มผูกด่วนจากบัญชีที่ส่งรายงานสดด้านบน
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
              {filteredGuards.map((guard) => {
                const isGlobalSpare = guard.siteId === "all" || guard.role === "spare";
                const isEmployer = guard.role === "employer";
                const siteName = guard.siteId === "all" 
                  ? "🌐 สแปร์กลาง (เข้าแทนได้ทุกจุด)" 
                  : (guard.siteName || siteMap.get(guard.siteId) || "ไม่ระบุจุด");
                const shiftLabel = isEmployer 
                  ? "👔 นายจ้าง (ไม่เข้าเวร)" 
                  : guard.preferredShift === "morning" 
                  ? "☀️ กะเช้า" 
                  : guard.preferredShift === "evening" 
                  ? "🌙 กะดึก" 
                  : "🔄 ทั้งสองกะ";
                const roleLabel = isEmployer 
                  ? "👔 นายจ้าง (งดตอบสติกเกอร์)" 
                  : guard.role === "head_guard" 
                  ? "👑 หัวหน้าชุด" 
                  : isGlobalSpare 
                  ? "🌐 สแปร์กลาง (ทุกกลุ่ม)" 
                  : "🛡️ รปภ. ประจำจุด";
                const roleColor = isEmployer ? "#f43f5e" : guard.role === "head_guard" ? "#f59e0b" : isGlobalSpare ? "#38bdf8" : "#10b981";

                return (
                  <div
                    key={guard.id}
                    style={{
                      background: isEmployer ? "#1f131d" : isGlobalSpare ? "#0c1524" : "#0f172a",
                      border: `1.5px solid ${isEmployer ? "#f43f5e" : isGlobalSpare ? "#0284c7" : "#1e293b"}`,
                      borderRadius: "14px",
                      padding: "1rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                      boxShadow: isGlobalSpare ? "0 4px 14px rgba(2, 132, 199, 0.15)" : "0 4px 12px rgba(0,0,0,0.15)",
                    }}
                  >
                    <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                      {/* AVATAR */}
                      {guard.pictureUrl && guard.pictureUrl.startsWith("http") ? (
                        <img
                          src={guard.pictureUrl}
                          alt={guard.guardName}
                          style={{ width: "50px", height: "50px", borderRadius: "50%", objectFit: "cover", border: `2px solid ${roleColor}` }}
                        />
                      ) : (
                        <div style={{ width: "50px", height: "50px", borderRadius: "50%", background: isEmployer ? "#4c0519" : isGlobalSpare ? "#0369a1" : "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", border: `2px solid ${roleColor}` }}>
                          {guard.pictureUrl || (isEmployer ? "👔" : isGlobalSpare ? "🌐" : "👮")}
                        </div>
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#ffffff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {guard.guardName}
                        </div>
                        <div style={{ fontSize: "0.78rem", color: isGlobalSpare ? "#38bdf8" : "#94a3b8", fontWeight: 700 }}>
                          🏢 {siteName}
                        </div>
                      </div>

                      <span style={{ fontSize: "0.72rem", fontWeight: 800, padding: "0.2rem 0.55rem", borderRadius: "12px", border: `1px solid ${roleColor}`, color: roleColor, background: "rgba(0,0,0,0.25)", whiteSpace: "nowrap" }}>
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
                          💬 {guard.displayName}
                        </span>
                      )}
                    </div>

                    {/* ACTIONS & ROLE SWITCHER */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #1e293b", paddingTop: "0.6rem", gap: "0.4rem", flexWrap: "wrap" }}>
                      {/* QUICK ROLE TOGGLE */}
                      {isEmployer ? (
                        <button
                          onClick={() => handleToggleRole(guard, "regular")}
                          style={{ background: "#065f46", color: "#a7f3d0", border: "1px solid #059669", padding: "0.3rem 0.6rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer" }}
                        >
                          👮‍♂️ เปลี่ยนเป็น รปภ. (เปิดบอทตอบ)
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggleRole(guard, "employer")}
                          style={{ background: "#881337", color: "#fecdd3", border: "1px solid #e11d48", padding: "0.3rem 0.6rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer" }}
                        >
                          👔 เปลี่ยนเป็นนายจ้าง (งดตอบบอท)
                        </button>
                      )}

                      <div style={{ display: "flex", gap: "0.4rem", marginLeft: "auto" }}>
                        <button
                          onClick={() => openEditModal(guard)}
                          style={{ background: "#1e293b", border: "1px solid #334155", color: "#cbd5e1", padding: "0.3rem 0.6rem", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer" }}
                        >
                          ✏️ แก้ไข
                        </button>
                        <button
                          onClick={() => handleDelete(guard)}
                          style={{ background: "transparent", border: "1px solid #ef4444", color: "#f87171", padding: "0.3rem 0.5rem", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer" }}
                        >
                          🗑️ ลบ
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* FORM MODAL */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "1rem" }}>
          <div style={{ background: "#0f172a", border: "1.5px solid #334155", borderRadius: "16px", padding: "1.5rem", width: "100%", maxWidth: "500px", boxShadow: "0 10px 25px rgba(0,0,0,0.5)" }}>
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
                    if (val === "all") {
                      setFormRole("spare");
                    }
                  }}
                  required
                  style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "0.55rem", borderRadius: "8px", fontSize: "0.88rem", fontWeight: 700 }}
                >
                  <option value="all" style={{ fontWeight: 800, color: "#38bdf8" }}>🌐 สแปร์กลาง (เข้าแทนได้ทุกจุด / ทุกกลุ่ม LINE)</option>
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
                  placeholder="เช่น นายสมชาย, คุณมานพ (ลูกค้า)"
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
                  <label style={{ display: "block", color: "#94a3b8", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.3rem" }}>บทบาท / สิทธิ์การตอบของบอท *</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as any)}
                    style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "0.55rem", borderRadius: "8px", fontSize: "0.88rem", fontWeight: 700 }}
                  >
                    <option value="regular">🛡️ รปภ. ประจำจุด (บอทตอบสติกเกอร์)</option>
                    <option value="spare">🔄 รปภ. สแปร์กลาง (บอทตอบสติกเกอร์)</option>
                    <option value="head_guard">👑 หัวหน้าชุด (บอทตอบสติกเกอร์)</option>
                    <option value="employer">👔 นายจ้าง / ลูกค้า (งดตอบสติกเกอร์ 100%)</option>
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
                  <label style={{ display: "block", color: "#94a3b8", fontSize: "0.8rem", fontWeight: 700, marginBottom: "0.3rem" }}>LINE User ID / Display Name</label>
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
                  placeholder="หรือวางลิงก์ https://profile.line-scdn.net/..."
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
