const escape = value => String(value || '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function mediaURL(value) {
  if (!value) return '';
  const url = String(value).startsWith('ipfs://') ? `https://ipfs.io/ipfs/${String(value).slice(7)}` : String(value).startsWith('ar://') ? `https://arweave.net/${String(value).slice(5)}` : String(value);
  if (!/^https?:\/\//i.test(url)) throw new Error('Media requires a public playback URL.');
  return escape(url);
}
function player(kind, source, poster, title) {
  const name = escape(title || `BonzAI ${kind}`);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title>
<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#050c15;color:#f7f3e9;font:16px system-ui}main{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:${kind === 'audio' ? '16px' : '0'}}img{display:block;width:100%;height:calc(100% - 76px);object-fit:contain;min-height:0}audio{width:min(100%,600px);flex-shrink:0}video{width:100%;height:100%;object-fit:cover;object-position:center}main{position:relative}.play-toggle{position:absolute;right:16px;bottom:72px;z-index:2;width:44px;height:44px;border:1px solid #ffffff55;border-radius:50%;background:#172332;color:white;cursor:pointer;font-size:20px}</style></head><body><main aria-label="${name}">
${kind === 'audio' ? `${poster ? `<img src="${mediaURL(poster)}" alt="${name}">` : `<p>${name}</p>`}<audio controls preload="metadata" src="${mediaURL(source)}" aria-label="Play ${name}"></audio>` : `<video controls playsinline preload="metadata" src="${mediaURL(source)}"${poster ? ` poster="${mediaURL(poster)}"` : ''} aria-label="Play ${name}"></video>`}
<button class="play-toggle" type="button" aria-label="Play preview">▶</button>
<p class="playback-error" role="status" style="position:absolute;left:16px;bottom:16px;margin:0;max-width:70%;background:#172332;color:white"></p>
</main><script>
const media=document.querySelector('audio,video'),button=document.querySelector('.play-toggle');
function sync(){button.textContent=media.paused?'▶':'■';button.setAttribute('aria-label',media.paused?'Play preview':'Stop preview');}
const status=document.querySelector('.playback-error');
button.addEventListener('click',async()=>{status.textContent='';if(!media.paused){media.pause();media.currentTime=0;}else{try{if(media.error)media.load();await media.play();}catch{status.textContent='Playback could not start. Check the connection and try again.';button.setAttribute('aria-label','Retry playback');return;}}sync();});
media.addEventListener('error',()=>{status.textContent='Media could not load. Check the connection and try again.';button.setAttribute('aria-label','Retry playback');});
media.addEventListener('play',sync);media.addEventListener('pause',sync);media.addEventListener('ended',()=>{media.currentTime=0;sync();});
</script></body></html>`;
}
export const buildAudioPlayer = (source, poster, title) => player('audio', source, poster, title);
export const buildVideoPlayer = (source, poster, title) => player('video', source, poster, title);
