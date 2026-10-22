import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ElooFlow",
    short_name: "ElooFlow",
    description: "Organize conversas, contatos e vendas no ElooFlow.",
    lang: "pt-BR",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0B1F17",
    theme_color: "#0B1F17",
    icons: [
      { src: "/brand/app-icon.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
