"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import type { DashboardData } from "./page";

type GuardProfile = {
  id: string;
  siteId: string;
  siteIds?: string[];
  siteName?: string;
  guardName: string;
  displayName: string | null;
  pictureUrl: string | null;
  phoneNumber: string | null;
  preferredShift: "morning" | "evening" | "all";
  role: "regular" | "spare" | "head_guard" | "employer" | "inspector" | "unconfirmed";
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
  const [activeTab, setActiveTab] = useState<"unconfirmed" | "sites" | "inspectors" | "employers">("unconfirmed");
  const [siteMemberFilter, setSiteMemberFilter] = useState<"all" | "guards" | "inspectors" | "unconfirmed" | "employers">("all");
  const [siteSearch, setSiteSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");
  const [showTokenSetting, setShowTokenSetting] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenStatus, setTokenStatus] = useState<{ configured: boolean; valid: boolean; botName?: string; basicId?: string; error?: string } | null>(null);
  const [testingToken, setTestingToken] = useState(false);

  // In-flight race condition guard
  const lastRequestTimeRef = useRef<number>(0);

  // Form modal state
  const [showModal, setShowModal] = useState(false);
  const [editingGuard, setEditingGuard] = useState<GuardProfile | null>(null);
  const [formSiteId, setFormSiteId] = useState("");
  const [formName, setFormName] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formPictureUrl, setFormPictureUrl] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formShift, setFormShift] = useState<"morning" | "evening" | "all">("all");
  const [formRole, setFormRole] = useState<"regular" | "spare" | "head_guard" | "employer" | "inspector" | "unconfirmed">("regular");

  const sites = data?.sites || [];

  const loadGuards = async (silent = false) => {
    if (!silent) setLoading(true);
    const reqTime = Date.now();
    try {
      const res = await fetch(`/api/guards?includeSenders=true`);
      if (res.ok) {
        const json = await res.json();
        // Only apply if this response is newer than any recent local user mutation or newer fetch
        if (reqTime >= lastRequestTimeRef.current) {
          lastRequestTimeRef.current = reqTime;
          setGuards(json.guards || []);
          setRecentSenders(json.recentSenders || []);
          setLastSyncTime(new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        }
      }
    } catch {
      if (!silent) setMessage("เกิดข้อผิดพลาดในการโหลดข้อมูล");
    }
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    loadGuards(false);
    checkTokenStatus();

    // Single unified polling interval (every 15 seconds, only when tab is visible)
    const pollInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadGuards(true);
      }
    }, 15000);

    return () => clearInterval(pollInterval);
  }, []);

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
    setFormRole(activeTab === "employers" ? "employer" : "regular");
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

  // Instant Optimistic Role Toggle
  const handleToggleRole = async (guard: GuardProfile, newRole: "regular" | "spare" | "employer" | "inspector" | "unconfirmed") => {
    const previousGuards = guards;
    lastRequestTimeRef.current = Date.now();

    const roleText = newRole === "employer" 
      ? "👔 นายจ้าง / ลูกค้า (บอทเงียบ 100%)" 
      : newRole === "inspector"
      ? "🔍 สายตรวจ / หัวหน้าสายตรวจ (บอทเงียบ 100%)"
      : newRole === "unconfirmed"
      ? "⏳ สมาชิกใหม่ / รอยืนยัน"
      : "👮‍♂️ รปภ. ประจำจุด (เปิดบอทตอบ)";

    // 1. Instant optimistic local update
    setGuards((prev) =>
      prev.map((g) =>
        g.id === guard.id
          ? { ...g, role: newRole, siteId: newRole === "spare" ? "all" : g.siteId }
          : g
      )
    );
    setMessage(`เปลี่ยนสถานะ "${guard.guardName}" เป็น ${roleText} สำเร็จ`);

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

      if (!res.ok) {
        // Rollback on server error
        setGuards(previousGuards);
        alert("เกิดข้อผิดพลาดในการเปลี่ยนสถานะ (ย้อนกลับค่าเดิม)");
      }
    } catch {
      setGuards(previousGuards);
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    }
  };

  // Batch update all visible members in current site to guard or employer
  const handleBatchSetRole = async (targetRole: "regular" | "employer") => {
    const currentMembers = activeTab === "employers" ? siteEmployers : [...siteGuards, ...siteEmployers];
    if (!currentMembers.length) return;
    const targetLabel = targetRole === "employer" ? "👔 บุคคลทั่วไป / นายจ้าง (บอทเงียบ 100%)" : "👮‍♂️ รปภ. ประจำจุด (เปิดบอทตอบ)";
    if (!confirm(`ต้องการปรับสมาชิกทั้งหมดในรายการนี้ (${currentMembers.length} คน) เป็น ${targetLabel} ใช่หรือไม่?`)) return;

    const previousGuards = guards;
    lastRequestTimeRef.current = Date.now();

    const memberIds = new Set(currentMembers.map((m) => m.id));
    setGuards((prev) =>
      prev.map((g) => (memberIds.has(g.id) ? { ...g, role: targetRole } : g))
    );
    setMessage(`กำลังปรับสมาชิก ${currentMembers.length} คนเป็น ${targetLabel}...`);

    try {
      for (const member of currentMembers) {
        await fetch("/api/guards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: member.id,
            siteId: member.siteId,
            guardName: member.guardName,
            displayName: member.displayName,
            pictureUrl: member.pictureUrl,
            phoneNumber: member.phoneNumber,
            preferredShift: member.preferredShift,
            role: targetRole,
          }),
        });
      }
      setMessage(`🎉 ปรับสมาชิกทั้งหมด (${currentMembers.length} คน) เป็น ${targetLabel} เรียบร้อยแล้ว`);
    } catch {
      setGuards(previousGuards);
      alert("เกิดข้อผิดพลาดในการปรับข้อมูลเป็นกลุ่ม");
    }
  };

  // Instant Optimistic Shift Toggle
  const handleToggleShift = async (guard: GuardProfile, newShift: "morning" | "evening" | "all") => {
    const previousGuards = guards;
    lastRequestTimeRef.current = Date.now();

    // Instant optimistic local update
    setGuards((prev) =>
      prev.map((g) =>
        g.id === guard.id
          ? { ...g, preferredShift: newShift }
          : g
      )
    );
    setMessage(`ปรับกะของ "${guard.guardName}" เป็น ${newShift === "morning" ? "☀️ กะเช้า" : newShift === "evening" ? "🌙 กะดึก" : "🔄 ทุกกะ"} สำเร็จ`);

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

      if (!res.ok) {
        setGuards(previousGuards);
        alert("เกิดข้อผิดพลาดในการเปลี่ยนกะ (ย้อนกลับค่าเดิม)");
      }
    } catch {
      setGuards(previousGuards);
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
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
        lastRequestTimeRef.current = Date.now();
        await loadGuards();
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
    const previousGuards = guards;
    lastRequestTimeRef.current = Date.now();

    // Instant optimistic deletion
    setGuards((prev) => prev.filter((g) => g.id !== guard.id));
    setMessage(`ลบ ${guard.guardName} แล้ว`);

    try {
      const res = await fetch(`/api/guards?id=${encodeURIComponent(guard.id)}`, { method: "DELETE" });
      if (!res.ok) {
        setGuards(previousGuards);
        alert("ลบไม่สำเร็จ");
      }
    } catch {
      setGuards(previousGuards);
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
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

  // Shift timings per site from database slots and linePointDetails
  const siteShiftTimings = useMemo(() => {
    const map = new Map<string, { morning?: string; evening?: string }>();
    
    // Check linePointDetails (which reflects shift_templates for all groups/sites)
    if (data?.linePointDetails && data?.lineGroups) {
      for (const grp of data.lineGroups) {
        if (!grp.siteId) continue;
        const detail = data.linePointDetails[grp.id];
        if (detail) {
          const existing = map.get(grp.siteId) || {};
          if (detail.morning?.deadline) existing.morning = detail.morning.deadline;
          if (detail.evening?.deadline) existing.evening = detail.evening.deadline;
          map.set(grp.siteId, existing);
        }
      }
    }

    // Also check active coverage slots
    if (data?.slots) {
      for (const slot of data.slots) {
        const existing = map.get(slot.siteId) || {};
        if (slot.wave === "morning") existing.morning = slot.deadline;
        if (slot.wave === "evening") existing.evening = slot.deadline;
        map.set(slot.siteId, existing);
      }
    }
    return map;
  }, [data?.slots, data?.linePointDetails, data?.lineGroups]);

  // Confirmed guards belonging to the selected site (strictly real profiles only)
  const siteGuards = useMemo(() => {
    if (activeTab === "employers" || activeTab === "inspectors") return [];
    const q = memberSearch.trim().toLowerCase();
    return guards.filter((g) => {
      const belongs = g.siteId === selectedSiteId || (g.siteIds && g.siteIds.includes(selectedSiteId));
      if (!belongs || g.role === "employer" || g.role === "inspector" || g.role === "unconfirmed") return false;
      // Extra safety check: placeholder sender names MUST NOT be in confirmed guards
      if (g.guardName.startsWith("ผู้ส่ง (") || g.guardName.startsWith("รปภ. (")) return false;
      if (!q) return true;
      return (
        g.guardName.toLowerCase().includes(q) ||
        (g.displayName && g.displayName.toLowerCase().includes(q)) ||
        (g.phoneNumber && g.phoneNumber.includes(q)) ||
        g.id.toLowerCase().includes(q)
      );
    });
  }, [guards, selectedSiteId, activeTab, memberSearch]);

  // Inspectors (สายตรวจ) across all sites or selected site
  const siteInspectors = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return guards.filter((g) => {
      const belongs = activeTab === "inspectors" ? true : (g.siteId === selectedSiteId || (g.siteIds && g.siteIds.includes(selectedSiteId)));
      if (!belongs || g.role !== "inspector") return false;
      if (!q) return true;
      return (
        g.guardName.toLowerCase().includes(q) ||
        (g.displayName && g.displayName.toLowerCase().includes(q)) ||
        (g.phoneNumber && g.phoneNumber.includes(q)) ||
        g.id.toLowerCase().includes(q)
      );
    });
  }, [guards, selectedSiteId, activeTab, memberSearch]);

  // Set of confirmed guard and employer names to prevent ghost unconfirmed duplicates
  const confirmedNames = useMemo(() => {
    const set = new Set<string>();
    for (const g of guards) {
      if (g.role !== "unconfirmed" && !g.guardName.startsWith("ผู้ส่ง (") && !g.guardName.startsWith("รปภ. (")) {
        if (g.guardName) {
          set.add(g.guardName.trim().toLowerCase());
        }
        if (g.displayName && !g.displayName.startsWith("ผู้ส่ง (") && !g.displayName.startsWith("รปภ. (")) {
          set.add(g.displayName.trim().toLowerCase());
        }
      }
    }
    return set;
  }, [guards]);

  // Unconfirmed / new members in the selected site
  const siteUnconfirmed = useMemo(() => {
    if (activeTab === "employers" || activeTab === "inspectors") return [];
    const q = memberSearch.trim().toLowerCase();
    return guards.filter((g) => {
      const belongs = g.siteId === selectedSiteId || (g.siteIds && g.siteIds.includes(selectedSiteId));
      const isPlace = g.guardName.startsWith("ผู้ส่ง (") || g.guardName.startsWith("รปภ. (");
      if (!belongs) return false;
      if (g.role !== "unconfirmed" && !isPlace) return false;
      if (g.role === "employer" || g.role === "inspector") return false;

      // If this person has already been confirmed as regular / spare / employer in this site or system, skip duplicate
      const gName = (g.guardName || "").trim().toLowerCase();
      const dName = (g.displayName || "").trim().toLowerCase();
      if (!isPlace && (confirmedNames.has(gName) || confirmedNames.has(dName))) {
        return false;
      }

      if (!q) return true;
      return (
        g.guardName.toLowerCase().includes(q) ||
        (g.displayName && g.displayName.toLowerCase().includes(q)) ||
        (g.phoneNumber && g.phoneNumber.includes(q)) ||
        g.id.toLowerCase().includes(q)
      );
    });
  }, [guards, selectedSiteId, activeTab, memberSearch, confirmedNames]);

  // Employers in the selected site (or all employers if activeTab === 'employers')
  const siteEmployers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return guards.filter((g) => {
      const belongs = activeTab === "employers" ? true : (g.siteId === selectedSiteId || (g.siteIds && g.siteIds.includes(selectedSiteId)));
      if (!belongs || g.role !== "employer") return false;
      if (!q) return true;
      return (
        g.guardName.toLowerCase().includes(q) ||
        (g.displayName && g.displayName.toLowerCase().includes(q)) ||
        (g.phoneNumber && g.phoneNumber.includes(q)) ||
        g.id.toLowerCase().includes(q)
      );
    });
  }, [guards, selectedSiteId, activeTab, memberSearch]);

  const totalInspectorsCount = useMemo(() => guards.filter((g) => g.role === "inspector").length, [guards]);
  const totalEmployersCount = useMemo(() => guards.filter((g) => g.role === "employer").length, [guards]);
  const totalGuardsCount = useMemo(() => guards.filter((g) => (g.role === "regular" || g.role === "spare" || g.role === "head_guard") && !g.guardName.startsWith("ผู้ส่ง (") && !g.guardName.startsWith("รปภ. (")).length, [guards]);

  // Global all unconfirmed members across all sites (including placeholders)
  const allUnconfirmedMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return guards.filter((g) => {
      const isPlace = g.guardName.startsWith("ผู้ส่ง (") || g.guardName.startsWith("รปภ. (");
      if (g.role !== "unconfirmed" && !isPlace) return false;
      if (g.role === "employer" || g.role === "inspector") return false;

      // If this person has already been confirmed as regular / spare / employer, skip duplicate
      const gName = (g.guardName || "").trim().toLowerCase();
      const dName = (g.displayName || "").trim().toLowerCase();
      if (!isPlace && (confirmedNames.has(gName) || confirmedNames.has(dName))) {
        return false;
      }

      if (!q) return true;
      return (
        g.guardName.toLowerCase().includes(q) ||
        (g.displayName && g.displayName.toLowerCase().includes(q)) ||
        (g.phoneNumber && g.phoneNumber.includes(q)) ||
        g.id.toLowerCase().includes(q)
      );
    });
  }, [guards, memberSearch, confirmedNames]);

  const unconfirmedWithRealNames = useMemo(() => {
    return allUnconfirmedMembers.filter((g) => !g.guardName.startsWith("ผู้ส่ง (") && !g.guardName.startsWith("รปภ. ("));
  }, [allUnconfirmedMembers]);

  const unconfirmedPlaceholders = useMemo(() => {
    return allUnconfirmedMembers.filter((g) => g.guardName.startsWith("ผู้ส่ง (") || g.guardName.startsWith("รปภ. ("));
  }, [allUnconfirmedMembers]);

  const handleBatchConfirmRealNames = async () => {
    if (!unconfirmedWithRealNames.length) return;
    if (!confirm(`⚡ ต้องการยืนยันคนที่มีชื่อจริง/โปรไฟล์จาก LINE ทั้งหมด (${unconfirmedWithRealNames.length} คน) เป็น รปภ. ประจำจุด ทันทีหรือไม่?`)) return;

    const previousGuards = guards;
    lastRequestTimeRef.current = Date.now();

    const targetIds = new Set(unconfirmedWithRealNames.map((m) => m.id));
    setGuards((prev) =>
      prev.map((g) => (targetIds.has(g.id) ? { ...g, role: "regular" } : g))
    );
    setMessage(`✅ กำลังยืนยัน รปภ. ที่มีชื่อจริง ${unconfirmedWithRealNames.length} คน...`);

    try {
      for (const member of unconfirmedWithRealNames) {
        await fetch("/api/guards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: member.id,
            siteId: member.siteId,
            guardName: member.guardName,
            displayName: member.displayName,
            pictureUrl: member.pictureUrl,
            phoneNumber: member.phoneNumber,
            preferredShift: member.preferredShift,
            role: "regular",
          }),
        });
      }
      setMessage(`✅ ยืนยัน รปภ. ที่มีชื่อจริงเรียบร้อยแล้ว (${unconfirmedWithRealNames.length} คน)`);
      onRefresh();
    } catch {
      setGuards(previousGuards);
      alert("เกิดข้อผิดพลาดในการบันทึก");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* HEADER SECTION */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 900, color: "#ffffff", display: "flex", alignItems: "center", gap: "0.6rem", letterSpacing: "-0.02em" }}>
            <span style={{ fontSize: "1.6rem" }}>👮‍♂️</span>
            <span>ทำเนียบเจ้าหน้าที่ รปภ. & นายจ้าง</span>
            <span style={{ background: "linear-gradient(135deg, #0284c7, #0369a1)", color: "#ffffff", fontSize: "0.72rem", fontWeight: 800, padding: "0.2rem 0.55rem", borderRadius: "20px", border: "1px solid #38bdf8" }}>
              LINE Auto-Sync
            </span>
          </h2>
          <p style={{ margin: "0.35rem 0 0 0", color: "#94a3b8", fontSize: "0.86rem" }}>
            ระบบดึงรูปและชื่อโปรไฟล์ LINE จริงของทุกคนอัตโนมัติ และแยกนายจ้าง (บอทเงียบ 100%) กับ รปภ. (เช็คเวร)
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => handleAutoSyncGuards()}
            disabled={syncing}
            style={{
              background: syncing ? "#334155" : "linear-gradient(135deg, #059669, #10b981)",
              color: "#ffffff",
              border: "none",
              padding: "0.55rem 1.1rem",
              borderRadius: "10px",
              fontWeight: 800,
              cursor: syncing ? "wait" : "pointer",
              fontSize: "0.86rem",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              boxShadow: "0 4px 14px rgba(16, 185, 129, 0.3)",
              transition: "all 0.15s ease",
            }}
          >
            <span>{syncing ? "⏳" : "🔄"}</span>
            <span>{syncing ? "กำลังดึงโปรไฟล์..." : "ดึงโปรไฟล์ LINE ทันที"}</span>
          </button>

          <button
            onClick={() => setShowTokenSetting(!showTokenSetting)}
            style={{
              background: "#1e293b",
              color: tokenStatus?.valid ? "#34d399" : "#cbd5e1",
              border: `1px solid ${tokenStatus?.valid ? "#059669" : "#334155"}`,
              padding: "0.55rem 0.95rem",
              borderRadius: "10px",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              transition: "all 0.15s ease",
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
              border: "1px solid rgba(239, 68, 68, 0.3)",
              padding: "0.55rem 0.85rem",
              borderRadius: "10px",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: "0.82rem",
              transition: "all 0.15s ease",
            }}
            title="โละล้างข้อมูลตัวอย่างจำลองเก่า เพื่อเตรียมรับโปรไฟล์ LINE จริง"
          >
            🗑️ โละล้างประวัติจำลอง
          </button>
        </div>
      </div>

      {/* TOP STATS CARDS BAR */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "0.85rem" }}>
        {/* Card 1: Total Confirmed Guards */}
        <div style={{ background: "linear-gradient(135deg, #0b201a, #051410)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "14px", padding: "0.85rem 1.1rem", display: "flex", alignItems: "center", gap: "0.85rem", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "rgba(16, 185, 129, 0.15)", color: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
            👮‍♂️
          </div>
          <div>
            <div style={{ fontSize: "0.72rem", color: "#a7f3d0", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>รปภ. ประจำจุด (เช็คเวร)</div>
            <div style={{ fontSize: "1.4rem", color: "#ffffff", fontWeight: 900, lineHeight: 1.1 }}>{totalGuardsCount} <span style={{ fontSize: "0.82rem", color: "#6ee7b7", fontWeight: 600 }}>นาย</span></div>
          </div>
        </div>

        {/* Card 2: Employers / General Members */}
        <div style={{ background: "linear-gradient(135deg, #240e1b, #150811)", border: "1px solid rgba(244, 63, 94, 0.25)", borderRadius: "14px", padding: "0.85rem 1.1rem", display: "flex", alignItems: "center", gap: "0.85rem", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "rgba(244, 63, 94, 0.15)", color: "#f43f5e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", border: "1px solid rgba(244, 63, 94, 0.3)" }}>
            👤
          </div>
          <div>
            <div style={{ fontSize: "0.72rem", color: "#fca5a5", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>บุคคลทั่วไป (บอทเงียบ 100%)</div>
            <div style={{ fontSize: "1.4rem", color: "#ffffff", fontWeight: 900, lineHeight: 1.1 }}>{totalEmployersCount} <span style={{ fontSize: "0.82rem", color: "#fda4af", fontWeight: 600 }}>คน</span></div>
          </div>
        </div>

        {/* Card 3: Total Sites Connected */}
        <div style={{ background: "linear-gradient(135deg, #0b1c36, #061122)", border: "1px solid rgba(56, 189, 248, 0.25)", borderRadius: "14px", padding: "0.85rem 1.1rem", display: "flex", alignItems: "center", gap: "0.85rem", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "rgba(56, 189, 248, 0.15)", color: "#38bdf8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", border: "1px solid rgba(56, 189, 248, 0.3)" }}>
            🏢
          </div>
          <div>
            <div style={{ fontSize: "0.72rem", color: "#7dd3fc", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>จุดตรวจ & กลุ่ม LINE</div>
            <div style={{ fontSize: "1.4rem", color: "#ffffff", fontWeight: 900, lineHeight: 1.1 }}>{sites.length} <span style={{ fontSize: "0.82rem", color: "#bae6fd", fontWeight: 600 }}>จุด</span></div>
          </div>
        </div>

        {/* Card 4: Live Auto-Sync Status */}
        <div style={{ background: "linear-gradient(135deg, #16122c, #0d0a1b)", border: "1px solid rgba(168, 85, 247, 0.25)", borderRadius: "14px", padding: "0.85rem 1.1rem", display: "flex", alignItems: "center", gap: "0.85rem", boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}>
          <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: "rgba(168, 85, 247, 0.15)", color: "#c084fc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem", border: "1px solid rgba(168, 85, 247, 0.3)" }}>
            ⚡
          </div>
          <div>
            <div style={{ fontSize: "0.72rem", color: "#d8b4fe", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.03em" }}>ระบบซิงค์สด Real-Time</div>
            <div style={{ fontSize: "0.96rem", color: "#34d399", fontWeight: 800, display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.15rem" }}>
              <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 8px #10b981" }} />
              <span>Live {lastSyncTime ? `(${lastSyncTime})` : "พร้อมทำงาน"}</span>
            </div>
          </div>
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

      {/* MASTER TOP LEVEL TABS SWITCHER */}
      <div style={{ display: "flex", gap: "0.5rem", background: "#090d16", padding: "0.4rem", borderRadius: "14px", border: "1px solid #1e293b", flexWrap: "wrap" }}>
        <button
          onClick={() => setActiveTab("unconfirmed")}
          style={{
            background: activeTab === "unconfirmed" ? "linear-gradient(135deg, #d97706, #b45309)" : "transparent",
            color: activeTab === "unconfirmed" ? "#ffffff" : "#f59e0b",
            border: activeTab === "unconfirmed" ? "1px solid #f59e0b" : "none",
            padding: "0.6rem 1.25rem",
            borderRadius: "10px",
            fontWeight: 800,
            fontSize: "0.88rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.45rem",
            boxShadow: activeTab === "unconfirmed" ? "0 4px 14px rgba(217, 119, 6, 0.4)" : "none",
          }}
        >
          <span>⏳</span>
          <span>รอยืนยันตัวตนทั้งหมด ({allUnconfirmedMembers.length} คน)</span>
        </button>

        <button
          onClick={() => setActiveTab("sites")}
          style={{
            background: activeTab === "sites" ? "#0284c7" : "transparent",
            color: activeTab === "sites" ? "#ffffff" : "#94a3b8",
            border: activeTab === "sites" ? "1px solid #38bdf8" : "none",
            padding: "0.6rem 1.25rem",
            borderRadius: "10px",
            fontWeight: 800,
            fontSize: "0.88rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.45rem",
          }}
        >
          <span>🏢</span>
          <span>ทำเนียบ รปภ. ประจำจุด ({totalGuardsCount} นาย)</span>
        </button>

        <button
          onClick={() => setActiveTab("inspectors")}
          style={{
            background: activeTab === "inspectors" ? "linear-gradient(135deg, #0284c7, #0369a1)" : "transparent",
            color: activeTab === "inspectors" ? "#ffffff" : "#38bdf8",
            border: activeTab === "inspectors" ? "1px solid #38bdf8" : "none",
            padding: "0.6rem 1.25rem",
            borderRadius: "10px",
            fontWeight: 800,
            fontSize: "0.88rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.45rem",
            boxShadow: activeTab === "inspectors" ? "0 4px 14px rgba(2, 132, 199, 0.4)" : "none",
          }}
        >
          <span>🔍</span>
          <span>ทีมสายตรวจ ({totalInspectorsCount} นาย)</span>
        </button>

        <button
          onClick={() => setActiveTab("employers")}
          style={{
            background: activeTab === "employers" ? "#f43f5e" : "transparent",
            color: activeTab === "employers" ? "#ffffff" : "#94a3b8",
            border: activeTab === "employers" ? "1px solid #fb7185" : "none",
            padding: "0.6rem 1.25rem",
            borderRadius: "10px",
            fontWeight: 800,
            fontSize: "0.88rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.45rem",
          }}
        >
          <span>👔</span>
          <span>ทำเนียบนายจ้าง / ลูกค้า ({totalEmployersCount} คน)</span>
        </button>
      </div>

      {/* 1. GLOBAL UNCONFIRMED MEMBERS HUB (หน้ารวมสมาชิกใหม่ / รอยืนยันทั้งหมดข้ามทุกกลุ่ม) */}
      {activeTab === "unconfirmed" && (
        <div style={{ background: "#0f172a", border: "1.5px solid #d97706", borderRadius: "16px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem", boxShadow: "0 8px 30px rgba(217, 119, 6, 0.15)" }}>
          
          {/* HEADER & SMART BATCH CONTROLS */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.85rem", borderBottom: "1px solid rgba(217, 119, 6, 0.25)", paddingBottom: "1rem" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "1.4rem" }}>⏳</span>
                <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 900, color: "#f59e0b" }}>
                  ศูนย์รวมสมาชิกใหม่ & รอยืนยันตัวตน (ทั่วทุกกลุ่ม LINE)
                </h3>
              </div>
              <p style={{ margin: "0.25rem 0 0 0", color: "#94a3b8", fontSize: "0.84rem" }}>
                รวมทุกคนที่ส่งข้อความในกลุ่ม LINE แต่ยังไม่ได้จัดบทบาท — สามารถเช็คได้ทันทีว่าใครมีรูป/ชื่อแล้ว และกดยืนยันในคลิกเดียว
              </p>
            </div>

            {/* BATCH BUTTONS */}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
              {unconfirmedWithRealNames.length > 0 && (
                <button
                  onClick={handleBatchConfirmRealNames}
                  style={{
                    background: "linear-gradient(135deg, #059669, #10b981)",
                    color: "#ffffff",
                    border: "none",
                    padding: "0.55rem 1.1rem",
                    borderRadius: "10px",
                    fontWeight: 800,
                    cursor: "pointer",
                    fontSize: "0.84rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    boxShadow: "0 4px 14px rgba(16, 185, 129, 0.35)",
                  }}
                >
                  <span>⚡</span>
                  <span>ยืนยันคนที่มีชื่อจริงเป็น รปภ. ({unconfirmedWithRealNames.length} คน)</span>
                </button>
              )}
              <button
                onClick={() => handleAutoSyncGuards()}
                disabled={syncing}
                style={{
                  background: "#1e293b",
                  color: "#cbd5e1",
                  border: "1px solid #334155",
                  padding: "0.55rem 0.95rem",
                  borderRadius: "10px",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: "0.82rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <span>{syncing ? "⏳" : "🔄"}</span>
                <span>{syncing ? "กำลังดึงรูป..." : "ดึงรูป LINE ซ้ำ"}</span>
              </button>
            </div>
          </div>

          {/* METRIC STRIP */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
            <div style={{ background: "#181308", border: "1px solid #78350f", borderRadius: "10px", padding: "0.65rem 0.9rem" }}>
              <div style={{ fontSize: "0.72rem", color: "#f59e0b", fontWeight: 700 }}>⏳ รอยืนยันทั้งหมด</div>
              <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "#ffffff" }}>{allUnconfirmedMembers.length} <small style={{ fontSize: "0.75rem" }}>คน</small></div>
            </div>
            <div style={{ background: "#051e18", border: "1px solid #065f46", borderRadius: "10px", padding: "0.65rem 0.9rem" }}>
              <div style={{ fontSize: "0.72rem", color: "#34d399", fontWeight: 700 }}>📸 มีรูป/ชื่อจริงจาก LINE แล้ว</div>
              <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "#34d399" }}>{unconfirmedWithRealNames.length} <small style={{ fontSize: "0.75rem" }}>คน</small></div>
            </div>
            <div style={{ background: "#111827", border: "1px solid #374151", borderRadius: "10px", padding: "0.65rem 0.9rem" }}>
              <div style={{ fontSize: "0.72rem", color: "#9ca3af", fontWeight: 700 }}>⏳ รอดึงข้อมูล (รหัสชั่วคราว)</div>
              <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "#9ca3af" }}>{unconfirmedPlaceholders.length} <small style={{ fontSize: "0.75rem" }}>คน</small></div>
            </div>
          </div>

          {/* SEARCH INPUT */}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              type="text"
              placeholder="🔍 ค้นหาชื่อสมาชิก / รหัส / จุดตรวจ..."
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              style={{ width: "100%", background: "#090d16", border: "1px solid #334155", color: "#ffffff", padding: "0.6rem 0.9rem", borderRadius: "10px", fontSize: "0.86rem" }}
            />
          </div>

          {/* UNCONFIRMED CARDS GRID */}
          {allUnconfirmedMembers.length === 0 ? (
            <div style={{ background: "#090d16", border: "1px dashed #334155", borderRadius: "12px", padding: "3rem 1.5rem", textAlign: "center", color: "#94a3b8" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🎉</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#ffffff" }}>ไม่พบสมาชิกที่รอยืนยัน</div>
              <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.25rem" }}>ยืนยันบทบาทครบถ้วนทุกคนแล้ว 100%</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "0.85rem" }}>
              {allUnconfirmedMembers.map((member) => {
                const isRealName = !member.guardName.startsWith("ผู้ส่ง (") && !member.guardName.startsWith("รปภ. (");
                const assignedSite = sites.find((s) => s.id === member.siteId);

                return (
                  <div
                    key={member.id}
                    style={{
                      background: "linear-gradient(145deg, #131b2e 0%, #0d1527 100%)",
                      border: isRealName ? "1.5px solid #10b981" : "1.5px solid #d97706",
                      borderRadius: "14px",
                      padding: "1rem",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      boxShadow: isRealName ? "0 4px 16px rgba(16, 185, 129, 0.15)" : "0 4px 16px rgba(217, 119, 6, 0.15)",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                        {member.pictureUrl && member.pictureUrl.startsWith("http") ? (
                          <img src={member.pictureUrl} alt={member.guardName} style={{ width: "52px", height: "52px", borderRadius: "50%", objectFit: "cover", border: isRealName ? "2px solid #10b981" : "2px solid #f59e0b" }} />
                        ) : (
                          <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", border: isRealName ? "2px solid #10b981" : "2px solid #f59e0b" }}>
                            {member.pictureUrl || (isRealName ? "👮‍♂️" : "👤")}
                          </div>
                        )}

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                            <span style={{ fontSize: "1rem", fontWeight: 900, color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {member.guardName}
                            </span>
                            {isRealName && (
                              <span style={{ background: "#064e3b", color: "#34d399", fontSize: "0.65rem", padding: "0.1rem 0.35rem", borderRadius: "4px", fontWeight: 800 }}>
                                📸 รูปจริง
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: "0.74rem", color: "#f59e0b", marginTop: "0.15rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                            <span>⏳ สมาชิกใหม่ / รอยืนยันบทบาท</span>
                          </div>

                          <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                            🏢 {assignedSite ? assignedSite.siteName : member.siteName || "ยังไม่ระบุจุด"}
                            {member.siteIds && member.siteIds.length > 1 && ` (ส่งใน ${member.siteIds.length} จุด)`}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* ACTION BUTTONS */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 36px", gap: "0.35rem", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "0.65rem" }}>
                      <button
                        onClick={() => handleToggleRole(member, "regular")}
                        style={{
                          background: "#059669",
                          color: "#ffffff",
                          border: "none",
                          padding: "0.45rem 0.3rem",
                          borderRadius: "8px",
                          fontWeight: 800,
                          fontSize: "0.74rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.2rem",
                        }}
                        title="ยืนยันว่าเป็น รปภ. ประจำจุด (บอทส่งสติกเกอร์ตอบรับ)"
                      >
                        <span>✅</span> รปภ.
                      </button>

                      <button
                        onClick={() => handleToggleRole(member, "inspector")}
                        style={{
                          background: "#0369a1",
                          color: "#e0f2fe",
                          border: "1px solid #38bdf8",
                          padding: "0.45rem 0.3rem",
                          borderRadius: "8px",
                          fontWeight: 800,
                          fontSize: "0.74rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.2rem",
                        }}
                        title="ตั้งเป็นสายตรวจ / หัวหน้าสายตรวจ (บอทเงียบ 100% ไม่ส่งสติกเกอร์ และไม่แจ้งเตือนซ้ำซ้อน)"
                      >
                        <span>🔍</span> สายตรวจ
                      </button>

                      <button
                        onClick={() => handleToggleRole(member, "employer")}
                        style={{
                          background: "#881337",
                          color: "#fecdd3",
                          border: "1px solid #e11d48",
                          padding: "0.45rem 0.3rem",
                          borderRadius: "8px",
                          fontWeight: 800,
                          fontSize: "0.74rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.2rem",
                        }}
                        title="ตั้งเป็นนายจ้าง / ลูกค้า (บอทเงียบ 100% + แจ้งเตือนเข้าสั่งการ)"
                      >
                        <span>👔</span> นายจ้าง
                      </button>

                      <button
                        onClick={() => openEditModal(member)}
                        style={{
                          background: "#1e293b",
                          color: "#cbd5e1",
                          border: "1px solid #334155",
                          padding: "0.45rem",
                          borderRadius: "8px",
                          fontWeight: 700,
                          fontSize: "0.8rem",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        title="แก้ไขชื่อ / สลับจุด / เพิ่มเบอร์โทร"
                      >
                        ✏️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MASTER-DETAIL SPLIT LAYOUT (FOR SITES & EMPLOYERS TABS) */}
      {activeTab !== "unconfirmed" && (
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "1.25rem", alignItems: "start" }}>
        
        {/* LEFT COLUMN: SITES & GROUPS LIST */}
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "14px", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "800px", overflowY: "auto" }}>
          
          {/* VIEW TABS */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.25rem", background: "#1e293b", padding: "0.3rem", borderRadius: "8px" }}>
            <button
              onClick={() => setActiveTab("sites")}
              style={{
                background: activeTab === "sites" ? "#0284c7" : "transparent",
                color: activeTab === "sites" ? "#ffffff" : "#94a3b8",
                border: "none",
                padding: "0.45rem 0.2rem",
                borderRadius: "6px",
                fontWeight: 800,
                fontSize: "0.76rem",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              🏢 จุด ({sites.length})
            </button>
            <button
              onClick={() => setActiveTab("inspectors")}
              style={{
                background: activeTab === "inspectors" ? "#0369a1" : "transparent",
                color: activeTab === "inspectors" ? "#ffffff" : "#38bdf8",
                border: "none",
                padding: "0.45rem 0.2rem",
                borderRadius: "6px",
                fontWeight: 800,
                fontSize: "0.76rem",
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              🔍 สายตรวจ ({totalInspectorsCount})
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
                fontSize: "0.76rem",
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
                <span>{activeTab === "inspectors" ? "🔍 รายชื่อทีมสายตรวจ & หัวหน้าชุดทั้งหมด" : activeTab === "employers" ? "👔 รายชื่อนายจ้าง / ลูกค้าทั้งหมด" : `🏢 ${selectedSite?.siteName || "เลือกจุดตรวจ"}`}</span>
              </h3>
              
              {activeTab === "inspectors" && (
                <div style={{ color: "#38bdf8", fontSize: "0.82rem", lineHeight: 1.5 }}>
                  🛡️ เจ้าหน้าที่สายตรวจ: เมื่อพิมพ์ในกลุ่ม LINE บอทจะงดส่งสติกเกอร์ 100% และถ้าสายตรวจคุยกับนายจ้าง ระบบจะไม่ส่งแจ้งเตือนซ้ำซ้อนเข้าศูนย์สั่งการ
                </div>
              )}

              {activeTab === "sites" && selectedSite && (
                <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>ลูกค้า: {selectedSite.customerName || "ทั่วไป"}</span>
                  
                  {/* SHIFT TIMINGS BANNER (LOADED DIRECTLY FROM DATABASE) */}
                  {(() => {
                    const timings = siteShiftTimings.get(selectedSiteId);
                    const hasMorning = Boolean(timings?.morning);
                    const hasEvening = Boolean(timings?.evening);

                    if (!hasMorning && !hasEvening) {
                      return (
                        <div style={{ display: "flex", gap: "0.5rem", background: "#0b1220", padding: "0.25rem 0.6rem", borderRadius: "6px", border: "1px solid #1e293b", fontSize: "0.76rem", color: "#94a3b8" }}>
                          ⚙️ ยังไม่เปิดเวลากะ
                        </div>
                      );
                    }

                    return (
                      <div style={{ display: "flex", gap: "0.5rem", background: "#0b1220", padding: "0.25rem 0.6rem", borderRadius: "6px", border: "1px solid #1e293b", fontSize: "0.76rem", alignItems: "center" }}>
                        {hasMorning && <span style={{ color: "#fde047", fontWeight: 700 }}>☀️ กะเช้า ({timings?.morning})</span>}
                        {hasMorning && hasEvening && <span style={{ color: "#475569" }}>|</span>}
                        {hasEvening && <span style={{ color: "#a5b4fc", fontWeight: 700 }}>🌙 กะดึก ({timings?.evening})</span>}
                        {!hasMorning && hasEvening && <span style={{ color: "#64748b", fontSize: "0.7rem" }}>(ไม่มีกะเช้า)</span>}
                        {hasMorning && !hasEvening && <span style={{ color: "#64748b", fontSize: "0.7rem" }}>(ไม่มีกะดึก)</span>}
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
              <span>{activeTab === "inspectors" ? "เพิ่มสายตรวจ" : activeTab === "employers" ? "เพิ่มนายจ้าง" : "เพิ่มคนในจุดนี้"}</span>
            </button>
          </div>

          {/* SUB-FILTER TABS (ALL / GUARDS / INSPECTORS / UNCONFIRMED / EMPLOYERS) */}
          {(siteGuards.length > 0 || siteInspectors.length > 0 || siteEmployers.length > 0 || siteUnconfirmed.length > 0) && (
            <div style={{ display: "flex", gap: "0.4rem", borderBottom: "1px solid #1e293b", paddingBottom: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => setSiteMemberFilter("all")}
                style={{
                  background: siteMemberFilter === "all" ? "#38bdf8" : "#1e293b",
                  color: siteMemberFilter === "all" ? "#0f172a" : "#cbd5e1",
                  border: "none",
                  padding: "0.35rem 0.75rem",
                  borderRadius: "6px",
                  fontSize: "0.76rem",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                📋 แสดงทุกคน ({siteGuards.length + siteInspectors.length + siteUnconfirmed.length + siteEmployers.length})
              </button>
              <button
                onClick={() => setSiteMemberFilter("guards")}
                style={{
                  background: siteMemberFilter === "guards" ? "#10b981" : "#1e293b",
                  color: siteMemberFilter === "guards" ? "#0f172a" : "#a7f3d0",
                  border: "none",
                  padding: "0.35rem 0.75rem",
                  borderRadius: "6px",
                  fontSize: "0.76rem",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                👮‍♂️ รปภ. ({siteGuards.length})
              </button>
              <button
                onClick={() => setSiteMemberFilter("inspectors")}
                style={{
                  background: siteMemberFilter === "inspectors" ? "#0284c7" : "#1e293b",
                  color: siteMemberFilter === "inspectors" ? "#ffffff" : "#38bdf8",
                  border: "none",
                  padding: "0.35rem 0.75rem",
                  borderRadius: "6px",
                  fontSize: "0.76rem",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                🔍 สายตรวจ ({siteInspectors.length})
              </button>
              {siteUnconfirmed.length > 0 && (
                <button
                  onClick={() => setSiteMemberFilter("unconfirmed")}
                  style={{
                    background: siteMemberFilter === "unconfirmed" ? "#f59e0b" : "#1e293b",
                    color: siteMemberFilter === "unconfirmed" ? "#0f172a" : "#fde68a",
                    border: "none",
                    padding: "0.35rem 0.75rem",
                    borderRadius: "6px",
                    fontSize: "0.76rem",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  ⏳ รอยืนยัน ({siteUnconfirmed.length})
                </button>
              )}
              <button
                onClick={() => setSiteMemberFilter("employers")}
                style={{
                  background: siteMemberFilter === "employers" ? "#f43f5e" : "#1e293b",
                  color: siteMemberFilter === "employers" ? "#ffffff" : "#fca5a5",
                  border: "none",
                  padding: "0.35rem 0.75rem",
                  borderRadius: "6px",
                  fontSize: "0.76rem",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                👔 นายจ้าง ({siteEmployers.length})
              </button>
            </div>
          )}

          {/* MEMBER SEARCH & BATCH ACTIONS TOOLBAR */}
          {(siteGuards.length > 0 || siteUnconfirmed.length > 0 || siteEmployers.length > 0 || memberSearch.trim().length > 0) && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", background: "#0b1220", padding: "0.6rem 0.75rem", borderRadius: "10px", border: "1px solid #1e293b" }}>
              <div style={{ flex: 1, minWidth: "220px", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <input
                  type="text"
                  placeholder="🔍 ค้นหาชื่อ รปภ. / นายจ้าง / ชื่อไลน์ / เบอร์..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", color: "#ffffff", padding: "0.45rem 0.75rem", borderRadius: "8px", fontSize: "0.82rem" }}
                />
                {memberSearch && (
                  <button onClick={() => setMemberSearch("")} style={{ background: "#334155", border: "none", color: "#cbd5e1", borderRadius: "6px", padding: "0.45rem 0.6rem", cursor: "pointer", fontSize: "0.75rem", fontWeight: 700 }}>
                    ✕ ล้าง
                  </button>
                )}
              </div>

              {/* BATCH ACTION SHORTCUTS */}
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {siteUnconfirmed.length > 0 && (
                  <button
                    onClick={() => {
                      const resolvedMembers = siteUnconfirmed.filter((m) => !m.guardName.startsWith("ผู้ส่ง (") && !m.guardName.startsWith("รปภ. ("));
                      if (!resolvedMembers.length) {
                        alert("ไม่มีสมาชิกที่มีชื่อจริงที่รอยืนยัน (เป็นรหัสชั่วคราวทั้งหมด)");
                        return;
                      }
                      if (!confirm(`ต้องการยืนยันสมาชิกที่มีชื่อ-รูปจริง (${resolvedMembers.length} คน) เป็น รปภ. ประจำจุด ใช่หรือไม่?`)) return;
                      resolvedMembers.forEach((m) => handleToggleRole(m, "regular"));
                    }}
                    style={{ background: "linear-gradient(135deg, #059669, #10b981)", color: "#ffffff", border: "1px solid #34d399", padding: "0.4rem 0.7rem", borderRadius: "6px", fontSize: "0.74rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.3rem" }}
                    title="ยืนยันทุกคนที่มีชื่อจริงและโปรไฟล์เป็น รปภ. ประจำจุด"
                  >
                    <span>✅</span>
                    <span>ยืนยันคนที่มีชื่อจริงเป็น รปภ.</span>
                  </button>
                )}
                <button
                  onClick={() => handleBatchSetRole("regular")}
                  style={{ background: "linear-gradient(135deg, #064e3b, #047857)", color: "#a7f3d0", border: "1px solid #059669", padding: "0.4rem 0.7rem", borderRadius: "6px", fontSize: "0.74rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.3rem" }}
                  title="ปรับทุกคนในจุดนี้เป็น รปภ. (เปิดระบบบอทตรวจเวรและสติกเกอร์)"
                >
                  <span>👮‍♂️</span>
                  <span>ปรับทุกคนเป็น รปภ.</span>
                </button>
                <button
                  onClick={() => handleBatchSetRole("employer")}
                  style={{ background: "linear-gradient(135deg, #4c0519, #881337)", color: "#fecdd3", border: "1px solid #e11d48", padding: "0.4rem 0.7rem", borderRadius: "6px", fontSize: "0.74rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.3rem" }}
                  title="ปรับทุกคนในจุดนี้เป็น นายจ้าง (บอทจะงดส่งสติกเกอร์ 100%)"
                >
                  <span>👔</span>
                  <span>ปรับทุกคนเป็น นายจ้าง</span>
                </button>
              </div>
            </div>
          )}

          {/* MEMBERS LIST */}
          {siteGuards.length === 0 && siteUnconfirmed.length === 0 && siteEmployers.length === 0 ? (
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
              {siteGuards.length > 0 && siteMemberFilter !== "employers" && (
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
                                {shiftLabel} · 👮‍♂️ รปภ. ประจำจุด
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
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.3rem", flexWrap: "wrap" }}>
                              <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                                <button
                                  onClick={() => handleToggleRole(guard, "inspector")}
                                  style={{ background: "#0c4a6e", color: "#bae6fd", border: "1px solid #0284c7", padding: "0.28rem 0.55rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.25rem" }}
                                  title="ปรับเป็นสายตรวจ บอทจะงดตอบสติกเกอร์ 100%"
                                >
                                  <span>🔍</span>
                                  <span>ตั้งเป็นสายตรวจ</span>
                                </button>
                                <button
                                  onClick={() => handleToggleRole(guard, "employer")}
                                  style={{ background: "#4c0519", color: "#fecdd3", border: "1px solid #e11d48", padding: "0.28rem 0.55rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.25rem" }}
                                  title="ปรับเป็นนายจ้าง บอทจะงดตอบสติกเกอร์ 100%"
                                >
                                  <span>👔</span>
                                  <span>ตั้งเป็นนายจ้าง</span>
                                </button>
                                <button
                                  onClick={() => handleToggleRole(guard, "unconfirmed")}
                                  style={{ background: "#27272a", color: "#fde68a", border: "1px solid #71717a", padding: "0.28rem 0.55rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.25rem" }}
                                  title="ยกเลิกการยืนยัน ย้ายกลับไปช่องรอยืนยัน บอทจะไม่ตอบรับจนกว่าจะยืนยันใหม่"
                                >
                                  <span>⏳</span>
                                  <span>ยกเลิกยืนยัน</span>
                                </button>
                              </div>

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

              {/* INSPECTORS SECTION */}
              {siteInspectors.length > 0 && (siteMemberFilter === "all" || siteMemberFilter === "inspectors" || activeTab === "inspectors") && (
                <div style={{ marginTop: (siteGuards.length > 0 || siteUnconfirmed.length > 0) && siteMemberFilter === "all" ? "0.75rem" : 0 }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 800, color: "#38bdf8", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <span>🔍</span>
                    <span>ทีมสายตรวจ ({siteInspectors.length} นาย) — บอทเงียบ 100% / ไม่ส่งแจ้งเตือนซ้ำซ้อน</span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.75rem" }}>
                    {siteInspectors.map((insp) => (
                      <div
                        key={insp.id}
                        style={{
                          background: "#0c2135",
                          border: "1.5px solid #0284c7",
                          borderRadius: "12px",
                          padding: "0.85rem",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.6rem",
                        }}
                      >
                        <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
                          {insp.pictureUrl && insp.pictureUrl.startsWith("http") ? (
                            <img src={insp.pictureUrl} alt={insp.guardName} style={{ width: "44px", height: "44px", borderRadius: "50%", objectFit: "cover", border: "2px solid #0284c7" }} />
                          ) : (
                            <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "#0369a1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", border: "2px solid #0284c7" }}>
                              {insp.pictureUrl || "🔍"}
                            </div>
                          )}

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {insp.guardName}
                            </div>
                            <div style={{ fontSize: "0.74rem", color: "#7dd3fc", fontWeight: 700 }}>
                              🔍 เจ้าหน้าที่สายตรวจ (บอทเงียบ 100%)
                            </div>
                          </div>
                        </div>

                        {insp.displayName && (
                          <div style={{ fontSize: "0.72rem", color: "#94a3b8", background: "#0b1220", padding: "0.25rem 0.5rem", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>💬 LINE: {insp.displayName}</span>
                            {insp.siteIds && insp.siteIds.length > 1 && (
                              <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: "0.68rem" }}>
                                🌐 ตรวจ {insp.siteIds.length} จุด
                              </span>
                            )}
                          </div>
                        )}

                        {/* ROLE & ACTION CONTROLS */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.3rem", flexWrap: "wrap", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "0.5rem" }}>
                          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                            <button
                              onClick={() => handleToggleRole(insp, "regular")}
                              style={{ background: "#064e3b", color: "#a7f3d0", border: "1px solid #10b981", padding: "0.28rem 0.55rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.25rem" }}
                              title="เปลี่ยนเป็น รปภ. ประจำจุด"
                            >
                              <span>✅</span>
                              <span>เป็น รปภ.</span>
                            </button>
                            <button
                              onClick={() => handleToggleRole(insp, "employer")}
                              style={{ background: "#4c0519", color: "#fecdd3", border: "1px solid #e11d48", padding: "0.28rem 0.55rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.25rem" }}
                              title="เปลี่ยนเป็นนายจ้าง"
                            >
                              <span>👔</span>
                              <span>เป็นนายจ้าง</span>
                            </button>
                          </div>

                          <div style={{ display: "flex", gap: "0.3rem" }}>
                            <button
                              onClick={() => openEditModal(insp)}
                              style={{ background: "#1e293b", border: "1px solid #334155", color: "#cbd5e1", padding: "0.25rem 0.5rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleDelete(insp)}
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

              {/* UNCONFIRMED NEW MEMBERS SECTION */}
              {siteUnconfirmed.length > 0 && (siteMemberFilter === "all" || siteMemberFilter === "unconfirmed") && (
                <div style={{ marginTop: (siteGuards.length > 0 || siteInspectors.length > 0) && siteMemberFilter === "all" ? "0.75rem" : 0 }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 800, color: "#f59e0b", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <span>⏳</span>
                    <span>สมาชิกใหม่ / รอยืนยัน ({siteUnconfirmed.length} คน) — บอทยังไม่ส่งสติกเกอร์จนกว่าจะยืนยัน</span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.75rem" }}>
                    {siteUnconfirmed.map((member) => (
                      <div
                        key={member.id}
                        style={{
                          background: "#1c1917",
                          border: "1.5px solid #f59e0b",
                          borderRadius: "12px",
                          padding: "0.85rem",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.6rem",
                        }}
                      >
                        <div style={{ display: "flex", gap: "0.65rem", alignItems: "center" }}>
                          {member.pictureUrl && member.pictureUrl.startsWith("http") ? (
                            <img src={member.pictureUrl} alt={member.guardName} style={{ width: "44px", height: "44px", borderRadius: "50%", objectFit: "cover", border: "2px solid #f59e0b" }} />
                          ) : (
                            <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "#451a03", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", border: "2px solid #f59e0b" }}>
                              {member.pictureUrl || "⏳"}
                            </div>
                          )}

                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#ffffff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {member.guardName}
                            </div>
                            <div style={{ fontSize: "0.74rem", color: "#fde68a", fontWeight: 700 }}>
                              ⏳ สมาชิกใหม่ / รอยืนยันบทบาท
                            </div>
                          </div>
                        </div>

                        {member.displayName && (
                          <div style={{ fontSize: "0.72rem", color: "#94a3b8", background: "#0b1220", padding: "0.25rem 0.5rem", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>💬 LINE: {member.displayName}</span>
                            {member.siteIds && member.siteIds.length > 1 && (
                              <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: "0.68rem" }}>
                                🌐 ส่งใน {member.siteIds.length} จุด
                              </span>
                            )}
                          </div>
                        )}

                        {/* CONFIRMATION ACTIONS */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.3rem", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "0.5rem" }}>
                          <button
                            onClick={() => handleToggleRole(member, "regular")}
                            style={{ background: "#064e3b", color: "#a7f3d0", border: "1px solid #10b981", padding: "0.35rem 0.2rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.2rem" }}
                            title="ยืนยันว่าเป็น รปภ. ประจำจุด เพื่อเปิดระบบบอทตรวจเวรและส่งสติกเกอร์"
                          >
                            <span>✅</span>
                            <span>รปภ.</span>
                          </button>
                          <button
                            onClick={() => handleToggleRole(member, "inspector")}
                            style={{ background: "#0c4a6e", color: "#bae6fd", border: "1px solid #0284c7", padding: "0.35rem 0.2rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.2rem" }}
                            title="ตั้งเป็นสายตรวจ บอทจะงดส่งสติกเกอร์ 100%"
                          >
                            <span>🔍</span>
                            <span>สายตรวจ</span>
                          </button>
                          <button
                            onClick={() => handleToggleRole(member, "employer")}
                            style={{ background: "#4c0519", color: "#fecdd3", border: "1px solid #e11d48", padding: "0.35rem 0.2rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.2rem" }}
                            title="ตั้งเป็นนายจ้างหรือบุคคลทั่วไป บอทจะงดส่งสติกเกอร์ 100%"
                          >
                            <span>👔</span>
                            <span>นายจ้าง</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* EMPLOYERS SECTION */}
              {siteEmployers.length > 0 && (siteMemberFilter === "all" || siteMemberFilter === "employers") && (
                <div style={{ marginTop: (siteGuards.length > 0 || siteUnconfirmed.length > 0) && siteMemberFilter === "all" ? "0.75rem" : 0 }}>
                  <div style={{ fontSize: "0.82rem", fontWeight: 800, color: "#f87171", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <span>👔</span>
                    <span>บุคคลทั่วไป / นายจ้างในกลุ่มนี้ ({siteEmployers.length} คน) — บอทเงียบ 100%</span>
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
                              👤 บุคคลทั่วไป / นายจ้าง (บอทเงียบ 100%)
                            </div>
                          </div>
                        </div>

                        {emp.displayName && (
                          <div style={{ fontSize: "0.72rem", color: "#94a3b8", background: "#0b1220", padding: "0.25rem 0.5rem", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>💬 LINE: {emp.displayName}</span>
                            {emp.siteIds && emp.siteIds.length > 1 && (
                              <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: "0.68rem" }}>
                                🌐 ส่งใน {emp.siteIds.length} จุด
                              </span>
                            )}
                          </div>
                        )}

                        {/* ACTION BUTTONS */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "0.5rem", gap: "0.3rem", flexWrap: "wrap" }}>
                          <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                            <button
                              onClick={() => handleToggleRole(emp, "regular")}
                              style={{ background: "#064e3b", color: "#a7f3d0", border: "1px solid #10b981", padding: "0.28rem 0.55rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.25rem" }}
                              title="ยืนยันเป็น รปภ. ประจำจุด เพื่อเปิดระบบบอทตอบรับและเช็คเวร"
                            >
                              <span>👮‍♂️</span>
                              <span>เป็น รปภ.</span>
                            </button>
                            <button
                              onClick={() => handleToggleRole(emp, "inspector")}
                              style={{ background: "#0c4a6e", color: "#bae6fd", border: "1px solid #0284c7", padding: "0.28rem 0.55rem", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.25rem" }}
                              title="ตั้งเป็นสายตรวจ บอทจะงดส่งสติกเกอร์ 100% และไม่ส่งแจ้งเตือนซ้ำซ้อน"
                            >
                              <span>🔍</span>
                              <span>ตั้งเป็นสายตรวจ</span>
                            </button>
                          </div>

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
      )}

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
                    <option value="regular">🛡️ รปภ. ประจำจุด (บอทตรวจเวร & ตอบรับสติกเกอร์)</option>
                    <option value="spare">🔄 รปภ. สแปร์กลาง (บอทตรวจเวร & ตอบรับสติกเกอร์)</option>
                    <option value="inspector">🔍 สายตรวจ / หัวหน้าสายตรวจ (บอทเงียบ 100% / ไม่ส่งแจ้งเตือนซ้ำซ้อน)</option>
                    <option value="employer">👔 นายจ้าง / ลูกค้า (บอทเงียบ 100% + แจ้งเตือนเข้าสั่งการ)</option>
                    <option value="unconfirmed">⏳ สมาชิกใหม่ / รอยืนยัน (บอทยังไม่ตอบ)</option>
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
