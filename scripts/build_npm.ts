/**
 * dnt (Deno to Node Transform) ビルドスクリプト。
 * npm パッケージを `npm/` ディレクトリに出力する。
 */
import { build, emptyDir } from "@deno/dnt";

const denoJson = JSON.parse(await Deno.readTextFile("./deno.json"));
const version: string = denoJson.version;

await emptyDir("./npm");

await build({
  entryPoints: [
    "./src/mod.ts",
    {
      name: "./testing",
      path: "./src/testing/mod.ts",
    },
  ],
  outDir: "./npm",
  shims: {
    deno: false,
  },
  scriptModule: false,
  declaration: "separate",
  test: false,
  typeCheck: "both",
  compilerOptions: {
    lib: ["ES2022", "ESNext.Disposable", "DOM"],
    target: "ES2022",
  },
  package: {
    name: "@ikuradon/tsunagiya",
    version,
    description:
      "Nostr relay mock library for testing. Intercepts WebSocket to test existing Nostr clients without code changes.",
    license: "MIT",
    engines: {
      node: ">=18",
    },
    repository: {
      type: "git",
      url: "git+https://github.com/ikuradon/tsunagiya.git",
    },
    bugs: {
      url: "https://github.com/ikuradon/tsunagiya/issues",
    },
    homepage: "https://ikuradon.github.io/tsunagiya/",
    keywords: [
      "nostr",
      "relay",
      "mock",
      "testing",
      "websocket",
    ],
  },
  postBuild() {
    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    Deno.copyFileSync("README.md", "npm/README.md");
  },
});
