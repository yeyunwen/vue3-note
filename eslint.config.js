import globals from "globals";
import pluginJs from "@eslint/js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  { files: ["**/*.js"], languageOptions: { sourceType: "module" } },
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  pluginJs.configs.recommended,
  {
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error",
    },
  },
];
