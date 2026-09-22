import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  // Matches the JSX transform Next uses, so a component test needs no
  // React import of its own.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    // Components render to a string through react-dom/server, so they need
    // no DOM and no extra dependency to test.
    include: ["lib/**/*.test.ts", "components/**/*.test.tsx"],
  },
});
