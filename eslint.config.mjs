import { defineConfig, globalIgnores } from "eslint/config";
import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

const eslintConfig = defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
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
