import { existsSync } from "node:fs";
import { importProfile } from "./import-profile";

async function main(): Promise<number> {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: import-cli.ts <path to master-profile.yaml>");
    return 2;
  }
  if (existsSync("../../.env")) process.loadEnvFile("../../.env");
  const result = await importProfile({
    path,
    apiUrl: process.env.COPILOT_API_URL,
  });
  (result.ok ? console.log : console.error)(result.output);
  return result.ok ? 0 : 1;
}
void main().then((code) => process.exit(code));
