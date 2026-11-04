import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "dist/**",
      "build/**",
      "node_modules/**",
    ],
  },
];

export default eslintConfig;
