import { defineConfig } from "vite";

export default defineConfig({
  base: "/INDETERMINATE-METRO/",

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
