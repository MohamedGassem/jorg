import { defineConfig } from "vitest/config";

export default defineConfig({
  // JSX is transformed by esbuild (React 19 automatic runtime); no React plugin
  // needed for unit tests, which keeps native SWC binaries out of the lock file.
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
