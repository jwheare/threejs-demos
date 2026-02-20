import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";


export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: {
      js
    },
    extends: ["js/recommended"],
    languageOptions: {
      globals: Object.assign({}, globals.node, globals.browser)
    },
    rules: {
      "no-unused-vars": "off",
      "semi": "warn",
      "space-before-function-paren": "warn",
    },
  },
]);
