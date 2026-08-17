"use client";

import { useEffect, useState, useCallback } from "react";

type QuotaData = {
  ok: boolean;
  quota?: {
    type: string;
    totalLimit: number;
    used: number;
    remaining: number;
    usagePercent: number;
  };
  botInfo?: {
    userId: string;
    basicId: string;
    displayName: string;
    pictureUrl: string | null;
    chatMode: string;
    markAsReadMode: string;
  };
  stats?: {
    freeReplyStickersSent: number;
    pushAlertsSent: number;
    quotaSavedByReply: number;
  };
  recentLogs?: Array<{
    id: string;
    group_id: string;
    group_name?: string;
    action_type: string;
    status: string;
    skip_reason?: string;
    sent_at: string;
  }>;
  error?: string;
  checkedAt?: string;
};

export function LineQuotaPanel() {
  const [data, setData] = useState<QuotaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuota = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch("/api/line/quota");
      const json = await res.json();
      if (json.ok) {
        setData(json);
        setError(null);
      } else {
        setError(json.error || "ไม่สามารถดึงข้อมูลโควต้า LINE ได้");
      }
    } catch (err: any) {
      setError(err.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchQuota();
    const interval = setInterval(() => {
      fetchQuota();
    }, 30000); // 30 seconds auto-refresh
    return () => clearInterval(interval);
  }, [fetchQuota]);

  const totalLimit = data?.quota?.totalLimit ?? 300;
  const used = data?.quota?.used ?? 0;
  const remaining = data?.quota?.remaining ?? (totalLimit - used);
  const usagePercent = data?.quota?.usagePercent ?? (totalLimit > 0 ? Math.round((used / totalLimit) * 100) : 0);

  const formatThaiDateTime = (isoStr?: string) => {
    if (!isoStr) return "-";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <section className="line-quota-panel" style={{ padding: "20px 0", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "16px",
        marginBottom: "24px",
        background: "linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)",
        padding: "20px 24px",
        borderRadius: "16px",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(12px)",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <span style={{ fontSize: "1.6rem" }}>📊</span>
            <h2 style={{ margin: 0, fontSize: "1.4rem", color: "#f8fafc", fontWeight: 700 }}>
              ระบบตรวจสอบโควต้า LINE Official Account
            </h2>
            <span style={{
              fontSize: "0.75rem",
              background: "rgba(34, 197, 94, 0.15)",
              color: "#4ade80",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              padding: "3px 10px",
              borderRadius: "20px",
              fontWeight: 600,
            }}>
              ● เชื่อมต่อ API สด
            </span>
          </div>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem" }}>
            เช็คโควต้าข้อความ Push รายเดือน, สถิติการประหยัดข้อความด้วย Reply API, และสถานะบอทสั่งการ
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {data?.checkedAt && (
            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
              อัปเดตล่าสุด: {formatThaiDateTime(data.checkedAt)}
            </span>
          )}
          <button
            onClick={() => fetchQuota(true)}
            disabled={refreshing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: refreshing ? "#334155" : "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
              color: "#ffffff",
              border: "none",
              padding: "10px 18px",
              borderRadius: "10px",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: refreshing ? "not-allowed" : "pointer",
              boxShadow: "0 4px 12px rgba(2, 132, 199, 0.3)",
              transition: "all 0.2s ease",
            }}
          >
            <span style={{ display: "inline-block", animation: refreshing ? "spin 1s linear infinite" : "none" }}>🔄</span>
            {refreshing ? "กำลังเช็ค..." : "รีเฟรชโควต้าสด"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: "rgba(239, 68, 68, 0.15)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          color: "#fca5a5",
          padding: "14px 18px",
          borderRadius: "12px",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}>
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Bot OA Profile Card */}
      {data?.botInfo && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}>
          <div style={{
            background: "rgba(15, 23, 42, 0.6)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "14px",
            padding: "18px 20px",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}>
            {data.botInfo.pictureUrl ? (
              <img
                src={data.botInfo.pictureUrl}
                alt={data.botInfo.displayName}
                style={{ width: "64px", height: "64px", borderRadius: "50%", border: "2px solid #0284c7" }}
              />
            ) : (
              <div style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: "#0284c7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.8rem",
              }}>
                🤖
              </div>
            )}
            <div>
              <div style={{ fontSize: "0.75rem", color: "#38bdf8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                LINE Official Account บัญชีหลัก
              </div>
              <h3 style={{ margin: "2px 0", fontSize: "1.15rem", color: "#f8fafc", fontWeight: 700 }}>
                {data.botInfo.displayName}
              </h3>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                <code style={{ background: "rgba(255, 255, 255, 0.1)", padding: "2px 8px", borderRadius: "6px", fontSize: "0.8rem", color: "#e2e8f0" }}>
                  {data.botInfo.basicId}
                </code>
                <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                  โหมด: {data.botInfo.chatMode}
                </span>
              </div>
            </div>
          </div>

          <div style={{
            background: "rgba(15, 23, 42, 0.6)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "14px",
            padding: "18px 20px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}>
            <div style={{ fontSize: "0.75rem", color: "#a855f7", fontWeight: 600, textTransform: "uppercase" }}>
              💡 กลยุทธ์ประหยัดโควต้า (Zero Cost Mode)
            </div>
            <p style={{ margin: "6px 0 0", fontSize: "0.82rem", color: "#cbd5e1", lineHeight: 1.5 }}>
              บอทตอบสติกเกอร์ รปภ. ด้วย <strong>LINE Direct Reply API (0 บาท / ฟรี 100%)</strong> ไม่หักโควต้าข้อความรายเดือนแม้แต่ข้อความเดียว!
            </p>
          </div>
        </div>
      )}

      {/* Main Quota KPI Gauges */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "16px",
        marginBottom: "24px",
      }}>
        {/* Total Quota */}
        <div style={{
          background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "14px",
          padding: "20px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600 }}>โควต้าทั้งหมด (แพ็กเกจ)</span>
            <span style={{ fontSize: "1.2rem" }}>📦</span>
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#f8fafc" }}>
            {loading ? "..." : `${totalLimit.toLocaleString()}`}
            <span style={{ fontSize: "0.9rem", fontWeight: 500, color: "#94a3b8", marginLeft: "6px" }}>ข้อความ/เดือน</span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>
            ประเภท: {data?.quota?.type === "limited" ? "จำกัดโควต้า (Free/Standard)" : "ไม่จำกัด"}
          </div>
        </div>

        {/* Used Quota */}
        <div style={{
          background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "14px",
          padding: "20px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600 }}>ใช้ไปแล้วในเดือนนี้</span>
            <span style={{ fontSize: "1.2rem" }}>📤</span>
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: usagePercent > 85 ? "#f87171" : usagePercent > 60 ? "#fbbf24" : "#38bdf8" }}>
            {loading ? "..." : `${used.toLocaleString()}`}
            <span style={{ fontSize: "0.9rem", fontWeight: 500, color: "#94a3b8", marginLeft: "6px" }}>ข้อความ</span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "4px" }}>
            คิดเป็น <strong>{usagePercent}%</strong> ของโควต้า
          </div>
        </div>

        {/* Remaining Quota */}
        <div style={{
          background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "14px",
          padding: "20px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600 }}>คงเหลือสำหรับส่ง Push</span>
            <span style={{ fontSize: "1.2rem" }}>🟢</span>
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: remaining < 30 ? "#ef4444" : remaining < 80 ? "#f59e0b" : "#4ade80" }}>
            {loading ? "..." : `${remaining.toLocaleString()}`}
            <span style={{ fontSize: "0.9rem", fontWeight: 500, color: "#94a3b8", marginLeft: "6px" }}>ข้อความ</span>
          </div>
          <div style={{ fontSize: "0.75rem", color: remaining < 30 ? "#fca5a5" : "#86efac", marginTop: "4px" }}>
            {remaining < 30 ? "⚠️ โควต้าเหลือน้อย แนะนำสำรอง" : "✓ สถานะโควต้าปลอดภัย"}
          </div>
        </div>

        {/* Free Replies Sent */}
        <div style={{
          background: "linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "14px",
          padding: "20px",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600 }}>สติกเกอร์ตอบรับฟรี (Reply)</span>
            <span style={{ fontSize: "1.2rem" }}>🎁</span>
          </div>
          <div style={{ fontSize: "2rem", fontWeight: 800, color: "#a855f7" }}>
            {loading ? "..." : `${(data?.stats?.freeReplyStickersSent ?? 0).toLocaleString()}`}
            <span style={{ fontSize: "0.9rem", fontWeight: 500, color: "#94a3b8", marginLeft: "6px" }}>ครั้ง (0 โควต้า)</span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "#c084fc", marginTop: "4px" }}>
            ประหยัดโควต้าได้ 100%
          </div>
        </div>
      </div>

      {/* Quota Progress Bar */}
      <div style={{
        background: "rgba(15, 23, 42, 0.8)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "16px",
        padding: "24px",
        marginBottom: "24px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <div>
            <h4 style={{ margin: 0, color: "#f8fafc", fontSize: "1rem", fontWeight: 700 }}>
              แถบสถานะการใช้โควต้าในรอบบิลปัจจุบัน
            </h4>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
              รีเซ็ตโควต้าใหม่ทุกวันที่ 1 ของเดือน (เวลา 00:00 น.)
            </span>
          </div>
          <div style={{
            fontSize: "1.1rem",
            fontWeight: 800,
            color: usagePercent > 85 ? "#f87171" : usagePercent > 60 ? "#fbbf24" : "#38bdf8",
          }}>
            {usagePercent}%
          </div>
        </div>

        {/* Progress Bar Container */}
        <div style={{
          width: "100%",
          height: "16px",
          background: "rgba(255, 255, 255, 0.08)",
          borderRadius: "10px",
          overflow: "hidden",
          position: "relative",
        }}>
          <div style={{
            width: `${usagePercent}%`,
            height: "100%",
            background: usagePercent > 85
              ? "linear-gradient(90deg, #f59e0b 0%, #ef4444 100%)"
              : usagePercent > 60
              ? "linear-gradient(90deg, #0284c7 0%, #f59e0b 100%)"
              : "linear-gradient(90deg, #0284c7 0%, #38bdf8 100%)",
            borderRadius: "10px",
            transition: "width 0.5s ease-in-out",
          }} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "0.75rem", color: "#64748b" }}>
          <span>0 ข้อความ</span>
          <span>{totalLimit / 2} ข้อความ (50%)</span>
          <span>{totalLimit} ข้อความ (100%)</span>
        </div>
      </div>

      {/* Outbound Push vs Reply Log Table */}
      <div style={{
        background: "rgba(15, 23, 42, 0.8)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "16px",
        padding: "24px",
        overflowX: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h4 style={{ margin: 0, color: "#f8fafc", fontSize: "1.05rem", fontWeight: 700 }}>
              📋 ประวัติการส่งข้อความและสติกเกอร์ล่าสุด (Live Outbound Audit)
            </h4>
            <p style={{ margin: "2px 0 0", color: "#94a3b8", fontSize: "0.8rem" }}>
              ตรวจสอบว่าข้อความใดเป็นแบบ Direct Reply (ฟรี) หรือแบบ Push แจ้งเตือนห้องสั่งการ
            </p>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)", color: "#94a3b8" }}>
              <th style={{ padding: "10px 14px" }}>วัน-เวลา</th>
              <th style={{ padding: "10px 14px" }}>ประเภทการส่ง</th>
              <th style={{ padding: "10px 14px" }}>กลุ่มเป้าหมาย</th>
              <th style={{ padding: "10px 14px" }}>สถานะ</th>
              <th style={{ padding: "10px 14px" }}>การตัดโควต้า</th>
            </tr>
          </thead>
          <tbody>
            {(!data?.recentLogs || data.recentLogs.length === 0) ? (
              <tr>
                <td colSpan={5} style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>
                  ยังไม่มีประวัติการส่งข้อความล่าสุด
                </td>
              </tr>
            ) : (
              data.recentLogs.map((log) => {
                const isReply = log.action_type === "auto-reply-close" || log.action_type === "auto-reply";
                const isPush = log.action_type.includes("push");
                return (
                  <tr key={log.id} style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                    <td style={{ padding: "12px 14px", color: "#cbd5e1", whiteSpace: "nowrap" }}>
                      {formatThaiDateTime(log.sent_at)}
                    </td>
                    <td style={{ padding: "12px 14px", color: "#f8fafc" }}>
                      <span style={{
                        display: "inline-block",
                        padding: "3px 8px",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        background: isReply ? "rgba(168, 85, 247, 0.15)" : "rgba(2, 132, 199, 0.15)",
                        color: isReply ? "#c084fc" : "#38bdf8",
                        border: `1px solid ${isReply ? "rgba(168, 85, 247, 0.3)" : "rgba(2, 132, 199, 0.3)"}`,
                      }}>
                        {isReply ? "💬 Direct Reply (สติกเกอร์)" : (isPush ? "🚨 Push Notification" : log.action_type)}
                      </span>
                    </td>
                    <td style={{ padding: "12px 14px", color: "#94a3b8" }}>
                      {log.group_name || log.group_id}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{
                        color: log.status === "sent" ? "#4ade80" : log.status === "skipped" ? "#fbbf24" : "#f87171",
                        fontWeight: 600,
                        fontSize: "0.8rem",
                      }}>
                        {log.status === "sent" ? "✓ ส่งสำเร็จ" : (log.status === "skipped" ? "ข้าม" : "✕ ผิดพลาด")}
                      </span>
                      {log.skip_reason && (
                        <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "2px" }}>
                          {log.skip_reason}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{
                        fontSize: "0.75rem",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontWeight: 600,
                        background: isReply ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
                        color: isReply ? "#4ade80" : "#f87171",
                      }}>
                        {isReply ? "🆓 0 โควต้า (ฟรี)" : (log.status === "sent" ? "➖ 1 โควต้า" : "0 โควต้า")}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
