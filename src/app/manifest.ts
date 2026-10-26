import type { MetadataRoute } from "next";

// Lets staff install Hotel Desk on a phone's home screen and open it like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hotel Desk",
    short_name: "Hotel Desk",
    description: "Daily counter, expenses, payroll and partner reports for the hotel.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f4ef",
    theme_color: "#1e6b4e",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
