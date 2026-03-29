const SRC_ROOT = new URL("../src/", import.meta.url);
const ALLOWED_FILES = new Set(["internal/runtime.ts"]);
const BLOCKED_PATTERNS = [
  { label: "Date.now()", regex: /\bDate\.now\s*\(/g },
  { label: "Math.random()", regex: /\bMath\.random\s*\(/g },
  {
    label: "crypto.getRandomValues()",
    regex: /\bcrypto\.getRandomValues\s*\(/g,
  },
] as const;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

async function collectTsFiles(
  dir: URL,
  prefix = "",
  files: string[] = [],
): Promise<string[]> {
  for await (const entry of Deno.readDir(dir)) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const childUrl = new URL(
      `${entry.name}${entry.isDirectory ? "/" : ""}`,
      dir,
    );

    if (entry.isDirectory) {
      await collectTsFiles(childUrl, relativePath, files);
      continue;
    }

    if (entry.isFile && entry.name.endsWith(".ts")) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

async function main(): Promise<void> {
  const files = await collectTsFiles(SRC_ROOT);
  const violations: string[] = [];

  for (const relativePath of files) {
    if (ALLOWED_FILES.has(relativePath)) {
      continue;
    }

    const source = stripComments(
      await Deno.readTextFile(new URL(relativePath, SRC_ROOT)),
    );

    for (const { label, regex } of BLOCKED_PATTERNS) {
      regex.lastIndex = 0;
      if (regex.test(source)) {
        violations.push(`${relativePath}: ${label}`);
      }
    }
  }

  if (violations.length === 0) {
    return;
  }

  console.error("Runtime access guard violations found:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  Deno.exit(1);
}

if (import.meta.main) {
  await main();
}
