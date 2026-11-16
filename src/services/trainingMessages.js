// Only product messages cross into the training UI; raw tool output remains
// available in server/export diagnostics, never in a toast or progress label.
const messages = {
  access: ['This model requires access from its publisher. Check your access or choose another model.', 'Ce modèle nécessite une autorisation de son éditeur. Vérifiez votre accès ou choisissez un autre modèle.'],
  memory: ['There is not enough available memory. Close other tasks or choose a smaller model.', 'La mémoire disponible est insuffisante. Fermez les autres tâches ou choisissez un modèle plus petit.'],
  disk: ['There is not enough free storage to save this model. Free some space and try again.', 'L’espace disponible est insuffisant pour enregistrer ce modèle. Libérez de l’espace et réessayez.'],
  invalid: ['The modified model contains invalid values and cannot be exported. Try a gentler method.', 'Le modèle modifié contient des valeurs invalides et ne peut pas être exporté. Essayez une méthode moins intensive.'],
  export: ['The model could not be exported in the selected format. Check the diagnostic log before retrying.', 'Le modèle n’a pas pu être exporté au format choisi. Consultez le journal de diagnostic avant de réessayer.'],
  connection: ['The local AI service is unavailable. Start it and try again.', 'Le service d’IA local est indisponible. Démarrez-le et réessayez.'],
  failed: ['The operation could not finish. Check the diagnostic log for details, then try again.', 'L’opération n’a pas pu aboutir. Consultez le journal de diagnostic, puis réessayez.'],
};
const stages = {
  summon: ['Preparing the model…', 'Préparation du modèle…'],
  probe: ['Analyzing model responses…', 'Analyse des réponses du modèle…'],
  distill: ['Identifying the changes to apply…', 'Identification des modifications à appliquer…'],
  excise: ['Applying model changes…', 'Application des modifications…'],
  verify: ['Checking model quality…', 'Vérification de la qualité du modèle…'],
  rebirth: ['Saving the modified model…', 'Enregistrement du modèle modifié…'],
  converting: ['Exporting the model…', 'Exportation du modèle…'],
  quantizing: ['Preparing the selected output format…', 'Préparation du format de sortie choisi…'],
};
const localized = (pair, locale) => pair[String(locale).startsWith('fr') ? 1 : 0];
export function trainingErrorMessage(error, locale = 'en') {
  const raw = String(error?.response?.data?.error || error?.message || error || '').toLowerCase();
  const kind = /hf_token|huggingface.*token|gated|unauthorized|access denied|401|403/.test(raw) ? 'access'
    : /out of memory|not enough.*memory|allocation.*fail/.test(raw) ? 'memory'
    : /no space left|insufficient disk|disk.*full/.test(raw) ? 'disk'
    : /non-finite|nan weights|invalid values/.test(raw) ? 'invalid'
    : /quantization|gguf conversion|converter|llama-quantize/.test(raw) ? 'export'
    : /network error|econnrefused|connection refused|service unavailable/.test(raw) ? 'connection' : 'failed';
  return localized(messages[kind], locale);
}
export function trainingProgressMessage(stage, detail, locale = 'en') {
  const text = localized(stages[stage] || ['Processing…', 'Traitement en cours…'], locale);
  // Retain useful batch progress without exposing tensor names or tool output.
  const batch = String(detail || '').match(/prompts\s+\d+-(\d+)\/(\d+)/i);
  return batch && stage === 'probe' ? `${text} ${batch[1]} / ${batch[2]}` : text;
}
