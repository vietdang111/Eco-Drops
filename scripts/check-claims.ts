import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const ROOTS = [resolve("src/app"), resolve("src/components")];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

const PROHIBITED_POSITIVE_CLAIMS = [
  { label: "guaranteed climate result", pattern: /\bguaranteed\s+(?:carbon|climate|emissions?)\b/gi },
  { label: "exact climate result", pattern: /\bexact\s+(?:carbon|climate|emissions?)\s+(?:saving|reduction|impact)/gi },
  { label: "verified climate result", pattern: /\bverified\s+(?:carbon|climate|emissions?)\s+(?:saving|reduction|impact)/gi },
  { label: "Scope 3 subtraction", pattern: /\b(?:subtract|deduct|remove|erase)[^\n.]{0,50}\bscope\s*3\b/gi },
  { label: "invoice authentication", pattern: /\b(?:invoice|document)\s+(?:is|was|has been)\s+authenticated\b/gi },
  { label: "external assurance", pattern: /\b(?:third[- ]party verified|pre[- ]audited|legally binding climate)\b/gi },
  { label: "generated carbon credits", pattern: /\b(?:generate[ds]?|issue[ds]?|create[ds]?)\s+(?:tradable\s+)?carbon\s+credits?\b/gi },
] as const;

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  }));
  return files.flat();
}

async function main(): Promise<void> {
  const files = (await Promise.all(ROOTS.map(sourceFiles))).flat();
  const failures: string[] = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    for (const rule of PROHIBITED_POSITIVE_CLAIMS) {
      rule.pattern.lastIndex = 0;
      for (const match of content.matchAll(rule.pattern)) {
        const line = content.slice(0, match.index).split("\n").length;
        failures.push(`${relative(process.cwd(), file)}:${line}: ${rule.label}: ${JSON.stringify(match[0])}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error("Climate-claim guard found language that needs review:\n" + failures.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.info(`Climate-claim guard passed across ${files.length} UI source files.`);
}

main().catch((error: unknown) => {
  console.error("Climate-claim guard failed to run.", error);
  process.exitCode = 1;
});
