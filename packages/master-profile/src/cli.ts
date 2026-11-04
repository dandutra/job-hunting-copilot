import { checkProfileFile } from "./check-file";

const path = process.argv[2];
if (!path) {
  console.error("Usage: cli.ts <path to master-profile.yaml>");
  process.exit(2);
}
const result = checkProfileFile(path);
(result.ok ? console.log : console.error)(result.output);
process.exit(result.ok ? 0 : 1);
