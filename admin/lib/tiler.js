const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Generates a Deep Zoom Image (DZI) tile pyramid for one source image.
 * Output: <outDir>/<imageId>.dzi  +  <outDir>/<imageId>_files/<level>/<col>_<row>.jpg
 * imageId-named files live directly inside outDir so OpenSeadragon's
 * default DZI conventions (sibling .dzi + _files folder) just work.
 */
async function generateTiles(sourcePath, outDir, imageId) {
  fs.mkdirSync(outDir, { recursive: true });
  const dziBasePath = path.join(outDir, imageId); // sharp appends .dzi and _files

  await sharp(sourcePath)
    .tile({
      size: 256,
      overlap: 1,
      layout: 'dz',
      depth: 'onepixel',
    })
    .toFile(dziBasePath);

  // DZI pyramid level 0 is near-1px (it's the top of the pyramid, not a thumbnail),
  // so generate a real small preview for admin UI thumbnails and any non-OSD use.
  const previewPath = path.join(outDir, `${imageId}_preview.jpg`);
  await sharp(sourcePath).resize({ width: 300 }).jpeg({ quality: 80 }).toFile(previewPath);

  return {
    dziUrl: `${imageId}.dzi`,
    previewUrl: `${imageId}_preview.jpg`,
  };
}

module.exports = { generateTiles };
