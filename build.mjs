import { build } from "esbuild";

await build({
  entryPoints: ["source-app.jsx"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2019"],
  loader: { ".jsx": "jsx", ".js": "jsx" },
  jsx: "automatic",
  outfile: "app.js",
});
console.log("built app.js");
