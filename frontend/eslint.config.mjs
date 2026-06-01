import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Resetting state in an effect early-return (e.g. clearing search results
      // when the query is too short) is a standard React pattern; this rule is
      // too strict for our usage.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
