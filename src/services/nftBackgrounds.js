// Bundled artwork only: choosing a background never makes a network request.
const assets = import.meta.glob('../assets/bonzai-knowledge/*.webp', { eager: true, query: '?url', import: 'default' });
export const nftBackgrounds = Object.entries(assets).map(([path, src]) => {
  const id = path.split('/').pop().replace('.webp', '');
  return { id, src, name: id === 'three-d' ? '3D' : id.replace(/(^|-)(\w)/g, (_, separator, letter) => `${separator ? ' ' : ''}${letter.toUpperCase()}`) };
}).sort((a, b) => a.name.localeCompare(b.name));
export function nftBackground(id) { return nftBackgrounds.find(background => background.id === id); }

export function centeredCoverRect(width, height, size = 1024) {
  const scale = Math.max(size / width, size / height);
  return { x: (size - width * scale) / 2, y: (size - height * scale) / 2, width: width * scale, height: height * scale };
}
