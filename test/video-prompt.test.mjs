import test from 'node:test';
import assert from 'node:assert/strict';
import { videoPromptInstruction } from '../src/services/videoPrompt.js';
import { userFacingError } from '../src/services/userFacingError.js';
import { generationKind } from '../src/services/activity/operations.js';
test('image-to-video direction preserves reference continuity and selected duration',()=>{
 const prompt=videoPromptInstruction({duration:8,direction:'A gentle wave'});
 assert.match(prompt,/8-second/);assert.match(prompt,/exact supplied frame/);assert.match(prompt,/beginning, middle and ending/);assert.match(prompt,/A gentle wave/);
});
test('H3 numerical diagnostics never reach the user and route to video',()=>{
 const raw='MiniMax H3 numerical failure in denoising step 1, transformer_blocks.39 (torch.bfloat16, (1, 6050, 5376))';
 assert.equal(generationKind('minimax_h3'),'video');
 assert.doesNotMatch(userFacingError(raw),/torch|transformer|6050/);
 assert.match(userFacingError(raw),/video/);
 assert.equal(userFacingError("Error invoking remote method 'test': Error: Your OpenRouter spending limit or credits have been reached."),'Your OpenRouter spending limit or credits have been reached.');
});
