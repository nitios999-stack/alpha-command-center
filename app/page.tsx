"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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

type DashboardData = {
  today: string;
  now: { time: string };
  slots: CoverageSlot[];
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

function groupSites(slots: CoverageSlot[]) {
  const groups = new Map<string, CoverageSlot[]>();
  slots.forEach((slot) => {
    const existing = groups.get(slot.siteId) ?? [];
    existing.push(slot);
    groups.set(slot.siteId, existing);
  });
  return Array.from(groups.entries())
    .map(([id, grouped]) => {
      const status = deriveSiteStatus(grouped);
      return {
        id,
        name: grouped[0].siteName,
        customerName: grouped[0].customerName,
        status,
        slots: grouped,
        confirmed: grouped.filter((slot) => slot.state === "confirmed").length,
        lateCount: grouped.filter((slot) => slot.lateMinutes > 0).length,
      } satisfies SiteCard;
    })
    .sort((a, b) => {
      const priority: Record<SiteStatus, number> = { red: 0, yellow: 1, gray: 2, green: 3 };
      return priority[a.status] - priority[b.status] || a.name.localeCompare(b.name, "th");
    });
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
  const [tab, setTab] = useState<"ops" | "billing">("ops");
  const [wave, setWave] = useState<"morning" | "evening">("morning");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showBillingForm, setShowBillingForm] = useState(false);
  const [showSlotForm, setShowSlotForm] = useState(false);

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
    void loadDashboard();
  }, [loadDashboard]);

  const visibleSlots = useMemo(
    () => (data?.slots ?? []).filter((slot) => slot.wave === wave),
    [data?.slots, wave],
  );
  const sites = useMemo(() => groupSites(visibleSlots), [visibleSlots]);
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

  const runAction = async (payload: Record<string, unknown>, id: string, success: string) => {
    setBusyId(id);
    setMessage(null);
    try {
      const response = await fetch("/api/command-center/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "ทำรายการไม่สำเร็จ");
      setMessage(success);
      await loadDashboard();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  };

  const replaceGuard = (slot: CoverageSlot) => {
    const name = window.prompt("ระบุชื่อ รปภ. สแปร์ที่รับจุดนี้", "นายสมพงษ์ (สแปร์)");
    if (!name) return;
    void runAction({ type: "replace", slotId: slot.id, guardName: name }, slot.id, "มอบหมายสแปร์แล้ว ระบบกำลังรอรายงานเข้าเวร");
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

  return (
    <main className="shell">
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

      <section className="hero">
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
      </section>

      <nav className="tabs" aria-label="เมนูหลัก">
        <button className={tab === "ops" ? "active" : ""} onClick={() => setTab("ops")}>กำลังวันนี้</button>
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
          <section className="metrics" aria-label="สรุปกำลัง">
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
              <button className="small-primary" onClick={() => setShowSlotForm((show) => !show)}>
                {showSlotForm ? "ปิด" : "+ เพิ่มช่องกำลัง"}
              </button>
            </div>
          </section>

          <div className="wave-switch" role="group" aria-label="เลือกผลัด">
            <button className={wave === "morning" ? "active" : ""} onClick={() => setWave("morning")}>ผลัดเช้า</button>
            <button className={wave === "evening" ? "active" : ""} onClick={() => setWave("evening")}>ผลัดเย็น</button>
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

          <section className="site-grid" aria-live="polite">
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
        </>
      ) : (
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
      )}
    </main>
  );
}
