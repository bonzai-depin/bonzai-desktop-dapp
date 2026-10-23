# GMAO : preuves terrain et reprise d’archives

Référence d’ingénierie et de recette, 22 octobre 2026. Complète [la recette des workflows](WORKFLOW_ACCEPTANCE.md). Les documents client restent locaux et ne font pas partie des fixtures.

## Périmètre et invariants

L’import historique conserve les pièces et leurs dates métier sans rejouer l’exploitation : aucun achat, ordre de travail courant, message, stock ou facture n’est créé par une archive. Les propositions d’extraction sont relues avant application, même avec une confiance élevée. Les champs absents, illisibles, vides et nuls ne sont pas interchangeables.

Le dossier terrain complète l’intervention existante. Ses preuves ont une révision contrôlée et un journal avant/après ; une écriture concurrente échoue au lieu d’écraser une preuve. Les clés, documents, équipements et originaux sont vérifiés dans le périmètre de l’équipe. Les scans sont conservés avec une empreinte SHA-256 vérifiée.

## Couverture de l’audit

| Écart | Comportement livré | Vérification déterminante |
| --- | --- | --- |
| G01 | Import local de dossier, fichiers et ZIP ; progression par fichier ; OCR par page avec checkpoints ; reprise par resélection ; états d’erreur isolés ; pointage page/zone ; saisie manuelle d’une archive illisible. | Copie ZIP dédupliquée, interruption/reprise OCR, visa vide et région du scan conservés. |
| G02 | Références DI/OI/OT/SILLAGE/GTP/GMAO/BON par émetteur, année et site ; alias ; rapprochement confirmé ; recherche par date/titre/équipement ; rattachement au dossier existant. | Même numéro dans deux sites/années distincts ; plusieurs scans dans un dossier ; aucun rapprochement automatique ambigu. |
| G03 | Dates d’opération séparées des dates d’import ; précision déclarée ; archives consultables en lecture seule. | Aucun changement des tables d’exploitation lors de la reprise. |
| G04 | Lignes par équipement, localisation, état initial/final, mesures, suite et indisponibilité ; historique propre à chaque matériel. | Un équipement opérationnel ne clôture pas un autre matériel hors service. |
| G05 | Segments multi-jours, techniciens/qualifications, pauses, déplacement ; durée seule ; présence et main-d’œuvre séparées ; fuseaux explicites. | 135 minutes sur deux journées ; 300 minutes de travail en deux segments ; 1,5 h = 90 minutes ; heures ambiguës refusées. |
| G06 | Pièces client, neuves, stock ou réemploi ; propriétaire/état/référence/unité/série ; donneur/receveur ; coût inconnu conservé ; lien à un mouvement réel. | Deux historiques pour un transfert ; pas de double consommation ; fourniture client exclue du total repris dans un devis. |
| G07 | Attentes distinctes, responsable, date et prochaine action ; absence de défaut et surveillance ; résolution tracée. | Une attente d’expertise n’ouvre pas un achat ; une clôture partielle échoue atomiquement. |
| G08 | Registre par circuit : fluide, masse en kg, ajout/récupération/contrôle, intervenant, résultat et suivi daté. | Une recharge ne répare pas implicitement la fuite ; suivi visible après service fait et clos sur compte-rendu du dossier. |
| G09 | Visas par rôle, statut, date et original ; journal ; rapport avec références, matériel, temps, pièces, fluides et preuves. | Visa absent non promu en acceptation ; libellé « Responsable du contrat » ; contrôles de lecture et de périmètre. |
| G10 | Profil contractuel validé, catégories, périodes et avenants ; franchise, coefficient, heures incluses, déplacement, accès et TVA ; justificatifs par poste ; calcul figé dans le devis. | Devis 500 € HT / 600 € TTC propagé à la facture ; avenant ultérieur sans recalcul rétroactif ; coûts inconnus refusés. |

## Points d’entrée

- **Réception documentaire** : sélectionner le mode historique avant un dossier/ZIP ; consulter les lots, ouvrir une source, comparer scan et champs, choisir le site et le rapprochement, valider. Pour un scan illisible, préparer une archive manuellement et conserver l’original.
- **GMAO / Documents** : consulter les archives reprises ; chaque source et chaque révision reste disponible.
- **GMAO / Dossier d’intervention** : onglets du dossier terrain pour références, équipements, passages, pièces, fluides, attentes et signatures. Un mouvement de stock doit d’abord exister dans Achats.
- **GMAO / Clients** : alias de sites et versions tarifaires ; un avenant doit nommer la version remplacée. Aucune condition contractuelle ne doit être déduite d’un répertoire de scans.
- **Maintenance / fiche équipement** : consulter uniquement ses faits, y compris ceux où il est donneur ou receveur.
- **Devis** : choisir la date applicable et la catégorie ; renseigner coûts, heures et justificatifs. La reprise des pièces du dossier exclut les fournitures client et bloque les coûts inconnus.

Les équipes équipées de `skill.local_casework` disposent des lectures et mutations `casework.*`. Les mutations de l’agent passent par la validation du propriétaire existante. L’import historique n’accorde jamais la permission d’exécuter une ancienne demande. Les reçus de stock interéquipes sont vérifiés contre le mouvement, la demande et la conversation effectivement partagés.

## Implémentation

- `src/shared/maintenanceEvidence.js` : schéma, conversions, dates, temps et états de preuve.
- `src/main/db/migrations/0028_gmao_casework.sql` : dossiers/preuves, références, révisions et lots.
- `src/main/db/repos/gmaoCasework.js` : périmètres, preuves, historique, rapprochement, stock et tarification.
- `src/main/gmao/importBatch.js` : lecture bornée de dossiers/ZIP sans extraction sur disque ni suivi de liens symboliques.
- `src/shared/companyIntake.js`, `companyIntake.js`, `intakeRecords.js` : extraction, checkpoints, revue et application.
- `CompanyCasework`, `MaintenanceArchiveReview`, `MaintenanceSourceViewer`, `MaintenanceFactFields`, `CompanyPricingVersions`, `CompanySiteAliases` : parcours de consultation et de saisie.

Limites d’import : 30 Mo/fichier, 1 Go/lot, 100 Mo/ZIP compressé, 3 000 entrées, profondeur 20. Les formats non pris en charge et les limites sont visibles. Les lots interrompus se reprennent par resélection ; les sources déjà enregistrées ne sont pas dupliquées. L’OCR est séquentiel, les résultats de pages terminées sont conservés. Les dates sans heure restent des dates civiles. Les scans ressemblants sont des propositions de rapprochement, pas des doublons automatiquement supprimés.

## Tests reproductibles

```sh
node --test --test-concurrency=2 test/gmao-casework.test.mjs test/gmao-domain.test.mjs test/gmao-maintenance.test.mjs test/gmao-operations.test.mjs test/company-intake.test.mjs test/contract-pricing.test.mjs test/gmao-pdf.test.mjs test/purchasing-logistics.test.mjs
node --test test/gmao-casework.browser.test.mjs
BONZAI_PDF_SMOKE=1 node --test --test-concurrency=1 test/gmao-pdf.test.mjs test/business-demo-electron.test.mjs
npm run test:workflows
npm run test:i18n
npm run build:vite
```

Le test navigateur crée son propre serveur Vite sur un port libre et utilise Chrome avec des données synthétiques ; il ne lance pas une seconde application BonzAI et bloque le réseau externe. Il couvre 1 440, 800 et 390 pixels, trois thèmes, une sauvegarde en échec conservant la saisie, le pointage d’un scan et une réponse de stock tardive après changement de dossier. Les fixtures SQLite utilisent des bases temporaires ; les transports de la chaîne financière sont simulés. Les tests natifs PDF utilisent des profils Electron temporaires, sans serveur BonzAI ni envoi externe.

La fixture de reprise vérifie aussi qu’un fichier disparu, une archive endommagée, un PDF trop volumineux et un lien symbolique ne bloquent pas le document valide suivant. Le parcours de stock interéquipes utilise une véritable demande partagée et un mouvement enregistré ; un reçu fabriqué, un autre dossier et une double affectation sont refusés.

## Recette client obligatoire sur le candidat de livraison

| Test | Manipulation | Résultat à constater |
| --- | --- | --- |
| T01 | Importer les 250 PDF et les ZIP, arrêter puis reprendre. | 250 originaux logiques, 43 copies ZIP reconnues, aucun effet courant ; chaque échec est visible. |
| T02 | Vérifier les demandes et les bons, dont les fichiers nommés « devis compresseur ». | Contenu prioritaire sur le nom ; aucun faux document financier validé. |
| T03 | Relire références, dates, site, bâtiment et série sur les scans. | SILLAGE n’est pas un numéro ; année du formulaire non utilisée comme date métier. |
| T04 | Valider une opération ancienne. | Archive fidèle, aucune commande, facture ou relance déclenchée. |
| T05 | Enregistrer deux équipements dont un reste hors service. | Historiques séparés et remise en service globale refusée. |
| T06 | Tracer un moteur repris sur un autre équipement/site. | Deux historiques ; mouvement existant lié une fois ; aucun achat fictif. |
| T07 | Saisir les deux passages de 60 et 75 min, puis 11-13 h et 14-17 h ; saisir 1,5 h seule. | 135 min, 300 min, 90 min ; aucune heure inventée. |
| T08 | Comparer et rapprocher les cinq scans d’un même bon. | Un dossier logique et cinq originaux conservés. |
| T09 | Consigner recharge, fuite non trouvée, attente d’expert, puis service fait. | Suivi distinct avec responsable/échéance ; aucun achat automatique ; clôture du suivi sur preuve. |
| T10 | Exécuter un dossier chiffré validé avec le contrat réel. | Devis, accord/BC, achats/réception, service fait et facture cohérents ; justificatifs disponibles. |
| T11 | Réviser une preuve, modifier simultanément et restaurer une sauvegarde. | Révision obsolète refusée ; historique et sources retrouvés ; aucune donnée d’une autre équipe. |
| T12 | Lire formulaires et PDF en français, en thème clair/sombre et sur fenêtre étroite. | Aucun titre illisible, champ tronqué ni action inaccessible. |

Sur l’OCR local du corpus analysé, le classificateur corrigé propose 94 demandes, 145 bons et 11 inconnus, sans proposition financière erronée. Cela mesure ce classificateur sur ces textes OCR ; ce n’est ni une mesure de l’extraction complète du moteur BonzAI configuré, ni une validation des 250 dossiers par le client.

La conformité métier et la décision de production restent à signer sur les conditions réelles du contrat, le référentiel, les rôles de signature, les obligations fluides applicables et un dossier financier complet. Ces preuves ne sont pas fournies par les scans de 2016. Ne pas marquer ces vérifications « réussies » sur la seule base des tests synthétiques ou des fonctionnalités présentes.
