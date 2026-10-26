import { ImageResponse } from "next/og";
import { AppMark } from "@/components/app-mark";

const SIZES = new Set([192, 512]);

// Home-screen icons for the web app manifest.
export async function GET(_: Request, { params }: RouteContext<"/pwa-icon/[size]">) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: "#1e6b4e" }}>
      <AppMark size={size} />
    </div>,
    { width: size, height: size },
  );
}
