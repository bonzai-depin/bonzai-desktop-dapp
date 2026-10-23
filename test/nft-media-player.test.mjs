import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAudioPlayer,buildVideoPlayer} from '../src/services/nftMediaPlayer.js';
test('collectors can play media with native controls and an explicit play/stop toggle',()=>{
 const video=buildVideoPlayer('https://example.com/film.mp4','https://example.com/cover.png','A film');
 assert.match(video,/object-fit:cover;object-position:center/);assert.match(video,/<video controls playsinline/);assert.doesNotMatch(video,/display:none|autoplay/);
 const audio=buildAudioPlayer('https://example.com/music.wav','https://example.com/cover.png','Music');
 assert.match(audio,/<audio controls preload="metadata"/);assert.match(audio,/<img /);
});
test('titles and URLs cannot inject markup into standalone NFT players',()=>{
 const html=buildAudioPlayer('https://example.com/a?x=" onerror="alert(1)','https://example.com/poster.png','<script>alert("bad")</script>');
 assert.doesNotMatch(html,/ onerror="/);
 assert.match(html,/class="play-toggle"/);assert.match(html,/media.currentTime=0/);assert.match(html,/&lt;script&gt;/);
 assert.throws(()=>buildVideoPlayer('javascript:alert(1)',null,'Bad'),/public playback/);
 assert.match(buildVideoPlayer('ipfs://bafyexample/film.mp4',null,'Film'),/https:\/\/ipfs.io\/ipfs\/bafyexample\/film.mp4/);
});
