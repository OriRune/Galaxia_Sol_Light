import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.0.0-dev"),
  },
  build: { target: "es2022" },
  worker: { format: "es" },
  assetsInclude: ["**/*.bin"],
});
