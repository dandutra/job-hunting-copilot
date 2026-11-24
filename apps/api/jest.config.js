module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/test"],
  setupFiles: ["<rootDir>/test/test-env.ts"],
  globalSetup: "<rootDir>/test/global-setup.ts",
  // Suites share one test database, so they run one after another.
  maxWorkers: 1,
  // Jest does not stop a timed-out test body. It keeps writing while the next
  // test's resetTestDb runs, which fails on a foreign key and breaks more tests.
  // 20 s leaves a slow CI runner room; the label queue e2e seeds 170 Postings.
  testTimeout: 20_000,
};
