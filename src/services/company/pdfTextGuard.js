/** Dynamic XFA fallback pages are not the content of the submitted form. */
export function assertReadablePdfForm({
  isPureXfa = false,
  info = {},
  text = "",
} = {}) {
  const fallback =
    /please\s+wait[.…\s]*(?:if this message|the full contents)/i.test(text) ||
    (/(?:adobe\s+reader|adobe\s+acrobat)/i.test(text) &&
      /(?:cannot be displayed|may not be able to display|ne peut pas afficher|contenu.*affich)/i.test(
        text,
      ));
  if (isPureXfa || info.IsXFAPresent || fallback) {
    const error = new Error(
      "Formulaire PDF XFA : original conservé. Ouvrez et complétez le formulaire actif dans un lecteur compatible, puis joignez sa copie aplatie pour analyse.",
    );
    error.code = "PDF_XFA_REVIEW_REQUIRED";
    throw error;
  }
}
