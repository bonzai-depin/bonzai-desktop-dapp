import { isRef, unref, nextTick } from 'vue';
/** Explicit field allowlist: never persist credentials, runtime handles or jobs. */
export function useGenerationDraft(fields) {
  const capture = () => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(fields).map(([key,value]) => [key,unref(value)]))));
  const restore = async savedState => {
    const state = JSON.parse(JSON.stringify(savedState));
    // Mode watchers may reset inputs; settle them before restoring the payload.
    if (isRef(fields.mode) && Object.hasOwn(state,'mode')) fields.mode.value = state.mode;
    await nextTick();
    const apply = () => { for (const [key, field] of Object.entries(fields)) {
      if (!Object.hasOwn(state,key)) continue;
      const value = structuredClone(state[key]);
      if (isRef(field)) field.value = value;
      else if (field && typeof field === 'object') Object.assign(field,value);
    } };
    apply();
    // Derived-input watchers may rebuild captions or duration. Restore the saved
    // editable values after those watchers settle, preserving custom overrides.
    await nextTick();
    apply();
  };
  return { capture, restore };
}
