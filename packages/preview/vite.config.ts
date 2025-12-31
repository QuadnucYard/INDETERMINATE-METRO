import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/INDETERMINATE-METRO/",

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  build: {
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [{ name: "three", test: /\/three/ }],
        },
      },
    },
  },
});
