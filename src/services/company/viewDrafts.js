import { watch, isRef } from "vue";

// Session-only, team-scoped drafts: changing screens never changes saved records.
// No credentials, file bytes or server results belong in this cache.
const drafts = new Map();
export function useCompanyDraft(key, fields) {
  let restoring = false;
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const initial = copy(
    Object.fromEntries(
      Object.entries(fields).map(([name, field]) => [
        name,
        isRef(field) ? field.value : field,
      ]),
    ),
  );
  function restore(id) {
    restoring = true;
    const saved = drafts.get(id) || initial;
    if (saved)
      for (const [name, field] of Object.entries(fields)) {
        if (!(name in saved)) continue;
        if (isRef(field)) field.value = copy(saved[name]);
        else {
          for (const k of Object.keys(field)) delete field[k];
          Object.assign(field, copy(saved[name]));
        }
      }
    restoring = false;
  }
  restore(key());
  watch(key, (id) => restore(id), { flush: "sync" });
  watch(
    () =>
      Object.fromEntries(
        Object.entries(fields).map(([name, field]) => [
          name,
          isRef(field) ? field.value : field,
        ]),
      ),
    (value) => {
      if (!restoring && key() && !key().startsWith(":"))
        drafts.set(key(), copy(value));
    },
    { deep: true, flush: "sync" },
  );
}
export function clearCompanyDrafts(companyId) {
  for (const key of drafts.keys())
    if (key.startsWith(companyId + ":")) drafts.delete(key);
}
