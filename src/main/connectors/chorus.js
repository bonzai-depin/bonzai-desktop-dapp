/** Chorus Pro Factures API. PISTE schema apiId 10175213-109c-4423-a7ab-05e7a051ea82.
 * OAuth: https://communaute.chorus-pro.gouv.fr/documentation/aides-aux-developpeurs-api-en-mode-oauth2/
 * No write retries. An interrupted request may have committed remotely.
 */
const HOSTS = {
  sandbox: {
    api: "https://sandbox-api.piste.gouv.fr",
    oauth: "https://sandbox-oauth.piste.gouv.fr/api/oauth/token",
  },
  production: {
    api: "https://api.piste.gouv.fr",
    oauth: "https://oauth.piste.gouv.fr/api/oauth/token",
  },
};
const id = (n) => Number.isSafeInteger(Number(n)) && Number(n) > 0;
export function chorusSubmitPayload(invoice, profile, attachmentId) {
  const c = profile.chorus || {};
  if (!id(c.supplierId) || !id(attachmentId))
    throw new Error(
      "Chorus : identifiant fournisseur et pièce jointe obligatoires.",
    );
  if (
    ![
      "A1_FACTURE_FOURNISSEUR",
      "A9_FACTURE_SOUSTRAITANT",
      "A12_FACTURE_COTRAITANT",
    ].includes(c.billingFrame)
  )
    throw new Error("Chorus : choisissez le cadre de facturation.");
  if (
    c.billingFrame !== "A1_FACTURE_FOURNISSEUR" &&
    (!c.validatorStructure || !c.validatorService)
  )
    throw new Error("Chorus : structure et service valideurs obligatoires.");
  if (
    ![
      "TVA_SUR_DEBIT",
      "TVA_SUR_ENCAISSEMENT",
      "EXONERATION",
      "SANS_TVA",
    ].includes(c.vatType)
  )
    throw new Error("Chorus : renseignez le régime TVA.");
  if (c.vatType === "EXONERATION" && !c.exemptionCode)
    throw new Error("Chorus : code d’exonération requis.");
  if (
    invoice.issuedAt > Date.now() ||
    !invoice.number ||
    invoice.number.length > 20
  )
    throw new Error("Chorus : numéro ou date de facture invalide.");
  const vat = new Map();
  for (const l of invoice.lines) {
    const group = vat.get(l.vatRate) || {
      ligneTvaTauxManuel: l.vatRate,
      base: 0,
      tax: 0,
    };
    group.base += l.subtotalCents;
    group.tax += l.vatCents;
    vat.set(l.vatRate, group);
  }
  return {
    modeDepot: "DEPOT_PDF_API",
    numeroFactureSaisi: invoice.number,
    dateFacture: new Date(invoice.issuedAt).toISOString().slice(0, 10),
    ...(id(c.userId) ? { idUtilisateurCourant: Number(c.userId) } : {}),
    destinataire: {
      codeDestinataire: profile.recipient.registration,
      codeServiceExecutant: profile.recipient.serviceCode,
    },
    fournisseur: {
      idFournisseur: Number(c.supplierId),
      ...(id(c.supplierServiceId)
        ? { idServiceFournisseur: Number(c.supplierServiceId) }
        : {}),
      ...(id(c.bankDetailsId)
        ? { codeCoordonneesBancairesFournisseur: Number(c.bankDetailsId) }
        : {}),
    },
    cadreDeFacturation: {
      codeCadreFacturation: c.billingFrame,
      ...(c.billingFrame !== "A1_FACTURE_FOURNISSEUR"
        ? {
            codeStructureValideur: c.validatorStructure,
            codeServiceValideur: c.validatorService,
          }
        : {}),
    },
    references: {
      deviseFacture: invoice.currency || "EUR",
      typeFacture: "FACTURE",
      typeTva: c.vatType,
      modePaiement: "VIREMENT",
      numeroMarche: profile.marketReference,
      numeroBonCommande: invoice.legalCommitment || profile.legalCommitment,
      ...(c.exemptionCode ? { motifExonerationTva: c.exemptionCode } : {}),
    },
    ligneTva: ["SANS_TVA", "EXONERATION"].includes(c.vatType)
      ? []
      : [...vat.values()].map((g) => ({
          ligneTvaTauxManuel: g.ligneTvaTauxManuel,
          ligneTvaMontantBaseHtParTaux: g.base / 100,
          ligneTvaMontantTvaParTaux: g.tax / 100,
        })),
    montantTotal: {
      montantHtTotal: invoice.subtotalCents / 100,
      montantTVA: invoice.vatCents / 100,
      montantTtcTotal: invoice.totalCents / 100,
      montantAPayer: invoice.amountDueCents / 100,
    },
    pieceJointePrincipale: [
      {
        pieceJointePrincipaleDesignation:
          invoice.document?.filename || "facture.pdf",
        pieceJointePrincipaleId: Number(attachmentId),
      },
    ],
    commentaire: invoice.advanceAppliedCents
      ? `Avance imputée : ${invoice.advanceAppliedCents / 100} EUR, ${invoice.advanceReference}`
      : invoice.notes || "",
  };
}
export function createChorusClient({
  credential,
  environment = "sandbox",
  fetchImpl = fetch,
}) {
  const hosts = HOSTS[environment];
  if (!hosts) throw new Error("Chorus : environnement invalide.");
  for (const field of [
    "clientId",
    "clientSecret",
    "technicalLogin",
    "technicalPassword",
  ])
    if (!credential?.[field] || /[\r\n]/.test(credential[field]))
      throw new Error(
        "Chorus : identifiants PISTE et compte technique requis.",
      );
  let token = null,
    expires = 0;
  async function accessToken() {
    if (token && expires > Date.now()) return token;
    const response = await fetchImpl(hosts.oauth, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: credential.clientId,
        client_secret: credential.clientSecret,
        scope: "openid",
      }).toString(),
    });
    if (!response.ok)
      throw Object.assign(
        new Error(`Authentification Chorus refusée (HTTP ${response.status}).`),
        { outcome: "not_sent" },
      );
    const value = await response.json();
    if (!value.access_token)
      throw Object.assign(new Error("Chorus : jeton non reçu."), {
        outcome: "not_sent",
      });
    token = value.access_token;
    expires =
      Date.now() + Math.max(0, (Number(value.expires_in) || 60) - 30) * 1000;
    return token;
  }
  async function request(path, body, { write = false, ocr = false } = {}) {
    let bearer;
    try {
      bearer = await accessToken();
    } catch (error) {
      error.outcome = "not_sent";
      throw error;
    }
    let response;
    try {
      response = await fetchImpl(hosts.api + "/cpro/factures/v1/" + path, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(30000),
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          Authorization: `Bearer ${bearer}`,
          "cpro-account": Buffer.from(
            `${credential.technicalLogin}:${credential.technicalPassword}`,
            "utf8",
          ).toString("base64"),
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw Object.assign(
        new Error(
          write
            ? "Résultat Chorus inconnu. Vérifiez le portail avant toute nouvelle tentative."
            : "Impossible de consulter Chorus.",
        ),
        { outcome: write ? "unknown" : "failed" },
      );
    }
    if (!response.ok)
      throw Object.assign(
        new Error(`Chorus a répondu HTTP ${response.status}.`),
        {
          outcome:
            write && (response.status >= 500 || response.status === 408)
              ? "unknown"
              : "rejected",
        },
      );
    let result;
    try {
      result = await response.json();
    } catch {
      throw Object.assign(new Error("Réponse Chorus illisible."), {
        outcome: write ? "unknown" : "failed",
      });
    }
    if (result.codeRetour != null && result.codeRetour !== 0)
      throw Object.assign(
        new Error(`Chorus a refusé l’opération (${result.codeRetour}).`),
        { outcome: "rejected", codeRetour: result.codeRetour },
      );
    if (ocr ? !id(result.pieceJointeId) : result.codeRetour !== 0)
      throw Object.assign(new Error("Chorus : confirmation absente."), {
        outcome: write ? "unknown" : "failed",
      });
    return result;
  }
  return {
    async validateConnection() {
      await accessToken();
      return { authenticated: true, environment };
    },
    async uploadPdf({ bytes, filename, userId }) {
      if (
        !Buffer.isBuffer(bytes) ||
        bytes.length > 10 * 1024 * 1024 ||
        bytes.subarray(0, 5).toString() !== "%PDF-"
      )
        throw Object.assign(
          new Error("Chorus : PDF valide de 10 Mo maximum requis."),
          { outcome: "not_sent" },
        );
      return request(
        "deposer/pdf",
        {
          fichierFacture: bytes.toString("base64"),
          formatDepot: "PDF_NON_SIGNE",
          nomFichier: filename,
          ...(id(userId) ? { idUtilisateurCourant: Number(userId) } : {}),
        },
        { write: true, ocr: true },
      );
    },
    submitInvoice(payload) {
      return request("soumettre", payload, { write: true });
    },
    invoiceStatus({ invoiceId, userId }) {
      if (!id(invoiceId)) throw new Error("Identifiant Chorus invalide.");
      return request("consulter/historique", {
        idFacture: Number(invoiceId),
        ...(id(userId) ? { idUtilisateurCourant: Number(userId) } : {}),
      });
    },
  };
}
