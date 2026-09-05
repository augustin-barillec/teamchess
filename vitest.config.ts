import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["server/**/*.test.ts", "client/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Les composants React (.tsx) sont volontairement hors couverture : ils
      // sont couverts par les tests Playwright, pas par des tests unitaires.
      include: ["server/**/*.ts", "client/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        "server/testUtils.ts",
        "server/types.ts",
        "server/shared_types.ts",
        "client/src/types.ts",
        "client/src/hooks/**",
      ],
    },
  },
});
