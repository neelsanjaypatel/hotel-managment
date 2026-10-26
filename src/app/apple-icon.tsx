import { ImageResponse } from "next/og";
import { AppMark } from "@/components/app-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS rounds the corners itself, so the mark fills the square.
export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#1e6b4e" }}>
      <AppMark size={180} />
    </div>,
    size,
  );
}
