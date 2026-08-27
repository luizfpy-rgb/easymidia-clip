// Rasteriza SVG → PNG com as fontes da marca embarcadas (resvg WASM).
// Uso: deno run -A brand/rasterize.mjs <in.svg> <out.png> [largura]
import { initWasm, Resvg } from 'https://esm.sh/@resvg/resvg-wasm@2.6.2';

const [svgPath, outPath, width] = Deno.args;
const wasm = await fetch('https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm');
await initWasm(wasm);

const svg = await Deno.readTextFile(svgPath);
const here = new URL('.', import.meta.url);
const fonts = [];
for await (const e of Deno.readDir(here)) {
  if (e.name.endsWith('.ttf')) fonts.push(await Deno.readFile(new URL(e.name, here)));
}
const resvg = new Resvg(svg, {
  fitTo: width ? { mode: 'width', value: Number(width) } : { mode: 'original' },
  font: { fontBuffers: fonts, loadSystemFonts: false, defaultFontFamily: 'Space Grotesk' },
});
await Deno.writeFile(outPath, resvg.render().asPng());
console.log('ok:', outPath);
