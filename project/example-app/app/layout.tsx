import "./globals.css";
import TraceBugInit from "./tracebug-init";

export const metadata = { title: "Demo App — TraceBug" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TraceBugInit />
        <nav style={{ borderBottom: "1px solid #333", padding: "12px 24px", display: "flex", gap: "16px" }}>
          <a href="/">Home</a>
          <a href="/vendor">Vendors</a>
        </nav>
        <div style={{ padding: "24px" }}>{children}</div>
      </body>
    </html>
  );
}
