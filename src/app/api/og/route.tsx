import { ImageResponse } from "next/og";
import fs from "fs";
import path from "path";

export async function GET() {
  const logoBuffer = fs.readFileSync(path.join(process.cwd(), "public", "bba-logo.png"));
  const logoSrc = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0c4a6e 100%)",
          fontFamily: "sans-serif",
          gap: 64,
          padding: "0 80px",
        }}
      >
        {/* Logo — besar, di tengah vertikal, visible saat di-crop jadi square */}
        <div
          style={{
            width: 200,
            height: 200,
            borderRadius: 40,
            overflow: "hidden",
            border: "4px solid rgba(14,165,233,0.5)",
            background: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 0 60px rgba(14,165,233,0.25)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            width={200}
            height={200}
            alt="BBA Logo"
            style={{ objectFit: "cover" }}
          />
        </div>

        {/* Text */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 900,
              color: "white",
              letterSpacing: "-2px",
              lineHeight: 1,
            }}
          >
            BBA HR
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 900,
              color: "#38bdf8",
              letterSpacing: "-2px",
              lineHeight: 1,
            }}
          >
            Platform
          </div>
          <div
            style={{
              fontSize: 24,
              color: "rgba(148,163,184,1)",
              fontWeight: 500,
              lineHeight: 1.4,
              maxWidth: 480,
              marginTop: 8,
            }}
          >
            Platform HR untuk operasional dan monitoring apotek
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 8,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#0ea5e9",
                display: "flex",
              }}
            />
            <span style={{ color: "#7dd3fc", fontSize: 18, fontWeight: 700 }}>
              bba-system.vercel.app
            </span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
