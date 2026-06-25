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

  return {
    dziUrl: `${imageId}.dzi`,
  };
}

module.exports = { generateTiles };
