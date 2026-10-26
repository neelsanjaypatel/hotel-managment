// The Hotel Desk mark, drawn for ImageResponse (inline styles only, flex layout).
export function AppMark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1e6b4e",
        color: "#ffffff",
        fontSize: Math.round(size * 0.42),
        fontWeight: 700,
        letterSpacing: -Math.round(size * 0.02),
        borderRadius: Math.round(size * 0.22),
      }}
    >
      HD
    </div>
  );
}
