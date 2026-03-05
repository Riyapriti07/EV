import nextPlugin from "eslint-config-next";

export default [
  ...nextPlugin(),
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off"
    }
  }
];

