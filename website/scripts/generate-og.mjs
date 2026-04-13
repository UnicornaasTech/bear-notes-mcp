import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, '..', 'public', 'og-image.png');
const BEAR_PATH = resolve(__dirname, '..', 'public', 'bear-mcp-server.webp');

const WIDTH = 1200;
const HEIGHT = 630;

const SURFACE_0 = '#f9f8f5';
const ACCENT = '#da2c38';
const TEXT_PRIMARY = '#1a1917';
const TEXT_SECONDARY = '#6b6862';

async function loadFont() {
  const url =
    'https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_TknNSg.ttf';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch font: ${res.status}`);
  return res.arrayBuffer();
}

async function renderText(fontData) {
  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          fontFamily: 'Plus Jakarta Sans',
          padding: '0 60px',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '24px',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: {
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      backgroundColor: ACCENT,
                    },
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { fontSize: '20px', color: TEXT_SECONDARY },
                    children: 'MCP Server for Bear Notes',
                  },
                },
              ],
            },
          },
          {
            type: 'div',
            props: {
              style: {
                fontSize: '52px',
                fontWeight: 700,
                color: TEXT_PRIMARY,
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
              },
              children: 'bear-notes-mcp',
            },
          },
          {
            type: 'div',
            props: {
              style: {
                fontSize: '26px',
                color: TEXT_SECONDARY,
                marginTop: '16px',
                lineHeight: 1.4,
              },
              children: 'Your Bear Notes, in Every AI Assistant',
            },
          },
        ],
      },
    },
    {
      width: 660,
      height: HEIGHT,
      fonts: [
        {
          name: 'Plus Jakarta Sans',
          data: fontData,
          weight: 700,
          style: 'normal',
        },
      ],
    }
  );

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 660 } });
  return resvg.render().asPng();
}

async function main() {
  const fontData = await loadFont();
  const textPng = await renderText(fontData);

  // Resize bear to fit left side — portrait image, fit by height
  const bear = await sharp(BEAR_PATH)
    .resize({ height: 560, withoutEnlargement: true })
    .toBuffer();
  const bearMeta = await sharp(bear).metadata();

  // Create canvas, composite bear on left + text on right
  const result = await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 3,
      background: SURFACE_0,
    },
  })
    .composite([
      // Red accent bar at top
      {
        input: {
          create: {
            width: WIDTH,
            height: 6,
            channels: 3,
            background: ACCENT,
          },
        },
        top: 0,
        left: 0,
      },
      // Bear illustration, bottom-aligned on the left
      {
        input: bear,
        top: HEIGHT - bearMeta.height,
        left: Math.round((420 - bearMeta.width) / 2),
      },
      // Text block on the right
      {
        input: textPng,
        top: 0,
        left: 420,
      },
    ])
    .png()
    .toBuffer();

  writeFileSync(OUTPUT_PATH, result);
  console.log(`OG image written to ${OUTPUT_PATH} (${result.length} bytes)`);
}

main().catch((err) => {
  console.error('Failed to generate OG image:', err);
  process.exit(1);
});
