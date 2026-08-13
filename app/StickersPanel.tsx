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
        setMessage("Failed to load sticker configurations.");
      }
    } catch (e) {
      setMessage("Network error loading sticker configurations.");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const toggleGroup = (id: string) => {
    setSelectedGroups(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
  };

  const handleManualBatch = async () => {
    if (selectedGroups.length === 0) return;
    const preset = presets[0]; // just use the first preset for now
    if (!preset) return alert("Please create a sticker preset first");
    if (!confirm(`Are you sure you want to send the sticker to ${selectedGroups.length} groups?`)) return;

    setMessage("Sending...");
    try {
      const res = await fetch("/api/line/stickers/manual-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupIds: selectedGroups,
          stickerPackageId: preset.package_id,
          stickerId: preset.sticker_id,
          idempotencyKey: "batch-" + Date.now()
        })
      });
      if (res.ok) {
        const data = await res.json();
        setMessage(`Sent to ${data.totalSent} groups successfully.`);
        setSelectedGroups([]);
      } else {
        const err = await res.json();
        setMessage(`Failed: ${err.error}`);
      }
    } catch (e) {
      setMessage("Network error.");
    }
  };

  if (loading) return <section className="line-control"><p>Loading...</p></section>;

  return (
    <section className="line-control">
      {message && <div className="notice" role="status"><span>ℹ️</span> {message} <button onClick={() => setMessage(null)}>x</button></div>}
      <div className="line-control-hero">
        <div>
          <p className="eyebrow">LINE STICKERS</p>
          <h2>ตอบกลับอัตโนมัติด้วยสติกเกอร์</h2>
          <p>ส่งสติกเกอร์ตอบกลับในกลุ่ม LINE โดยอัตโนมัติ เพื่อยืนยันการรับรู้ หรือส่งแบบ Manual ไปยังหลายกลุ่มพร้อมกัน</p>
        </div>
      </div>
      
      <div className="roster-grid">
        <div className="card">
          <div className="card-header">
            <h3>Manual Batch</h3>
          </div>
          <div className="card-body">
            <p>เลือกกลุ่มที่ต้องการส่งสติกเกอร์แบบ Manual ทันที (จะใช้ Preset แรก)</p>
            <div style={{ maxHeight: 300, overflow: 'auto', marginBottom: 10, border: '1px solid var(--border)', padding: '10px' }}>
              {groups.map(g => (
                <label key={g.id} style={{ display: 'block', padding: '4px 0' }}>
                  <input type="checkbox" checked={selectedGroups.includes(g.id)} onChange={() => toggleGroup(g.id)} />
                  {' '}
                  {g.group_name || 'ไม่ระบุชื่อกลุ่ม'}
                </label>
              ))}
            </div>
            <button className="primary" onClick={handleManualBatch} disabled={selectedGroups.length === 0}>
              ส่งสติกเกอร์ให้ {selectedGroups.length} กลุ่ม
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Presets (ตั้งค่าสติกเกอร์)</h3>
          </div>
          <div className="card-body">
            {presets.length === 0 ? <p>ยังไม่มี Preset</p> : (
              <ul>
                {presets.map(p => (
                  <li key={p.id}><strong>{p.name}</strong> - Pkg: {p.package_id}, Sticker: {p.sticker_id}</li>
                ))}
              </ul>
            )}
            <p style={{ marginTop: 10 }}><small>การเพิ่ม/แก้ไข Preset อยู่ระหว่างการพัฒนา (สามารถแก้ไขใน Database ได้)</small></p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Group Configurations (ตั้งค่าตอบกลับอัตโนมัติ)</h3>
          </div>
          <div className="card-body">
            {configs.length === 0 ? <p>ยังไม่ได้ตั้งค่ากลุ่มใดเลย (ระบบ Silent-by-default)</p> : (
              <table style={{ width: '100%', textAlign: 'left' }}>
                <thead>
                  <tr>
                    <th>กลุ่ม</th>
                    <th>โหมด</th>
                    <th>แพ็กเกจ/สติกเกอร์</th>
                    <th>Cooldown/Daily</th>
                  </tr>
                </thead>
                <tbody>
                  {configs.map(c => {
                    const g = groups.find(x => x.id === c.group_id);
                    return (
                      <tr key={c.group_id}>
                        <td>{g ? g.group_name : 'Unknown'}</td>
                        <td>{c.mode}</td>
                        <td>{c.sticker_package_id}/{c.sticker_id}</td>
                        <td>{c.cooldown_minutes}m / {c.daily_count}/{c.daily_limit}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p style={{ marginTop: 10 }}><small>การเปลี่ยนการตั้งค่าแต่ละกลุ่มอยู่ระหว่างการพัฒนา (สามารถแก้ไขใน Database ได้)</small></p>
          </div>
        </div>
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>คิวจัดส่ง (Pending Manual Batch)</h3>
            <button className="secondary" onClick={fetchData}>รีเฟรช 🔄</button>
          </div>
          <div className="card-body">
            {queue.length === 0 ? <p>ไม่มีสติกเกอร์รอคิว</p> : (
              <table style={{ width: '100%', textAlign: 'left' }}>
                <thead>
                  <tr>
                    <th>กลุ่ม</th>
                    <th>แพ็กเกจ/สติกเกอร์</th>
                    <th>สร้างเมื่อ (เวลาที่กดส่ง)</th>
                    <th>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map(q => {
                    const g = groups.find(x => x.id === q.group_id);
                    return (
                      <tr key={q.id}>
                        <td>{g ? g.group_name : 'Unknown'}</td>
                        <td>{q.sticker_package_id}/{q.sticker_id}</td>
                        <td>{new Date(q.created_at).toLocaleString('th-TH')}</td>
                        <td><span style={{ color: 'orange' }}>รอจังหวะส่ง ⏳</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p style={{ marginTop: 10, color: 'var(--text-secondary)' }}><small>* สติกเกอร์ในคิวจะถูกส่งฟรี 100% ทันทีที่รปภ. ในกลุ่มนั้นๆ พิมพ์ข้อความใหม่เข้ามา (ระบบ Reply Token)</small></p>
          </div>
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-header">
            <h3>ประวัติการส่งล่าสุด (Audit Log)</h3>
          </div>
          <div className="card-body">
            {audit.length === 0 ? <p>ยังไม่มีประวัติการส่ง</p> : (
              <table style={{ width: '100%', textAlign: 'left' }}>
                <thead>
                  <tr>
                    <th>เวลา</th>
                    <th>กลุ่ม</th>
                    <th>ประเภท</th>
                    <th>แพ็กเกจ/สติกเกอร์</th>
                    <th>สถานะ</th>
                    <th>หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map(a => {
                    const g = groups.find(x => x.id === a.group_id);
                    return (
                      <tr key={a.id}>
                        <td>{new Date(a.sent_at).toLocaleString('th-TH')}</td>
                        <td>{g ? g.group_name : 'Unknown'}</td>
                        <td>{a.action_type === 'manual-batch-queued' ? 'คิว (Manual)' : a.action_type}</td>
                        <td>{a.sticker_package_id}/{a.sticker_id}</td>
                        <td style={{ color: a.status === 'sent' ? 'green' : (a.status === 'skipped' ? 'gray' : 'red') }}>{a.status}</td>
                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.skip_reason}>{a.skip_reason || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
