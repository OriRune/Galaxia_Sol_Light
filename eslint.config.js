import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const prohibitedGenerationMath = [
  "random",
  "acos",
  "acosh",
  "asin",
  "asinh",
  "atan",
  "atanh",
  "atan2",
  "cbrt",
  "cos",
  "cosh",
  "exp",
  "expm1",
  "hypot",
  "log",
  "log1p",
  "log2",
  "log10",
  "pow",
  "sin",
  "sinh",
  "tan",
  "tanh",
];

export default tseslint.config(
  { ignores: ["dist/**", "coverage/**", "node_modules/**", "playwright-report/**"] },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx}"],
  })),
  ...tseslint.configs.stylisticTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx}"],
  })),
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.eslint.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    files: ["**/*.mjs", "**/*.cjs", "**/*.js"],
    languageOptions: { globals: { console: "readonly" } },
  },
  {
    files: ["src/generation/**/*.{js,ts,tsx}"],
    rules: {
      "no-restricted-properties": [
        "error",
        ...prohibitedGenerationMath.map((property) => ({
          object: "Math",
          property,
          message: "Generation must use deterministic primitives.",
        })),
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "BinaryExpression[operator='**']",
          message: "Generation must not use exponentiation.",
        },
      ],
    },
  },
);
