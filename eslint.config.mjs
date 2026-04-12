import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Server Components (async page/layout files) are not React render functions.
    // Date.now() and crypto.randomUUID() are valid here since they run once per request on the server.
    files: ["src/app/**/*.tsx", "src/app/**/*.ts"],
    rules: {
      "react-hooks/purity": "off",
    },
  },
]);

export default eslintConfig;
