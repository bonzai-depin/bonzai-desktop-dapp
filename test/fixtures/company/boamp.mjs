// Two records from the public BOAMP open data API (Licence Ouverte 2.0), fetched
// on 2026-11-19 and trimmed: contact names, emails and phone numbers removed.
export const boampResponse = {
  total_count: 3,
  results: [
    {
      idweb: "26-108200",
      objet: "Accord-cadre de travaux de chauffage, ventilation, climatisation, désenfumage et plomberie (CVCD-P)",
      nomacheteur: "Sénat",
      dateparution: "2026-11-06",
      datelimitereponse: "2026-12-07T11:00:00+00:00",
      code_departement: ["75"],
      type_marche: ["TRAVAUX"],
      nature: "APPEL_OFFRE",
      nature_libelle: "Avis de marché",
      procedure_libelle: "Procédure Ouverte",
      descripteur_libelle: ["Chauffage (travaux)", "Plomberie (travaux)", "Ventilation"],
      url_avis: "https://www.boamp.fr/pages/avis/?q=idweb:26-108200",
      donnees: JSON.stringify({ FNSimple: { organisme: { nomOfficiel: "Sénat" }, initial: { communication: { urlProfilAch: "https://www.marches-publics.gouv.fr", identifiantInterne: "SENAT-DAPJ_2026_026" } } } }),
    },
    {
      idweb: "26-107411",
      objet: "Maintenance des installations de climatisation",
      nomacheteur: "Musée du Louvre",
      dateparution: "2026-11-04",
      datelimitereponse: "2026-12-03T11:00:00+00:00",
      code_departement: ["75"],
      type_marche: ["SERVICES"],
      nature: "APPEL_OFFRE",
      nature_libelle: "Avis de marché",
      procedure_libelle: "Procédure Ouverte",
      descripteur_libelle: null,
      url_avis: "https://www.boamp.fr/pages/avis/?q=idweb:26-107411",
      donnees: JSON.stringify({ EFORMS: { ContractNotice: { "cac:ContractingParty": { "cbc:BuyerProfileURI": "https://www.marches-publics.gouv.fr/" } } } }),
    },
    // A record the workspace must drop rather than display half-read.
    { idweb: "", objet: "", donnees: "{not json" },
  ],
};
