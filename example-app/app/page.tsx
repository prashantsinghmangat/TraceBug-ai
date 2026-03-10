"use client";

export default function HomePage() {
  return (
    <div>
      <h1 style={{ fontSize: "24px", marginBottom: "16px" }}>Demo App</h1>
      <p style={{ color: "#999", marginBottom: "24px" }}>
        This app demonstrates TraceBug SDK. Go to the Vendor page and trigger a bug.
      </p>
      <a href="/vendor" style={{ display: "inline-block", padding: "10px 20px", background: "#2563eb", color: "white", borderRadius: "6px" }}>
        Go to Vendor Page
      </a>
    </div>
  );
}
