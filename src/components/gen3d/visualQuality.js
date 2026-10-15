const categories = ['silhouette','proportions','materials','criticalDetails'];
const meanScore = review => categories.reduce((sum,key) => sum + review[key],0)/categories.length;

export const VISUAL_REVIEW_FORMAT = {
  type: 'json_schema',
  json_schema: { name: 'asset_visual_review', strict: true, schema: {
    type: 'object', additionalProperties: false,
    required: ['score','silhouette','proportions','materials','criticalDetails','verdict','defects','strengths'],
    properties: {
      ...Object.fromEntries(['score','silhouette','proportions','materials','criticalDetails'].map(key=>[key,{type:'number',minimum:0,maximum:1}])),
      verdict: {type:'string',enum:['pass','refine']},
      defects: {type:'array',maxItems:4,items:{type:'string',maxLength:180}}, strengths: {type:'array',maxItems:3,items:{type:'string',maxLength:120}},
    },
  } },
};

export function visualReviewPrompt(brief, reference = false, mode = 'object') {
  return `${reference ? 'The left image is the reference and the right image is the reconstruction.' : 'Inspect this actual render of a generated 3D asset.'}
Original request: ${brief}
Judge visible geometry against the request, not code execution. Inspect silhouette, proportions, construction/contact, materials and all identity-critical features. Look for stacked primitives replacing shaped parts, buried or missing components, disconnected parts, opaque liquids, excessive glow and lighting that hides the object. Do not reward particles or atmosphere when construction is wrong. Do not invent hidden defects.
${mode === 'level' ? 'For a level, judge finished environmental construction: navigable space, foreground/midground/background, landmarks, architectural/terrain detail, grounded props, material relief and texture scale. A flat coloured slab with placeholder poles/spheres is a blockout, not a finished environment. Report visible z-fighting, floating props, missing contact shadows and stretched textures. Unless the request explicitly calls for disconnected platforms, water or space, missing ground/floors beneath the playable area is a critical construction defect; isolated paths and grass patches floating against the sky do not form a finished courtyard.' : 'Require a finished silhouette, secondary construction and credible material response. Plain primitive assemblies or a texture pasted onto the wrong shape are blockouts. Respect deliberately minimal, stylized and low-poly requests.'}
Return the requested JSON object, no prose. Score each numeric field independently from 0 (absent or unusable) to 1 (faithful and well constructed). Use intermediate scores for partial matches. Overall score is the mean of silhouette, proportions, materials and criticalDetails.
Set verdict to pass only if overall score is at least 0.85 and every category is at least 0.75. Otherwise use refine. Any unresolved defect requires refine; a pass must have an empty defects array. Include at most four distinct, specific visible defects and up to three strengths. Do not assume a hidden part is absent.`;
}
export function parseVisualReview(raw) {
  try {
    const value = JSON.parse(String(raw).match(/\{[\s\S]*\}/)?.[0] || '');
    for (const field of ['score','silhouette','proportions','materials','criticalDetails']) {
      if (typeof value[field] !== 'number' || !Number.isFinite(value[field]) || value[field] < 0 || value[field] > 1) throw new Error('Invalid visual score');
    }
    if (!['pass','refine'].includes(value.verdict) || !Array.isArray(value.defects) || !value.defects.every(d=>typeof d === 'string')) throw new Error('Invalid visual verdict');
    return { ...value, score: meanScore(value), defects: [...new Set(value.defects)].slice(0,4) };
  } catch { return { score:null, verdict:'unavailable', defects:[], raw:String(raw) }; }
}
export function passesVisualReview(review) {
  return review?.verdict === 'pass' && Array.isArray(review.defects) && review.defects.length === 0 && Number.isFinite(review.score) && review.score >= .85 && review.score <= 1 &&
    categories.every(key => typeof review[key] === 'number' && Number.isFinite(review[key]) && review[key] >= .75 && review[key] <= 1) && meanScore(review) >= .85;
}

export function aggregateViewReviews(views) {
  if (!views.length || views.some(view=>view.review.verdict==='unavailable')) {
    return {score:null,verdict:'unavailable',defects:[],views};
  }
  const scores = Object.fromEntries(categories.map(key=>[key,Math.min(...views.map(view=>view.review[key]))]));
  const defects=[...new Set(views.flatMap(view=>view.review.defects.map(defect=>`${view.label}: ${defect}`)))].slice(0,8);
  return {...scores,score:meanScore(scores),verdict:views.every(view=>passesVisualReview(view.review))?'pass':'refine',defects,views};
}

export function isBetterReview(next, previous) {
  if (next.verdict==='unavailable' || !Number.isFinite(next.score) || next.score < previous.score) return false;
  // Small reviewer variance is tolerable. Losing a required feature is not.
  if (categories.some(key=>!Number.isFinite(next[key]) || next[key] < previous[key] - .04)) return false;
  if (previous.views && next.views) {
    for(const old of previous.views) {
      const current=next.views.find(view=>view.label===old.label)?.review;
      if(!current || categories.some(key=>current[key]<old.review[key]-.04))return false;
    }
  }
  return true;
}

// A successful GPU frame is only a draft. Keep the best reviewed candidate,
// never replace it with a failed, unreviewed or visually worse correction.
export async function reviewSceneQuality({code,snapshot,review,refine,render,maxCorrections=2,onStage=()=>{}}) {
  let best={code,snapshot,review:null}; const passes=[];
  try { onStage('review'); best.review=await review(snapshot); passes.push(best.review); }
  catch(error) { best.review={score:null,verdict:'unavailable',defects:[],raw:error.message};passes.push(best.review); }
  for(let attempt=0;attempt<maxCorrections && best.review.verdict!=='unavailable' && !passesVisualReview(best.review);attempt++){
    try {
      onStage('correct',attempt+1);
      const nextCode=await refine(best.code,best.review);
      if(!nextCode || nextCode===best.code) { passes.push({verdict:'correction-failed',score:null,raw:'The correction returned no change to the geometry.'}); break; }
      const nextSnapshot=await render(nextCode);
      onStage('review',attempt+1);
      const nextReview=await review(nextSnapshot); passes.push(nextReview);
      if(!isBetterReview(nextReview, best.review)){await render(best.code);break;}
      best={code:nextCode,snapshot:nextSnapshot,review:nextReview};
    } catch(error) {
      passes.push({score:null,verdict:'correction-failed',raw:error.message});
      await render(best.code); break;
    }
  }
  return {...best,passes,status:passesVisualReview(best.review)?'reviewed':best.review.verdict==='unavailable'?'unreviewed':'needs-refinement'};
}

// Bound image tokens for the shared 4K-context local vision model. Full desktop
// screenshots can consume its entire context before the review prompt is read.
export async function resizeReviewImage(dataUrl, maxEdge = 768) {
  const image = await new Promise((resolve,reject)=>{
    const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Unable to read visual-review image'));img.src=dataUrl;
  });
  const ratio=Math.min(1,maxEdge/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
  const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',.9);
}
