import { nftCoverCopy } from './nftCopy.js';
import { nftBackground, centeredCoverRect } from './nftBackgrounds.js';
/** Deterministic, local artwork used by both the review UI and published metadata. */
import tokensCSS from '../assets/tokens.css?raw';
import themesCSS from '../assets/themes.css?raw';
import { themeService } from './theme.service.js';
import '../assets/tokens.css';
import '../assets/themes.css';
import '../assets/fonts/fonts.css';
const displayFont = '"Fira Sans Condensed"';
const bodyFont = '"Fira Sans"';
const clean = value => String(value || '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/[#*_`~]/g, '').trim();

export function artworkIdentity({ inferenceType, generation = {} }) {
  if (inferenceType === 'training') {
    const format = /abliterat|uncensor/i.test(generation.type || '') ? 'Uncensored Model'
      : /lora|adapter/i.test(generation.artifactFormat || generation.outputType || '') ? 'LoRA' : /checkpoint/i.test(generation.artifactFormat || '') ? 'Checkpoint' : 'Model';
    const modality = generation.modality || generation.contentType || generation.parameters?.modality || 'unspecified';
    return { label: format, modality: String(modality).split('/')[0], detail: 'Model identity & provenance', model: true };
  }
  const labels = { text: 'Text', audio: /speech|tts|voice/i.test(generation.type || '') ? 'Speech' : 'Music', video: 'Video', object: ({game:'Game',level:'Level'})[generation.assetKind] || '3D Asset' };
  return { label: labels[inferenceType] || 'Content', detail: '', model: false };
}

export function nftThemePalette(id) {
  const theme = themeService.list().find(theme => theme.id === id);
  if (!theme) return { background:'#050c15', foreground:'#f7f3e9', muted:'#bfcdd0', accent:'#e5cc98' };
  const probe = document.createElement('iframe');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;width:1px;height:1px'; document.body.appendChild(probe);
  const doc = probe.contentDocument; const style = doc.createElement('style'); style.textContent = tokensCSS + '\n' + themesCSS; doc.head.appendChild(style);
  doc.documentElement.dataset.theme = theme.id;
  const sample = doc.createElement('span'); doc.body.appendChild(sample);
  const color = (token, fallback) => {
    sample.style.color = `var(${token}, ${fallback})`;
    return probe.contentWindow.getComputedStyle(sample).color;
  };
  const palette = { background:color('--bz-canvas',theme.swatch[0]), foreground:color('--bz-fg','#f7f3e9'), muted:color('--bz-fg-mid','#bfcdd0'), accent:color('--bz-accent',theme.swatch[1]) };
  probe.remove(); return palette;
}

function bounded(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]).finally(() => clearTimeout(timer));
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('Artwork took too long to load.')), 15000);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); reject(new Error('Artwork could not be loaded.')); };
    image.src = url;
  });
}

function fitLines(ctx, value, width, count) {
  const words = clean(value).split(/\s+/); const lines = []; let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  const visible = lines.slice(0, count);
  for (let i = 0; i < visible.length; i++) {
    let text = visible[i]; const truncated = ctx.measureText(text).width > width || (i === count - 1 && lines.length > count);
    if (truncated) { while (text && ctx.measureText(text + '…').width > width) text = text.slice(0, -1); text += '…'; }
    visible[i] = text;
  }
  return visible;
}

/** Returns the exact 1024px square PNG uploaded as metadata.image. Images and agent portraits stay original. */
export async function renderNFTCover({ inferenceType, generation = {}, title, textContent = '', customThumbnail, themeId } = {}) {
  await bounded(Promise.all([document.fonts.load(`italic 900 72px ${displayFont}`), document.fonts.load(`400 24px ${bodyFont}`)]), 5000, 'The artwork font could not load. Please retry.');
  const theme = nftThemePalette(themeId || generation.nftArtwork?.themeId);
  const colorProbe = document.createElement('canvas'); colorProbe.width = colorProbe.height = 1;
  const colorContext = colorProbe.getContext('2d'); colorContext.fillStyle = theme.background; colorContext.fillRect(0,0,1,1);
  const [red,green,blue] = colorContext.getImageData(0,0,1,1).data;
  const tint = opacity => `rgba(${red},${green},${blue},${opacity})`;

  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d'); const identity = artworkIdentity({ inferenceType, generation });
  ctx.fillStyle = theme.background; ctx.fillRect(0, 0, 1024, 1024);
  const selectedBackground = nftBackground(generation.nftArtwork?.backgroundId);
  const fallback = nftBackground(({training:'intelligence',text:'create',audio:'music',video:'video',object:'three-d',image:'image'})[inferenceType] || 'create');
  const source = selectedBackground?.src || customThumbnail || generation.thumbnail || generation.screenshots?.[0]?.dataUrl || fallback?.src;
  if (source) {
    const image = await loadImage(source);
    const crop = centeredCoverRect(image.width, image.height);
    ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height);
  }

  const shade = ctx.createLinearGradient(0, 0, 0, 1024);
  shade.addColorStop(0, tint(.9)); shade.addColorStop(.27, tint(0));
  shade.addColorStop(.56, tint(.3)); shade.addColorStop(.76, tint(.97)); shade.addColorStop(1, theme.background);
  ctx.fillStyle = shade; ctx.fillRect(0, 0, 1024, 1024);
  ctx.textBaseline = 'top'; ctx.fillStyle = theme.foreground; ctx.font = `italic 900 40px ${displayFont}`; ctx.fillText('BonzAI', 64, 54);
  ctx.font = `400 22px ${bodyFont}`; ctx.textAlign = 'right'; ctx.fillStyle = theme.accent; ctx.fillText(`${identity.model ? identity.modality + ' / ' : ''}${identity.label}`.toUpperCase(), 960, 65); ctx.textAlign = 'left';
  const copy = nftCoverCopy({inferenceType,generation,title,textContent,fallbackTitle:clean(generation.model) || `Untitled ${identity.label}`,fallbackDescription:identity.model ? identity.detail : ''});
  ctx.fillStyle = theme.foreground; ctx.font = `italic 900 76px ${displayFont}`;
  const lines = fitLines(ctx, copy.title, 896, 2);
  lines.forEach((line, i) => ctx.fillText(line, 64, 680 + i * 78));
  ctx.fillStyle = theme.muted; ctx.font = `400 25px ${bodyFont}`;
  fitLines(ctx, copy.description, 890, 3).forEach((line,i) => ctx.fillText(line, 64, 850 + i * 31));
  ctx.fillStyle = theme.accent; ctx.fillRect(64, 958, 48, 2);
  ctx.fillStyle = theme.muted; ctx.font = `400 18px ${bodyFont}`; ctx.fillText(identity.model ? 'MODEL COLLECTION' : 'CREATED WITH BONZAI', 128, 949);
  const blob = await bounded(new Promise(resolve => canvas.toBlob(resolve, 'image/png')), 5000, 'The artwork export did not finish. Please retry.');
  if (!blob) throw new Error('Could not render the token artwork. Please retry.');
  return new Uint8Array(await blob.arrayBuffer());
}

/** Decode only a poster frame locally; never initiate inference or upload media. */
export async function extractVideoPoster(url) {
  const video = document.createElement('video'); video.muted = true; video.preload = 'auto'; video.crossOrigin = 'anonymous';
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Video poster timed out.')), 10000);
      video.onerror = () => { clearTimeout(timer); reject(new Error('Video poster unavailable.')); };
      video.onloadeddata = () => {
        clearTimeout(timer);
        try { const canvas = document.createElement('canvas');
          const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/png'));
        } catch (error) { reject(error); }
      };
      video.src = url;
    });
  } finally { video.pause(); video.removeAttribute('src'); video.load(); }
}
