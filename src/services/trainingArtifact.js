// Content and packaging are independent: a music LoRA is not a speech model.
export function trainingArtifact(model = {}) {
  const type = String(model.type || '').toLowerCase();
  const operation = type.includes('ablit') || model.operation === 'abliteration' ? 'abliteration' : 'training';
  const explicit = model.content_type || model.modality;
  let content = ['text', 'speech', 'music', 'image', 'video'].includes(explicit) ? explicit : null;
  if (!content) {
    if (/speech|tts/.test(type)) content = 'speech';
    else if (type.includes('music')) content = 'music';
    else if (/llm|text|ablit/.test(type)) content = 'text';
    else if (/sdxl|image/.test(type)) content = 'image';
    else if (type.includes('video')) content = 'video';
    else if (type.includes('audio')) content = 'audio'; // Legacy records must not be guessed as speech or music.
  }
  const contentLabel = {text:'Text',speech:'Speech',music:'Music',image:'Image',video:'Video',audio:'Audio · unspecified'}[content] || 'Content type unspecified';
  const format = model.artifact_type || (type.includes('lora') ? 'lora' : operation === 'abliteration' || type.includes('checkpoint') ? 'checkpoint' : 'unknown');
  const formatLabel = {lora:'LoRA Adapter',checkpoint:'Checkpoint'}[format] || 'Format unspecified';
  return {content, contentLabel, format, formatLabel, operation};
}
