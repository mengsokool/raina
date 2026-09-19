import path from "node:path";
import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    tailwindcss(),
    reactRouter(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    include: [
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tooltip",
      "@xyflow/react",
      "class-variance-authority",
      "clsx",
      "lucide-react",
      "nanoid",
      "next-themes",
      "react-grid-layout",
      "recharts",
      "tailwind-merge",
      "zod",
    ],
  },
  server: {
    port: 3000,
    proxy: {
      "/v1": {
        target: process.env.INTERNAL_API_URL || "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
