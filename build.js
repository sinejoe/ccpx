// Deploy build step: minifies the served HTML/CSS/inline-JS and copies
// everything else (puzzle data, _redirects) through untouched. Source files
// stay fully commented in git -- only dist/, which Cloudflare Pages builds
// and serves, is stripped. Run via `npm run build`.
const fs = require('fs');
const path = require('path');
const { minify } = require('html-minifier-terser');
const { renderGridPng } = require('./generate_og_image.js');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const SITE_URL = 'https://ccpx.fyi';

const HTML_FILES = ['index.html', 'archive.html', '404.html'];

// The in-page "paste the finished grid back" box is a solving aid for the
// private *.pages.dev preview deploys only. Its runtime gate (isPreviewHost())
// already keeps it from ever rendering on the public site, but a production
// build strips the markup/CSS/JS outright so it isn't in the public source at
// all. Build a preview with CCPX_PREVIEW=1 to keep it -- see
// skill/SKILL.md ("Reference solve for the current week").
const KEEP_DEV_EXPORT_BOX = process.env.CCPX_PREVIEW === '1';
const DEV_EXPORT_BOX_RE = /[ \t]*(?:<!--|\/\*)\s*dev-export-box:start\s*(?:-->|\*\/)[\s\S]*?(?:<!--|\/\*)\s*dev-export-box:end\s*(?:-->|\*\/)[ \t]*\n?/g;

function applyDevExportBox(html){
  if(KEEP_DEV_EXPORT_BOX) return html;
  const stripped = html.replace(DEV_EXPORT_BOX_RE, '');
  if(/devExportBox|devExportText|isPreviewHost/.test(stripped)){
    throw new Error('dev-export-box markers missed a reference -- refusing to ship it to the public build');
  }
  return stripped;
}
const COPY_PATHS = ['puzzles', '_redirects', 'favicon.svg', 'favicon.ico', 'favicon-96x96.png'];

const MINIFY_OPTS = {
  collapseWhitespace: true,
  removeComments: true,
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  useShortDoctype: true,
  minifyCSS: true,
  minifyJS: { mangle: true, compress: true },
  collapseBooleanAttributes: true,
};

async function main(){
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  for(const file of HTML_FILES){
    if(file === 'index.html') continue; // handled per-puzzle below
    const src = applyDevExportBox(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    const out = await minify(src, MINIFY_OPTS);
    fs.writeFileSync(path.join(DIST, file), out);
    console.log(`minified ${file}: ${src.length} -> ${out.length} bytes`);
  }

  for(const p of COPY_PATHS){
    fs.cpSync(path.join(ROOT, p), path.join(DIST, p), {
      recursive: true,
      filter: (src) => !src.endsWith('.solution.json'),
    });
  }

  await buildPuzzleVariants();

  console.log(`dev-export-box: ${KEEP_DEV_EXPORT_BOX ? 'KEPT (preview build)' : 'stripped (production build)'}`);
  console.log('build complete ->', DIST);
}

async function buildPuzzleVariants(){
  const indexTemplate = applyDevExportBox(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  const puzzleIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'puzzles', 'index.json'), 'utf8'));

  fs.mkdirSync(path.join(DIST, 'og'), { recursive: true });

  for(const [i, entry] of puzzleIndex.entries()){
    const puzzle = JSON.parse(fs.readFileSync(path.join(ROOT, entry.file), 'utf8'));

    await renderGridPng(puzzle.pattern, path.join(DIST, 'og', `${entry.id}.png`));

    const ogTitle = `${puzzle.title} — ${puzzle.kickerDate} — Charleston City Paper Crossword`;
    const ogImage = `${SITE_URL}/og/${entry.id}.png`;
    const isCurrent = i === 0;
    const ogUrl = isCurrent ? `${SITE_URL}/` : `${SITE_URL}/archive/${entry.id}`;

    const html = indexTemplate
      .split('__OG_TITLE__').join(ogTitle)
      .split('__OG_IMAGE__').join(ogImage)
      .split('__OG_URL__').join(ogUrl);
    const out = await minify(html, MINIFY_OPTS);

    const outDir = isCurrent ? DIST : path.join(DIST, 'archive', entry.id);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), out);
    console.log(`generated variant for ${entry.id} -> ${path.relative(DIST, outDir)}/index.html`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
