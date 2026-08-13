"use client";

import { useEffect } from "react";

export default function PatrolPage() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.location.replace("/?tab=patrol");
    }
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#090d16", color: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📱</div>
        <div>กำลังเปิดแผงตรวจสายตรวจ...</div>
      </div>
    </div>
  );
}
