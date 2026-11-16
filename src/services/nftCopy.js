import { visibleText } from "../shared/visibleText.js";
const clean = value => visibleText(value).replace(/[#*_`~]/g, '').trim();
export function truncateNFTCopy(value, limit) {
 const chars=Array.from(clean(value));
 return chars.length>limit ? chars.slice(0,limit).join('').trimEnd()+' [...]' : chars.join('');
}
export function musicNFTDescription(generation={}) {
 const p=generation.musicParams || {};
 const tags=['genres','moods','instruments','vocals','production'].flatMap(key=>Array.isArray(p[key])?p[key]:p[key]?[p[key]]:[]);
 return [...tags, p.bpm ? `${p.bpm} BPM` : '', p.key, p.timeSignature, p.instrumental ? 'Instrumental' : ''].filter(Boolean).join(' · ') || p.caption || '';
}
export function nftCoverCopy({inferenceType,generation={},title,textContent='',fallbackTitle='',fallbackDescription=''}) {
 if(['video','object'].includes(inferenceType))return {title:'',description:''};
 const music=inferenceType==='audio' && !/speech|tts|voice/i.test(generation.type || '');
 return {
  title:truncateNFTCopy((music && (generation.songName || generation.songTitle || generation.musicParams?.title)) || title || fallbackTitle,24),
  description:truncateNFTCopy(music ? musicNFTDescription(generation) : textContent || generation.outputText || generation.answer?.text || generation.metadata?.text || fallbackDescription,140),
 };
}
