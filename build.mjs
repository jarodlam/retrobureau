import * as esbuild from "esbuild";
import { cpSync, mkdirSync, existsSync, watch } from "fs";

const isServe = process.argv.includes("--serve");
const outdir = "dist";

function copyStatic() {
  mkdirSync(`${outdir}/js`, { recursive: true });
  cpSync("src/index.html", `${outdir}/index.html`);
  cpSync("src/radar.html", `${outdir}/radar.html`);
  cpSync("src/css", `${outdir}/css`, { recursive: true });
  if (existsSync("public")) {
    cpSync("public", `${outdir}`, { recursive: true });
  }
}

copyStatic();

const buildOptions = {
  entryPoints: ["src/ts/main.ts", "src/ts/radar.ts"],
  bundle: true,
  outdir: `${outdir}/js`,
  format: "esm",
  sourcemap: true,
  target: "es2020",
};

if (isServe) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();

  // Watch static files and re-copy on change
  watch("src", { recursive: true }, (event, filename) => {
    if (
      filename &&
      (filename.endsWith(".html") || filename.endsWith(".css"))
    ) {
      copyStatic();
    }
  });

  const { host, port } = await ctx.serve({
    servedir: outdir,
    port: 3000,
  });
  console.log(`Dev server running at http://localhost:${port}`);
} else {
  await esbuild.build(buildOptions);
  console.log("Build complete.");
}
