// Rasterize the same vector arch and star used by the LogaLuxe website.
// Pass the installed sharp module path to keep tooling out of app dependencies.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.argv[2] || 'sharp');
const mark = (color) => `<path d="M3 38.6V16a13 13 0 0 1 26 0v22.6Z" fill="none" stroke="${color}" stroke-width="1.7"/><path d="M16 15.2c.55 5.3 2.5 7.25 7.8 7.8-5.3.55-7.25 2.5-7.8 7.8-.55-5.3-2.5-7.25-7.8-7.8 5.3-.55 7.25-2.5 7.8-7.8Z" fill="${color}"/>`;
function artwork(background, height, color = '#D4AF5A') {
  const width = height * .8;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${background ? `<rect width="1024" height="1024" fill="${background}"/>` : ''}<svg x="${(1024-width)/2}" y="${(1024-height)/2}" width="${width}" height="${height}" viewBox="0 0 32 40">${mark(color)}</svg></svg>`;
}
(async () => {
  const folder = path.join(__dirname, '..', 'assets');
  for (const [file, svg, size] of [
    ['icon.png', artwork('#1A1513', 600), 1024],
    ['android-icon-foreground.png', artwork(null, 480), 1024],
    ['android-icon-background.png', '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#1A1513"/></svg>', 1024],
    ['android-icon-monochrome.png', artwork(null, 480, '#FFFFFF'), 1024],
    ['splash-icon.png', artwork(null, 480), 1024],
    ['favicon.png', artwork('#1A1513', 600), 64],
  ]) {
    await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(folder, file));
  }
  console.log('Rendered LogaLuxe launcher, adaptive, monochrome and splash assets.');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
