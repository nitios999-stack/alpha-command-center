"use client";

import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type SlotState = "confirmed" | "self_reported" | "waiting" | "replacement_required" | "unassigned" | "missing";

type CoverageSlot = {
  id: string;
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
  eventCount: number;
  source: "manual" | "webhook";
};

type LineIntegrationStatus = {
  configured: boolean;
  gatewayConfigured: boolean;
  webhookPath: string;
  lastWebhookAt: string | null;
  webhookAgeMinutes: number | null;
  webhookStatus: "healthy" | "stale" | "never";
  receivedGroups: number;
  mappedGroups: number;
};

type LineReminderSettings = {
  targetGroupId: string | null;
  autoEnabled: boolean;
  lastSentAt: string | null;
  lastSentCount: number;
  lastTargetName: string | null;
};

type LineReportConfig = {
  enabled: boolean;
  morningTimes: string[];
  eveningTimes: string[];
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

type DashboardData = {
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
  if (slots.some((slot) => ["missing", "unassigned", "replacement_required"].includes(slot.state))) return "red";
  if (slots.every((slot) => slot.state === "confirmed")) return "green";
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
  const lineGroupBySite = new Map(lineGroups.filter((group): group is LineGroup & { siteId: string } => Boolean(group.siteId)).map((group) => [group.siteId, group]));
  const siteIds = new Set([...activeRegistry.map((site) => site.id), ...groups.keys()]);
  return Array.from(siteIds)
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
  if (site.status === "green") {
    return site.lateCount > 0 ? `ครบ • สาย ${site.lateCount}` : "ครบกำลัง";
  }
  if (site.status === "yellow") {
    return `รอยืนยัน ${site.slots.filter((slot) => slot.state !== "confirmed").length}`;
  }
  if (site.status === "red") {
    return `ขาด/ต้องจัด ${site.slots.filter((slot) => ["missing", "unassigned", "replacement_required"].includes(slot.state)).length}`;
  }
  return "ยังไม่มีอัตรา";
}

function lineGroupLabel(group: LineGroup | null | undefined) {
  if (!group) return "ยังไม่ผูก LINE";
  return group.nameResolved ? group.groupName : "กำลังรอชื่อจริงจาก LINE";
}

type LineSignalStatus = "green" | "yellow" | "red" | "gray";
type LineReportFilter = "all" | LineSignalStatus | "unmapped";

function lineSignalStatus(group: LineGroup, nowTime: string): LineSignalStatus {
  if (!group.lastSeenAt) return "gray";
  const seenAt = Date.parse(group.lastSeenAt);
  if (!Number.isFinite(seenAt)) return "gray";
  const ageMinutes = Math.max(0, Math.floor((Date.now() - seenAt) / 60_000));
  if (ageMinutes <= 30) return "green";
  if (ageMinutes <= 120) return "yellow";
  const parts = nowTime.split(":").map(Number);
  const minute = (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  return (minute >= 330 && minute <= 500) || (minute >= 1020 && minute <= 1200) ? "red" : "gray";
}

function lineSignalLabel(status: LineSignalStatus) {
  if (status === "green") return "มีสัญญาณล่าสุด";
  if (status === "yellow") return "สัญญาณช้าลง";
  if (status === "red") return "เงียบในช่วงเวร";
  return "ยังไม่มีข้อมูล";
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

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState<"ops" | "billing" | "setup" | "line" | "reports">("ops");
  const [wave, setWave] = useState<"morning" | "evening">("morning");
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
  const [reminderTargetDraft, setReminderTargetDraft] = useState<string | null>(null);
  const [reminderAutoDraft, setReminderAutoDraft] = useState<boolean | null>(null);
  const [reminderWave, setReminderWave] = useState<"morning" | "evening">("morning");
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
      let payload: DashboardData & { error?: string };
      try {
        payload = (await response.json()) as DashboardData & { error?: string };
      } catch {
        throw new Error("ระบบตอบกลับไม่ครบ กรุณาลองใหม่");
      }
      if (response.status === 401) {
        setNetworkState("auth");
        setMessage("กรุณาเข้าสู่ระบบก่อนใช้งานศูนย์สั่งการ");
        return;
      }
      if (!response.ok) throw new Error(payload.error ?? "ไม่สามารถโหลดข้อมูลได้");
      setData(payload);
      setLastLoadedAt(Date.now());
      setNetworkState("online");
    } catch (error) {
      setNetworkState(navigator.onLine === false ? "offline" : "error");
      setMessage(error instanceof Error ? error.message : "ไม่สามารถโหลดข้อมูลได้");
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
    () => lineOverviewGroups.filter((group) => Boolean(group.siteId && operationalSiteById.get(group.siteId)?.active === 1)),
    [lineOverviewGroups, operationalSiteById],
  );
  const trackedLineGroups = useMemo(
    () => lineConfigurableGroups.filter((group) => lineReportConfigFor(group.id, data?.lineReportConfigs).enabled),
    [data?.lineReportConfigs, lineConfigurableGroups],
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
  const reminderTargetGroup = (data?.lineGroups ?? []).find((group) => group.id === reminderTargetId) ?? null;
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

  const runAction = useCallback(async (payload: Record<string, unknown>, id: string, success: string) => {
    setBusyId(id);
    setMessage(null);
    try {
      const response = await fetch("/api/command-center/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string; message?: string; skipped?: boolean; silentCount?: number; trackedCount?: number; imported?: number; created?: number; existing?: number; total?: number };
      if (!response.ok) throw new Error(result.error ?? "ทำรายการไม่สำเร็จ");
      setMessage(success);
      await loadDashboard();
      return result;
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
      { type: "line_reminder_settings", targetGroupId: reminderTargetId, autoEnabled: reminderAutoEnabled },
      "line-reminder-settings",
      "บันทึกกลุ่มหลักและแผนเตือนแล้ว",
    );
  }, [reminderAutoEnabled, reminderTargetId, runAction]);

  const sendReminder = useCallback(async (force = true, automatic = false, waveOverride: "morning" | "evening" = reminderWave, includeClear = false) => {
    if (!reminderTargetId) {
      setMessage("กรุณาเลือกกลุ่ม LINE หลักก่อนส่งเตือน");
      return undefined;
    }
    if (force && !automatic && !window.confirm(`ส่งรายการกลุ่มเงียบไปที่ “${lineGroupLabel(reminderTargetGroup)}” ใช่หรือไม่?`)) return undefined;
    const result = await runAction(
      { type: "line_reminder_send", targetGroupId: reminderTargetId, wave: waveOverride, force, includeClear },
      automatic ? "line-reminder-auto" : "line-reminder-send",
      automatic ? "ระบบส่งเตือนตามแผนแล้ว" : "ส่งเตือนกลุ่มเงียบไปยังกลุ่มหลักแล้ว",
    );
    if (result?.skipped && result.message) setMessage(result.message);
    return result;
  }, [reminderTargetGroup, reminderTargetId, reminderWave, runAction]);

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
      const scheduled = (["morning", "evening"] as const)
        .map((scheduledWave) => ({
          wave: scheduledWave,
          time: [...new Set(trackedLineGroups.flatMap((group) => reminderTimes(scheduledWave, lineReportConfigFor(group.id, data.lineReportConfigs))))].find((time) => time === lineNowTime),
        }))
        .find((item) => item.time);
      if (!scheduled?.time) return;
      const key = `${data.today}-${scheduled.wave}-${scheduled.time}`;
      if (autoReminderKeyRef.current === key) return;
      autoReminderKeyRef.current = key;
      void sendReminder(false, true, scheduled.wave, true);
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
      morningEnabled: detail?.morning ? true : !detail,
      eveningEnabled: detail?.evening ? true : !detail,
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

  const deleteLineRegistryGroup = (group: LineGroup) => {
    if (group.siteId) {
      setMessage("กลุ่มนี้ยังผูกกับจุดอยู่ กรุณายกเลิกการผูกก่อนลบ");
      return;
    }
    if (!window.confirm(`ลบกลุ่ม “${lineGroupLabel(group)}” ออกจากทะเบียนที่ไม่ใช้งานใช่หรือไม่? ถ้ากลุ่มส่ง webhook อีกครั้งจะกลับมาอัตโนมัติ`)) return;
    void runAction({ type: "line_delete", groupId: group.id }, "line-delete-" + group.id, "ลบกลุ่มที่ไม่ใช้งานแล้ว");
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

      {tab === "billing" && <section className="hero">
        <div>
          <p className="eyebrow">ศูนย์สั่งการประจำวัน</p>
          <h2>{tab === "ops" ? "เช็กกำลังประจำจุด" : "วางบิลและติดตามรับชำระ"}</h2>
          <p className="subcopy">
            {tab === "ops"
              ? "ดูเฉพาะสิ่งที่ต้องจัดการ: จุดไหนครบ จุดไหนรอตรวจ และจุดไหนยังขาดกำลัง"
              : "จัดลำดับงานวางบิล เอกสาร และยอดเงินที่ต้องติดตามในหน้าเดียว"}
          </p>
        </div>
        <div className="hero-date">
          <span>วันนี้</span>
          <strong>{data?.today ?? "กำลังโหลด"}</strong>
          <small>เวลาไทย (Asia/Bangkok)</small>
        </div>
      </section>}

      <nav className="tabs" aria-label="เมนูหลัก">
        <button data-icon="✓" className={tab === "ops" ? "active" : ""} onClick={() => setTab("ops")} aria-current={tab === "ops" ? "page" : undefined}>เข้าเวรวันนี้</button>
        <button data-icon="⌁" className={tab === "setup" ? "active" : ""} onClick={() => setTab("setup")} aria-current={tab === "setup" ? "page" : undefined}>ตั้งค่าอัตรา</button>
        <button data-icon="≋" className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")} aria-current={tab === "reports" ? "page" : undefined}>ตรวจรายงาน</button>
        <button data-icon="●" className={tab === "line" ? "active" : ""} onClick={() => setTab("line")} aria-current={tab === "line" ? "page" : undefined}>LINE OA</button>
        <button data-icon="฿" className={tab === "billing" ? "active" : ""} onClick={() => setTab("billing")} aria-current={tab === "billing" ? "page" : undefined}>วางบิล</button>
        <button className="quiet refresh-control" onClick={() => void loadDashboard()} disabled={loading}>↻ รีเฟรช</button>
      </nav>

      {message && (
        <div className="notice" role="status">
          <span>●</span> {message}
          <button onClick={() => setMessage(null)} aria-label="ปิดข้อความ">×</button>
        </div>
      )}

      {tab === "ops" ? (
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
            <button className={wave === "morning" ? "active" : ""} onClick={() => setWave("morning")}>ผลัดเช้า</button>
            <button className={wave === "evening" ? "active" : ""} onClick={() => setWave("evening")}>ผลัดเย็น</button>
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
            <div className="report-window">
              <span>ดึงข้อมูลอัตโนมัติ</span>
              <strong>ทุก 5 วินาที</strong>
              <small>{data?.lineIntegration.webhookStatus === "healthy"
                ? `Webhook ปกติ · รายงานล่าสุด ${displayTime(data.lineIntegration.lastWebhookAt)} · รอบถัดไป ~${reportRefreshIn} วิ`
                : data?.lineIntegration.webhookStatus === "stale" ? "Webhook เงียบเกิน 24 ชั่วโมง" : "กำลังรอสัญญาณจาก LINE"}</small>
            </div>
          </div>
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
                <button className="small-secondary" onClick={saveReminderSettings} disabled={!reminderTargetId || busyId === "line-reminder-settings"}>บันทึกปลายทาง</button>
              </div>
            </div>
            <div className="reminder-plan">
              <div className="reminder-plan-copy">
                <span className="eyebrow">AI REMINDER PLAN</span>
                <strong>{reminderWave === "morning" ? "ผลัดเช้า 05:30–08:20" : "ผลัดเย็น 17:00–20:00"}</strong>
                <small>รอบแนะนำถัดไป {reminderNextTime} · รอบที่ระบบคำนวณจากช่วงผลัดและกลุ่มเงียบ</small>
              </div>
              <label className="reminder-wave">ผลัดที่จะเตือน
                <select value={reminderWave} onChange={(event) => setReminderWave(event.target.value === "evening" ? "evening" : "morning")}>
                  <option value="morning">เช้า 05:30–08:20</option>
                  <option value="evening">เย็น 17:00–20:00</option>
                </select>
              </label>
              <label className="reminder-toggle"><input type="checkbox" checked={reminderAutoEnabled} onChange={(event) => setReminderAutoDraft(event.target.checked)} /> เปิดเตือนตามแผนขณะเปิดศูนย์</label>
              <button className="small-primary" onClick={() => void sendReminder(true)} disabled={!reminderTargetId || busyId === "line-reminder-send"}>{busyId === "line-reminder-send" ? "กำลังส่ง…" : "ส่งเตือนตอนนี้"}</button>
            </div>
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
                <label className="shift-config-row"><span>กะเช้า</span><input type="text" value={scheduleConfig.morningTimes.join(", ")} onChange={(event) => setScheduleDraft({ groupId: scheduleGroupId, config: { ...scheduleConfig, morningTimes: parseTimeList(event.target.value) } })} placeholder="06:00, 07:00, 08:00" /><small>05:30–08:20 · ค่าเริ่มต้นรายชั่วโมง</small></label>
                <label className="shift-config-row"><span>กะเย็น</span><input type="text" value={scheduleConfig.eveningTimes.join(", ")} onChange={(event) => setScheduleDraft({ groupId: scheduleGroupId, config: { ...scheduleConfig, eveningTimes: parseTimeList(event.target.value) } })} placeholder="17:00, 18:00, 19:00" /><small>17:00–20:00 · ค่าเริ่มต้นรายชั่วโมง</small></label>
                <button className="small-secondary" onClick={saveReportSchedule} disabled={busyId === "line-report-config"}>{busyId === "line-report-config" ? "กำลังบันทึก…" : "บันทึกเวลาจุดนี้"}</button>
              </div>
            ) : <p className="shift-config-empty">ยังไม่มีจุดที่ผูกกลุ่ม LINE และเปิดใช้งานให้ตั้งค่า</p>}
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
                <p>ดึงจากฐานข้อมูล LINE webhook โดยตรง · เรียงกลุ่มที่ส่งล่าสุดขึ้นก่อน · ไม่ต้องเปิด OA ไล่ดูทีละกลุ่ม</p>
              </div>
              <div className="line-overview-counts" aria-label="สรุปสัญญาณ LINE">
                <span className="green"><b>{trackedLineOverviewStats.green}</b> ล่าสุด</span>
                <span className="yellow"><b>{trackedLineOverviewStats.yellow}</b> ช้าลง</span>
                <span className="red"><b>{trackedLineOverviewStats.red}</b> เงียบ</span>
                <span className="gray"><b>{trackedLineOverviewStats.gray}</b> ยังไม่มี</span>
              </div>
            </div>
            <p className="line-overview-note">เรียงจากกลุ่มที่ส่งล่าสุดขึ้นก่อน · คลิกการ์ดเพื่อเปิดจุดที่ผูกไว้ · สีนี้บอกความเคลื่อนไหวของ LINE เท่านั้น ไม่ใช่การยืนยันเข้าเวร</p>
            <div className="line-overview-grid">
              {reportVisibleGroups.map((group, index) => {
                const signal = lineSignalStatus(group, data?.now.time ?? "00:00");
                const site = group.siteId ? operationalSiteById.get(group.siteId) : null;
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
                      <span className="line-overview-name">{group.nameResolved ? group.groupName : "รอชื่อจริงจาก LINE"}</span>
                      <em className="line-overview-rank">#{index + 1}</em>
                      <i aria-hidden="true" />
                    </span>
                    <span className="line-overview-site">{site ? `${site.siteName} · ${site.customerName}` : "ยังไม่ผูกจุด · ไปที่ LINE OA เพื่อผูก"}</span>
                    <span className="line-overview-event"><b>{lineEventLabel(group.lastEventType)}</b><span>{group.eventCount} รายการ</span></span>
                    <span className="line-overview-meta"><b>{lineSignalLabel(signal)}</b><span>ส่ง {displayTime(group.lastSeenAt)} · {lineAgeLabel(group.lastSeenAt, reportNowMs)}</span></span>
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
                    <button type="button" className="line-ignored-setup" onClick={() => openLinePointSetup(group)} disabled={!group.nameResolved || busyId === "line-point-setup-" + group.id}>{group.siteId ? "แก้ไขข้อมูลจุด" : "ตั้งเป็นจุดใช้งาน"}</button>
                    <div className="line-ignored-card-top">
                      {group.pictureUrl ? <img src={group.pictureUrl} alt="" /> : <b>LINE</b>}
                      <strong>{group.nameResolved ? group.groupName : "รอชื่อจริงจาก LINE"}</strong>
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
              <span>Webhook: {data?.lineIntegration.webhookPath ?? "/api/line/webhook"}{data?.lineIntegration.webhookAgeMinutes !== null && data?.lineIntegration.webhookAgeMinutes !== undefined ? ` · ล่าสุด ${data.lineIntegration.webhookAgeMinutes} นาทีที่แล้ว` : ""}</span>
              <button className="small-secondary line-sync-button" disabled={!data?.lineIntegration.gatewayConfigured || busyId === "line-gateway-sync"} onClick={syncLineGroups}>{busyId === "line-gateway-sync" ? "กำลังซิงค์…" : "ซิงค์ทะเบียน LINE"}</button>
            </div>
          </div>

          <section className="line-kpis">
            <article><span>กลุ่มในทะเบียน</span><strong>{data?.lineIntegration.receivedGroups ?? 0}</strong><small>พบจาก webhook หรือเพิ่มด้วยผู้จัดการ</small></article>
            <article><span>ผูกกับจุดแล้ว</span><strong>{data?.lineIntegration.mappedGroups ?? 0}</strong><small>กลุ่มละ 1 จุด เพื่อไม่ให้สับสน</small></article>
            <article><span>ยังไม่ผูกจุด</span><strong>{Math.max(0, (data?.lineIntegration.receivedGroups ?? 0) - (data?.lineIntegration.mappedGroups ?? 0))}</strong><small>เลือกจุดจากตารางด้านล่าง</small></article>
          </section>

          <section className="line-safety-note">
            <span className="line-avatar">LINE</span>
            <div><strong>การทดสอบจะส่งเพียงข้อความกลาง</strong><p>กด “ทดสอบ” เมื่อพร้อมเท่านั้น ข้อความไม่ระบุชื่อ รปภ. จุดที่ขาด สถานะลา หรือรายละเอียดการดำเนินงาน</p></div>
          </section>

          <section className="line-callback-gate">
            <strong>LINE Callback เชื่อมเข้าระบบโดยตรง</strong>
            <p>LINE OA ส่ง webhook ที่ตรวจลายเซ็นแล้วเข้าฐานข้อมูล Dashboard โดยตรง ระบบจะบันทึกทะเบียนกลุ่มก่อนตอบกลับ LINE และไม่เก็บข้อความในกลุ่ม</p>
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
                  <div><strong>{group.nameResolved ? group.groupName : "กำลังรอชื่อจริงจาก LINE"}</strong><code title={group.id}>{group.id}</code><small>{group.nameResolved ? "ชื่อจริงจาก LINE webhook" : "LINE รับกลุ่มแล้ว แต่ยังดึงชื่อจริงไม่สำเร็จ"}</small></div>
                </div>
                <div className="line-mapping-cell">
                  <div className="line-point-summary">
                    <span className={pointSite?.active === 1 ? "point-ready" : "point-dormant"}>{pointSite?.active === 1 ? "พร้อมตรวจ" : group.siteId ? "บันทึกแล้ว · ยังไม่เปิดตรวจ" : "เตรียมเป็นจุดจากกลุ่มนี้"}</span>
                    <small>{pointSite?.customerName && pointSite.customerName !== "ยังไม่ระบุลูกค้า" ? pointSite.customerName : "เติมลูกค้า กะ และเวลาในบัตรนี้"}</small>
                    <button type="button" className="small-secondary" onClick={() => openLinePointSetup(group)} disabled={!group.nameResolved || busyId === "line-point-setup-" + group.id}>{group.siteId ? "แก้ไขข้อมูลจุด" : "ตั้งเป็นจุดใช้งาน"}</button>
                  </div>
                  <select value={group.siteId ?? ""} onChange={(event) => linkRegistryGroup(group, event.target.value)} disabled={!group.nameResolved || busyId === "line-map-" + group.id}>
                    <option value="">{group.nameResolved ? "เลือกจุดที่จะผูก…" : "รอชื่อจริงจาก LINE…"}</option>
                    {(data?.sites ?? []).map((site) => <option key={site.id} value={site.id}>{site.siteName} · {site.customerName}</option>)}
                  </select>
                  {group.siteId && <button className="action-text danger" disabled={busyId === "line-unmap-" + group.id} onClick={() => unmapRegistryGroup(group)}>ยกเลิก</button>}
                </div>
                <div className="line-last-seen">{displayTime(group.lastSeenAt)}<small>{group.lastSeenAt ? "เวลาไทย" : "ยังไม่ได้รับ webhook"}</small></div>
                <div className="line-row-actions"><button className="action-confirm" disabled={!data?.lineIntegration.configured || busyId === "line-test-" + group.id} onClick={() => testLineGroup(group)}>ทดสอบ</button>{!group.siteId && <button className="action-text danger" disabled={busyId === "line-delete-" + group.id} onClick={() => deleteLineRegistryGroup(group)}>{busyId === "line-delete-" + group.id ? "กำลังลบ…" : "ลบกลุ่ม"}</button>}</div>
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
                  return <div className="preview-row" key={`${row.siteName}-${row.wave}-${index}`}><span>{row.siteName}</span><span>{row.wave === "morning" ? "เช้า" : "เย็น"}</span><span>{row.postName} · {row.slotLabel}</span><span>{row.assignedGuard || "ยังไม่ระบุ"}</span><span>{group?.nameResolved ? group.groupName : row.lineGroupId ? "รอชื่อจริงจาก LINE" : "ยังไม่ผูก"}</span><span>{row.deadline}</span></div>;
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
