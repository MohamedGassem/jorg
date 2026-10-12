import { defineConfig } from "vitest/config";

export default defineConfig({
  // No React plugin: JSX is transformed by esbuild using the tsconfig `jsx`
  // setting (react-jsx / automatic runtime), which keeps native SWC binaries
  // out of the lock file. Fast Refresh is not needed for unit tests.
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
