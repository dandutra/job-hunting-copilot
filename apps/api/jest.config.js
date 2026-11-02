module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/test"],
  globalSetup: "<rootDir>/test/global-setup.ts",
  // Suites share one test database, so they run one after another.
  maxWorkers: 1,
};
