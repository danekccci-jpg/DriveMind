const tseslint = require("typescript-eslint");

module.exports = [
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: true
      }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
    }
  }
];

