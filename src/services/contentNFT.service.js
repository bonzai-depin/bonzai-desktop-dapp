/**
 * BonzAI — Content NFT Minting Service
 *
 * Orchestrates minting on Base (ERC-721).
 * 4 stages: upload content → upload metadata → mint on-chain → update store.
 */

import { ethers } from 'ethers';
import { irysService } from './irys.service.js';
import { getEip1193Provider, switchNetwork, getSigner } from './web3.service.js';
import { markAsMinted } from '../stores/inferenceStore.js';
import { mintStore } from '../stores/mintStore.js';
import { CONFIG } from '../config/web3.config.js';
import { canMintContentType, checkAllLevels } from './level.service.js';

// Branded fallback images per content type (Vite asset imports → bundled URLs)
import brandTextUrl from '../assets/bonzai_chat.webp';
import brandImageUrl from '../assets/bonzai_image.webp';
import brandAudioUrl from '../assets/bonzai_music.webp';
import brandVideoUrl from '../assets/bonzai_video.webp';
import brand3DUrl from '../assets/bonzai_robots.webp';

const BRAND_IMAGE_URLS = {
  text:   brandTextUrl,
  image:  brandImageUrl,
  audio:  brandAudioUrl,
  video:  brandVideoUrl,
  object: brand3DUrl,
};

// ═══════════════════════════════════════════════════════════════════════════
// BASE ERC-721 ABI
// ═══════════════════════════════════════════════════════════════════════════

const BASE_CONTENT_ABI = [
  'function mint(string transactionId, string model, string tokenURI_, uint8 contentType) payable returns (uint256)',
  'function mintFee() view returns (uint256)',
  'event ContentMinted(uint256 indexed tokenId, address indexed creator, string transactionId, string model, uint256 timestamp)',
];

// Content type mapping (matches BonzaiContent.sol Provenance.contentType)
const CONTENT_TYPE_MAP = { text: 0, audio: 1, image: 2, video: 3, object: 4, training: 5 };

// ═══════════════════════════════════════════════════════════════════════════
// MAIN MINT FLOW
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mint AI-generated content as an NFT on the selected network.
 *
 * @param {Object} params
 * @param {string|Buffer|Uint8Array} params.content - Content data (base64 string, buffer, or text)
 * @param {string} params.contentType - MIME type (e.g. 'image/webp', 'audio/wav')
 * @param {string} params.prompt - Original generation prompt
 * @param {Object} params.generation - Generation metadata { type, model, modelVersion, timestamp, parameters }
 * @param {string} params.title - NFT title
 * @param {string} params.description - NFT description
 * @param {string} params.inferenceType - Store type key ('image', 'audio', 'video', 'text', 'object')
 * @param {string} params.inferenceId - Inference record ID in store
 * @param {function} params.onProgress - Progress callback (stage, message, percent)
 * @returns {Object} { success, tokenId, transactionHash, explorerUrl, contentUrl, network }
 */
export async function mintContent({
  content,
  contentType,
  prompt,
  generation = {},
  title,
  description,
  inferenceType,
  inferenceId,
  onProgress = () => {},
}) {
  const network = mintStore.state.network;
  const networkConfig = mintStore.activeMintNetwork.value;

  try {
    // ─── Level gate: check if user can mint this content type ────────
    await checkAllLevels();
    const { canMint, levelRequired, reason } = canMintContentType(inferenceType);
    if (!canMint) {
      return { success: false, error: `${levelRequired} required. ${reason}`, levelBlocked: true };
    }

    // ─── Pre-flight: ensure we're on Base ──────────────────────────
    onProgress('upload', 'Preparing...', 5);
    await switchNetwork('base');

    // ─── Stage 1: Upload content to IPFS ──────────────────────────────
    onProgress('upload', 'Uploading content to IPFS...', 10);

    const provider = getEip1193Provider();
    if (!provider) {
      throw new Error('Wallet not connected. Please connect your wallet first.');
    }

    // Initialize storage (Pinata — no wallet needed, just API key)
    irysService.disconnect();
    await irysService.initIrys(provider);

    const promptHash = ethers.keccak256(ethers.toUtf8Bytes(prompt || ''));
    const attribution = {
      creator: (await (new ethers.BrowserProvider(provider)).getSigner()).address,
      platform: CONFIG.treasury.address,
    };

    let contentReceipt;
    onProgress('upload', 'Uploading content to IPFS...', 12);
    if (typeof content === 'string' && (content.startsWith('data:') || isBase64(content))) {
      contentReceipt = await irysService.uploadBase64({
        base64Data: content,
        contentType,
        generation: {
          type: generation.type,
          model: generation.model,
          modelVersion: generation.modelVersion,
          promptHash,
          timestamp: generation.timestamp || Date.now(),
          parameters: generation.parameters,
        },
        attribution,
      });
    } else if (typeof content === 'string') {
      // Plain text content
      const textBuffer = new TextEncoder().encode(content);
      contentReceipt = await irysService.uploadContent({
        data: textBuffer,
        contentType: contentType || 'text/plain',
        generation: {
          type: generation.type,
          model: generation.model,
          promptHash,
          timestamp: generation.timestamp || Date.now(),
        },
        attribution,
      });
    } else {
      // Buffer / Uint8Array
      contentReceipt = await irysService.uploadContent({
        data: content,
        contentType,
        generation: {
          type: generation.type,
          model: generation.model,
          promptHash,
          timestamp: generation.timestamp || Date.now(),
        },
        attribution,
      });
    }

    onProgress('upload', 'Content uploaded to Arweave', 30);

    // ─── Stage 1b: Upload interactive 3D viewer (if 3D object) ──────
    let viewerReceipt = null;
    if (inferenceType === 'object' && generation.threeCode) {
      onProgress('upload', 'Uploading 3D viewer...', 33);
      const userCode = extractUserCode(generation.threeCode);
      const viewerHtml = buildInteractive3DViewer(userCode);
      const viewerBuffer = new TextEncoder().encode(viewerHtml);
      viewerReceipt = await irysService.uploadContent({
        data: viewerBuffer,
        contentType: 'text/html',
        generation: {
          type: 'interactive-3d-viewer',
          model: generation.model,
          timestamp: generation.timestamp || Date.now(),
        },
        attribution,
      });
      onProgress('upload', '3D viewer uploaded', 38);
    }

    // ─── Stage 1c: Branded image + media player (non-image content) ─
    let brandedImageReceipt = null;
    let mediaPlayerReceipt = null;
    const modelSlug = toModelSlug(generation.model);

    if (!contentType.startsWith('image/')) {
      // Upload branded fallback image as NFT thumbnail
      const brandUrl = BRAND_IMAGE_URLS[inferenceType] || BRAND_IMAGE_URLS.text;
      try {
        onProgress('upload', 'Uploading thumbnail...', 34);
        const brandResp = await fetch(brandUrl);
        const brandBuf = new Uint8Array(await brandResp.arrayBuffer());
        brandedImageReceipt = await irysService.uploadContent({
          data: brandBuf,
          contentType: 'image/webp',
          generation: { type: 'nft-thumbnail', model: modelSlug, timestamp: Date.now() },
          attribution,
        });
      } catch (e) {
        console.warn('[ContentNFT] Branded image upload failed:', e);
      }

      // Build inline HTML media player for audio / video
      if (contentType.startsWith('audio/')) {
        onProgress('upload', 'Uploading audio player...', 36);
        const playerHtml = buildAudioPlayer(contentReceipt.gatewayUrl, brandedImageReceipt?.gatewayUrl, title || prompt);
        const playerBuf = new TextEncoder().encode(playerHtml);
        mediaPlayerReceipt = await irysService.uploadContent({
          data: playerBuf,
          contentType: 'text/html',
          generation: { type: 'audio-player', model: modelSlug, timestamp: Date.now() },
          attribution,
        });
      } else if (contentType.startsWith('video/')) {
        onProgress('upload', 'Uploading video player...', 36);
        const playerHtml = buildVideoPlayer(contentReceipt.gatewayUrl, brandedImageReceipt?.gatewayUrl, title || prompt);
        const playerBuf = new TextEncoder().encode(playerHtml);
        mediaPlayerReceipt = await irysService.uploadContent({
          data: playerBuf,
          contentType: 'text/html',
          generation: { type: 'video-player', model: modelSlug, timestamp: Date.now() },
          attribution,
        });
      }
    }

    // ─── Stage 2: Build & upload metadata ────────────────────────────
    onProgress('metadata', 'Uploading metadata...', 40);

    // Standard ERC-721 JSON metadata
    // animation_url priority: 3D viewer > media player > raw audio/video
    const animationUrl = viewerReceipt
      ? viewerReceipt.gatewayUrl
      : mediaPlayerReceipt
        ? mediaPlayerReceipt.gatewayUrl
        : undefined;

    // image priority: actual image content > branded fallback
    const imageUrl = contentType.startsWith('image/')
      ? contentReceipt.gatewayUrl
      : brandedImageReceipt?.gatewayUrl || undefined;

    console.log(`[ContentNFT] Metadata name: "${title}", type: "${generation.type}"`);
    const metadata = {
      name: title || `${generation.type || 'Untitled'} #${Date.now().toString(36)}`,
      description: description || `AI-generated content by BonzAI. Prompt: ${(prompt || '').substring(0, 200)}`,
      image: imageUrl,
      animation_url: animationUrl,
      external_url: 'https://bonzai.sh',
      attributes: [
        { trait_type: 'Generation Type', value: generation.type || 'unknown' },
        { trait_type: 'Model', value: modelSlug },
        { trait_type: 'Platform', value: 'BonzAI' },
        ...(generation.tokensPerSecond ? [{ trait_type: 'Tokens Per Second', value: String(generation.tokensPerSecond) }] : []),
        ...(generation.elapsedMs ? [{ trait_type: 'Generation Time (ms)', value: String(generation.elapsedMs) }] : []),
      ],
      properties: {
        provenance: {
          transactionId: contentReceipt.transactionId,
          contentUrl: contentReceipt.gatewayUrl,
          promptHash,
          model: modelSlug,
          generationType: generation.type,
          timestamp: generation.timestamp || Date.now(),
          ...(generation.tokensPerSecond ? { tokensPerSecond: String(generation.tokensPerSecond) } : {}),
          ...(generation.elapsedMs ? { elapsedMs: generation.elapsedMs } : {}),
          ...(generation.threeCode ? { threeCode: generation.threeCode } : {}),
        },
      },
    };

    // Fallback: if no image and no animation, use content URL directly
    if (!metadata.image && !metadata.animation_url) {
      metadata.image = contentReceipt.gatewayUrl;
    }

    const metadataReceipt = await irysService.uploadMetadata(metadata, {
      type: 'metadata',
      model: modelSlug,
    }, attribution);

    onProgress('metadata', 'Metadata uploaded', 55);

    // ─── Stage 3: Mint on-chain ──────────────────────────────────────
    onProgress('mint', `Minting on ${networkConfig.label}...`, 65);

    const mintResult = await mintOnBase({
      transactionId: contentReceipt.transactionId,
      model: generation.model || 'unknown',
      tokenURI: metadataReceipt.url,  // ipfs://<cid> — BaseScan resolves via its own gateway
      onProgress,
      inferenceType,
    });

    onProgress('mint', 'Minted successfully!', 85);

    // ─── Stage 4: Update inference store ─────────────────────────────
    onProgress('finalize', 'Updating records...', 90);

    const nftData = {
      tokenId: mintResult.tokenId,
      contractAddress: mintResult.contractAddress,
      transactionHash: mintResult.transactionHash,
      chainId: networkConfig.chainId,
      explorerUrl: mintResult.explorerUrl,
      standard: networkConfig.standard,
      network: network,
      transactionId: contentReceipt.transactionId,
      contentUrl: contentReceipt.gatewayUrl,
      metadataUrl: metadataReceipt.gatewayUrl,
    };

    if (inferenceType && inferenceId) {
      await markAsMinted(inferenceType, inferenceId, nftData);
    }

    onProgress('done', 'Complete!', 100);

    return {
      success: true,
      ...nftData,
    };
  } catch (error) {
    console.error('[ContentNFT] Mint failed:', error);
    return {
      success: false,
      error: error.message || 'Minting failed',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BASE MINTING (ERC-721)
// ═══════════════════════════════════════════════════════════════════════════

async function mintOnBase({ transactionId, model, tokenURI, onProgress, inferenceType }) {
  const contractAddress = CONFIG.contentNFT?.base?.contractAddress;
  if (!contractAddress) {
    throw new Error('BonzaiContent contract not deployed on Base yet. Contract address not configured.');
  }

  // Ensure we're on Base (should already be from pre-flight)
  await switchNetwork('base');

  onProgress('mint', 'Preparing transaction...', 68);
  const signer = await getSigner();
  const contract = new ethers.Contract(contractAddress, BASE_CONTENT_ABI, signer);

  // Get mint fee from contract
  let mintFee;
  try {
    mintFee = await contract.mintFee();
  } catch {
    mintFee = ethers.parseEther(CONFIG.contentNFT.base.mintFee);
  }

  onProgress('mint', 'Confirm transaction in your wallet...', 72);

  const contentType = CONTENT_TYPE_MAP[inferenceType] ?? 0;
  const tx = await contract.mint(transactionId, model, tokenURI, contentType, { value: mintFee });
  console.log('[ContentNFT] Base mint tx sent:', tx.hash);

  onProgress('mint', 'Waiting for confirmation...', 78);
  const receipt = await tx.wait();

  // Parse ContentMinted event for tokenId
  let tokenId = null;
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
      if (parsed && parsed.name === 'ContentMinted') {
        tokenId = parsed.args.tokenId.toString();
        break;
      }
    } catch {
      // Not our event
    }
  }

  return {
    tokenId,
    contractAddress,
    transactionHash: receipt.hash,
    explorerUrl: `https://basescan.org/tx/${receipt.hash}`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function isBase64(str) {
  if (!str || typeof str !== 'string') return false;
  // Quick heuristic: base64 strings are long and only contain valid chars
  if (str.length < 100) return false;
  return /^[A-Za-z0-9+/=\s]+$/.test(str.substring(0, 200));
}

/**
 * Estimate raw byte size of content before upload.
 */
function estimateContentSize(content, contentType) {
  if (!content) return 1000;
  if (content instanceof Uint8Array || content instanceof ArrayBuffer) {
    return content.byteLength || content.length;
  }
  if (typeof content === 'string') {
    if (content.startsWith('data:') || isBase64(content)) {
      // Base64 is ~33% larger than raw; decode ratio ≈ 0.75
      const clean = content.replace(/^data:[^;]+;base64,/, '');
      return Math.ceil(clean.length * 0.75);
    }
    return new TextEncoder().encode(content).length;
  }
  return 100_000; // fallback
}

/**
 * Convert a model display name to a URL-safe slug.
 * "Codestral 22B" → "codestral-22b"
 * "DeepSeek R1 1.5B" → "deepseek-r1-1.5b"
 * "Qwen 2.5 Coder 7B" → "qwen-2.5-coder-7b"
 */
function toModelSlug(name) {
  if (!name) return 'unknown';
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9.\-]/g, '');
}

/**
 * Extract user code from the full wrapper code.
 * The wrapper uses `// ── USER CODE START ──` and `// ── USER CODE END ──` markers.
 */
function extractUserCode(fullCode) {
  if (!fullCode) return fullCode;
  const match = fullCode.match(/\/\/ ── USER CODE START ──\n([\s\S]*?)\/\/ ── USER CODE END ──/);
  return match ? match[1].trim() : fullCode;
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERACTIVE 3D VIEWER BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a self-contained HTML page that renders a Three.js 3D object.
 * Imports Three.js from CDN and includes minimal material/light helpers (H).
 * The resulting page auto-rotates the scene with orbit controls.
 *
 * @param {string} userCode - The user's generated Three.js code (extracted, no wrapper)
 * @returns {string} Complete HTML page string
 */
function buildInteractive3DViewer(userCode) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>BonzAI 3D NFT</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{overflow:hidden;background:#1a1a2e}
canvas{display:block;width:100%;height:100%}
</style>
</head>
<body>
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.170.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.170.0/examples/jsm/"
  }
}
<` + `/script>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ── Scene setup ──
const scene = new THREE.Scene();
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

// Sky gradient background
const skyCanvas = document.createElement('canvas');
skyCanvas.width = 2; skyCanvas.height = 256;
const ctx = skyCanvas.getContext('2d');
const grad = ctx.createLinearGradient(0, 0, 0, 256);
grad.addColorStop(0, '#0a0a2a');
grad.addColorStop(0.5, '#1a1a4e');
grad.addColorStop(1, '#2a2a6e');
ctx.fillStyle = grad;
ctx.fillRect(0, 0, 2, 256);
const skyTex = new THREE.CanvasTexture(skyCanvas);
skyTex.mapping = THREE.EquirectangularReflectionMapping;
scene.background = skyTex;
scene.environment = skyTex;

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(3, 2.5, 4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.5;
controls.target.set(0, 0.5, 0);

// Lights
scene.add(new THREE.AmbientLight(0x404060, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(5, 8, 5);
scene.add(dirLight);
const fillLight = new THREE.DirectionalLight(0x8888ff, 0.4);
fillLight.position.set(-3, 2, -3);
scene.add(fillLight);

// ── Minimal H helpers (material + light + particle subset) ──
const H = {
  glass: (color = 0xffffff, o = {}) => new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: o.roughness ?? 0.05, transmission: o.transmission ?? 0.95, thickness: o.thickness ?? 0.15, ior: o.ior ?? 1.5, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, ...o }),
  gem: (color = 0xff0000, o = {}) => new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.03, transmission: 0.92, thickness: 1.5, ior: o.ior ?? 1.8, clearcoat: 1, emissive: color, emissiveIntensity: o.glow ?? 0.25, transparent: true, ...o }),
  metal: (color = 0xffd700, o = {}) => new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: o.roughness ?? 0.2, clearcoat: o.clearcoat ?? 0.8, emissive: color, emissiveIntensity: o.glow ?? 0.1, ...o }),
  matte: (color = 0x888888, o = {}) => new THREE.MeshPhysicalMaterial({ color, metalness: o.metalness ?? 0.05, roughness: o.roughness ?? 0.7, clearcoat: o.clearcoat ?? 0.2, ...o }),
  glow: (color = 0x00ffff, o = {}) => new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: o.intensity ?? 0.8, metalness: 0, roughness: 0.3, transparent: true, opacity: o.opacity ?? 1, ...o }),
  liquid: (color = 0xff0000, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: o.roughness ?? 0.2, metalness: 0, transmission: 0.6, thickness: 0.8, ior: 1.33, clearcoat: 0.4, clearcoatRoughness: 0.1, side: THREE.DoubleSide, ...o }),
  fire: (o = {}) => new THREE.MeshPhysicalMaterial({ color: o.color ?? 0xff6600, emissive: o.color ?? 0xff4400, emissiveIntensity: o.intensity ?? 1.2, metalness: 0, roughness: 0.5, transparent: true, opacity: o.opacity ?? 0.9, side: THREE.DoubleSide, ...o }),
  ice: (color = 0xaaddff, o = {}) => new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.15, transmission: 0.85, thickness: 1.2, ior: 1.31, clearcoat: 1, emissive: 0x88ccff, emissiveIntensity: 0.1, ...o }),
  lava: (o = {}) => new THREE.MeshPhysicalMaterial({ color: o.color ?? 0xff2200, emissive: 0xff4400, emissiveIntensity: o.intensity ?? 1.5, metalness: 0.3, roughness: 0.6, ...o }),
  leather: (color = 0x8b4513, o = {}) => new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: o.roughness ?? 0.8, clearcoat: 0.15, ...o }),
  velvet: (color = 0x660066, o = {}) => new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.95, sheen: 1, sheenRoughness: 0.3, sheenColor: new THREE.Color(color).multiplyScalar(1.5), ...o }),
  lowPoly: (color = 0x888888, o = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...o }),
  toon: (color = 0x888888, o = {}) => new THREE.MeshToonMaterial({ color, ...o }),
  cartoon: (color = 0x888888, o = {}) => new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 1, clearcoat: 0, flatShading: true, ...o }),
  light: (color = 0xffffff, intensity = 2, distance = 5) => { const l = new THREE.PointLight(color, intensity, distance); l.castShadow = false; return l; },
  spot: (color = 0xffffff, intensity = 2, o = {}) => { const l = new THREE.SpotLight(color, intensity); l.angle = o.angle ?? Math.PI / 6; l.penumbra = o.penumbra ?? 0.3; l.distance = o.distance ?? 10; return l; },
  particles: (count = 50, o = {}) => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const spread = o.spread ?? 1, baseY = o.baseY ?? 0.5, heightRange = o.heightRange ?? 1;
    for (let i = 0; i < count; i++) { pos[i*3] = (Math.random()-0.5)*spread*2; pos[i*3+1] = baseY + Math.random()*heightRange; pos[i*3+2] = (Math.random()-0.5)*spread*2; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ color: o.color ?? 0xffffff, size: o.size ?? 0.05, transparent: true, opacity: o.opacity ?? 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  },
};

// fillLiquid stub — static version (no animation)
H.fillLiquid = (containerMesh, color = 0xff0000, o = {}) => {
  const fill = o.fillLevel ?? 0.7;
  const inset = o.inset ?? 0.93;
  const geo = containerMesh.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const gBox = geo.boundingBox;
  const gMinY = gBox.min.y, gMaxY = gBox.max.y, gHeight = gMaxY - gMinY;
  const fillY = gMinY + gHeight * fill;
  const liquidMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.2, metalness: 0, transmission: 0.6, thickness: 0.8, ior: 1.33, clearcoat: 0.4, clearcoatRoughness: 0.1, side: THREE.DoubleSide });
  let liquidGeo, surfaceRadius;
  if (geo.parameters && geo.parameters.points) {
    const origPoints = geo.parameters.points;
    const segments = geo.parameters.segments || 64;
    const wallPoints = [];
    let passedFirstWall = false;
    for (let i = 0; i < origPoints.length; i++) {
      const pt = origPoints[i], r = pt.x;
      if (passedFirstWall && r < 0.02) break;
      if (r < 0.02) continue;
      passedFirstWall = true;
      if (pt.y <= fillY) { wallPoints.push(new THREE.Vector2(r * inset, pt.y)); }
      else { if (i > 0) { const prev = origPoints[i-1]; const prevR = Math.max(prev.x, 0.02); if (prev.y < fillY) { const t = (fillY - prev.y) / (pt.y - prev.y); wallPoints.push(new THREE.Vector2((prevR + (r - prevR) * t) * inset, fillY)); } } break; }
    }
    if (wallPoints.length >= 2) {
      const bottomY = gMinY;
      surfaceRadius = wallPoints[wallPoints.length - 1].x;
      const profile = [new THREE.Vector2(0.001, bottomY)];
      for (const wp of wallPoints) profile.push(wp);
      profile.push(new THREE.Vector2(0.001, fillY));
      liquidGeo = new THREE.LatheGeometry(profile, segments);
    }
  }
  if (!liquidGeo) {
    const r = Math.max((gBox.max.x - gBox.min.x) / 2, (gBox.max.z - gBox.min.z) / 2) * inset;
    const liquidH = gHeight * fill;
    liquidGeo = new THREE.CylinderGeometry(r, r, liquidH, 32, 1, false);
    liquidGeo.translate(0, gMinY + liquidH / 2, 0);
    surfaceRadius = r;
  }
  const liquidMesh = new THREE.Mesh(liquidGeo, liquidMat);
  liquidMesh.position.copy(containerMesh.position);
  liquidMesh.rotation.copy(containerMesh.rotation);
  if (!surfaceRadius) surfaceRadius = (gBox.max.x - gBox.min.x) / 2 * inset * 0.9;
  const surfaceGeo = new THREE.CircleGeometry(surfaceRadius, 64);
  const surfaceMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, metalness: 0.05, transmission: 0.4, thickness: 0.3, ior: 1.33, clearcoat: 1.0, clearcoatRoughness: 0.0, side: THREE.DoubleSide });
  const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
  surface.rotation.x = -Math.PI / 2;
  surface.position.copy(containerMesh.position);
  surface.position.y += fillY;
  const group = new THREE.Group();
  group.name = 'liquid_fill';
  group.add(liquidMesh);
  group.add(surface);
  return group;
};

// ── Stubs for setObjectInfo / TEX (no-ops or minimal) ──
let _objectInfo = {};
function setObjectInfo(info) { _objectInfo = info; }

const TEX = {
  canvas: (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    draw(ctx, w, h);
    return new THREE.CanvasTexture(c);
  },
  noise: (w = 256, h = 256, scale = 20) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i+1] = img.data[i+2] = v;
      img.data[i+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  },
  checker: (c1 = '#ffffff', c2 = '#000000', size = 8) => {
    const s = size * 2;
    const c = document.createElement('canvas');
    c.width = s; c.height = s;
    const ctx = c.getContext('2d');
    ctx.fillStyle = c1; ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = c2; ctx.fillRect(0, 0, size, size); ctx.fillRect(size, size, size, size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  },
};

// ── Execute user code ──
try {
${userCode}
} catch (e) {
  console.error('BonzAI 3D NFT code error:', e);
}

// Auto-fit camera to scene
const box = new THREE.Box3().setFromObject(scene);
if (!box.isEmpty()) {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(size * 0.8, size * 0.6, size * 0.8));
  camera.near = size / 100;
  camera.far = size * 10;
  camera.updateProjectionMatrix();
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
<` + `/script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIO / VIDEO HTML PLAYERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a self-contained HTML page with a branded background image and an
 * HTML5 audio player overlay. Fully covers the viewport.
 */
function buildAudioPlayer(audioUrl, bgImageUrl, titleText) {
  const safeTitle = (titleText || 'BonzAI Audio').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const bgCss = bgImageUrl
    ? `background:url('${bgImageUrl}') center/cover no-repeat #111;`
    : 'background:#111;';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${safeTitle}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:100vw;height:100vh;${bgCss}display:flex;flex-direction:column;align-items:center;justify-content:flex-end;font-family:system-ui,-apple-system,sans-serif;overflow:hidden}
.overlay{position:absolute;inset:0;background:rgba(0,0,0,0.35)}
.player{position:relative;z-index:1;width:100%;padding:24px 32px 32px;background:linear-gradient(transparent,rgba(0,0,0,0.85));display:flex;flex-direction:column;align-items:center;gap:12px}
.title{color:#fff;font-size:16px;font-weight:600;text-align:center;text-shadow:0 1px 4px rgba(0,0,0,0.6);max-width:80%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
audio{width:min(90%,480px);height:40px;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.4))}
.badge{color:rgba(255,255,255,0.5);font-size:11px;margin-top:4px}
</style>
</head>
<body>
<div class="overlay"></div>
<div class="player">
  <div class="title">${safeTitle}</div>
  <audio controls autoplay loop preload="auto" src="${audioUrl}"></audio>
  <div class="badge">BonzAI</div>
</div>
</body>
</html>`;
}

/**
 * Build a self-contained HTML page with a full-cover HTML5 video player.
 * Falls back to a branded poster image while loading.
 */
function buildVideoPlayer(videoUrl, posterUrl, titleText) {
  const safeTitle = (titleText || 'BonzAI Video').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const posterAttr = posterUrl ? ` poster="${posterUrl}"` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${safeTitle}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:100vw;height:100vh;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden}
video{width:100%;height:100%;object-fit:cover}
.controls{position:fixed;bottom:0;left:0;right:0;padding:16px 24px;background:linear-gradient(transparent,rgba(0,0,0,0.7));display:flex;align-items:center;justify-content:space-between;z-index:1;opacity:0;transition:opacity 0.3s}
body:hover .controls{opacity:1}
.title{color:#fff;font-size:14px;font-weight:600;text-shadow:0 1px 4px rgba(0,0,0,0.6)}
.badge{color:rgba(255,255,255,0.5);font-size:11px}
</style>
</head>
<body>
<video controls autoplay loop muted playsinline preload="auto"${posterAttr} src="${videoUrl}"></video>
<div class="controls">
  <span class="title">${safeTitle}</span>
  <span class="badge">BonzAI</span>
</div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// FETCH NFT 3D CODE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch the Three.js code from a minted 3D NFT's on-chain metadata.
 *
 * @param {string} tokenId - The NFT token ID
 * @param {string} [network='base'] - Network to query ('base' or 'lukso')
 * @returns {Object|null} { code, prompt } or null if not found
 */
export async function fetchNFT3DCode(tokenId) {
  try {
    // ERC-721: call tokenURI on Base
    const contractAddress = CONFIG.contentNFT?.base?.contractAddress;
    if (!contractAddress) throw new Error('Content NFT contract not configured');

    const provider = new ethers.JsonRpcProvider(CONFIG.networks?.base?.rpc || 'https://base.llamarpc.com');
    const contract = new ethers.Contract(
      contractAddress,
      ['function tokenURI(uint256 tokenId) view returns (string)'],
      provider,
    );
    let metadataUrl = await contract.tokenURI(tokenId);

    // Resolve Arweave URLs
    if (metadataUrl.startsWith('ar://')) {
      metadataUrl = `https://gateway.irys.xyz/${metadataUrl.slice(5)}`;
    }

    // Fetch metadata JSON
    const resp = await fetch(metadataUrl);
    if (!resp.ok) throw new Error(`Failed to fetch metadata: ${resp.status}`);
    const metadata = await resp.json();

    // Extract threeCode from provenance
    const threeCode = metadata?.properties?.provenance?.threeCode;
    if (!threeCode) return null;

    const prompt = metadata?.description || '';

    return { code: threeCode, prompt };
  } catch (err) {
    console.error('[ContentNFT] Failed to fetch NFT 3D code:', err);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const contentNFTService = {
  mintContent,
  fetchNFT3DCode,
  buildInteractive3DViewer,
};

export default contentNFTService;
