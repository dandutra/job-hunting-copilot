import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "eslint.config.mjs",
      "jest.config.js",
      "src/ingestion/jobspy/schema.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
