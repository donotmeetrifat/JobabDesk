import { ImageResponse } from "next/og";

// Replaces the default Next.js favicon with the brand mark — Hostinger
// violet rounded square + white chat-square glyph — matching the
// sidebar logo in `src/components/layout/sidebar.tsx`. Next.js renders
// this at build time and auto-injects <link rel="icon"> into <head>.
//
// This route takes precedence over src/app/favicon.ico, which is the
// Next.js default and can stay on disk harmlessly (or be removed).

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0066FF",
          borderRadius: 8,
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            d="M12 3C6.48 3 2 6.94 2 11.8c0 2.76 1.42 5.22 3.65 6.81-.17 1.48-.78 3.12-1.92 4.19-.24.23-.07.64.26.62 2.37-.15 4.38-1.07 5.64-1.96.75.22 1.54.34 2.37.34 5.52 0 10-3.94 10-8.8S17.52 3 12 3z"
            fill="#ffffff"
          />
          <circle cx="8" cy="11.8" r="1.3" fill="#0066FF" />
          <circle cx="12" cy="11.8" r="1.3" fill="#0066FF" />
          <circle cx="16" cy="11.8" r="1.3" fill="#0066FF" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
