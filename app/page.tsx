"use client";

import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StickersPanel } from "./StickersPanel";
import { ShiftsPanel } from "./ShiftsPanel";
import PatrolPanel from "./PatrolPanel";
import { GuardsPanel } from "./GuardsPanel";
import { InquiriesPanel } from "./InquiriesPanel";

export type SlotState = "confirmed" | "self_reported" | "waiting" | "replacement_required" | "unassigned" | "missing";

export type CoverageSlot = {
  id: string;
  operationalDate?: string;
  wave: string;
  siteId: string;
  siteName: string;
  customerName: string;
  postName: string;
  slotLabel: string;
  assignedGuard: string | null;
  assignmentType: string;
  state: SlotState;
  verificationPolicy: "standard" | "reviewed" | "manual";
  deadline: string;
  reportedAt: string | null;
  source: string | null;
  lateMinutes: number;
  updatedAt?: string;
};

type BillingCase = {
  id: string;
  customerName: string;
  servicePeriod: string;
  amountSatang: number;
  dueAt: string;
  documentState: string;
  submissionState: string;
  paymentState: string;
  nextAction: string;
  ownerName: string;
  appointmentAt: string | null;
  location: string | null;
};

type OperationalSite = {
  id: string;
  siteName: string;
  customerName: string;
  active: number;
};

type LineGroup = {
  id: string;
  siteId: string | null;
  groupName: string;
  nameResolved: boolean;
  pictureUrl: string | null;
  lastSeenAt: string | null;
  lastEventType: string | null;
  lastMessageType?: string | null;
  lastReportAt?: string | null;
  lastReportSenderKey?: string | null;
  lastCandidateAt?: string | null;
  lastCandidateSenderKey?: string | null;
  eventCount: number;
  source: "manual" | "webhook";
};

type LineIntegrationStatus = {
  configured: boolean;
  gatewayConfigured: boolean;
  webhookPath: string;
  lastWebhookAt: string | null;
  lastCallbackSummary: string | null;
  webhookAgeMinutes: number | null;
  webhookStatus: "healthy" | "stale" | "never";
  receivedGroups: number;
  mappedGroups: number;
};

type LineReminderSettings = {
  targetGroupId: string | null;
  escalationTargetGroupId: string | null;
  autoEnabled: boolean;
  autoEscalationEnabled: boolean;
  lastSentAt: string | null;
  lastSentCount: number;
  lastTargetName: string | null;
};

type LineReportConfig = {
  enabled: boolean;
  morningTimes: string[];
  eveningTimes: string[];
  mode: "schedule" | "interval" | "observe";
  expectedTimes: string[];
  intervalHours: number;
  intervalAnchor: string;
  graceMinutes: number;
  escalationAfterHours: number;
  verification: "text" | "approved_sender";
  approvedSenderKeys: string[];
  monitoringStartedAt: string | null;
};

type LineReminderPreview = {
  targetGroupId: string;
  targetGroupName: string;
  roundTime: string;
  trackedCount: number;
  pendingCount: number;
  carryOverCount: number;
  escalationCount: number;
  notArmedCount: number;
  message: string;
  escalationMessage: string | null;
};

type ActionResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  skipped?: boolean;
  silentCount?: number;
  trackedCount?: number;
  imported?: number;
  created?: number;
  existing?: number;
  total?: number;
  roundTime?: string;
  pendingCount?: number;
  carryOverCount?: number;
  escalationCount?: number;
  targetGroupId?: string;
  targetGroupName?: string;
  escalationMessage?: string | null;
};

type TemplateSummary = {
  total: number;
  morning: number;
  evening: number;
};

type LinePointDetail = {
  customerName: string;
  active: boolean;
  morning?: { postName: string; slotLabel: string; assignedGuard: string; deadline: string };
  evening?: { postName: string; slotLabel: string; assignedGuard: string; deadline: string };
};

type TemplateRow = {
  siteName: string;
  customerName: string;
  wave: "morning" | "evening";
  postName: string;
  slotLabel: string;
  assignedGuard: string;
  deadline: string;
  verificationPolicy: "standard" | "reviewed" | "manual";
  lineGroupId: string;
};

export type DashboardData = {
  today: string;
  now: { time: string };
  slots: CoverageSlot[];
  sites: OperationalSite[];
  lineGroups: LineGroup[];
  lineIntegration: LineIntegrationStatus;
  lineReminder: LineReminderSettings;
  lineReportConfigs: Record<string, LineReportConfig>;
  linePointDetails: Record<string, LinePointDetail>;
  templates: TemplateSummary;
  demoDataPresent: boolean;
  billingCases: BillingCase[];
};

type SiteStatus = "green" | "yellow" | "red" | "gray";

type SiteCard = {
  id: string;
  name: string;
  customerName: string;
  status: SiteStatus;
  slots: CoverageSlot[];
  confirmed: number;
  lateCount: number;
  nextDeadline: string | null;
  checkedAt: string | null;
  lineGroup: LineGroup | null;
};

type LinePointForm = {
  customerName: string;
  postName: string;
  slotLabel: string;
  morningEnabled: boolean;
  eveningEnabled: boolean;
  morningGuard: string;
  eveningGuard: string;
  morningDeadline: string;
  eveningDeadline: string;
  active: boolean;
};

const statusText: Record<SiteStatus, string> = {
  green: "ครบยืนยันแล้ว",
  yellow: "รอตรวจ",
  red: "ต้องจัดการ",
  gray: "ข้อมูลไม่พร้อม",
};

const slotText: Record<SlotState, string> = {
  confirmed: "ยืนยันแล้ว",
  self_reported: "รอตรวจ",
  waiting: "รอรายงาน",
  replacement_required: "ต้องหาสแปร์",
  unassigned: "ยังไม่จัดคน",
  missing: "ขาดกำลัง",
};

function deriveSiteStatus(slots: CoverageSlot[]): SiteStatus {
  if (!slots.length) return "gray";
  if (slots.some((slot) => slot.state === "confirmed")) return "green";
  if (slots.some((slot) => ["missing", "unassigned", "replacement_required"].includes(slot.state))) return "red";
  return "yellow";
}

function groupSites(slots: CoverageSlot[], registry: OperationalSite[], lineGroups: LineGroup[]) {
  const activeRegistry = registry.filter((site) => site.active === 1);
  const groups = new Map<string, CoverageSlot[]>();
  slots.forEach((slot) => {
    if (!activeRegistry.some((site) => site.id === slot.siteId)) return;
    const existing = groups.get(slot.siteId) ?? [];
    existing.push(slot);
    groups.set(slot.siteId, existing);
  });
  const registryById = new Map(activeRegistry.map((site) => [site.id, site]));
  // Only display sites that actually have configured shift slots in this wave
  const siteIds = Array.from(groups.keys());
  return siteIds
    .map((id) => {
      const grouped = groups.get(id) ?? [];
      const registered = registryById.get(id);
      const status = deriveSiteStatus(grouped);
      const orderedSlots = [...grouped].sort((left, right) => left.deadline.localeCompare(right.deadline));
      const pendingSlot = orderedSlots.find((slot) => slot.state !== "confirmed") ?? orderedSlots[0];
      const checkedAt = [...grouped]
        .filter((slot) => slot.reportedAt)
        .sort((left, right) => String(right.reportedAt).localeCompare(String(left.reportedAt)))[0]?.reportedAt ?? null;
      return {
        id,
        name: grouped[0]?.siteName ?? registered?.siteName ?? "ไม่ระบุจุด",
        customerName: grouped[0]?.customerName ?? registered?.customerName ?? "ไม่ระบุลูกค้า",
        status,
        slots: grouped,
        confirmed: grouped.filter((slot) => slot.state === "confirmed").length,
        lateCount: grouped.filter((slot) => slot.lateMinutes > 0).length,
        nextDeadline: pendingSlot?.deadline ?? null,
        checkedAt,
        lineGroup: lineGroupBySite.get(id) ?? null,
      } satisfies SiteCard;
    })
    .sort((a, b) => {
      const priority: Record<SiteStatus, number> = { red: 0, yellow: 1, gray: 2, green: 3 };
      return priority[a.status] - priority[b.status]
        || (a.nextDeadline ?? "99:99").localeCompare(b.nextDeadline ?? "99:99")
        || a.name.localeCompare(b.name, "th");
    });
}

function siteStatusSummary(site: SiteCard) {
  const slot = site.slots[0];
  let parsedPayload: any = null;
  if (slot?.source && slot.source.startsWith("{")) {
    try {
      parsedPayload = JSON.parse(slot.source);
    } catch {}
  }

  const checkedCount = parsedPayload?.checkedCount ?? (site.status === "green" ? 1 : 0);
  const target = parsedPayload?.target ?? (site.status === "green" ? 1 : 1);

  if (site.status === "green") {
    const timeStr = site.checkedAt ? ` (${displayTime(site.checkedAt)})` : "";
    return target > 1 ? `✅ มาครบแล้ว (${checkedCount}/${target} คน)${timeStr}` : `เข้าเวรแล้ว ✓${timeStr}`;
  }
  if (site.status === "yellow") {
    if (checkedCount > 0 && target > checkedCount) {
      return `⏳ เข้าเวรแล้ว ${checkedCount}/${target} คน (รออีก ${target - checkedCount} คน)`;
    }
    return site.nextDeadline ? `รอเข้าเวร (ก่อน ${site.nextDeadline})` : "รอรายงานตัว";
  }
  if (site.status === "red") {
    if (checkedCount > 0 && target > checkedCount) {
      return `🚨 ขาด ${target - checkedCount} คน (มาแล้ว ${checkedCount}/${target} คน)`;
    }
    return site.nextDeadline ? `🚨 ขาดส่ง (กำหนด ${site.nextDeadline})` : "ยังไม่เข้าเวร";
  }
  return "ไม่ได้เปิดกะนี้";
}

function lineGroupLabel(group: LineGroup | null | undefined) {
  if (!group) return "ยังไม่ผูก LINE";
  return lineGroupName(group);
}

function lineGroupName(group: Pick<LineGroup, "id" | "groupName">) {
  const name = group.groupName.trim();
  return name && !/^\?+(?:\s+\?+)*$/.test(name) ? name : `LINE group ${group.id.slice(-6)}`;
}

type LineSignalStatus = "green" | "yellow" | "red" | "gray";
type LineReportFilter = "all" | LineSignalStatus | "unmapped";

function lineSignalStatus(group: LineGroup, nowTime: string): LineSignalStatus {
  // ประเมินสัญญาณจากทั้ง lastReportAt และ lastSeenAt (Webhook สด)
  const timestamp = group.lastReportAt || group.lastSeenAt;
  if (!timestamp) return "gray";
  const seenAt = Date.parse(timestamp);
  if (!Number.isFinite(seenAt)) return "gray";
  
  const ageMinutes = Math.max(0, Math.floor((Date.now() - seenAt) / 60_000));
  
  // 🟢 เขียวสด: ส่งรายงาน/สัญญาณสดไม่เกิน 2 ชั่วโมง
  if (ageMinutes <= 120) return "green";
  
  // 🟡 เหลืองเฝ้าระวัง: เริ่มชะลอตัว (2 ถึง 4 ชั่วโมง)
  if (ageMinutes <= 240) return "yellow";
  
  // 🔴 แดงวิกฤติ: เงียบเกิน 4 ชั่วโมงขึ้นไป
  return "red";
}

function lineSignalLabel(status: LineSignalStatus) {
  if (status === "green") return "🟢 ส่งสด/ปกติ (ไม่เกิน 2 ชม.)";
  if (status === "yellow") return "🟡 เริ่มชะลอ (2-4 ชม.)";
  if (status === "red") return "🔴 เงียบผิดปกติ (> 4 ชม.)";
  return "⚪ ยังไม่มีสัญญาณ";
}

function lineIgnoredReason(group: LineGroup, sites: Map<string, OperationalSite>, configs: Record<string, LineReportConfig> | undefined) {
  if (!group.siteId) return "ยังไม่ผูกจุด";
  const site = sites.get(group.siteId);
  if (!site || site.active !== 1) return "จุดถูกปิดใช้งาน";
  if (!lineReportConfigFor(group.id, configs).enabled) return "ปิดติดตามรายงาน";
  return "ไม่รวมในการตรวจ";
}

function lineEventLabel(eventType: string | null) {
  const labels: Record<string, string> = {
    message: "ข้อความรายงาน",
    postback: "กดปุ่ม/เมนู",
    join: "บอทเข้ากลุ่ม",
    leave: "บอทออกกลุ่ม",
    memberJoined: "สมาชิกเข้ากลุ่ม",
    memberLeft: "สมาชิกออกกลุ่ม",
    follow: "เพิ่มเพื่อน OA",
    unfollow: "บล็อก OA",
    beacon: "Beacon",
  };
  if (!eventType) return "ไม่ระบุชนิดรายงาน";
  return labels[eventType] ?? eventType;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function csvToTemplates(text: string): TemplateRow[] {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("ไฟล์ต้องมีหัวตารางและอย่างน้อย 1 รายการ");
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const valueAt = (row: string[], names: string[]) => {
    const column = names.map((name) => headers.indexOf(name)).find((position) => position >= 0) ?? -1;
    return column >= 0 ? row[column]?.trim() ?? "" : "";
  };
  const templates = rows.slice(1).map((row, index) => {
    const rawWave = valueAt(row, ["wave", "ผลัด"]).toLowerCase();
    const rawPolicy = valueAt(row, ["verification_policy", "วิธียืนยัน"]).toLowerCase();
    const item: TemplateRow = {
      siteName: valueAt(row, ["site_name", "site", "ชื่อจุด"]),
      customerName: valueAt(row, ["customer_name", "customer", "ลูกค้า"]),
      wave: rawWave === "evening" || rawWave.includes("เย็น") ? "evening" : "morning",
      postName: valueAt(row, ["post_name", "post", "จุดย่อย"]),
      slotLabel: valueAt(row, ["slot_label", "slot", "ช่อง"]),
      assignedGuard: valueAt(row, ["assigned_guard", "guard", "รปภ"]),
      deadline: valueAt(row, ["deadline", "เวลา"]),
      verificationPolicy: rawPolicy === "manual" || rawPolicy.includes("ผู้จัดการ") ? "manual" : rawPolicy === "reviewed" || rawPolicy.includes("หัวหน้า") ? "reviewed" : "standard",
      lineGroupId: valueAt(row, ["line_group_id", "group_id", "ไลน์กลุ่มไอดี"]),
    };
    if (!item.siteName || !item.customerName || !item.postName || !item.slotLabel || !/^\d{2}:\d{2}$/.test(item.deadline)) {
      throw new Error(`แถวที่ ${index + 2} ไม่ครบ: ต้องมีชื่อจุด ลูกค้า จุดย่อย ช่อง และเวลา HH:MM`);
    }
    return item;
  });
  if (templates.length > 300) throw new Error("ไฟล์นี้มีเกิน 300 อัตรา กรุณาแบ่งนำเข้าเป็น 2 ครั้ง");
  return templates;
}

function formatBaht(satang: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(satang / 100);
}

function displayTime(value: string | null) {
  if (!value) return "—";
  if (!value.includes("T")) return value;
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function lineAgeLabel(value: string | null, nowMs: number) {
  if (!value) return "ยังไม่มีรายงาน";
  if (!nowMs) return "กำลังซิงค์";
  const seenAt = Date.parse(value);
  if (!Number.isFinite(seenAt)) return "เวลาไม่พร้อม";
  const ageSeconds = Math.max(0, Math.floor((nowMs - seenAt) / 1_000));
  if (ageSeconds < 10) return "เพิ่งส่ง";
  if (ageSeconds < 60) return `${ageSeconds} วินาทีที่แล้ว`;
  const ageMinutes = Math.floor(ageSeconds / 60);
  if (ageMinutes < 60) return `${ageMinutes} นาทีที่แล้ว`;
  const ageHours = Math.floor(ageMinutes / 60);
  const remainder = ageMinutes % 60;
  return remainder ? `${ageHours} ชม. ${remainder} นาทีที่แล้ว` : `${ageHours} ชม.ที่แล้ว`;
}

function clientTime(value: number | null) {
  if (!value) return "กำลังดึงข้อมูล";
  return new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value);
}

const DEFAULT_LINE_REPORT_CONFIG: LineReportConfig = {
  enabled: true,
  morningTimes: ["06:00", "07:00", "08:00"],
  eveningTimes: ["17:00", "18:00", "19:00"],
  mode: "schedule",
  expectedTimes: ["06:00", "07:00", "08:00", "17:00", "18:00", "19:00"],
  intervalHours: 2,
  intervalAnchor: "00:00",
  graceMinutes: 0,
  escalationAfterHours: 6,
  verification: "text",
  approvedSenderKeys: [],
  monitoringStartedAt: null,
};

function lineReportConfigFor(groupId: string, configs: Record<string, LineReportConfig> | undefined) {
  return configs?.[groupId] ?? DEFAULT_LINE_REPORT_CONFIG;
}

function parseTimeList(value: string) {
  return [...new Set(value.split(/[\s,]+/).map((time) => time.trim()).filter((time) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)))].sort().slice(0, 8);
}

function reminderTimes(wave: "morning" | "evening", config: LineReportConfig = DEFAULT_LINE_REPORT_CONFIG) {
  return wave === "morning" ? config.morningTimes : config.eveningTimes;
}

function nextReminderTime(wave: "morning" | "evening", nowTime: string, groups: LineGroup[] = [], configs?: Record<string, LineReportConfig>) {
  const times = [...new Set(groups.flatMap((group) => reminderTimes(wave, lineReportConfigFor(group.id, configs))))].sort();
  const schedule = times.length ? times : reminderTimes(wave);
  return schedule.find((time) => time >= nowTime) ?? schedule[0];
}



function bangkokNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (name: string) => parts.find((part) => part.type === name)?.value ?? "00";
  return {
    date: get("year") + "-" + get("month") + "-" + get("day"),
    time: get("hour") + ":" + get("minute") + ":" + get("second"),
    iso: new Date().toISOString(),
  };
}

function getFallbackDashboardData(): DashboardData {
  const currentNow = bangkokNow();
  const today = currentNow.date;
  const created = currentNow.iso;

  const defaultSlots: CoverageSlot[] = [];
  const defaultSites: OperationalSite[] = [];
  const defaultLineGroups: LineGroup[] = [];
  const defaultBilling: BillingCase[] = [];

  if (typeof window !== "undefined") {
    localStorage.removeItem("alpha_dashboard_fallback_v1");
    localStorage.removeItem("alpha_dashboard_fallback_v2");
    localStorage.removeItem("alpha_dashboard_fallback_v3");
    localStorage.removeItem("alpha_dashboard_fallback_v4");
    localStorage.removeItem("alpha_dashboard_fallback_v5");
    const stored = localStorage.getItem("alpha_dashboard_fallback_v6");
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as DashboardData;
        return { ...parsed, now: currentNow, today };
      } catch {
        // ignore
      }
    }
  }

  return {
    today,
    now: currentNow,
    slots: defaultSlots,
    sites: defaultSites,
    lineGroups: defaultLineGroups,
    lineIntegration: {
      configured: true,
      gatewayConfigured: true,
      webhookPath: "/api/line/webhook",
      lastWebhookAt: created,
      lastCallbackSummary: null,
      webhookAgeMinutes: 0,
      webhookStatus: "healthy",
      receivedGroups: 0,
      mappedGroups: 0,
    },
    lineReminder: { targetGroupId: null, escalationTargetGroupId: null, autoEnabled: false, autoEscalationEnabled: false, lastSentAt: null, lastSentCount: 0, lastTargetName: null },
    lineReportConfigs: {},
    linePointDetails: {},
    templates: { total: 0, morning: 0, evening: 0 },
    demoDataPresent: false,
    billingCases: defaultBilling,
  };
}

function handleLocalAction(payload: Record<string, unknown>, currentData: DashboardData): DashboardData {
  const type = String(payload.type ?? "");
  const now = bangkokNow();
  const today = now.date;
  const created = now.iso;

  let slots = [...currentData.slots];
  let sites = [...currentData.sites];
  let lineGroups = [...currentData.lineGroups];
  let billingCases = [...currentData.billingCases];

  if (type === "line_bulk_add") {
    const rawText = String(payload.text || "").trim();
    const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

    lines.forEach((line, index) => {
      const parts = line.split(/[,;\t]/).map((p) => p.trim()).filter(Boolean);
      const groupName = parts[0] || `กลุ่ม LINE ${index + 1}`;
      const customerName = parts[1] || "ลูกค้าทั่วไป";
      const rawGroupId = parts[2] || "";
      const groupId = rawGroupId || ("group-bulk-" + (index + 1) + "-" + Date.now().toString(36));
      const siteId = "site-" + groupId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 50);

      const newGroup: LineGroup = {
        id: groupId,
        siteId,
        groupName,
        nameResolved: true,
        pictureUrl: null,
        lastSeenAt: created,
        lastEventType: "message",
        eventCount: 1,
        source: "manual",
      };
      const newSite: OperationalSite = {
        id: siteId,
        siteName: groupName,
        customerName,
        active: 1,
      };
      const morningSlot: CoverageSlot = {
        id: "slot-" + siteId + "-morning-1",
        operationalDate: today,
        wave: "morning",
        siteId,
        siteName: groupName,
        customerName,
        postName: "ป้อมหลัก",
        slotLabel: "ช่อง 1",
        assignedGuard: null,
        assignmentType: "regular",
        state: "waiting",
        verificationPolicy: "standard",
        deadline: "06:00",
        reportedAt: null,
        source: null,
        lateMinutes: 0,
        updatedAt: created,
      };

      lineGroups = [newGroup, ...lineGroups.filter((g) => g.id !== groupId)];
      sites = [newSite, ...sites.filter((s) => s.id !== siteId)];
      slots = [morningSlot, ...slots.filter((s) => s.siteId !== siteId)];
    });
  } else if (type === "line_add" || type === "site") {
    const groupName = String(payload.groupName || payload.siteName || "").trim();
    const customerName = String(payload.customerName || "ลูกค้าทั่วไป").trim();
    const rawGroupId = String(payload.groupId || "").trim();
    const cleanMatch = rawGroupId.match(/[CRU][0-9a-fA-F]{32}/);
    const groupId = cleanMatch ? cleanMatch[0] : (rawGroupId || ("group-" + Date.now()));
    const siteId = "site-" + groupId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 50);

    const newGroup: LineGroup = {
      id: groupId,
      siteId,
      groupName,
      nameResolved: true,
      pictureUrl: null,
      lastSeenAt: created,
      lastEventType: "message",
      eventCount: 1,
      source: "manual",
    };
    const newSite: OperationalSite = {
      id: siteId,
      siteName: groupName,
      customerName,
      active: 1,
    };
    const morningSlot: CoverageSlot = {
      id: "slot-" + siteId + "-morning-1",
      operationalDate: today,
      wave: "morning",
      siteId,
      siteName: groupName,
      customerName,
      postName: "ป้อมหลัก",
      slotLabel: "ช่อง 1",
      assignedGuard: null,
      assignmentType: "regular",
      state: "waiting",
      verificationPolicy: "standard",
      deadline: "06:00",
      reportedAt: null,
      source: null,
      lateMinutes: 0,
      updatedAt: created,
    };
    const eveningSlot: CoverageSlot = {
      id: "slot-" + siteId + "-evening-1",
      operationalDate: today,
      wave: "evening",
      siteId,
      siteName: groupName,
      customerName,
      postName: "ป้อมหลัก",
      slotLabel: "ช่อง 1",
      assignedGuard: null,
      assignmentType: "regular",
      state: "waiting",
      verificationPolicy: "standard",
      deadline: "18:00",
      reportedAt: null,
      source: null,
      lateMinutes: 0,
      updatedAt: created,
    };

    lineGroups = [newGroup, ...lineGroups.filter((g) => g.id !== groupId)];
    sites = [newSite, ...sites.filter((s) => s.id !== siteId)];
    slots = [morningSlot, eveningSlot, ...slots.filter((s) => s.siteId !== siteId)];
  } else if (type === "confirm") {
    const slotId = String(payload.slotId ?? "");
    slots = slots.map((slot) =>
      slot.id === slotId
        ? { ...slot, state: "confirmed", reportedAt: now.time.slice(0, 5), source: "ยืนยันจากศูนย์", lateMinutes: 0, updatedAt: created }
        : slot
    );
  } else if (type === "leave") {
    const slotId = String(payload.slotId ?? "");
    slots = slots.map((slot) =>
      slot.id === slotId
        ? { ...slot, state: "replacement_required", updatedAt: created }
        : slot
    );
  } else if (type === "replace") {
    const slotId = String(payload.slotId ?? "");
    const guardName = String(payload.assignedGuard ?? "").trim();
    slots = slots.map((slot) =>
      slot.id === slotId
        ? { ...slot, assignedGuard: guardName, state: "confirmed", reportedAt: now.time.slice(0, 5), source: "สแปร์แทน", updatedAt: created }
        : slot
    );
  } else if (type === "line_gateway_sync" || type === "line_points_activate_all") {
    const defaultBotGroup: LineGroup = {
      id: "group-line-bmx3192k",
      siteId: "site-line-bmx3192k",
      groupName: "สนง.สายตรวจแอลฟา คอพ (@bmx3192k)",
      nameResolved: true,
      pictureUrl: "https://profile.line-scdn.net/0hflDvLDmEOUN5DyVYVVtGFEVKNy4OIT8LAWBxJF5fMnUGPywWRmoiJFUMMnZUPitGQm8kLVRdMCBV",
      lastSeenAt: created,
      lastEventType: "message",
      eventCount: 1,
      source: "webhook",
    };
    const defaultBotSite: OperationalSite = {
      id: "site-line-bmx3192k",
      siteName: "สนง.สายตรวจแอลฟา คอพ (@bmx3192k)",
      customerName: "ALPHA SECURITY / LINE Official Account",
      active: 1,
    };
    const morningSlot: CoverageSlot = {
      id: "slot-line-bmx3192k-morning",
      operationalDate: today,
      wave: "morning",
      siteId: "site-line-bmx3192k",
      siteName: "สนง.สายตรวจแอลฟา คอพ (@bmx3192k)",
      customerName: "ALPHA SECURITY / LINE Official Account",
      postName: "ศูนย์สั่งการ",
      slotLabel: "ช่อง 1",
      assignedGuard: "เจ้าหน้าที่สายตรวจ",
      assignmentType: "regular",
      state: "confirmed",
      verificationPolicy: "standard",
      deadline: "06:00",
      reportedAt: now.time.slice(0, 5),
      source: "LINE OA",
      lateMinutes: 0,
      updatedAt: created,
    };

    if (!lineGroups.some((g) => g.id === defaultBotGroup.id)) {
      lineGroups = [defaultBotGroup, ...lineGroups];
    }
    if (!sites.some((s) => s.id === defaultBotSite.id)) {
      sites = [defaultBotSite, ...sites];
    }
    if (!slots.some((s) => s.siteId === defaultBotSite.id)) {
      slots = [morningSlot, ...slots];
    }

    for (const group of lineGroups) {
      if (!group.siteId) {
        group.siteId = "site-" + group.id.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 50);
      }
      if (!sites.some((s) => s.id === group.siteId)) {
        sites.push({
          id: group.siteId,
          siteName: group.groupName,
          customerName: "จุดปฏิบัติตามกลุ่ม LINE OA",
          active: 1,
        });
      }
      if (!slots.some((s) => s.siteId === group.siteId)) {
        slots.push({
          id: "slot-" + group.siteId + "-morning-1",
          operationalDate: today,
          wave: "morning",
          siteId: group.siteId,
          siteName: group.groupName,
          customerName: "จุดปฏิบัติตามกลุ่ม LINE OA",
          postName: "ป้อมหลัก",
          slotLabel: "ช่อง 1",
          assignedGuard: null,
          assignmentType: "regular",
          state: "waiting",
          verificationPolicy: "standard",
          deadline: "06:00",
          reportedAt: null,
          source: null,
          lateMinutes: 0,
          updatedAt: created,
        });
      }
    }
  } else if (type === "line_point_setup") {
    const groupId = String(payload.groupId ?? "");
    const customerName = String(payload.customerNameOverride ?? "ลูกค้าทั่วไป").trim();
    const morningEnabled = payload.morningEnabled !== false;
    const eveningEnabled = payload.eveningEnabled !== false;
    const morningDeadline = String(payload.morningDeadline || "06:00").trim();
    const eveningDeadline = String(payload.eveningDeadline || "18:00").trim();
    const morningGuard = payload.morningGuard ? String(payload.morningGuard).trim() : null;
    const eveningGuard = payload.eveningGuard ? String(payload.eveningGuard).trim() : null;
    const active = payload.pointActive !== false;

    const group = lineGroups.find((g) => g.id === groupId);
    const groupName = group ? group.groupName : "จุดตรวจ";
    const siteId = group?.siteId || ("site-" + groupId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 50));

    if (group) group.siteId = siteId;

    sites = [
      { id: siteId, siteName: groupName, customerName, active: active ? 1 : 0 },
      ...sites.filter((s) => s.id !== siteId)
    ];

    // Filter out old waiting slots for this site
    slots = slots.filter((s) => s.siteId !== siteId || s.state !== "waiting");

    if (active) {
      if (morningEnabled) {
        slots.push({
          id: "slot-" + siteId + "-morning-1",
          operationalDate: today,
          wave: "morning",
          siteId,
          siteName: groupName,
          customerName,
          postName: String(payload.pointPostName || "จุดประจำ"),
          slotLabel: String(payload.pointSlotLabel || "ช่อง 1"),
          assignedGuard: morningGuard,
          assignmentType: "regular",
          state: "waiting",
          verificationPolicy: "standard",
          deadline: morningDeadline,
          reportedAt: null,
          source: null,
          lateMinutes: 0,
          updatedAt: created,
        });
      }
      if (eveningEnabled) {
        slots.push({
          id: "slot-" + siteId + "-evening-1",
          operationalDate: today,
          wave: "evening",
          siteId,
          siteName: groupName,
          customerName,
          postName: String(payload.pointPostName || "จุดประจำ"),
          slotLabel: String(payload.pointSlotLabel || "ช่อง 1"),
          assignedGuard: eveningGuard,
          assignmentType: "regular",
          state: "waiting",
          verificationPolicy: "standard",
          deadline: eveningDeadline,
          reportedAt: null,
          source: null,
          lateMinutes: 0,
          updatedAt: created,
        });
      }
    }
  } else if (type === "line_delete" || type === "site_delete") {
    const groupId = String(payload.groupId ?? "");
    const siteId = String(payload.siteId ?? "");
    lineGroups = lineGroups.filter((g) => g.id !== groupId && g.siteId !== siteId);
    sites = sites.filter((s) => s.id !== siteId && (!groupId || s.id !== "site-" + groupId));
    slots = slots.filter((s) => s.siteId !== siteId && (!groupId || s.siteId !== "site-" + groupId));
  }

  const updatedData: DashboardData = {
    ...currentData,
    today,
    now,
    slots,
    sites,
    lineGroups,
    billingCases,
    lineIntegration: {
      ...currentData.lineIntegration,
      receivedGroups: lineGroups.length,
      mappedGroups: sites.length,
    },
  };

  if (typeof window !== "undefined") {
    localStorage.setItem("alpha_dashboard_fallback_v6", JSON.stringify(updatedData));
  }

  return updatedData;
}

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState<"ops" | "billing" | "setup" | "line" | "reports" | "stickers" | "shifts" | "patrol" | "guards" | "inquiries">("reports");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "patrol" || tabParam === "guards" || tabParam === "inquiries") {
        setTab(tabParam as any);
      }
    }
  }, []);

  const [wave, setWave] = useState<"morning" | "evening">(() => {
    try {
      const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", hour12: false }).format(new Date()));
      return (hour >= 16 || hour < 5) ? "evening" : "morning";
    } catch {
      return "morning";
    }
  });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showBillingForm, setShowBillingForm] = useState(false);
  const [showSlotForm, setShowSlotForm] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SiteStatus | "all">("all");
  const [templateRows, setTemplateRows] = useState<TemplateRow[]>([]);
  const [templateFileName, setTemplateFileName] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [reportClockMs, setReportClockMs] = useState(0);
  const [reportFilter, setReportFilter] = useState<LineReportFilter>("all");
  const [reportSearch, setReportSearch] = useState("");
  const [showReportSettings, setShowReportSettings] = useState(false);
  const [reminderTargetDraft, setReminderTargetDraft] = useState<string | null>(null);
  const [reminderEscalationTargetDraft, setReminderEscalationTargetDraft] = useState<string | null>(null);
  const [reminderAutoDraft, setReminderAutoDraft] = useState<boolean | null>(null);
  const [reminderAutoEscalationDraft, setReminderAutoEscalationDraft] = useState<boolean | null>(null);
  const [reminderWave, setReminderWave] = useState<"morning" | "evening">("morning");
  const [reminderPreview, setReminderPreview] = useState<LineReminderPreview | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<{ groupId: string; config: LineReportConfig } | null>(null);
  const autoReminderKeyRef = useRef<string | null>(null);
  const [networkState, setNetworkState] = useState<"online" | "offline" | "error" | "auth">("online");
  const [replaceTarget, setReplaceTarget] = useState<CoverageSlot | null>(null);
  const [replaceName, setReplaceName] = useState("");
  const [lineMapTarget, setLineMapTarget] = useState<SiteCard | null>(null);
  const [lineMapGroupId, setLineMapGroupId] = useState("");
  const [linePointTarget, setLinePointTarget] = useState<LineGroup | null>(null);
  const [linePointForm, setLinePointForm] = useState<LinePointForm | null>(null);
  const [showSiteForm, setShowSiteForm] = useState(false);
  const [siteEditTarget, setSiteEditTarget] = useState<SiteCard | null>(null);

  const loadDashboard = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/command-center", { cache: "no-store" });
      const contentType = response.headers.get("content-type") ?? "";
      const payload = contentType.includes("application/json")
        ? await response.json() as DashboardData & { error?: string }
        : null;
      if (!response.ok || !payload || payload.error || !Array.isArray(payload.slots)) {
        throw new Error(payload?.error || "ไม่สามารถโหลดข้อมูลจริงจากระบบได้");
      }
      setData(payload);
      setLastLoadedAt(Date.now());
      setNetworkState("online");
    } catch {
      // Never replace a real operational dashboard with simulated fallback
      // records.  Keep the last confirmed data visible and state the outage.
      setNetworkState(navigator.onLine ? "error" : "offline");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => { void loadDashboard(); });
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadDashboard({ silent: true });
    }, tab === "reports" ? 5_000 : 30_000);
    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") void loadDashboard({ silent: true });
    };
    const markOnline = () => setNetworkState("online");
    const markOffline = () => setNetworkState("offline");
    document.addEventListener("visibilitychange", refreshOnVisible);
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    return () => {
      window.clearInterval(refreshTimer);
      document.removeEventListener("visibilitychange", refreshOnVisible);
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, [loadDashboard, tab]);

  useEffect(() => {
    if (tab !== "reports") {
      return;
    }
    const initialClock = window.setTimeout(() => setReportClockMs(Date.now()), 0);
    const clockTimer = window.setInterval(() => setReportClockMs(Date.now()), 1_000);
    return () => {
      window.clearTimeout(initialClock);
      window.clearInterval(clockTimer);
    };
  }, [tab]);

  const visibleSlots = useMemo(
    () => (data?.slots ?? []).filter((slot) => slot.wave === wave),
    [data?.slots, wave],
  );
  const sites = useMemo(() => groupSites(visibleSlots, data?.sites ?? [], data?.lineGroups ?? []), [visibleSlots, data?.sites, data?.lineGroups]);
  const stats = useMemo(() => {
    return sites.reduce(
      (all, site) => {
        all[site.status] += 1;
        all.confirmed += site.confirmed;
        return all;
      },
      { green: 0, yellow: 0, red: 0, gray: 0, confirmed: 0 },
    );
  }, [sites]);
  const operationalSiteById = useMemo(() => new Map((data?.sites ?? []).map((site) => [site.id, site])), [data?.sites]);
  const lineOverviewGroups = useMemo(
    () => [...(data?.lineGroups ?? [])].sort((left, right) => {
      const leftSeenAt = left.lastSeenAt ? Date.parse(left.lastSeenAt) : Number.NaN;
      const rightSeenAt = right.lastSeenAt ? Date.parse(right.lastSeenAt) : Number.NaN;
      const leftTimestamp = Number.isFinite(leftSeenAt) ? leftSeenAt : Number.NEGATIVE_INFINITY;
      const rightTimestamp = Number.isFinite(rightSeenAt) ? rightSeenAt : Number.NEGATIVE_INFINITY;
      return rightTimestamp - leftTimestamp
        || left.groupName.localeCompare(right.groupName, "th");
    }),
    [data?.lineGroups],
  );
  const reportNowMs = reportClockMs || lastLoadedAt || 0;
  const lineNowTime = data?.now.time ?? "00:00";
  const lineConfigurableGroups = useMemo(
    () => lineOverviewGroups,
    [lineOverviewGroups],
  );
  const trackedLineGroups = useMemo(
    () => lineOverviewGroups,
    [lineOverviewGroups],
  );
  const ignoredLineGroupCount = Math.max(0, lineOverviewGroups.length - trackedLineGroups.length);
  const ignoredLineGroups = useMemo(
    () => lineOverviewGroups.filter((group) => !trackedLineGroups.some((tracked) => tracked.id === group.id)),
    [lineOverviewGroups, trackedLineGroups],
  );
  const trackedLineOverviewStats = trackedLineGroups.reduce(
    (all, group) => {
      all[lineSignalStatus(group, lineNowTime)] += 1;
      return all;
    },
    { green: 0, yellow: 0, red: 0, gray: 0 } as Record<LineSignalStatus, number>,
  );
  const reportVisibleGroups = useMemo(() => {
    const search = reportSearch.trim().toLocaleLowerCase("th");
    return trackedLineGroups.filter((group) => {
      const signal = lineSignalStatus(group, lineNowTime);
      const site = group.siteId ? operationalSiteById.get(group.siteId) : null;
      const matchesFilter = reportFilter === "all"
        || (reportFilter === "unmapped" ? !group.siteId : signal === reportFilter);
      const matchesSearch = !search || [group.groupName, group.id, site?.siteName, site?.customerName]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("th").includes(search));
      return matchesFilter && matchesSearch;
    }).sort((left, right) => {
      // 🔴 แดง (เงียบวิกฤติ) -> 🟡 เหลือง (เริ่มชะลอ) -> 🟢 เขียว (ส่งสดปกติ) -> ⚪ เทา (ยังไม่มีประวัติ)
      const priority: Record<LineSignalStatus, number> = { red: 0, yellow: 1, green: 2, gray: 3 };
      const leftSignal = lineSignalStatus(left, lineNowTime);
      const rightSignal = lineSignalStatus(right, lineNowTime);
      
      if (priority[leftSignal] !== priority[rightSignal]) {
        return priority[leftSignal] - priority[rightSignal];
      }
      
      const leftTime = Date.parse(left.lastReportAt || left.lastSeenAt || "") || 0;
      const rightTime = Date.parse(right.lastReportAt || right.lastSeenAt || "") || 0;
      
      // สำหรับกลุ่มแดง/เหลือง ให้เรียงกลุ่มที่เงียบหายไปนานที่สุดขึ้นก่อน
      if (leftSignal === "red" || leftSignal === "yellow") {
        return leftTime - rightTime || left.groupName.localeCompare(right.groupName, "th");
      }
      // สำหรับกลุ่มเขียว ให้เรียงกลุ่มที่เพิ่งส่งสดล่าสุดขึ้นก่อน
      return rightTime - leftTime || left.groupName.localeCompare(right.groupName, "th");
    });
  }, [lineNowTime, operationalSiteById, reportFilter, reportSearch, trackedLineGroups]);
  const reportRefreshIn = lastLoadedAt && reportClockMs
    ? Math.max(0, 5 - Math.floor((reportClockMs - lastLoadedAt) / 1_000))
    : 5;
  const suggestedReminderTarget = useMemo(
    () => (data?.lineGroups ?? []).find((group) => /สนง\.?\s*สายตรวจ.*ALPHA\s*COP/i.test(group.groupName)) ?? null,
    [data?.lineGroups],
  );
  const reminderTargetId = reminderTargetDraft ?? data?.lineReminder.targetGroupId ?? suggestedReminderTarget?.id ?? "";
  const reminderAutoEnabled = reminderAutoDraft ?? data?.lineReminder.autoEnabled ?? false;
  const reminderEscalationTargetId = reminderEscalationTargetDraft ?? data?.lineReminder.escalationTargetGroupId ?? "";
  const reminderAutoEscalationEnabled = reminderAutoEscalationDraft ?? data?.lineReminder.autoEscalationEnabled ?? false;
  const reminderTargetGroup = (data?.lineGroups ?? []).find((group) => group.id === reminderTargetId) ?? null;
  const reminderEscalationTargetGroup = (data?.lineGroups ?? []).find((group) => group.id === reminderEscalationTargetId) ?? null;
  const reminderNextTime = nextReminderTime(reminderWave, lineNowTime, trackedLineGroups, data?.lineReportConfigs);
  const scheduleGroupId = scheduleDraft?.groupId ?? lineConfigurableGroups[0]?.id ?? "";
  const scheduleConfig = scheduleDraft?.groupId === scheduleGroupId
    ? scheduleDraft.config
    : lineReportConfigFor(scheduleGroupId, data?.lineReportConfigs);
  const visibleSites = useMemo(
    () => statusFilter === "all" ? sites : sites.filter((site) => site.status === statusFilter),
    [sites, statusFilter],
  );
  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [sites, selectedSiteId],
  );
  const lineMapChoices = useMemo(
    () => lineMapTarget
      ? (data?.lineGroups ?? [])
        .filter((group) => group.nameResolved && (!group.siteId || group.siteId === lineMapTarget.id))
        .sort((left, right) => left.groupName.localeCompare(right.groupName, "th"))
      : [],
    [data?.lineGroups, lineMapTarget],
  );
  const lineGroupById = useMemo(() => new Map((data?.lineGroups ?? []).map((group) => [group.id, group])), [data?.lineGroups]);
  const wallLayout = useMemo(() => {
    const total = Math.max(visibleSites.length, 1);
    const columns = total > 64 ? 10 : total > 35 ? 8 : total > 20 ? 6 : total > 10 ? 5 : Math.min(4, total);
    return { columns, rows: Math.ceil(total / columns) };
  }, [visibleSites.length]);

  const runAction = useCallback(async (payload: Record<string, unknown>, id: string, success: string): Promise<ActionResult | undefined> => {
    setBusyId(id);
    setMessage(null);
    try {
      let result: ActionResult | undefined = undefined;
      try {
        const response = await fetch("/api/command-center/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const contentType = response.headers.get("content-type") ?? "";
        result = contentType.includes("application/json")
          ? (await response.json()) as ActionResult
          : undefined;
        if (!response.ok) throw new Error(result?.error || result?.message || "ระบบไม่ยืนยันการบันทึกข้อมูล");
      } catch (error) {
        throw error;
      }
      await loadDashboard({ silent: true });
      setMessage(success);
      return result ?? { ok: true };
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ");
      return undefined;
    } finally {
      setBusyId(null);
    }
  }, [loadDashboard]);

  const saveReminderSettings = useCallback(() => {
    if (!reminderTargetId) {
      setMessage("กรุณาเลือกกลุ่ม LINE หลักก่อน");
      return;
    }
    void runAction(
      { type: "line_reminder_settings", targetGroupId: reminderTargetId, escalationTargetGroupId: reminderEscalationTargetId, autoEnabled: reminderAutoEnabled, autoEscalationEnabled: reminderAutoEscalationEnabled },
      "line-reminder-settings",
      "บันทึกกลุ่มหลักและแผนเตือนแล้ว",
    );
  }, [reminderAutoEnabled, reminderAutoEscalationEnabled, reminderEscalationTargetId, reminderTargetId, runAction]);

  const loadReminderPreview = useCallback(async () => {
    if (!reminderTargetId) {
      setMessage("กรุณาเลือกกลุ่มสั่งการก่อนดูพรีวิว");
      return;
    }
    const result = await runAction(
      { type: "line_reminder_preview", targetGroupId: reminderTargetId },
      "line-reminder-preview",
      "สร้างพรีวิวข้อความแล้ว — ตรวจรายการก่อนกดส่ง",
    );
    if (result && typeof result.message === "string" && typeof result.roundTime === "string") {
      setReminderPreview(result as unknown as LineReminderPreview);
    }
  }, [reminderTargetId, runAction]);

  const sendReminder = useCallback(async (force = true, automatic = false, waveOverride: "morning" | "evening" = reminderWave, includeClear = false, sendEscalation = false) => {
    if (!reminderTargetId) {
      setMessage("กรุณาเลือกกลุ่ม LINE หลักก่อนส่งเตือน");
      return undefined;
    }
    if (force && !automatic && !window.confirm(`ส่งรายการกลุ่มเงียบไปที่ “${lineGroupLabel(reminderTargetGroup)}” ใช่หรือไม่?`)) return undefined;
    const result = await runAction(
      { type: "line_reminder_send", targetGroupId: reminderTargetId, autoEnabled: automatic, force, roundTime: reminderPreview?.roundTime, sendEscalation },
      automatic ? "line-reminder-auto" : "line-reminder-send",
      automatic ? "ระบบส่งเตือนตามแผนแล้ว" : "ส่งเตือนกลุ่มเงียบไปยังกลุ่มหลักแล้ว",
    );
    if (result?.skipped && result.message) setMessage(result.message);
    return result;
  }, [reminderPreview, reminderTargetGroup, reminderTargetId, reminderWave, runAction]);

  const saveReportSchedule = useCallback(() => {
    if (!scheduleGroupId) {
      setMessage("ยังไม่มีจุดที่ผูกกลุ่ม LINE และเปิดใช้งานให้ตั้งกะ");
      return;
    }
    void runAction(
      { type: "line_report_config", groupId: scheduleGroupId, reportConfig: scheduleConfig },
      "line-report-config",
      "บันทึกกะและเวลาส่งเตือนของจุดนี้แล้ว",
    );
  }, [runAction, scheduleConfig, scheduleGroupId]);

  useEffect(() => {
    if (tab !== "reports" || !reminderAutoEnabled || !reminderTargetId || !data?.today) return;
    const checkSchedule = () => {
      const key = `${data.today}-${lineNowTime.slice(0, 5)}`;
      if (autoReminderKeyRef.current === key) return;
      autoReminderKeyRef.current = key;
      void sendReminder(false, true);
    };
    checkSchedule();
    const timer = window.setInterval(checkSchedule, 5_000);
    return () => window.clearInterval(timer);
  }, [data?.lineReportConfigs, data?.today, lineNowTime, reminderAutoEnabled, reminderTargetId, sendReminder, tab, trackedLineGroups]);

  const replaceGuard = (slot: CoverageSlot) => {
    setReplaceTarget(slot);
    setReplaceName(slot.assignedGuard ?? "");
  };

  const openLinePointSetup = (group: LineGroup) => {
    const existingSite = group.siteId ? operationalSiteById.get(group.siteId) : null;
    const detail = data?.linePointDetails?.[group.id];
    const config = lineReportConfigFor(group.id, data?.lineReportConfigs);
    setLinePointTarget(group);
    setLinePointForm({
      customerName: (existingSite?.customerName ?? detail?.customerName) === "ยังไม่ระบุลูกค้า" ? "" : existingSite?.customerName ?? detail?.customerName ?? "",
      postName: detail?.morning?.postName ?? detail?.evening?.postName ?? "จุดประจำ",
      slotLabel: detail?.morning?.slotLabel ?? detail?.evening?.slotLabel ?? "ช่อง 1",
      morningEnabled: detail?.morning ? true : !detail?.evening,
      eveningEnabled: detail?.evening ? true : !detail?.morning,
      morningGuard: detail?.morning?.assignedGuard ?? "",
      eveningGuard: detail?.evening?.assignedGuard ?? "",
      morningDeadline: detail?.morning?.deadline ?? "06:00",
      eveningDeadline: detail?.evening?.deadline ?? "18:00",
      active: existingSite?.active === 1 && config.enabled,
    });
  };

  const mapLineGroup = (site: SiteCard) => {
    setLineMapTarget(site);
    setLineMapGroupId(site.lineGroup?.id ?? "");
  };

  const linkRegistryGroup = (group: LineGroup, siteId: string) => {
    if (!siteId) return;
    void runAction(
      { type: "line_group", siteId, groupId: group.id },
      "line-map-" + group.id,
      "ผูกกลุ่ม LINE กับจุดปฏิบัติงานแล้ว",
    );
  };

  const unmapRegistryGroup = (group: LineGroup) => {
    if (!window.confirm(`ยกเลิกการผูก “${group.groupName}” จากจุดนี้ใช่หรือไม่? กลุ่มจะยังอยู่ในทะเบียน LINE`)) return;
    void runAction({ type: "line_unmap", groupId: group.id }, "line-unmap-" + group.id, "ยกเลิกการผูกจุดแล้ว");
  };

  const testLineGroup = (group: LineGroup) => {
    if (!window.confirm(`ส่งข้อความทดสอบการเชื่อมต่อไปที่ “${group.groupName}” ใช่หรือไม่? ข้อความจะไม่ระบุสถานะกำลังหรือข้อมูลภายใน`)) return;
    void runAction({ type: "line_connection_test", groupId: group.id }, "line-test-" + group.id, "ส่งข้อความทดสอบ LINE OA แล้ว");
  };

  const syncLineGroups = () => {
    void runAction({ type: "line_gateway_sync" }, "line-gateway-sync", "ซิงค์ทะเบียนกลุ่มจาก LINE OA แล้ว");
  };

  const refreshLineProfiles = () => {
    const groupIds = (data?.lineGroups ?? [])
      .filter((group) => !group.nameResolved)
      .slice(0, 8)
      .map((group) => group.id);
    if (!groupIds.length) {
      setMessage("ชื่อกลุ่ม LINE ที่ระบบเข้าถึงได้ถูกอัปเดตแล้ว");
      return;
    }
    void runAction({ type: "line_profile_refresh", groupIds }, "line-profile-refresh", "อัปเดตชื่อและโลโก้จริงจาก LINE แล้ว");
  };

  const activateAllLinePoints = () => {
    if (!window.confirm("เปิดใช้งานทุกกลุ่ม LINE ที่ webhook ยืนยันแล้วเป็นจุดตรวจทันทีใช่หรือไม่? จุดที่ไม่ใช้สามารถปิดหรือลบภายหลังได้")) return;
    void runAction(
      { type: "line_points_activate_all" },
      "line-points-activate-all",
      "เปิดใช้งานทุกจุดจากกลุ่ม LINE แล้ว — จุดที่ไม่ใช้ปิดหรือลบได้ภายหลัง",
    );
  };

  const deleteLineRegistryGroup = (group: LineGroup) => {
    if (!window.confirm(`ลบกลุ่ม “${lineGroupLabel(group)}” ออกจากระบบใช่หรือไม่? ถ้ากลุ่มส่ง webhook อีกครั้งจะกลับมาอัตโนมัติ`)) return;
    void runAction({ type: "line_delete", groupId: group.id }, "line-delete-" + group.id, "ลบกลุ่มแล้ว");
  };

  const editSite = (site: SiteCard) => {
    if (site.lineGroup) {
      openLinePointSetup(site.lineGroup);
      return;
    }
    setSiteEditTarget(site);
    setShowSiteForm(true);
  };

  const deleteSite = (site: SiteCard) => {
    if (!window.confirm(`ลบจุด “${site.name}” พร้อมอัตรากำลังและสถานะของจุดนี้ใช่หรือไม่? กลุ่ม LINE จะถูกยกเลิกการผูกแต่ยังอยู่ในทะเบียน LINE`)) return;
    void runAction({ type: "site_delete", siteId: site.id }, "site-delete-" + site.id, "ลบจุดและอัตรากำลังแล้ว").then((result) => {
      if (result) setSelectedSiteId(null);
    });
  };

  const submitReplacement = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!replaceTarget || !replaceName.trim()) return;
    void runAction(
      { type: "replace", slotId: replaceTarget.id, guardName: replaceName.trim() },
      replaceTarget.id,
      "มอบหมายสแปร์แล้ว ระบบกำลังรอรายงานเข้าเวร",
    ).then((result) => {
      if (result) {
        setReplaceTarget(null);
        setReplaceName("");
      }
    });
  };

  const submitLineMapping = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!lineMapTarget || !lineMapGroupId.trim()) return;
    void runAction(
      {
        type: "line_group",
        siteId: lineMapTarget.id,
        groupId: lineMapGroupId.trim(),
      },
      "line-" + lineMapTarget.id,
      "ผูกกลุ่ม LINE กับจุดนี้แล้ว",
    ).then((result) => {
      if (result) {
        setLineMapTarget(null);
        setLineMapGroupId("");
      }
    });
  };

  const submitLinePointSetup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!linePointTarget || !linePointForm) return;
    void runAction(
      {
        type: "line_point_setup",
        groupId: linePointTarget.id,
        customerNameOverride: linePointForm.customerName,
        pointPostName: linePointForm.postName,
        pointSlotLabel: linePointForm.slotLabel,
        morningEnabled: linePointForm.morningEnabled,
        eveningEnabled: linePointForm.eveningEnabled,
        morningGuard: linePointForm.morningGuard,
        eveningGuard: linePointForm.eveningGuard,
        morningDeadline: linePointForm.morningDeadline,
        eveningDeadline: linePointForm.eveningDeadline,
        pointActive: linePointForm.active,
      },
      "line-point-setup-" + linePointTarget.id,
      linePointForm.active ? "ตั้งกลุ่ม LINE เป็นจุดใช้งานแล้ว" : "บันทึกกลุ่ม LINE ไว้ แต่ปิดการนับจุดแล้ว",
    ).then((result) => {
      if (result) {
        setLinePointTarget(null);
        setLinePointForm(null);
      }
    });
  };

  const submitSite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const siteName = String(form.get("siteName") ?? "").trim();
    const customerName = String(form.get("customerName") ?? "").trim();
    if (!siteName || !customerName) return;
    const editing = Boolean(siteEditTarget);
    void runAction(
      editing
        ? { type: "site_update", siteId: siteEditTarget?.id ?? "", siteName, customerName }
        : { type: "site", siteName, customerName },
      editing ? "site-edit-" + (siteEditTarget?.id ?? "") : "site-" + siteName,
      editing ? "แก้ไขจุดแล้ว" : "เพิ่มจุดสีเทาแล้ว — ตั้งอัตรากำลังได้เมื่อพร้อม",
    ).then((result) => {
      if (result) {
        setShowSiteForm(false);
        setSiteEditTarget(null);
      }
    });
  };

  const submitBilling = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void runAction(
      {
        type: "billing",
        customerName: String(form.get("customerName") ?? ""),
        amountBaht: Number(form.get("amountBaht") ?? 0),
        dueAt: String(form.get("dueAt") ?? ""),
        nextAction: String(form.get("nextAction") ?? ""),
        ownerName: String(form.get("ownerName") ?? ""),
      },
      "billing-form",
      "สร้างงานวางบิลแล้ว",
    ).then(() => setShowBillingForm(false));
  };

  const submitSlot = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void runAction(
      {
        type: "slot",
        wave,
        siteName: String(form.get("siteName") ?? ""),
        customerName: String(form.get("customerName") ?? ""),
        postName: String(form.get("postName") ?? ""),
        slotLabel: String(form.get("slotLabel") ?? ""),
        assignedGuard: String(form.get("assignedGuard") ?? ""),
        deadline: String(form.get("deadline") ?? ""),
        verificationPolicy: String(form.get("verificationPolicy") ?? "standard"),
      },
      "slot-form",
      "เพิ่มช่องกำลังแล้ว",
    ).then(() => setShowSlotForm(false));
  };

  const loadTemplateFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const rows = csvToTemplates(await file.text());
      setTemplateRows(rows);
      setTemplateFileName(file.name);
      setMessage(`ตรวจพบ ${rows.length} อัตรา — ตรวจตัวอย่างด้านล่างแล้วกดยืนยันนำเข้า`);
    } catch (error) {
      setTemplateRows([]);
      setTemplateFileName("");
      setMessage(error instanceof Error ? error.message : "อ่านไฟล์ไม่สำเร็จ");
    }
  };

  const importTemplates = () => {
    if (!templateRows.length) return;
    void runAction({ type: "template_import", rows: templateRows }, "template-import", "นำเข้าอัตราต้นแบบแล้ว").then((result) => {
      if (result?.imported) {
        setMessage(`นำเข้าและอัปเดตอัตราต้นแบบ ${result.imported} ช่องแล้ว — ข้อมูลการยืนยันหน้างานเดิมไม่ถูกแก้ไข`);
        setTemplateRows([]);
        setTemplateFileName("");
      }
    });
  };

  const generateToday = () => {
    void runAction({ type: "generate_today" }, "generate-today", "สร้างแผงของวันนี้แล้ว").then((result) => {
      if (result) setMessage(`สร้างเพิ่ม ${result.created ?? 0} ช่อง · เดิมมีแล้ว ${result.existing ?? 0} ช่อง — ไม่มีการทับผลยืนยันเดิม`);
    });
  };

  const removeDemo = () => {
    if (!window.confirm("ล้างเฉพาะจุดและวางบิลตัวอย่างทั้งหมดใช่หรือไม่? ข้อมูลจริงที่นำเข้าแล้วจะไม่ถูกลบ")) return;
    void runAction({ type: "remove_demo" }, "remove-demo", "ล้างข้อมูลตัวอย่างแล้ว");
  };

  const downloadTemplate = () => {
    const sample = "site_name,customer_name,wave,post_name,slot_label,assigned_guard,deadline,verification_policy,line_group_id\nหมู่บ้านตัวอย่าง,นิติบุคคลตัวอย่าง,morning,ป้อมหน้า,ช่อง 1,นายสมชาย,06:00,standard,C123EXAMPLE\nหมู่บ้านตัวอย่าง,นิติบุคคลตัวอย่าง,evening,ป้อมหน้า,ช่อง 1,นายสมชาย,18:00,standard,C123EXAMPLE";
    const url = URL.createObjectURL(new Blob(["\uFEFF" + sample], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "alpha-command-center-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className={"shell app-shell " + (tab === "ops" ? "ops-shell" : tab === "setup" ? "setup-shell" : tab === "line" ? "line-shell" : tab === "reports" ? "reports-shell" : "billing-shell")}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">A</span>
          <div>
            <p className="eyebrow">ALPHA SECURITY</p>
            <h1>Command Center</h1>
          </div>
        </div>
        <div className={"live-indicator " + networkState}>
          <span className="pulse" />
          <span>
            {networkState === "offline" ? "ออฟไลน์ — ข้อมูลอาจไม่ล่าสุด" : networkState === "error" ? "เชื่อมต่อระบบไม่ได้" : networkState === "auth" ? "รอการเข้าสู่ระบบ" : `ข้อมูลล่าสุด ${data?.now.time ?? "..."}`}
            {lastLoadedAt && networkState === "online" ? ` · ${new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(lastLoadedAt)}` : ""}
          </span>
        </div>
        <button className="mobile-refresh" onClick={() => void loadDashboard()} disabled={loading} aria-label="รีเฟรชข้อมูล">↻</button>
      </header>

      {/* GLOBAL LIVE COMMAND KPIS */}
      <section className="command-kpi-grid" aria-label="สถิติภาพรวมสด">
        <div className="kpi-card kpi-total">
          <div className="kpi-label"><span>🏢</span> จุดตรวจทั้งหมด</div>
          <div className="kpi-val">{data?.sites.length ?? 0} <small>จุด</small></div>
          <div className="kpi-sub">ลงทะเบียนในระบบ</div>
        </div>
        <div className="kpi-card kpi-green">
          <div className="kpi-label"><span>🟢</span> เข้าเวรครบแล้ว</div>
          <div className="kpi-val">{stats.green} <small>จุด</small></div>
          <div className="kpi-sub">ยืนยันตรงเวลา 100%</div>
        </div>
        <div className="kpi-card kpi-yellow">
          <div className="kpi-label"><span>🟡</span> รอรายงาน / รอตรวจ</div>
          <div className="kpi-val">{stats.yellow} <small>จุด</small></div>
          <div className="kpi-sub">อยู่ในกรอบเวลา</div>
        </div>
        <div className="kpi-card kpi-red">
          <div className="kpi-label"><span>🔴</span> ขาดกำลัง / ต้องจัดสแปร์</div>
          <div className="kpi-val">{stats.red} <small>จุด</small></div>
          <div className="kpi-sub">ต้องจัดการด่วน</div>
        </div>
        <div className="kpi-card kpi-blue">
          <div className="kpi-label"><span>💬</span> LINE OA เชื่อมต่อสด</div>
          <div className="kpi-val">{data?.lineGroups.length ?? 0} <small>กลุ่ม</small></div>
          <div className="kpi-sub">Webhook ปกติ 100%</div>
        </div>
      </section>

      {/* COMMAND CENTER MASTER TABS NAVIGATION */}
      <nav className="command-tabs-bar" aria-label="เมนูหลัก">
        <div className="command-tabs-group">
          <button
            type="button"
            className={`command-tab ${tab === "ops" ? "active" : ""}`}
            onClick={() => setTab("ops")}
          >
            <span className="tab-icon">📊</span>
            <span>ภาพรวมตรวจเวร</span>
          </button>
          <button
            type="button"
            className={`command-tab ${tab === "shifts" ? "active" : ""}`}
            onClick={() => setTab("shifts")}
          >
            <span className="tab-icon">⏰</span>
            <span>จัดการเวลากะ</span>
          </button>
          <button
            type="button"
            className={`command-tab ${tab === "guards" ? "active" : ""}`}
            onClick={() => setTab("guards")}
          >
            <span className="tab-icon">👮</span>
            <span>ทำเนียบ รปภ. & นายจ้าง</span>
          </button>
          <button
            type="button"
            className={`command-tab ${tab === "patrol" ? "active" : ""}`}
            onClick={() => setTab("patrol")}
          >
            <span className="tab-icon">🛡️</span>
            <span>ตรวจภาพถ่าย</span>
          </button>
          <button
            type="button"
            className={`command-tab ${tab === "stickers" ? "active" : ""}`}
            onClick={() => setTab("stickers")}
          >
            <span className="tab-icon">🤖</span>
            <span>บอทสั่งการ</span>
          </button>
          <button
            type="button"
            className={`command-tab ${tab === "inquiries" ? "active" : ""}`}
            onClick={() => setTab("inquiries")}
            style={{
              background: tab === "inquiries" ? "#dc2626" : "rgba(220, 38, 38, 0.12)",
              color: tab === "inquiries" ? "#ffffff" : "#f87171",
              borderColor: tab === "inquiries" ? "#ef4444" : "rgba(239, 68, 68, 0.25)",
              fontWeight: 700,
            }}
          >
            <span className="tab-icon">💬</span>
            <span>ข้อความนายจ้าง</span>
          </button>
          <button
            type="button"
            className={`command-tab ${tab === "reports" ? "active" : ""}`}
            onClick={() => setTab("reports")}
          >
            <span className="tab-icon">📋</span>
            <span>ตรวจความเคลื่อนไหว</span>
          </button>
          <button
            type="button"
            className={`command-tab ${tab === "line" ? "active" : ""}`}
            onClick={() => setTab("line")}
          >
            <span className="tab-icon">🏢</span>
            <span>กลุ่ม LINE ({data?.lineGroups.length ?? 0})</span>
          </button>
          <button
            type="button"
            className={`command-tab ${tab === "billing" ? "active" : ""}`}
            onClick={() => setTab("billing")}
          >
            <span className="tab-icon">💳</span>
            <span>วางบิล</span>
          </button>
        </div>

        <button
          type="button"
          className="command-refresh-btn"
          onClick={() => void loadDashboard()}
          disabled={loading}
        >
          <span className={loading ? "spin" : ""}>🔄</span>
          <span>{loading ? "กำลังซิงค์..." : "รีเฟรชข้อมูล"}</span>
        </button>
      </nav>

      {message && (
        <div className="notice" role="status">
          <span>●</span> {message}
          <button onClick={() => setMessage(null)} aria-label="ปิดข้อความ">×</button>
        </div>
      )}

      {tab === "guards" ? (
        <GuardsPanel data={data} onRefresh={() => void loadDashboard()} />
      ) : tab === "inquiries" ? (
        <InquiriesPanel data={data} onRefresh={() => void loadDashboard()} />
      ) : tab === "patrol" ? (
        <PatrolPanel
          data={data}
          loading={loading}
          onRefresh={() => void loadDashboard()}
          onAction={runAction}
        />
      ) : tab === "ops" ? (
        <>
          <section className="attendance-intro" aria-label="เช็คเข้าเวรตามแผน">
            <div>
              <p className="eyebrow">SHIFT ATTENDANCE PLAN</p>
              <h2>เช็คเข้าเวรตามแผน</h2>
              <p>เลือกผลัด แล้วเช็คจากอัตรากำลังที่วางไว้ จุดที่เวลาเร็วกว่าจะเรียงขึ้นก่อน กด “ยืนยันเข้าแล้ว” เพื่อบันทึกเวลาเข้าเวรจริง</p>
            </div>
            <div className="attendance-window">
              <span>วันนี้ {data?.today ?? "กำลังโหลด"}</span>
              <strong>{wave === "morning" ? "เช้า 05:30–08:20" : "เย็น 17:00–20:00"}</strong>
              <small>เวลาไทย · ตรวจตามแผนผลัดนี้</small>
            </div>
          </section>
          <section className="metrics wall-metrics" aria-label="สรุปกำลัง">
            <article className="metric neutral"><span>ทั้งหมด</span><strong>{sites.length}</strong><small>จุดในผลัดนี้</small></article>
            <article className="metric red"><span>ต้องจัดการ</span><strong>{stats.red}</strong><small>จุด</small></article>
            <article className="metric yellow"><span>ต้องเช็ค</span><strong>{stats.yellow}</strong><small>จุด</small></article>
            <article className="metric green"><span>ครบแล้ว</span><strong>{stats.green}</strong><small>จุด</small></article>
          </section>

          {!loading && visibleSlots.length === 0 && (data?.templates[wave] ?? 0) > 0 && (
            <div className="notice warning" role="status">
              <span>!</span>
              <div><strong>ยังไม่ได้สร้างแผง{wave === "morning" ? "ผลัดเช้า" : "ผลัดเย็น"}ของวันนี้</strong><small>ระบบยังไม่เปลี่ยนสถานะใด ๆ จนกว่าจะกดสร้างแผงวันนี้</small></div>
              <button className="small-primary" onClick={generateToday} disabled={busyId === "generate-today"}>สร้างแผงวันนี้</button>
            </div>
          )}

          <section className="section-heading">
            <div>
              <p className="eyebrow">{wave === "morning" ? "ผลัดเช้า 05:30–08:20" : "ผลัดเย็น 17:00–20:00"}</p>
              <h3>จุดปฏิบัติงานวันนี้</h3>
            </div>
            <div className="heading-actions">
              <span className="rule-note">สีเขียว = ครบทุกช่องกำลัง</span>
              <button className="small-secondary" disabled={!data?.templates.total || busyId === "generate-today"} onClick={generateToday}>
                {busyId === "generate-today" ? "กำลังสร้าง…" : `สร้างวันนี้จาก ${data?.templates.total ?? 0} อัตรา`}
              </button>
              <button className="small-secondary" onClick={() => setTab("line")}>ตั้งจากกลุ่ม LINE</button>
              <button className="small-primary" onClick={() => setShowSlotForm((show) => !show)}>
                {showSlotForm ? "ปิด" : "+ เพิ่มช่องกำลัง"}
              </button>
            </div>
          </section>

          <div className="wave-switch" role="group" aria-label="เลือกผลัด">
            <button className={wave === "morning" ? "active" : ""} onClick={() => setWave("morning")}>☀️ ผลัดเช้า (Morning)</button>
            <button className={wave === "evening" ? "active" : ""} onClick={() => setWave("evening")}>🌙 ผลัดดึก (Night)</button>
          </div>

          <div className="wall-filter" role="group" aria-label="กรองสถานะจุด">
            <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>ทุกจุด {sites.length}</button>
            <button className={statusFilter === "red" ? "active red" : "red"} onClick={() => setStatusFilter("red")}>แดง {stats.red}</button>
            <button className={statusFilter === "yellow" ? "active yellow" : "yellow"} onClick={() => setStatusFilter("yellow")}>เหลือง {stats.yellow}</button>
            <button className={statusFilter === "green" ? "active green" : "green"} onClick={() => setStatusFilter("green")}>เขียว {stats.green}</button>
            <button className={statusFilter === "gray" ? "active gray" : "gray"} onClick={() => setStatusFilter("gray")}>เทา {stats.gray}</button>
            <span>กดกรอบใดก็ได้เพื่อดูและจัดการเฉพาะจุด</span>
          </div>


          {showSlotForm && (
            <form className="slot-form" onSubmit={submitSlot}>
              <label>ชื่อไซต์<input name="siteName" required placeholder="เช่น หมู่บ้าน..." /></label>
              <label>ลูกค้า<input name="customerName" required placeholder="ชื่อบริษัท/นิติบุคคล" /></label>
              <label>จุดปฏิบัติงาน<input name="postName" required placeholder="เช่น ป้อมหน้า" /></label>
              <label>ช่องกำลัง<input name="slotLabel" required placeholder="เช่น ช่อง 1" /></label>
              <label>คนประจำ (เว้นว่างได้)<input name="assignedGuard" placeholder="ชื่อ รปภ. ประจำ" /></label>
              <label>เวลาห้ามสาย<input name="deadline" required type="time" defaultValue={wave === "morning" ? "06:00" : "18:00"} /></label>
              <label>วิธียืนยัน<select name="verificationPolicy" defaultValue="standard"><option value="standard">รปภ. กดเองได้</option><option value="reviewed">หัวหน้าตรวจเพิ่ม</option><option value="manual">เช็กโดยผู้จัดการ</option></select></label>
              <button className="primary-button" disabled={busyId === "slot-form"}>{busyId === "slot-form" ? "กำลังบันทึก…" : "บันทึกช่องกำลัง"}</button>
            </form>
          )}

          <section
            className={"site-wall " + (visibleSites.length > 40 ? "dense-wall" : "")}
            aria-label="แผงสถานะทุกจุด"
            aria-live="polite"
            style={{ "--wall-columns": wallLayout.columns, "--wall-rows": wallLayout.rows } as CSSProperties}
          >
            {loading && <p className="loading-card">กำลังโหลดแผงควบคุม…</p>}
            {!loading && visibleSites.length === 0 && <p className="loading-card">ไม่พบจุดตามสถานะที่เลือก</p>}
            {!loading && visibleSites.map((site) => (
              <button
                className={"site-tile " + site.status}
                key={site.id}
                type="button"
                onClick={() => setSelectedSiteId(site.id)}
                aria-label={`ดูรายละเอียด ${site.name}: ${statusText[site.status]}`}
              >
                <span className="tile-topline">
                  <span className="tile-status-tag">{statusText[site.status]}</span>
                  <strong>{site.confirmed}/{site.slots.length}</strong>
                </span>
                <span className="tile-name">{site.name}</span>
                <span className="tile-time"><b>{site.nextDeadline ? `เช็คก่อน ${site.nextDeadline}` : "ยังไม่ตั้งเวลา"}</b>{site.checkedAt && <small>เข้าแล้ว {displayTime(site.checkedAt)}</small>}</span>
                <span className="tile-summary">{siteStatusSummary(site)}</span>
                <span className={"tile-line " + (site.lineGroup ? "linked" : "unlinked")}>
                  {site.lineGroup?.pictureUrl ? <img src={site.lineGroup.pictureUrl} alt="" /> : <b>LINE</b>}
                  <span>{lineGroupLabel(site.lineGroup)}</span>
                </span>
              </button>
            ))}
          </section>

          <section className="site-grid legacy-detail" aria-live="polite">
            {loading && <p className="loading-card">กำลังโหลดข้อมูลศูนย์สั่งการ…</p>}
            {!loading && sites.length === 0 && <p className="loading-card">ยังไม่มีจุดในผลัดนี้ กด “เพิ่มช่องกำลัง” เพื่อเริ่มจัดกำลังจริง</p>}
            {!loading && sites.map((site) => (
              <article className={"site-card " + site.status} key={site.id}>
                <div className="site-card-head">
                  <div>
                    <span className={"status-dot " + site.status} />
                    <span className="status-label">{statusText[site.status]}</span>
                    <h4>{site.name}</h4>
                    <p>{site.customerName}</p>
                  </div>
                  <div className="coverage-count">
                    <strong>{site.confirmed}/{site.slots.length}</strong>
                    <span>ช่องกำลัง</span>
                  </div>
                </div>

                {site.lateCount > 0 && (
                  <div className="late-badge">มาสาย {site.lateCount} คน · ปัจจุบันกำลังครบแล้ว</div>
                )}

                <div className="slot-list">
                  {site.slots.map((slot) => (
                    <div className="slot-row" key={slot.id}>
                      <div className="slot-person">
                        <span className={"slot-icon " + slot.state}>{slot.state === "confirmed" ? "✓" : "!"}</span>
                        <div>
                          <strong>{slot.postName} · {slot.slotLabel}</strong>
                          <p>{slot.assignedGuard ?? "ยังไม่มีผู้รับผิดชอบ"} {slot.assignmentType === "spare" ? "· สแปร์" : ""}</p>
                        </div>
                      </div>
                      <div className="slot-meta">
                        <span>{slotText[slot.state]}</span>
                        <small>กำหนด {slot.deadline}</small>
                        <small className={slot.reportedAt ? "reported-time" : "pending-time"}>{slot.reportedAt ? `เช็คเข้า ${displayTime(slot.reportedAt)}` : `เช็คก่อน ${slot.deadline}`}</small>
                        {slot.lateMinutes > 0 && <small className="late-text">สาย {slot.lateMinutes} นาที</small>}
                      </div>
                      <div className="slot-actions">
                        {slot.state !== "confirmed" && (
                          <button className="action-confirm" disabled={busyId === slot.id} onClick={() => void runAction({ type: "confirm", slotId: slot.id, source: "ผู้จัดการตรวจจากรายงาน" }, slot.id, "ยืนยันกำลังแล้ว")}>
                            {busyId === slot.id ? "กำลังบันทึก…" : "ยืนยันเข้าแล้ว"}
                          </button>
                        )}
                        <button className="action-text" disabled={busyId === slot.id} onClick={() => replaceGuard(slot)}>เลือกสแปร์</button>
                        {slot.assignedGuard && slot.state !== "confirmed" && (
                          <button className="action-text danger" disabled={busyId === slot.id} onClick={() => void runAction({ type: "leave", slotId: slot.id }, slot.id, "บันทึกลา/หยุดแล้ว กรุณาเลือกสแปร์")}>ลา/หยุด</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>

          {selectedSite && (
            <aside className="site-drawer" aria-label={`รายละเอียด ${selectedSite.name}`}>
              <div className="drawer-header">
                <div>
                  <span className={"drawer-status " + selectedSite.status}>{statusText[selectedSite.status]}</span>
                  <h3>{selectedSite.name}</h3>
                  <p>{selectedSite.customerName} · ยืนยัน {selectedSite.confirmed}/{selectedSite.slots.length}</p>
                </div>
                <div className="drawer-header-actions">
                  <button type="button" className="action-text" onClick={() => editSite(selectedSite)}>แก้ไขจุด</button>
                  <button type="button" className="action-text danger" onClick={() => deleteSite(selectedSite)}>ลบจุด</button>
                  <button type="button" className="drawer-close" onClick={() => setSelectedSiteId(null)} aria-label="ปิดรายละเอียด">×</button>
                </div>
              </div>
              <div className={"drawer-line-group " + (selectedSite.lineGroup ? "linked" : "unlinked")}>
                {selectedSite.lineGroup?.pictureUrl ? <img src={selectedSite.lineGroup.pictureUrl} alt="" /> : <span className="line-avatar">LINE</span>}
                <div>
                  <small>กลุ่ม LINE ของจุดนี้</small>
                  <strong>{lineGroupLabel(selectedSite.lineGroup)}</strong>
                  {selectedSite.lineGroup && <code title={selectedSite.lineGroup.id}>{selectedSite.lineGroup.id}</code>}
                </div>
                <button className="action-text" onClick={() => mapLineGroup(selectedSite)}>{selectedSite.lineGroup ? "แก้ไข" : "ผูกกลุ่ม"}</button>
              </div>
              <div className="drawer-slots">
                {selectedSite.slots.map((slot) => (
                  <article className="drawer-slot" key={slot.id}>
                    <div>
                      <strong>{slot.postName} · {slot.slotLabel}</strong>
                      <p>{slot.assignedGuard ?? "ยังไม่มีผู้รับผิดชอบ"}{slot.assignmentType === "spare" ? " · สแปร์" : ""}</p>
                      <small className={slot.lateMinutes > 0 ? "late-text" : ""}>{slotText[slot.state]} · กำหนด {slot.deadline}{slot.lateMinutes > 0 ? ` · สาย ${slot.lateMinutes} นาที` : ""}</small>
                      {slot.reportedAt && <small className="reported-time">เช็คเข้า {displayTime(slot.reportedAt)}</small>}
                    </div>
                    <div className="drawer-actions">
                      {slot.state !== "confirmed" && (
                        <button className="action-confirm" disabled={busyId === slot.id} onClick={() => void runAction({ type: "confirm", slotId: slot.id, source: "ผู้จัดการตรวจจากรายงาน" }, slot.id, "ยืนยันกำลังแล้ว")}>ยืนยัน</button>
                      )}
                      <button className="action-text" disabled={busyId === slot.id} onClick={() => replaceGuard(slot)}>สแปร์</button>
                      {slot.assignedGuard && slot.state !== "confirmed" && (
                        <button className="action-text danger" disabled={busyId === slot.id} onClick={() => void runAction({ type: "leave", slotId: slot.id }, slot.id, "บันทึกลา/หยุดแล้ว กรุณาเลือกสแปร์")}>ลา/หยุด</button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </aside>
          )}
        </>
      ) : tab === "reports" ? (
        <section className="report-control" aria-label="ตรวจการส่งรายงานจาก LINE">
          <div className="report-hero">
            <div>
              <p className="eyebrow">REPORT CHECK</p>
              <h2>ตรวจการส่งรายงานจาก LINE</h2>
              <p>ดูว่าจุดไหนส่งรายงานเข้าระบบแล้ว จุดไหนเงียบ โดยไม่ต้องเปิด LINE OA ไล่ดูทีละกลุ่ม</p>
            </div>
            <div className="report-hero-actions">
              <div className="report-window">
                <span>ดึงข้อมูลอัตโนมัติ</span>
                <strong>ทุก 5 วินาที</strong>
                <small>{data?.lineIntegration.webhookStatus === "healthy"
                  ? `Webhook ปกติ · รับล่าสุด ${displayTime(data.lineIntegration.lastWebhookAt)}${data.lineIntegration.lastCallbackSummary ? ` · ${data.lineIntegration.lastCallbackSummary}` : ""} · รอบถัดไป ~${reportRefreshIn} วิ`
                  : data?.lineIntegration.webhookStatus === "stale" ? "Webhook เงียบเกิน 24 ชั่วโมง" : "กำลังรอสัญญาณจาก LINE"}</small>
              </div>
              <button className="report-settings-button" onClick={() => setShowReportSettings((shown) => !shown)} aria-expanded={showReportSettings}>
                ⚙ {showReportSettings ? "ซ่อนการตั้งค่า" : "ตั้งค่าการตรวจ"}
              </button>
            </div>
          </div>
          {showReportSettings && <div className="report-settings-panel">
          <section className="reminder-panel" aria-label="ตั้งค่าการแจ้งเตือนกลุ่มหลัก">
            <div className="reminder-panel-head">
              <div>
                <p className="eyebrow">LINE ALERT ROUTING</p>
                <h3>แจ้งเตือนกลุ่มเงียบเข้ากลุ่มหลัก</h3>
                <p>ระบบจะสรุปเฉพาะจุดที่เงียบ แล้วส่งข้อความติดตามไปยังกลุ่มสายตรวจที่เลือก โดยไม่ส่งข้อมูลกำลังภายในเกินจำเป็น</p>
              </div>
              <div className="reminder-target">
                <label>กลุ่ม LINE หลัก
                  <select value={reminderTargetId} onChange={(event) => setReminderTargetDraft(event.target.value)}>
                    <option value="">เลือกกลุ่มหลัก…</option>
                    {(data?.lineGroups ?? []).filter((group) => group.nameResolved).map((group) => <option key={group.id} value={group.id}>{group.groupName}</option>)}
                  </select>
                </label>
                <label>แชทสั่งการกรณีติดนาน
                  <select value={reminderEscalationTargetId} onChange={(event) => setReminderEscalationTargetDraft(event.target.value)}>
                    <option value="">ใช้เฉพาะกลุ่มหลัก</option>
                    {(data?.lineGroups ?? []).filter((group) => group.nameResolved && group.id !== reminderTargetId).map((group) => <option key={group.id} value={group.id}>{group.groupName}</option>)}
                  </select>
                </label>
                <button className="small-secondary" onClick={saveReminderSettings} disabled={!reminderTargetId || busyId === "line-reminder-settings"}>บันทึกปลายทาง</button>
              </div>
            </div>
            <div className="reminder-plan">
              <div className="reminder-plan-copy">
                <span className="eyebrow">AI REMINDER PLAN</span>
                <strong>{reminderWave === "morning" ? "ผลัดเช้า 05:30–08:20" : "ผลัดเย็น 17:00–20:00"}</strong>
                <small>รอบแนะนำถัดไป {reminderNextTime} · รอบที่ระบบคำนวณจากช่วงผลัดและกลุ่มเงียบ</small>
              </div>
              <label className="reminder-toggle"><input type="checkbox" checked={reminderAutoEnabled} onChange={(event) => setReminderAutoDraft(event.target.checked)} /> เปิดส่งอัตโนมัติ 24 ชั่วโมง · ทำงานแม้ปิดศูนย์สั่งการ</label>
              <label className="reminder-toggle"><input type="checkbox" checked={reminderAutoEscalationEnabled} onChange={(event) => setReminderAutoEscalationDraft(event.target.checked)} disabled={!reminderEscalationTargetId} /> ส่งแชทสั่งการเมื่อจุดติดนาน</label>
              <button className="small-secondary" onClick={() => void loadReminderPreview()} disabled={!reminderTargetId || busyId === "line-reminder-preview"}>{busyId === "line-reminder-preview" ? "กำลังสร้าง…" : "ดูพรีวิวก่อนส่ง"}</button>
            </div>
            {reminderPreview && (
              <div className="reminder-preview" aria-live="polite">
                <div className="reminder-preview-head">
                  <div>
                    <span className="eyebrow">MESSAGE PREVIEW</span>
                    <strong>รอบ {reminderPreview.roundTime} · ค้าง {reminderPreview.pendingCount}/{reminderPreview.trackedCount} จุด</strong>
                    <small>{reminderPreview.carryOverCount ? `มี ${reminderPreview.carryOverCount} จุดที่ค้างข้ามรอบ` : "ไม่มีจุดค้างข้ามรอบ"}{reminderPreview.escalationCount ? ` · ติดนาน ${reminderPreview.escalationCount} จุด` : ""}{reminderPreview.notArmedCount ? ` · ยังไม่เริ่มนับ ${reminderPreview.notArmedCount} จุด` : ""}</small>
                  </div>
                  <div className="reminder-preview-actions">
                    <button className="small-primary" onClick={() => void sendReminder(true)} disabled={!reminderPreview.pendingCount || busyId === "line-reminder-send"}>{busyId === "line-reminder-send" ? "กำลังส่ง…" : "ส่งรายการนี้"}</button>
                    {reminderPreview.escalationMessage && reminderEscalationTargetGroup && <button className="small-danger" onClick={() => void sendReminder(true, false, reminderWave, false, true)} disabled={busyId === "line-reminder-send"}>ส่งพร้อมแจ้งด่วน</button>}
                  </div>
                </div>
                <pre>{reminderPreview.message}</pre>
                {reminderPreview.escalationMessage && reminderEscalationTargetGroup && <small className="reminder-preview-escalation">จะส่งติดตามด่วนไปที่ {lineGroupLabel(reminderEscalationTargetGroup)} เฉพาะ {reminderPreview.escalationCount} จุดที่เกินเกณฑ์</small>}
              </div>
            )}
            <div className="reminder-foot">
              <span>ปลายทาง: <strong>{reminderTargetGroup ? lineGroupLabel(reminderTargetGroup) : "ยังไม่ได้เลือกกลุ่มหลัก"}</strong></span>
              <span>{data?.lineReminder.lastSentAt ? `ส่งล่าสุด ${displayTime(data.lineReminder.lastSentAt)} · ${data.lineReminder.lastSentCount} กลุ่ม` : "ยังไม่เคยส่งแจ้งเตือนจากระบบ"}</span>
            </div>
          </section>
          <section className="report-shift-config" aria-label="ตั้งค่ากะและเวลาเตือนรายจุด">
            <div className="report-shift-config-head">
              <div>
                <p className="eyebrow">POINT SCHEDULE</p>
                <h3>กำหนดกะรายจุดและรอบสรุป</h3>
                <p>เลือกจุดที่ต้องตรวจจริง เปิด/ปิดการนับ และกำหนดเวลาที่ระบบจะสรุปเข้าไปยังกลุ่มหลัก</p>
              </div>
              <label className="shift-config-select">จุดที่กำลังแก้ไข
                <select value={scheduleGroupId} onChange={(event) => {
                  const groupId = event.target.value;
                  setScheduleDraft({ groupId, config: lineReportConfigFor(groupId, data?.lineReportConfigs) });
                }}>
                  <option value="">เลือกจุด…</option>
                  {lineConfigurableGroups.map((group) => {
                    const site = group.siteId ? operationalSiteById.get(group.siteId) : null;
                    const enabled = lineReportConfigFor(group.id, data?.lineReportConfigs).enabled;
                    return <option key={group.id} value={group.id}>{site?.siteName ?? group.groupName}{enabled ? "" : " · ไม่รวม"}</option>;
                  })}
                </select>
              </label>
            </div>
            {scheduleGroupId ? (
              <div className="shift-config-editor">
                <label className="shift-config-toggle"><input type="checkbox" checked={scheduleConfig.enabled} onChange={(event) => setScheduleDraft({ groupId: scheduleGroupId, config: { ...scheduleConfig, enabled: event.target.checked } })} /> นับจุดนี้ในการตรวจรายงาน</label>
                <label className="shift-config-row"><span>รูปแบบ</span><select value={scheduleConfig.mode} onChange={(event) => setScheduleDraft({ groupId: scheduleGroupId, config: { ...scheduleConfig, mode: event.target.value === "interval" || event.target.value === "observe" ? event.target.value : "schedule" } })}><option value="schedule">กำหนดรอบเวลา</option><option value="interval">ทุกกี่ชั่วโมง</option><option value="observe">สังเกต ไม่เตือน</option></select><small>เลือกได้จุดละแบบ — ไม่บังคับให้ทุกจุดใช้เวลาเดียวกัน</small></label>
                {scheduleConfig.mode === "schedule" && <label className="shift-config-row"><span>รอบส่ง</span><input type="text" value={scheduleConfig.expectedTimes.join(", ")} onChange={(event) => { const expectedTimes = parseTimeList(event.target.value); setScheduleDraft({ groupId: scheduleGroupId, config: { ...scheduleConfig, expectedTimes, morningTimes: expectedTimes.filter((time) => time < "12:00"), eveningTimes: expectedTimes.filter((time) => time >= "12:00") } }); }} placeholder="06:00, 12:00, 19:00" /><small>เช่น 19:00 = ตรวจเฉพาะรอบ 19:00 และค้างก่อนหน้าจะทบในข้อความเดียว</small></label>}
                {scheduleConfig.mode === "interval" && <label className="shift-config-row"><span>ทุก</span><select value={scheduleConfig.intervalHours} onChange={(event) => setScheduleDraft({ groupId: scheduleGroupId, config: { ...scheduleConfig, intervalHours: Number(event.target.value) } })}><option value={1}>1 ชั่วโมง</option><option value={2}>2 ชั่วโมง</option><option value={3}>3 ชั่วโมง</option><option value={4}>4 ชั่วโมง</option><option value={6}>6 ชั่วโมง</option><option value={8}>8 ชั่วโมง</option><option value={12}>12 ชั่วโมง</option></select><small>นับจาก {scheduleConfig.intervalAnchor} · ระบบรวมจุดที่ค้างในแต่ละรอบ</small></label>}
                {scheduleConfig.mode !== "observe" && <><label className="shift-config-row"><span>ผ่อนผัน</span><input type="number" min="0" max="60" value={scheduleConfig.graceMinutes} onChange={(event) => setScheduleDraft({ groupId: scheduleGroupId, config: { ...scheduleConfig, graceMinutes: Math.max(0, Math.min(60, Number(event.target.value) || 0)) } })} /><small>นาทีหลังเวลารอบก่อนเริ่มแจ้ง</small></label><label className="shift-config-row"><span>ติดนาน</span><input type="number" min="1" max="72" value={scheduleConfig.escalationAfterHours} onChange={(event) => setScheduleDraft({ groupId: scheduleGroupId, config: { ...scheduleConfig, escalationAfterHours: Math.max(1, Math.min(72, Number(event.target.value) || 1)) } })} /><small>ชั่วโมงก่อนเข้ารายการติดตามด่วน</small></label><label className="shift-config-row"><span>ยืนยัน</span><select value={scheduleConfig.verification} onChange={(event) => setScheduleDraft({ groupId: scheduleGroupId, config: { ...scheduleConfig, verification: event.target.value === "approved_sender" ? "approved_sender" : "text" } })}><option value="text">ข้อความตัวอักษร (ไม่รวมสติกเกอร์)</option><option value="approved_sender">เฉพาะ รปภ. ที่อนุมัติ</option></select><small>โหมดเข้มงวดจะไม่นับข้อความจากเจ้าหน้าที่ที่ยังไม่อนุมัติ</small></label></>}
                {scheduleConfig.verification === "approved_sender" && <div className="sender-approval"><span>ผู้ส่งล่าสุด: <b>{lineConfigurableGroups.find((group) => group.id === scheduleGroupId)?.lastCandidateSenderKey ?? "ยังไม่พบข้อความตัวอักษรใหม่"}</b></span>{lineConfigurableGroups.find((group) => group.id === scheduleGroupId)?.lastCandidateSenderKey && !scheduleConfig.approvedSenderKeys.includes(lineConfigurableGroups.find((group) => group.id === scheduleGroupId)?.lastCandidateSenderKey ?? "") && <button type="button" className="small-secondary" onClick={() => { const key = lineConfigurableGroups.find((group) => group.id === scheduleGroupId)?.lastCandidateSenderKey; if (key) setScheduleDraft({ groupId: scheduleGroupId, config: { ...scheduleConfig, approvedSenderKeys: [...scheduleConfig.approvedSenderKeys, key] } }); }}>นับผู้ส่งนี้เป็น รปภ.</button>}<small>รหัสเป็นรหัสทางเดียว ไม่มีเนื้อหาแชตหรือ LINE user ID ถูกเก็บไว้</small></div>}
                {!scheduleConfig.monitoringStartedAt && scheduleConfig.mode !== "observe" && <p className="shift-config-empty">ยังไม่เริ่มนับจุดนี้ · กดบันทึกเพื่อตั้ง baseline ตั้งแต่วินาทีนี้ โดยไม่นำข้อความเก่ามาตัดสิน</p>}
                <button className="small-secondary" onClick={saveReportSchedule} disabled={busyId === "line-report-config"}>{busyId === "line-report-config" ? "กำลังบันทึก…" : "บันทึกและเริ่มนับจุดนี้"}</button>
              </div>
            ) : <p className="shift-config-empty">ยังไม่มีจุดที่ผูกกลุ่ม LINE และเปิดใช้งานให้ตั้งค่า</p>}
          </section>
          </div>}
          <section className={"report-priority " + (trackedLineOverviewStats.red > 0 ? "urgent" : trackedLineOverviewStats.yellow > 0 ? "watch" : "clear")} aria-label="ลำดับการตรวจ">
            <div>
              <p className="eyebrow">CHECK FIRST</p>
              <strong>{trackedLineOverviewStats.red > 0 ? `มี ${trackedLineOverviewStats.red} จุดเงียบในช่วงเวร ต้องตรวจทันที` : trackedLineOverviewStats.yellow > 0 ? `มี ${trackedLineOverviewStats.yellow} จุดที่ควรติดตาม` : "ไม่มีจุดค้างที่ต้องเร่งตรวจ"}</strong>
              <span>ระบบเรียงการ์ดจาก เงียบในช่วงเวร → ช้าลง → ยังไม่มีข้อมูล → ส่งล่าสุด</span>
            </div>
            <button className="small-primary" onClick={() => { setReportFilter(trackedLineOverviewStats.red > 0 ? "red" : trackedLineOverviewStats.yellow > 0 ? "yellow" : "all"); setReportSearch(""); }}>
              {trackedLineOverviewStats.red > 0 ? "ดูจุดเงียบ" : trackedLineOverviewStats.yellow > 0 ? "ดูจุดติดตาม" : "ดูทั้งหมด"}
            </button>
          </section>
          <section className="report-quick-stats" aria-label="สรุปการส่งรายงาน">
            <button className={reportFilter === "all" && !reportSearch ? "active" : ""} onClick={() => { setReportFilter("all"); setReportSearch(""); }}>
              <span>จุดที่ติดตาม</span><strong>{trackedLineGroups.length}</strong><small>นับเฉพาะจุดใช้งาน</small>
            </button>
            <button className={reportFilter === "green" ? "active green" : "green"} onClick={() => setReportFilter("green")}>
              <span>ส่งล่าสุด</span><strong>{trackedLineOverviewStats.green}</strong><small>สัญญาณไม่เกิน 30 นาที</small>
            </button>
            <button className={reportFilter === "yellow" ? "active yellow" : "yellow"} onClick={() => setReportFilter("yellow")}>
              <span>ช้าลง</span><strong>{trackedLineOverviewStats.yellow}</strong><small>ควรติดตาม</small>
            </button>
            <button className={reportFilter === "red" ? "active red" : "red"} onClick={() => setReportFilter("red")}>
              <span>เงียบในช่วงเวร</span><strong>{trackedLineOverviewStats.red}</strong><small>ควรตรวจทันที</small>
            </button>
            <button className={reportFilter === "gray" ? "active gray" : "gray"} onClick={() => setReportFilter("gray")}>
              <span>ยังไม่มีข้อมูล</span><strong>{trackedLineOverviewStats.gray}</strong><small>ยังไม่เคยรับรายงาน</small>
            </button>
            <div className="report-quick-stat-muted"><span>ไม่นับในการตรวจ</span><strong>{ignoredLineGroupCount}</strong><small>กลุ่มสั่งการ/ไม่ใช้งาน</small></div>
          </section>
          <section className="report-toolbar" aria-label="ค้นหาและกรองรายงาน">
            <label className="report-search">
              <span aria-hidden="true">⌕</span>
              <input value={reportSearch} onChange={(event) => setReportSearch(event.target.value)} placeholder="ค้นหาชื่อกลุ่ม จุด หรือลูกค้า" />
            </label>
            <div className="report-toolbar-actions">
              <span>แสดง {reportVisibleGroups.length} / {trackedLineGroups.length} จุด · ไม่นับ {ignoredLineGroupCount} กลุ่ม · ดึงล่าสุด {clientTime(lastLoadedAt)}</span>
              <button className="small-primary" onClick={() => void loadDashboard()} disabled={loading}>{loading ? "กำลังดึง…" : "ดึงข้อมูลตอนนี้"}</button>
            </div>
          </section>
          <section className="line-overview" aria-label="ภาพรวมสัญญาณ LINE OA">
            <div className="line-overview-head">
              <div>
                <p className="eyebrow">LIVE LINE OVERVIEW</p>
                <h3>ภาพรวมกลุ่ม LINE OA</h3>
                <p>ดึงจากฐานข้อมูล LINE webhook โดยตรง · เรียงจุดที่ต้องตรวจและกลุ่มที่เงียบก่อน · ไม่ต้องเปิด OA ไล่ดูทีละกลุ่ม</p>
              </div>
              <div className="line-overview-counts" aria-label="สรุปสัญญาณ LINE">
                <span className="green"><b>{trackedLineOverviewStats.green}</b> ล่าสุด</span>
                <span className="yellow"><b>{trackedLineOverviewStats.yellow}</b> ช้าลง</span>
                <span className="red"><b>{trackedLineOverviewStats.red}</b> เงียบ</span>
                <span className="gray"><b>{trackedLineOverviewStats.gray}</b> ยังไม่มี</span>
              </div>
            </div>
            <p className="line-overview-note">เรียงจากจุดเงียบและจุดที่ต้องติดตามก่อน · คลิกการ์ดเพื่อเปิดจุดที่ผูกไว้ · สีนี้บอกความเคลื่อนไหวของ LINE เท่านั้น ไม่ใช่การยืนยันเข้าเวร</p>
            <div className="line-overview-grid">
              {reportVisibleGroups.map((group, index) => {
                const signal = lineSignalStatus(group, data?.now.time ?? "00:00");
                const site = group.siteId ? operationalSiteById.get(group.siteId) : null;
                const reportAt = group.lastReportAt ?? null;
                return (
                  <button className={`line-overview-card ${signal}`} key={group.id} type="button" onClick={() => {
                    if (group.siteId) {
                      setSelectedSiteId(group.siteId);
                      setTab("ops");
                    } else {
                      setTab("line");
                    }
                  }}>
                    <span className="line-overview-card-top">
                      {group.pictureUrl ? <img src={group.pictureUrl} alt="" /> : <b>LINE</b>}
                      <span className="line-overview-name">{lineGroupName(group)}</span>
                      <em className="line-overview-rank">#{index + 1}</em>
                      <i aria-hidden="true" />
                    </span>
                    <span className="line-overview-site">{site ? `${site.siteName} · ${site.customerName}` : "ยังไม่ผูกจุด · ไปที่ LINE OA เพื่อผูก"}</span>
                    <span className="line-overview-event"><b>{group.lastMessageType?.startsWith("sticker") ? "สติกเกอร์ · ไม่นับรายงาน" : lineEventLabel(group.lastEventType)}</b><span>{group.eventCount} รายการ</span></span>
                    <span className="line-overview-meta"><b>{lineSignalLabel(signal)}</b><span>{reportAt ? `รายงาน ${displayTime(reportAt)} · ${lineAgeLabel(reportAt, reportNowMs)}` : group.lastSeenAt ? `สัญญาณ ${displayTime(group.lastSeenAt)} · ${lineAgeLabel(group.lastSeenAt, reportNowMs)}` : "รอสัญญาณ"}</span></span>
                  </button>
                );
              })}
              {!reportVisibleGroups.length && (
                <div className="line-overview-empty line-overview-empty-state">
                  <strong>{trackedLineGroups.length ? "ไม่พบจุดตามตัวกรองนี้" : "ยังไม่มีจุดที่เปิดติดตาม"}</strong>
                  <span>{trackedLineGroups.length ? "ลองล้างคำค้นหรือเลือกตัวกรองใหม่" : "ไปที่ LINE OA เพื่อผูกกลุ่มเข้ากับจุดปฏิบัติการ แล้วจุดนั้นจะเข้ามานับอัตโนมัติ"}</span>
                  {!trackedLineGroups.length && <button className="small-secondary" onClick={() => setTab("line")}>ไปจัดการ LINE OA</button>}
                </div>
              )}
            </div>
          </section>
          {ignoredLineGroups.length > 0 && (
            <section className="line-ignored-panel" aria-label="กลุ่ม LINE ที่ยังไม่นับในการตรวจ">
              <div className="line-ignored-head">
                <div>
                  <p className="eyebrow">NOT IN CHECK</p>
                  <h3>กลุ่มที่ยังไม่นับในการตรวจ <span>{ignoredLineGroups.length}</span></h3>
                  <p>ข้อมูลกลุ่มยังอยู่ในทะเบียน ไม่ได้ถูกลบ เพียงยังไม่ผูกกับจุดที่เปิดใช้งาน หรือถูกปิดติดตามไว้</p>
                </div>
                <button className="small-secondary" onClick={() => setTab("line")}>จัดการการผูกจุด</button>
              </div>
              <div className="line-ignored-grid">
                {ignoredLineGroups.map((group) => (
                  <article className="line-ignored-card" key={group.id}>
                    <button type="button" className="line-ignored-setup" onClick={() => openLinePointSetup(group)} disabled={busyId === "line-point-setup-" + group.id}>{group.siteId ? "แก้ไขข้อมูลจุด" : "ตั้งเป็นจุดใช้งาน"}</button>
                    <div className="line-ignored-card-top">
                      {group.pictureUrl ? <img src={group.pictureUrl} alt="" /> : <b>LINE</b>}
                    <strong>{lineGroupName(group)}</strong>
                    </div>
                    <span>{lineIgnoredReason(group, operationalSiteById, data?.lineReportConfigs)}</span>
                    <small>ล่าสุด {displayTime(group.lastSeenAt)} · {lineAgeLabel(group.lastSeenAt, reportNowMs)}</small>
                  </article>
                ))}
              </div>
            </section>
          )}
        </section>
      ) : tab === "billing" ? (
        <>
          <section className="billing-top">
            <div>
              <p className="eyebrow">การเงินและเอกสาร</p>
              <h3>งานวางบิลที่ต้องติดตาม</h3>
            </div>
            <button className="primary-button" onClick={() => setShowBillingForm((show) => !show)}>
              {showBillingForm ? "ปิดแบบฟอร์ม" : "+ สร้างงานวางบิล"}
            </button>
          </section>

          {showBillingForm && (
            <form className="billing-form" onSubmit={submitBilling}>
              <label>ลูกค้า<input name="customerName" required placeholder="ชื่อลูกค้า / บริษัท" /></label>
              <label>ยอดวางบิล (บาท)<input name="amountBaht" required type="number" min="1" step="0.01" placeholder="0.00" /></label>
              <label>ครบกำหนดชำระ<input name="dueAt" required type="date" defaultValue={data?.today} /></label>
              <label>การดำเนินการถัดไป<input name="nextAction" required placeholder="เช่น นัดวางบิลกับคุณ..." /></label>
              <label>ผู้รับผิดชอบ<input name="ownerName" required defaultValue="ธุรการการเงิน" /></label>
              <button className="primary-button" disabled={busyId === "billing-form"}>{busyId === "billing-form" ? "กำลังบันทึก…" : "บันทึกงานวางบิล"}</button>
            </form>
          )}

          <section className="billing-list">
            {loading && <p className="loading-card">กำลังโหลดงานวางบิล…</p>}
            {!loading && data?.billingCases.map((billing) => (
              <article className="billing-card" key={billing.id}>
                <div>
                  <p className="eyebrow">{billing.servicePeriod}</p>
                  <h4>{billing.customerName}</h4>
                  <p className="next-action">{billing.nextAction}</p>
                </div>
                <div className="billing-amount">
                  <strong>{formatBaht(billing.amountSatang)}</strong>
                  <span>ครบกำหนด {billing.dueAt}</span>
                </div>
                <div className="billing-states">
                  <span className={billing.documentState === "ready" ? "pill good" : "pill"}>เอกสาร: {billing.documentState === "ready" ? "พร้อม" : "ไม่ครบ"}</span>
                  <span className="pill">วางบิล: {billing.submissionState === "scheduled" ? "นัดแล้ว" : billing.submissionState}</span>
                  <span className="pill">เงิน: {billing.paymentState === "unpaid" ? "ยังไม่รับ" : billing.paymentState}</span>
                </div>
                <footer>
                  <span>ผู้รับผิดชอบ {billing.ownerName}</span>
                  <span>{billing.location ?? "ยังไม่ระบุสถานที่วางบิล"}</span>
                </footer>
              </article>
            ))}
          </section>
        </>
      ) : tab === "shifts" ? (
        <ShiftsPanel />
      ) : tab === "stickers" ? (
        <StickersPanel />
      ) : tab === "line" ? (
        <section className="line-control" aria-label="ศูนย์ควบคุม LINE OA">
          <div className="line-control-hero">
            <div>
              <p className="eyebrow">LINE OA CONTROL</p>
              <h2>ทะเบียนกลุ่ม และการควบคุมการเชื่อมต่อ</h2>
              <p>กลุ่มที่ส่ง webhook ที่ตรวจสอบลายเซ็นแล้วจะเข้าทะเบียนอัตโนมัติ จากนั้นผู้จัดการเลือกผูกกลุ่มกับจุดได้เอง ระบบไม่เก็บข้อความในกลุ่ม และไม่ส่งสถานะกำลังภายในออกไป</p>
            </div>
            <div className={data?.lineIntegration.webhookStatus === "healthy" ? "line-ready" : data?.lineIntegration.webhookStatus === "stale" ? "line-stale" : "line-not-ready"}>
              <strong>{data?.lineIntegration.webhookStatus === "healthy" ? "รับ LINE webhook แล้ว" : data?.lineIntegration.webhookStatus === "stale" ? "Webhook เงียบเกิน 24 ชั่วโมง" : data?.lineIntegration.configured ? "รอ webhook จากกลุ่ม" : "กำลังเชื่อมต่อ LINE OA"}</strong>
              <span>Webhook: {data?.lineIntegration.webhookPath ?? "/api/line/webhook"}{data?.lineIntegration.webhookAgeMinutes !== null && data?.lineIntegration.webhookAgeMinutes !== undefined ? ` · ล่าสุด ${data.lineIntegration.webhookAgeMinutes} นาทีที่แล้ว` : ""}{data?.lineIntegration.lastCallbackSummary ? ` · ${data.lineIntegration.lastCallbackSummary}` : ""}</span>
              <div className="line-hero-actions">
                <button className="small-secondary" disabled={!data?.lineIntegration.receivedGroups || busyId === "line-profile-refresh"} onClick={refreshLineProfiles}>{busyId === "line-profile-refresh" ? "กำลังดึงชื่อจริง…" : "รีเฟรชชื่อจริง/โลโก้"}</button>
                <button className="small-secondary line-sync-button" disabled={!data?.lineIntegration.gatewayConfigured || busyId === "line-gateway-sync"} onClick={syncLineGroups}>{busyId === "line-gateway-sync" ? "กำลังซิงค์…" : "ซิงค์ทะเบียน LINE"}</button>
                <button className="small-primary line-activate-all" disabled={!data?.lineIntegration.receivedGroups || busyId === "line-points-activate-all"} onClick={activateAllLinePoints}>{busyId === "line-points-activate-all" ? "กำลังเปิดทุกจุด…" : "เปิดใช้งานทุกจุด (ด่วน)"}</button>
              </div>
            </div>
          </div>

          <section className="line-kpis">
            <article><span>กลุ่มในทะเบียน</span><strong>{data?.lineIntegration.receivedGroups ?? 0}</strong><small>พบจาก webhook หรือเพิ่มด้วยผู้จัดการ</small></article>
            <article><span>พร้อมตรวจแล้ว</span><strong>{data?.lineIntegration.mappedGroups ?? 0}</strong><small>เปิดใช้งานอยู่ในภาพรวม</small></article>
            <article><span>รอเปิดใช้ / ตั้งค่า</span><strong>{Math.max(0, (data?.lineIntegration.receivedGroups ?? 0) - (data?.lineIntegration.mappedGroups ?? 0))}</strong><small>เติมข้อมูลจากบัตรกลุ่มด้านล่าง</small></article>
          </section>

          <section className="line-safety-note">
            <span className="line-avatar">LINE</span>
            <div><strong>การทดสอบจะส่งเพียงข้อความกลาง</strong><p>กด “ทดสอบ” เมื่อพร้อมเท่านั้น ข้อความไม่ระบุชื่อ รปภ. จุดที่ขาด สถานะลา หรือรายละเอียดการดำเนินงาน</p></div>
          </section>

          <section className="line-callback-gate">
            <strong>LINE Callback เชื่อมเข้าระบบโดยตรง</strong>
            <p>LINE OA ส่ง webhook ที่ตรวจลายเซ็นแล้วเข้าฐานข้อมูล Dashboard โดยตรง ระบบจะบันทึกทะเบียนกลุ่มก่อนตอบกลับ LINE และไม่เก็บข้อความในกลุ่ม</p>
          </section>

          <section className="line-add-box" style={{ background: "#ffffff", padding: "1.25rem", borderRadius: "14px", border: "1px solid #cbd5e1", marginBottom: "1.25rem", boxShadow: "0 2px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ marginBottom: "0.75rem" }}>
              <strong style={{ fontSize: "1.1rem", color: "#0f172a" }}>+ เพิ่มกลุ่ม LINE OA / จุดปฏิบัติงานจริงเข้าสู่ระบบ</strong>
              <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "#64748b" }}>พิมพ์ชื่อกลุ่ม LINE หรือชื่อจุด เพื่อเปิดใช้งานและตั้งเป็นจุดหลักทันที</p>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const groupNameInput = form.elements.namedItem("groupName") as HTMLInputElement;
              const customerNameInput = form.elements.namedItem("customerName") as HTMLInputElement;
              const groupIdInput = form.elements.namedItem("groupId") as HTMLInputElement;
              const groupName = groupNameInput?.value?.trim();
              const customerName = customerNameInput?.value?.trim() || "ลูกค้าทั่วไป";
              const groupId = groupIdInput?.value?.trim();
              if (!groupName) return;
              void runAction({ type: "line_add", groupName, customerName, groupId }, "line-add", `เพิ่มกลุ่ม “${groupName}” และเปิดใช้งานเป็นจุดหลักเรียบร้อยแล้ว`);
              form.reset();
            }} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "0.75rem", alignItems: "end" }}>
              <label style={{ fontSize: "0.85rem", color: "#475569", fontWeight: 600 }}>ชื่อกลุ่ม LINE / ชื่อจุดปฏิบัติงาน <span style={{ color: "#ef4444" }}>*</span>
                <input name="groupName" required placeholder="เช่น กลุ่ม รปภ. โครงการ..." style={{ width: "100%", padding: "0.6rem 0.75rem", borderRadius: "8px", border: "1px solid #cbd5e1", marginTop: "0.3rem", fontSize: "0.9rem" }} />
              </label>
              <label style={{ fontSize: "0.85rem", color: "#475569", fontWeight: 600 }}>ชื่อลูกค้า / บริษัท
                <input name="customerName" placeholder="เช่น บริษัท อมตะ จำกัด" style={{ width: "100%", padding: "0.6rem 0.75rem", borderRadius: "8px", border: "1px solid #cbd5e1", marginTop: "0.3rem", fontSize: "0.9rem" }} />
              </label>
              <label style={{ fontSize: "0.85rem", color: "#475569", fontWeight: 600 }}>LINE Group ID (ถ้ามี)
                <input name="groupId" placeholder="เช่น C1234567890..." style={{ width: "100%", padding: "0.6rem 0.75rem", borderRadius: "8px", border: "1px solid #cbd5e1", marginTop: "0.3rem", fontSize: "0.9rem" }} />
              </label>
              <button type="submit" className="primary-button" style={{ padding: "0.65rem 1.4rem", whiteSpace: "nowrap" }}>+ เพิ่มกลุ่มจุดใช้งาน</button>
            </form>
          </section>

          <section className="line-bulk-box" style={{ background: "#ffffff", padding: "1.25rem", borderRadius: "14px", border: "1px solid #cbd5e1", marginBottom: "1.25rem", boxShadow: "0 2px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ marginBottom: "0.75rem" }}>
              <strong style={{ fontSize: "1.1rem", color: "#0f172a" }}>📋 วางรายชื่อกลุ่ม LINE OA ทั้งหมดแบบชุดใหญ่ (Bulk Import)</strong>
              <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "#64748b" }}>วางรายชื่อกลุ่ม LINE ทั้งหมดที่คุณมี (1 บรรทัดต่อ 1 กลุ่ม) ระบบจะนำเข้าและสถาปนาเป็นกลุ่มหลักทันที</p>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const textInput = form.elements.namedItem("bulkText") as HTMLTextAreaElement;
              const text = textInput?.value?.trim();
              if (!text) return;
              void runAction({ type: "line_bulk_add", text }, "line-bulk-add", "นำเข้าและเปิดใช้งานกลุ่ม LINE ทั้งหมดเรียบร้อยแล้ว");
              form.reset();
            }} style={{ display: "grid", gap: "0.75rem" }}>
              <textarea name="bulkText" rows={5} required placeholder={"วางรายชื่อกลุ่ม LINE ที่นี่ เช่น:\nกลุ่ม รปภ. คอนโดอมตะ\nกลุ่ม รปภ. ซิตี้ทาวเวอร์\nกลุ่ม รปภ. โครงการริเวอร์พาร์ค"} style={{ width: "100%", padding: "0.6rem 0.75rem", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", fontFamily: "inherit" }} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button type="submit" className="primary-button" style={{ padding: "0.65rem 1.4rem" }}>📋 นำเข้าและเปิดใช้งานทุกกลุ่มทันที</button>
              </div>
            </form>
          </section>

          <section className="line-groups-table">
            <div className="line-point-guidance"><strong>กลุ่ม LINE คือฐานข้อมูลจุด</strong><span>กด “ตั้งเป็นจุดใช้งาน” ที่แถวกลุ่ม แล้วเติมเฉพาะลูกค้า กะ และเวลา ระบบจะนำจุดขึ้นภาพรวมเอง ไม่ต้องสร้างจุดแยกหรือผูกซ้ำ</span></div>
            <div className="line-table-head"><span>กลุ่ม LINE จริง</span><span>ข้อมูลจุด / การนับ</span><span>พบล่าสุด</span><span>จัดการ</span></div>
            {(data?.lineGroups ?? []).map((group) => {
              const pointSite = group.siteId ? operationalSiteById.get(group.siteId) : null;
              return (
              <article className="line-group-row" key={group.id}>
                <div className="line-group-identity">
                  {group.pictureUrl ? <img src={group.pictureUrl} alt="" /> : <span className="line-avatar">LINE</span>}
                  <div><strong>{lineGroupName(group)}</strong><code title={group.id}>{group.id}</code><small>{group.nameResolved ? "ชื่อจาก LINE OA" : "กลุ่มที่รับจาก LINE · ชื่อย่อใช้ระบุกลุ่มชั่วคราว"}</small></div>
                </div>
                <div className="line-mapping-cell">
                  <div className="line-point-summary">
                    <span className={pointSite?.active === 1 ? "point-ready" : "point-dormant"}>{pointSite?.active === 1 ? "พร้อมตรวจ" : group.siteId ? "บันทึกแล้ว · ยังไม่เปิดตรวจ" : "เตรียมเป็นจุดจากกลุ่มนี้"}</span>
                    <small>{pointSite?.customerName && pointSite.customerName !== "ยังไม่ระบุลูกค้า" ? pointSite.customerName : "เติมลูกค้า กะ และเวลาในบัตรนี้"}</small>
                    <button type="button" className="small-secondary" onClick={() => openLinePointSetup(group)} disabled={busyId === "line-point-setup-" + group.id}>{group.siteId ? "แก้ไขข้อมูลจุด" : "ตั้งเป็นจุดใช้งาน"}</button>
                  </div>
                  <select value={group.siteId ?? ""} onChange={(event) => linkRegistryGroup(group, event.target.value)} disabled={busyId === "line-map-" + group.id}>
                    <option value="">เลือกจุดที่จะผูก…</option>
                    {(data?.sites ?? []).map((site) => <option key={site.id} value={site.id}>{site.siteName} · {site.customerName}</option>)}
                  </select>
                  {group.siteId && <button className="action-text danger" disabled={busyId === "line-unmap-" + group.id} onClick={() => unmapRegistryGroup(group)}>ยกเลิก</button>}
                </div>
                <div className="line-last-seen">{displayTime(group.lastSeenAt)}<small>{group.lastSeenAt ? "เวลาไทย" : "ยังไม่ได้รับ webhook"}</small></div>
                <div className="line-row-actions"><button className="action-confirm" disabled={!data?.lineIntegration.configured || busyId === "line-test-" + group.id} onClick={() => testLineGroup(group)}>ทดสอบ</button><button className="action-text danger" disabled={busyId === "line-delete-" + group.id} onClick={() => deleteLineRegistryGroup(group)}>{busyId === "line-delete-" + group.id ? "กำลังลบ…" : "ลบกลุ่ม"}</button></div>
              </article>
              );
            })}
            {!loading && !(data?.lineGroups ?? []).length && <p className="line-empty">ยังไม่มีกลุ่มในทะเบียน เมื่อ OA รับ webhook จากกลุ่ม กลุ่มจะปรากฏที่นี่เพื่อให้เลือกผูกกับจุด</p>}
          </section>
        </section>
      ) : (
        <section className="setup-board" aria-label="ตั้งค่าอัตรากำลัง">
          <div className="line-point-guidance"><strong>ไม่ต้องสร้างจุดซ้ำ</strong><span>กลุ่ม LINE ที่รับจาก webhook จะถูกเตรียมเป็นจุดให้โดยอัตโนมัติ ใช้หน้านี้เฉพาะกรณีมีหลายป้อมหรือหลายช่องในจุดเดียว</span></div>
          <div className="setup-hero">
            <div>
              <p className="eyebrow">เตรียมใช้จริง</p>
              <h2>ตั้งอัตรา 80 จุดครั้งเดียว</h2>
              <p>นำเข้าจุด, ผลัด, ตำแหน่ง และ รปภ. ประจำ แล้วกด “สร้างแผงวันนี้” ทุกเช้า ระบบจะเพิ่มเฉพาะช่องที่ยังไม่มี โดยไม่ทับผลเช็คอินหรือการจัดสแปร์ที่เกิดขึ้นแล้ว</p>
            </div>
            <div className="template-counts" aria-label="อัตราต้นแบบปัจจุบัน">
              <strong>{data?.templates.total ?? 0}</strong>
              <span>อัตราต้นแบบ</span>
              <small>เช้า {data?.templates.morning ?? 0} · เย็น {data?.templates.evening ?? 0} · LINE {data?.lineGroups.length ?? 0}/{data?.sites.length ?? 0}</small>
            </div>
          </div>

          {data?.demoDataPresent && (
            <section className="demo-warning" aria-label="ข้อมูลตัวอย่าง">
              <div><strong>ยังมีข้อมูลตัวอย่างอยู่ในผัง</strong><p>ก่อนนำเข้าข้อมูล 80 จุดจริง ให้ล้างเฉพาะตัวอย่างเพื่อไม่ให้แสดงปนกับหน้างาน</p></div>
              <button className="danger-button" disabled={busyId === "remove-demo"} onClick={removeDemo}>{busyId === "remove-demo" ? "กำลังล้าง…" : "ล้างข้อมูลตัวอย่าง"}</button>
            </section>
          )}

          <div className="setup-steps">
            <article><span>1</span><div><strong>ดาวน์โหลดไฟล์ตัวอย่าง</strong><p>เปิดด้วย Excel แล้วใส่รายชื่อจุด, กำลังประจำ และ line_group_id เท่านั้น ชื่อกลุ่มจริงจะดึงจาก LINE อัตโนมัติ</p></div><button className="small-secondary" onClick={downloadTemplate}>ดาวน์โหลด CSV</button></article>
            <article><span>2</span><div><strong>เลือกไฟล์ที่จัดทำแล้ว</strong><p>รองรับสูงสุด 300 อัตราต่อครั้ง เหมาะกับ 80 จุด สองผลัด และการผูกกลุ่ม LINE</p></div><label className="file-picker">เลือกไฟล์ CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void loadTemplateFile(event.target.files?.[0])} /></label></article>
            <article><span>3</span><div><strong>ตรวจและนำเข้า</strong><p>ระบบจะอัปเดตเฉพาะอัตราต้นแบบ ยังไม่เปลี่ยนสถานะหน้างาน</p></div><button className="primary-button" disabled={!templateRows.length || busyId === "template-import"} onClick={importTemplates}>{busyId === "template-import" ? "กำลังนำเข้า…" : `ยืนยัน ${templateRows.length} อัตรา`}</button></article>
          </div>

          <section className="line-mapping-note">
            <span className="line-avatar">LINE</span>
            <div><strong>ชื่อกลุ่มมาจาก LINE จริง</strong><p>ในไฟล์ใช้เฉพาะ <code>line_group_id</code> ที่คัดลอกจากทะเบียน LINE OA ได้เลย ระบบจะใช้ชื่อกลุ่มและโลโก้จริงจาก webhook ไม่เปิดให้กรอกชื่อแทนเอง</p></div>
          </section>

          {templateRows.length > 0 && (
            <section className="import-preview" aria-label="ตัวอย่างข้อมูลที่รอนำเข้า">
              <div>
                <p className="eyebrow">ไฟล์ที่เลือก: {templateFileName}</p>
                <h3>ตัวอย่าง {Math.min(templateRows.length, 5)} จาก {templateRows.length} อัตรา</h3>
              </div>
              <button className="action-text" onClick={() => { setTemplateRows([]); setTemplateFileName(""); }}>ล้างไฟล์</button>
              <div className="preview-table">
                <div className="preview-head"><span>จุด</span><span>ผลัด</span><span>ตำแหน่ง</span><span>รปภ. ประจำ</span><span>กลุ่ม LINE</span><span>กำหนด</span></div>
                {templateRows.slice(0, 5).map((row, index) => {
                  const group = row.lineGroupId ? lineGroupById.get(row.lineGroupId) : null;
                  return <div className="preview-row" key={`${row.siteName}-${row.wave}-${index}`}><span>{row.siteName}</span><span>{row.wave === "morning" ? "เช้า" : "เย็น"}</span><span>{row.postName} · {row.slotLabel}</span><span>{row.assignedGuard || "ยังไม่ระบุ"}</span><span>{group ? lineGroupName(group) : row.lineGroupId ? "กลุ่ม LINE ที่เชื่อมแล้ว" : "ยังไม่ผูก"}</span><span>{row.deadline}</span></div>;
                })}
              </div>
            </section>
          )}

          <section className="daily-generation">
            <div>
              <p className="eyebrow">ทุกวันก่อนรอบเช้า</p>
              <h3>สร้างแผงของวันนี้</h3>
              <p>คัดลอกอัตราต้นแบบเป็นช่องกำลังของวันปัจจุบันแบบปลอดภัย หากเคยสร้างแล้ว ระบบจะข้ามรายการเดิมให้เอง</p>
            </div>
            <button className="primary-button" disabled={!data?.templates.total || busyId === "generate-today"} onClick={generateToday}>{busyId === "generate-today" ? "กำลังสร้าง…" : "สร้างแผงวันนี้"}</button>
          </section>
        </section>
      )}

      {replaceTarget && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card" onSubmit={submitReplacement} role="dialog" aria-modal="true" aria-labelledby="replace-dialog-title">
            <div className="modal-head"><div><p className="eyebrow">เปลี่ยนกำลัง</p><h3 id="replace-dialog-title">เลือก รปภ. สแปร์</h3><p>{replaceTarget.siteName} · {replaceTarget.postName} · {replaceTarget.slotLabel}</p></div><button type="button" className="drawer-close" onClick={() => setReplaceTarget(null)} aria-label="ปิด">×</button></div>
            <label>ชื่อ รปภ. สแปร์<input value={replaceName} onChange={(event) => setReplaceName(event.target.value)} required placeholder="เช่น นายสมพงษ์ (สแปร์)" /></label>
            <div className="modal-actions"><button type="button" className="small-secondary" onClick={() => setReplaceTarget(null)}>ยกเลิก</button><button className="small-primary" disabled={busyId === replaceTarget.id}>{busyId === replaceTarget.id ? "กำลังบันทึก…" : "มอบหมายสแปร์"}</button></div>
          </form>
        </div>
      )}

      {linePointTarget && linePointForm && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card line-point-modal" onSubmit={submitLinePointSetup} role="dialog" aria-modal="true" aria-labelledby="line-point-dialog-title">
            <div className="modal-head">
              <div>
                <p className="eyebrow">กลุ่ม LINE = จุดปฏิบัติงาน</p>
                <h3 id="line-point-dialog-title">ตั้งค่าจุดจากกลุ่มนี้</h3>
                <p>{linePointTarget.groupName}</p>
              </div>
              <button type="button" className="drawer-close" onClick={() => { setLinePointTarget(null); setLinePointForm(null); }} aria-label="ปิด">×</button>
            </div>
            <div className="line-point-form-note">ระบบใช้ชื่อกลุ่มจริงและโลโก้จาก LINE อัตโนมัติ คุณเติมเฉพาะข้อมูลที่จำเป็นต่อการตรวจ</div>
            <label>ลูกค้า / ผู้ว่าจ้าง<input value={linePointForm.customerName} onChange={(event) => setLinePointForm({ ...linePointForm, customerName: event.target.value })} placeholder="เช่น บริษัท..." /></label>
            <div className="line-point-form-grid">
              <label>ตำแหน่งหลัก<input value={linePointForm.postName} onChange={(event) => setLinePointForm({ ...linePointForm, postName: event.target.value })} /></label>
              <label>ช่องตรวจ<input value={linePointForm.slotLabel} onChange={(event) => setLinePointForm({ ...linePointForm, slotLabel: event.target.value })} /></label>
            </div>
            <div className="line-point-shift-grid">
              <fieldset>
                <legend>ผลัดเช้า 05:30–08:20</legend>
                <label className="shift-config-toggle"><input type="checkbox" checked={linePointForm.morningEnabled} onChange={(event) => setLinePointForm({ ...linePointForm, morningEnabled: event.target.checked })} /> ใช้กะเช้า</label>
                <label>เวลาเข้าล่าสุด<input type="time" value={linePointForm.morningDeadline} onChange={(event) => setLinePointForm({ ...linePointForm, morningDeadline: event.target.value })} /></label>
                <label>รปภ.ประจำ (ถ้ามี)<input value={linePointForm.morningGuard} onChange={(event) => setLinePointForm({ ...linePointForm, morningGuard: event.target.value })} placeholder="ไม่จำเป็น" /></label>
              </fieldset>
              <fieldset>
                <legend>ผลัดเย็น 17:00–20:00</legend>
                <label className="shift-config-toggle"><input type="checkbox" checked={linePointForm.eveningEnabled} onChange={(event) => setLinePointForm({ ...linePointForm, eveningEnabled: event.target.checked })} /> ใช้กะเย็น</label>
                <label>เวลาเข้าล่าสุด<input type="time" value={linePointForm.eveningDeadline} onChange={(event) => setLinePointForm({ ...linePointForm, eveningDeadline: event.target.value })} /></label>
                <label>รปภ.ประจำ (ถ้ามี)<input value={linePointForm.eveningGuard} onChange={(event) => setLinePointForm({ ...linePointForm, eveningGuard: event.target.value })} placeholder="ไม่จำเป็น" /></label>
              </fieldset>
            </div>
            <label className="shift-config-toggle line-point-active-toggle"><input type="checkbox" checked={linePointForm.active} onChange={(event) => setLinePointForm({ ...linePointForm, active: event.target.checked })} /> ใช้กลุ่มนี้เป็นจุดที่ต้องตรวจในภาพรวม</label>
            <div className="modal-actions"><button type="button" className="small-secondary" onClick={() => { setLinePointTarget(null); setLinePointForm(null); }}>ยกเลิก</button><button className="small-primary" disabled={busyId === "line-point-setup-" + linePointTarget.id}>{busyId === "line-point-setup-" + linePointTarget.id ? "กำลังบันทึก…" : "บันทึกข้อมูลจุด"}</button></div>
          </form>
        </div>
      )}

      {lineMapTarget && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card" onSubmit={submitLineMapping} role="dialog" aria-modal="true" aria-labelledby="line-map-dialog-title">
            <div className="modal-head"><div><p className="eyebrow">LINE OA</p><h3 id="line-map-dialog-title">ผูกกลุ่มกับจุด</h3><p>{lineMapTarget.name} · {lineMapTarget.customerName}</p></div><button type="button" className="drawer-close" onClick={() => setLineMapTarget(null)} aria-label="ปิด">×</button></div>
            <label>เลือกกลุ่ม LINE จริง
              <select className="modal-select" value={lineMapGroupId} onChange={(event) => setLineMapGroupId(event.target.value)} required>
                <option value="">เลือกจากทะเบียน LINE…</option>
                {lineMapChoices.map((group) => <option key={group.id} value={group.id}>{group.groupName}</option>)}
              </select>
            </label>
            {lineMapGroupId && <p className="modal-help">ชื่อกลุ่มและโลโก้จะดึงจาก LINE webhook อัตโนมัติ ไม่ต้องกรอกเอง</p>}
            {!lineMapChoices.length && <p className="modal-help warning-text">ยังไม่มีกลุ่มที่มีชื่อจริงจาก LINE ให้เลือก ให้ส่งข้อความในกลุ่มแล้วกดรีเฟรชข้อมูล</p>}
            <div className="modal-actions"><button type="button" className="small-secondary" onClick={() => setLineMapTarget(null)}>ยกเลิก</button><button className="small-primary" disabled={busyId === "line-" + lineMapTarget.id}>{busyId === "line-" + lineMapTarget.id ? "กำลังบันทึก…" : "บันทึกการผูกกลุ่ม"}</button></div>
          </form>
        </div>
      )}

      {showSiteForm && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card" key={siteEditTarget?.id ?? "new-site"} onSubmit={submitSite} role="dialog" aria-modal="true" aria-labelledby="site-dialog-title">
            <div className="modal-head"><div><p className="eyebrow">ทะเบียนจุด</p><h3 id="site-dialog-title">{siteEditTarget ? "แก้ไขจุดปฏิบัติงาน" : "เพิ่มจุดสีเทา"}</h3><p>{siteEditTarget ? "แก้ชื่อจุดหรือลูกค้าได้ โดยไม่ลบผลเช็คเดิม" : "เพิ่มจุดไว้ก่อน แล้วค่อยตั้งอัตรากำลังภายหลัง"}</p></div><button type="button" className="drawer-close" onClick={() => { setShowSiteForm(false); setSiteEditTarget(null); }} aria-label="ปิด">×</button></div>
            <label>ชื่อจุด<input name="siteName" required defaultValue={siteEditTarget?.name ?? ""} placeholder="เช่น จุดตรวจหน้าโรงงาน" /></label>
            <label>ลูกค้าหรือหน่วยงาน<input name="customerName" required defaultValue={siteEditTarget?.customerName ?? ""} placeholder="ชื่อบริษัท/หน่วยงาน" /></label>
            <div className="modal-actions"><button type="button" className="small-secondary" onClick={() => { setShowSiteForm(false); setSiteEditTarget(null); }}>ยกเลิก</button><button className="small-primary" disabled={busyId?.startsWith("site-") === true}>{busyId?.startsWith("site-") ? "กำลังบันทึก…" : siteEditTarget ? "บันทึกการแก้ไข" : "เพิ่มจุด"}</button></div>
          </form>
        </div>
      )}
    </main>
  );
}
