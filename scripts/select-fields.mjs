import { readFile } from "node:fs/promises";
import { selectFields } from "../dist/hamqslprint.js";

const args = process.argv.slice(2);

if (args.length !== 1 || !args[0].trim()) {
  console.error('Usage: npm run test:log -- "<log-file-path>"');
  process.exitCode = 1;
} else {
  try {
    const data = await readFile(args[0]);
    console.log(JSON.stringify(selectFields(data), null, 2));
  } catch (error) {
    console.error(
      `Failed to read or parse log "${args[0]}":`,
      error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
  }
}
