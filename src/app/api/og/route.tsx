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
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0c4a6e 100%)",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Background decoration */}
        <div
          style={{
            position: "absolute",
            top: -80,
            right: -80,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "rgba(14,165,233,0.08)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -60,
            left: -60,
            width: 300,
            height: 300,
            borderRadius: "50%",
            background: "rgba(14,165,233,0.06)",
            display: "flex",
          }}
        />

        {/* Logo */}
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 28,
            overflow: "hidden",
            marginBottom: 32,
            border: "3px solid rgba(14,165,233,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "white",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            width={120}
            height={120}
            alt="BBA Logo"
            style={{ objectFit: "cover" }}
          />
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 900,
            color: "white",
            letterSpacing: "-2px",
            lineHeight: 1,
            marginBottom: 16,
            textAlign: "center",
          }}
        >
          BBA HR Platform
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 26,
            color: "rgba(148,163,184,1)",
            fontWeight: 500,
            textAlign: "center",
            maxWidth: 700,
            lineHeight: 1.4,
          }}
        >
          Platform HR untuk operasional dan monitoring apotek
        </div>

        {/* Bottom domain badge */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(14,165,233,0.12)",
            border: "1px solid rgba(14,165,233,0.3)",
            borderRadius: 999,
            padding: "8px 20px",
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
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
