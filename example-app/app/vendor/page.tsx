"use client";

import { useState } from "react";

/**
 * Demo vendor page with a DELIBERATE BUG.
 * When status is changed to "Inactive" and Update is clicked,
 * it throws: Cannot read properties of undefined (reading 'status')
 *
 * TraceBug captures this and generates reproduction steps automatically.
 */
export default function VendorPage() {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("Acme Corp");
  const [status, setStatus] = useState("Active");

  const handleUpdate = () => {
    // BUG: vendorConfig has no "Inactive" key
    const vendorConfig: Record<string, any> = {
      Active: { validation: { status: "ok" } },
      // "Inactive" intentionally missing
    };

    // This throws when status === "Inactive"
    const validationStatus = vendorConfig[status].validation.status;
    console.log("Validation:", validationStatus);
    alert("Vendor updated!");
  };

  const s = {
    card: { border: "1px solid #333", borderRadius: "8px", padding: "20px", maxWidth: "500px" } as const,
    field: { display: "flex" as const, flexDirection: "column" as const, gap: "4px", marginBottom: "16px" },
    label: { color: "#999", fontSize: "14px" },
    input: { padding: "8px 12px", background: "#222", border: "1px solid #444", borderRadius: "4px", color: "#eee" },
    select: { padding: "8px 12px", background: "#222", border: "1px solid #444", borderRadius: "4px", color: "#eee" },
    btnPrimary: { padding: "8px 16px", background: "#2563eb", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" },
    btnSecondary: { padding: "8px 16px", background: "#333", color: "#eee", border: "none", borderRadius: "4px", cursor: "pointer" },
  };

  return (
    <div>
      <h1 style={{ fontSize: "24px", marginBottom: "16px" }}>Vendor Page</h1>
      <div style={s.card}>
        {!editing ? (
          <>
            <p><strong>Name:</strong> {name}</p>
            <p><strong>Status:</strong> {status}</p>
            <button id="editBtn" style={{ ...s.btnPrimary, marginTop: "16px" }} onClick={() => setEditing(true)}>Edit</button>
          </>
        ) : (
          <>
            <div style={s.field}>
              <label style={s.label}>Name</label>
              <input name="vendorName" style={s.input} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Status</label>
              <select name="vendorStatus" style={s.select} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button id="updateBtn" style={s.btnPrimary} onClick={handleUpdate}>Update</button>
              <button style={s.btnSecondary} onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </>
        )}
      </div>
      <p style={{ color: "#666", marginTop: "24px", fontSize: "14px" }}>
        Try: Click Edit → Change Status to Inactive → Click Update → Then click 🐛 to see the bug report.
      </p>
    </div>
  );
}
