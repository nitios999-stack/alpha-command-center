"use client";

import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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
  pictureUrl: string | null;
  lastSeenAt: string | null;
  source: "manual" | "webhook";
};

type LineIntegrationStatus = {
  configured: boolean;
  gatewayConfigured: boolean;
  webhookPath: string;
  lastWebhookAt: string | null;
  receivedGroups: number;
  mappedGroups: number;
};

type TemplateSummary = {
  total: number;
  morning: number;
  evening: number;
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
  lineGroupName: string;
  linePictureUrl: string;
};

type DashboardData = {
  today: string;
  now: { time: string };
  slots: CoverageSlot[];
  sites: OperationalSite[];
  lineGroups: LineGroup[];
  lineIntegration: LineIntegrationStatus;
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
  lineGroup: LineGroup | null;
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
  const groups = new Map<string, CoverageSlot[]>();
  slots.forEach((slot) => {
    const existing = groups.get(slot.siteId) ?? [];
    existing.push(slot);
    groups.set(slot.siteId, existing);
  });
  const registryById = new Map(registry.map((site) => [site.id, site]));
  const lineGroupBySite = new Map(lineGroups.filter((group): group is LineGroup & { siteId: string } => Boolean(group.siteId)).map((group) => [group.siteId, group]));
  const siteIds = new Set([...registry.map((site) => site.id), ...groups.keys()]);
  return Array.from(siteIds)
    .map((id) => {
      const grouped = groups.get(id) ?? [];
      const registered = registryById.get(id);
      const status = deriveSiteStatus(grouped);
      return {
        id,
        name: grouped[0]?.siteName ?? registered?.siteName ?? "ไม่ระบุจุด",
        customerName: grouped[0]?.customerName ?? registered?.customerName ?? "ไม่ระบุลูกค้า",
        status,
        slots: grouped,
        confirmed: grouped.filter((slot) => slot.state === "confirmed").length,
        lateCount: grouped.filter((slot) => slot.lateMinutes > 0).length,
        lineGroup: lineGroupBySite.get(id) ?? null,
      } satisfies SiteCard;
    })
    .sort((a, b) => {
      const priority: Record<SiteStatus, number> = { red: 0, yellow: 1, gray: 2, green: 3 };
      return priority[a.status] - priority[b.status] || a.name.localeCompare(b.name, "th");
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
      lineGroupName: valueAt(row, ["line_group_name", "group_name", "ชื่อกลุ่มไลน์"]),
      linePictureUrl: valueAt(row, ["line_picture_url", "group_picture_url", "โลโก้กลุ่มไลน์"]),
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

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState<"ops" | "billing" | "setup" | "line">("ops");
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

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/command-center", { cache: "no-store" });
      const payload = (await response.json()) as DashboardData & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "ไม่สามารถโหลดข้อมูลได้");
      setData(payload);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ไม่สามารถโหลดข้อมูลได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => { void loadDashboard(); });
  }, [loadDashboard]);

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
  const visibleSites = useMemo(
    () => statusFilter === "all" ? sites : sites.filter((site) => site.status === statusFilter),
    [sites, statusFilter],
  );
  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [sites, selectedSiteId],
  );
  const wallLayout = useMemo(() => {
    const total = Math.max(visibleSites.length, 1);
    const columns = total > 64 ? 10 : total > 35 ? 8 : total > 20 ? 6 : total > 10 ? 5 : Math.min(4, total);
    return { columns, rows: Math.ceil(total / columns) };
  }, [visibleSites.length]);

  const runAction = async (payload: Record<string, unknown>, id: string, success: string) => {
    setBusyId(id);
    setMessage(null);
    try {
      const response = await fetch("/api/command-center/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string; imported?: number; created?: number; existing?: number; total?: number };
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
  };

  const replaceGuard = (slot: CoverageSlot) => {
    const name = window.prompt("ระบุชื่อ รปภ. สแปร์ที่รับจุดนี้", "นายสมพงษ์ (สแปร์)");
    if (!name) return;
    void runAction({ type: "replace", slotId: slot.id, guardName: name }, slot.id, "มอบหมายสแปร์แล้ว ระบบกำลังรอรายงานเข้าเวร");
  };

  const mapLineGroup = (site: SiteCard) => {
    const groupId = window.prompt("รหัสกลุ่ม LINE (groupId)", site.lineGroup?.id ?? "");
    if (!groupId) return;
    const groupName = window.prompt("ชื่อที่ต้องการแสดงของกลุ่ม LINE", site.lineGroup?.groupName ?? "");
    if (!groupName) return;
    const pictureUrl = window.prompt("ลิงก์โลโก้กลุ่ม LINE (เว้นว่างได้)", site.lineGroup?.pictureUrl ?? "");
    void runAction({ type: "line_group", siteId: site.id, groupId, groupName, pictureUrl }, "line-" + site.id, "ผูกกลุ่ม LINE กับจุดนี้แล้ว");
  };

  const linkRegistryGroup = (group: LineGroup, siteId: string) => {
    if (!siteId) return;
    void runAction(
      { type: "line_group", siteId, groupId: group.id, groupName: group.groupName, pictureUrl: group.pictureUrl ?? "" },
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

  const addSiteWithoutRoster = () => {
    const siteName = window.prompt("ชื่อจุดที่ต้องการแสดงเป็นสีเทา (ยังไม่ตั้งอัตราผลัดนี้)");
    if (!siteName) return;
    const customerName = window.prompt("ชื่อลูกค้าหรือหน่วยงานของจุดนี้");
    if (!customerName) return;
    void runAction({ type: "site", siteName, customerName }, "site-" + siteName, "เพิ่มจุดสีเทาแล้ว — ตั้งอัตรากำลังได้เมื่อพร้อม");
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
    const sample = "site_name,customer_name,wave,post_name,slot_label,assigned_guard,deadline,verification_policy,line_group_id,line_group_name,line_picture_url\nหมู่บ้านตัวอย่าง,นิติบุคคลตัวอย่าง,morning,ป้อมหน้า,ช่อง 1,นายสมชาย,06:00,standard,C123EXAMPLE,กลุ่ม รปภ. หมู่บ้านตัวอย่าง,\nหมู่บ้านตัวอย่าง,นิติบุคคลตัวอย่าง,evening,ป้อมหน้า,ช่อง 1,นายสมชาย,18:00,standard,C123EXAMPLE,กลุ่ม รปภ. หมู่บ้านตัวอย่าง,";
    const url = URL.createObjectURL(new Blob(["\uFEFF" + sample], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "alpha-command-center-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className={"shell " + (tab === "ops" ? "ops-shell" : tab === "setup" ? "setup-shell" : tab === "line" ? "line-shell" : "billing-shell")}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">A</span>
          <div>
            <p className="eyebrow">ALPHA SECURITY</p>
            <h1>Command Center</h1>
          </div>
        </div>
        <div className="live-indicator">
          <span className="pulse" />
          <span>อัปเดตจากระบบ {data?.now.time ?? "..."}</span>
        </div>
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
        <button className={tab === "ops" ? "active" : ""} onClick={() => setTab("ops")}>กำลังวันนี้</button>
        <button className={tab === "setup" ? "active" : ""} onClick={() => setTab("setup")}>ตั้งค่าอัตรา</button>
        <button className={tab === "line" ? "active" : ""} onClick={() => setTab("line")}>LINE OA</button>
        <button className={tab === "billing" ? "active" : ""} onClick={() => setTab("billing")}>วางบิล</button>
        <button className="quiet" onClick={() => void loadDashboard()} disabled={loading}>รีเฟรช</button>
      </nav>

      {message && (
        <div className="notice" role="status">
          <span>●</span> {message}
          <button onClick={() => setMessage(null)} aria-label="ปิดข้อความ">×</button>
        </div>
      )}

      {tab === "ops" ? (
        <>
          <section className="metrics wall-metrics" aria-label="สรุปกำลัง">
            <article className="metric green"><span>ครบยืนยันแล้ว</span><strong>{stats.green}</strong><small>จุด</small></article>
            <article className="metric yellow"><span>รอตรวจ</span><strong>{stats.yellow}</strong><small>จุด</small></article>
            <article className="metric red"><span>ต้องจัดการ</span><strong>{stats.red}</strong><small>จุด</small></article>
            <article className="metric neutral"><span>ยืนยันกำลังแล้ว</span><strong>{stats.confirmed}</strong><small>ช่องกำลัง</small></article>
          </section>

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
              <button className="small-secondary" onClick={addSiteWithoutRoster}>+ เพิ่มจุดเทา</button>
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
                <span className="tile-summary">{siteStatusSummary(site)}</span>
                <span className={"tile-line " + (site.lineGroup ? "linked" : "unlinked")}>
                  {site.lineGroup?.pictureUrl ? <img src={site.lineGroup.pictureUrl} alt="" /> : <b>LINE</b>}
                  <span>{site.lineGroup?.groupName ?? "ยังไม่ผูก LINE"}</span>
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
                <button type="button" className="drawer-close" onClick={() => setSelectedSiteId(null)} aria-label="ปิดรายละเอียด">×</button>
              </div>
              <div className={"drawer-line-group " + (selectedSite.lineGroup ? "linked" : "unlinked")}>
                {selectedSite.lineGroup?.pictureUrl ? <img src={selectedSite.lineGroup.pictureUrl} alt="" /> : <span className="line-avatar">LINE</span>}
                <div>
                  <small>กลุ่ม LINE ของจุดนี้</small>
                  <strong>{selectedSite.lineGroup?.groupName ?? "ยังไม่ผูกกลุ่ม"}</strong>
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
            <div className={data?.lineIntegration.lastWebhookAt ? "line-ready" : "line-not-ready"}>
              <strong>{data?.lineIntegration.lastWebhookAt ? "รับ LINE webhook แล้ว" : data?.lineIntegration.gatewayConfigured ? "รอ webhook จากกลุ่ม" : "กำลังเชื่อมต่อ Gateway"}</strong>
              <span>Webhook: {data?.lineIntegration.webhookPath ?? "/api/line/webhook"}</span>
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
            <strong>Webhook Gateway แยกต่างหาก</strong>
            <p>LINE จะส่ง webhook เข้า Gateway ที่ตรวจลายเซ็นและบันทึกกลุ่มก่อนตอบกลับ LINE ทันที จากนั้นจึงส่งเฉพาะทะเบียนกลุ่มที่ยืนยันแล้วเข้า Dashboard โดยไม่เก็บข้อความในกลุ่ม</p>
            <button className="small-secondary" disabled={!data?.lineIntegration.gatewayConfigured || busyId === "line-gateway-sync"} onClick={() => void runAction({ type: "line_gateway_sync" }, "line-gateway-sync", "รับทะเบียนกลุ่มล่าสุดจาก LINE Gateway แล้ว")}>{busyId === "line-gateway-sync" ? "กำลังรับข้อมูล…" : "รับกลุ่มล่าสุด"}</button>
          </section>

          <section className="line-groups-table">
            <div className="line-table-head"><span>กลุ่ม LINE</span><span>เชื่อมกับจุด</span><span>พบล่าสุด</span><span>จัดการ</span></div>
            {(data?.lineGroups ?? []).map((group) => (
              <article className="line-group-row" key={group.id}>
                <div className="line-group-identity">
                  {group.pictureUrl ? <img src={group.pictureUrl} alt="" /> : <span className="line-avatar">LINE</span>}
                  <div><strong>{group.groupName}</strong><code title={group.id}>{group.id}</code><small>{group.source === "webhook" ? "พบจาก LINE webhook" : "บันทึกโดยผู้จัดการ"}</small></div>
                </div>
                <div className="line-mapping-cell">
                  <select value={group.siteId ?? ""} onChange={(event) => linkRegistryGroup(group, event.target.value)} disabled={busyId === "line-map-" + group.id}>
                    <option value="">เลือกจุดที่จะผูก…</option>
                    {(data?.sites ?? []).map((site) => <option key={site.id} value={site.id}>{site.siteName} · {site.customerName}</option>)}
                  </select>
                  {group.siteId && <button className="action-text danger" disabled={busyId === "line-unmap-" + group.id} onClick={() => unmapRegistryGroup(group)}>ยกเลิก</button>}
                </div>
                <div className="line-last-seen">{displayTime(group.lastSeenAt)}<small>{group.lastSeenAt ? "เวลาไทย" : "ยังไม่ได้รับ webhook"}</small></div>
                <div className="line-row-actions"><button className="action-confirm" disabled={!data?.lineIntegration.configured || busyId === "line-test-" + group.id} onClick={() => testLineGroup(group)}>ทดสอบ</button></div>
              </article>
            ))}
            {!loading && !(data?.lineGroups ?? []).length && <p className="line-empty">ยังไม่มีกลุ่มในทะเบียน เมื่อ OA รับ webhook จากกลุ่ม กลุ่มจะปรากฏที่นี่เพื่อให้เลือกผูกกับจุด</p>}
          </section>
        </section>
      ) : (
        <section className="setup-board" aria-label="ตั้งค่าอัตรากำลัง">
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
            <article><span>1</span><div><strong>ดาวน์โหลดไฟล์ตัวอย่าง</strong><p>เปิดด้วย Excel แล้วใส่รายชื่อจุด, กำลังประจำ และกลุ่ม LINE ของแต่ละจุด</p></div><button className="small-secondary" onClick={downloadTemplate}>ดาวน์โหลด CSV</button></article>
            <article><span>2</span><div><strong>เลือกไฟล์ที่จัดทำแล้ว</strong><p>รองรับสูงสุด 300 อัตราต่อครั้ง เหมาะกับ 80 จุด สองผลัด และการผูกกลุ่ม LINE</p></div><label className="file-picker">เลือกไฟล์ CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void loadTemplateFile(event.target.files?.[0])} /></label></article>
            <article><span>3</span><div><strong>ตรวจและนำเข้า</strong><p>ระบบจะอัปเดตเฉพาะอัตราต้นแบบ ยังไม่เปลี่ยนสถานะหน้างาน</p></div><button className="primary-button" disabled={!templateRows.length || busyId === "template-import"} onClick={importTemplates}>{busyId === "template-import" ? "กำลังนำเข้า…" : `ยืนยัน ${templateRows.length} อัตรา`}</button></article>
          </div>

          <section className="line-mapping-note">
            <span className="line-avatar">LINE</span>
            <div><strong>การผูกกลุ่ม LINE</strong><p>คอลัมน์ <code>line_group_id</code> และ <code>line_group_name</code> ใช้ระบุว่าจุดนี้อยู่ในกลุ่มใด ส่วน <code>line_picture_url</code> เป็นลิงก์โลโก้กลุ่ม (เว้นว่างได้) เมื่อเปิดเชื่อม LINE OA ในเฟสถัดไป ระบบจะใช้ groupId เดียวกันนี้เป็นตัวจับคู่</p></div>
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
                {templateRows.slice(0, 5).map((row, index) => <div className="preview-row" key={`${row.siteName}-${row.wave}-${index}`}><span>{row.siteName}</span><span>{row.wave === "morning" ? "เช้า" : "เย็น"}</span><span>{row.postName} · {row.slotLabel}</span><span>{row.assignedGuard || "ยังไม่ระบุ"}</span><span>{row.lineGroupName || "ยังไม่ผูก"}</span><span>{row.deadline}</span></div>)}
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
    </main>
  );
}
