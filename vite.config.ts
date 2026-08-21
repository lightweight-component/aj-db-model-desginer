import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  base: "./",
  plugins: [vue()],
  optimizeDeps: {
    include: ["popper.js", "view-ui-plus/src/components/select/dropdown.vue > popper.js"],
  },
});
