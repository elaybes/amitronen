const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateTiles } = require('./lib/tiler');
const { publishToGit } = require('./lib/publish');

const REPO_ROOT = path.join(__dirname, '..');
const EXHIBITIONS_DIR = path.join(REPO_ROOT, 'exhibitions');
const VIEWER_DIR = path.join(REPO_ROOT, 'viewer');
const UPLOAD_TMP_DIR = path.join(__dirname, 'uploads');

fs.mkdirSync(EXHIBITIONS_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
// lets the admin UI preview via the real viewer + read tile thumbnails, at the same
// paths they'll have once published (root-level /viewer and /exhibitions on GitHub Pages)
app.use('/viewer', express.static(VIEWER_DIR));
app.use('/exhibitions', express.static(EXHIBITIONS_DIR));

const upload = multer({ dest: UPLOAD_TMP_DIR });

function slugify(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9֐-׿]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

function configPath(slug) {
  return path.join(EXHIBITIONS_DIR, slug, 'config.json');
}

function readConfig(slug) {
  const p = configPath(slug);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeConfig(slug, config) {
  const dir = path.join(EXHIBITIONS_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath(slug), JSON.stringify(config, null, 2));
}

// --- API: list exhibitions ---
app.get('/api/exhibitions', (req, res) => {
  const slugs = fs.existsSync(EXHIBITIONS_DIR)
    ? fs.readdirSync(EXHIBITIONS_DIR).filter((name) =>
        fs.existsSync(path.join(EXHIBITIONS_DIR, name, 'config.json'))
      )
    : [];
  const list = slugs.map((slug) => {
    const cfg = readConfig(slug);
    return { slug, title_en: cfg.title_en, title_he: cfg.title_he, imageCount: cfg.images.length };
  });
  res.json(list);
});

// --- API: create exhibition ---
app.post('/api/exhibitions', (req, res) => {
  const { title_en, title_he, slug: requestedSlug } = req.body;
  if (!title_en && !title_he) {
    return res.status(400).json({ error: 'title_en or title_he is required' });
  }
  const slug = slugify(requestedSlug || title_en || title_he);
  if (!slug) return res.status(400).json({ error: 'could not derive a slug' });
  if (readConfig(slug)) return res.status(409).json({ error: 'exhibition already exists', slug });

  writeConfig(slug, { title_en: title_en || '', title_he: title_he || '', images: [] });
  res.json({ slug });
});

// --- API: get one exhibition ---
app.get('/api/exhibitions/:slug', (req, res) => {
  const cfg = readConfig(req.params.slug);
  if (!cfg) return res.status(404).json({ error: 'not found' });
  res.json(cfg);
});

// --- API: update exhibition metadata + image order/captions ---
app.put('/api/exhibitions/:slug', (req, res) => {
  const { slug } = req.params;
  if (!readConfig(slug)) return res.status(404).json({ error: 'not found' });
  const { title_en, title_he, images } = req.body;
  writeConfig(slug, { title_en, title_he, images });
  res.json({ ok: true });
});

// --- API: upload + tile a new image into an exhibition ---
app.post('/api/exhibitions/:slug/images', upload.single('image'), async (req, res) => {
  const { slug } = req.params;
  const cfg = readConfig(slug);
  if (!cfg) return res.status(404).json({ error: 'not found' });
  if (!req.file) return res.status(400).json({ error: 'no image uploaded' });

  const imageId = crypto.randomUUID();
  const tilesDir = path.join(EXHIBITIONS_DIR, slug, 'tiles');

  try {
    await generateTiles(req.file.path, tilesDir, imageId);
  } catch (err) {
    return res.status(500).json({ error: 'tiling failed', detail: err.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }

  const newImage = {
    id: imageId,
    dzi: `tiles/${imageId}.dzi`,
    preview: `tiles/${imageId}_preview.jpg`,
    caption_en: '',
    caption_he: '',
    medium_en: '',
    medium_he: '',
    dimensions: '',
  };
  cfg.images.push(newImage);
  writeConfig(slug, cfg);

  res.json(newImage);
});

// --- API: delete an image from an exhibition ---
app.delete('/api/exhibitions/:slug/images/:imageId', (req, res) => {
  const { slug, imageId } = req.params;
  const cfg = readConfig(slug);
  if (!cfg) return res.status(404).json({ error: 'not found' });

  cfg.images = cfg.images.filter((img) => img.id !== imageId);
  writeConfig(slug, cfg);

  const tilesDir = path.join(EXHIBITIONS_DIR, slug, 'tiles');
  fs.rmSync(path.join(tilesDir, `${imageId}.dzi`), { force: true });
  fs.rmSync(path.join(tilesDir, `${imageId}_files`), { recursive: true, force: true });
  fs.rmSync(path.join(tilesDir, `${imageId}_preview.jpg`), { force: true });

  res.json({ ok: true });
});

// --- API: publish (commit + push site/) ---
app.post('/api/publish', async (req, res) => {
  const { message } = req.body;
  try {
    const result = await publishToGit(message || 'Update exhibitions');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'publish failed', detail: err.stderr || err.message });
  }
});

const PORT = process.env.PORT || 4848;
app.listen(PORT, () => {
  console.log(`Admin tool running at http://localhost:${PORT}`);
});
