import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('public/fonts', { recursive: true });
const agent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
for (const [name,query] of [['manrope','Manrope:wght@400..800'],['instrument-serif','Instrument+Serif'],['instrument-serif-italic','Instrument+Serif:ital@1']]) {
  const response = await fetch(`https://fonts.googleapis.com/css2?family=${query}&display=swap`, { headers: { 'User-Agent': agent } });
  const css = await response.text();
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)];
  if (!urls.length) throw new Error(`No font URL for ${name}`);
  const download = await fetch(urls.at(-1)[1], { headers: { 'User-Agent': agent } });
  if (!download.ok) throw new Error(`Font download failed: ${name}`);
  const bytes = Buffer.from(await download.arrayBuffer());
  if (bytes.subarray(0,4).toString('ascii') !== 'wOF2') throw new Error(`Font is not WOFF2: ${name}`);
  await writeFile(`public/fonts/${name}.woff2`, bytes);
  console.log(`Ready: ${name} (${bytes.length} bytes)`);
}
