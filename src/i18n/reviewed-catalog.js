import { smartWorkflowOutcomeMessages } from './smartWorkflowOutcomeMessages.js';
import { smartWorkflowSetupMessages } from './smartWorkflowSetupMessages.js';
import { smartWorkflowWorkspaceMessages } from './smartWorkflowWorkspaceMessages.js';
import { smartWorkflowResultsMessages } from './smartWorkflowResultsMessages.js';
import { smartWorkflowDiscoveryMessages } from './smartWorkflowDiscoveryMessages.js';
import { activityMessages } from './activity.js';
import {companyWorkspaceMessages} from './companyWorkspaceMessages.js';
import { demoGuide } from '../services/company/demoGuide.js';
// Reviewed corrections for the legacy exact-phrase catalog. These are applied by
// the generator offline; generated-ui.json is never the source for an override.
export const reviewedCatalogOverrides = {
  ja: {
    "Animate": "アニメーション化",
    "Animate this image": "この画像をアニメーション化",
    "Mint token": "トークンを発行",
    "Prepare compliance report": "コンプライアンス報告書を作成",
    "Prepare financial report": "財務報告書を作成",
    "Prepare product report": "製品報告書を作成",
    "Prepare experiment report": "実験報告書を作成",
    "Legal and compliance": "法務・コンプライアンス",
    "Document management": "文書管理",
  },

  ko: {
    "Animate": "애니메이션 만들기",
    "Animate this image": "이 이미지로 애니메이션 만들기",
    "Mint token": "토큰 발행",
    "Prepare compliance report": "규정 준수 보고서 작성",
    "Prepare financial report": "재무 보고서 작성",
    "Prepare product report": "제품 보고서 작성",
    "Prepare experiment report": "실험 보고서 작성",
    "Legal and compliance": "법무 및 규정 준수",
    "Document management": "문서 관리",
  },

  fr: {
    "Smart Workflows": "Workflows intelligents",
    "Build your team": "Composez votre équipe",
    "Process Analyst": "Analyse des processus",
    "Outcome": "Objectif",
    "Review": "Vérification",
    "What do you want to accomplish?": "Quel résultat souhaitez-vous obtenir ?",
    "Choose an outcome. See the work, deliverables and team before you start.": "Choisissez un objectif. Découvrez le travail, les livrables et l’équipe avant de commencer.",
    "Loading available workflows…": "Chargement des workflows disponibles…",
    "Your team at a glance": "Votre équipe en un coup d’œil",
    "What you get": "Vos livrables",
    "Who does the work": "Qui réalise le travail",
    "Suggested tools": "Outils suggérés",
    "You stay in control of sensitive actions.": "Vous gardez le contrôle des actions sensibles.",
    "A team built around your outcome": "Une équipe au service de votre objectif",
    "Select a template to explore its deliverables and responsibilities.": "Sélectionnez un modèle pour découvrir ses livrables et ses responsabilités.",
    "Choose the work": "Choisissez le travail",
    "Add your context": "Ajoutez votre contexte",
    "Review your team": "Vérifiez votre équipe",
    "Make it yours": "Adaptez-la à votre activité",
    "Give the team the context it should remember. Specific task inputs come next, in your workspace.": "Donnez à l’équipe le contexte à retenir. Les informations propres à chaque tâche seront précisées dans votre espace de travail.",
    "My project": "Mon projet",
    "Ready to start": "Prêt à démarrer",
    "Your team": "Votre équipe",
    "Your workspace": "Votre espace de travail",
    "You approve sensitive actions": "Vous validez les actions sensibles",
    "Review external actions and inspect saved results from your workspace.": "Validez les actions externes et consultez les résultats enregistrés depuis votre espace de travail.",
    "First tasks": "Premières tâches",
    "Select a template to continue": "Sélectionnez un modèle pour continuer",
    "Creating team…": "Création de l’équipe…",
    "Loading workflow": "Chargement du workflow",
    "Workflow stages": "Étapes du workflow",
    "Needs your input": "Votre intervention est requise",
    "Current task": "Tâche en cours",
    "Start with your first brief": "Commencez par votre première demande",
    "Ready for the next task": "Prêt pour la prochaine tâche",
    "Create a task with your source material and the result you want. Progress and deliverables stay together here.": "Créez une tâche avec vos sources et le résultat souhaité. Retrouvez ici sa progression et ses livrables.",
    "Worker for new tasks": "Agent pour les nouvelles tâches",
    "Assign a worker": "Affecter un agent",
    "Saved results": "Résultats enregistrés",
    "Reviewed files and finished work will appear in Deliverables.": "Les fichiers vérifiés et les travaux terminés apparaîtront dans Livrables.",
    "Task workspace": "Espace de la tâche",
    "Source material and desired result": "Sources et résultat attendu",
    "Work assigned to your agent": "Travail confié à votre agent",
    "Approve and save the result": "Validez et enregistrez le résultat",
    "Needs review": "À vérifier",

    "Creation and analysis": "Création et analyse",
    "Production team": "Équipe de production",
    "Set up your production team": "Configurez votre équipe de production",
    "Project name *": "Nom du projet *",
    "Standing instructions (optional)": "Consignes permanentes (facultatif)",
    "Audience, tone, source material and what a good result looks like.": "Public, ton, sources et critères d’un résultat réussi.",
    "Assigned worker": "Agent responsable",
    "From brief to deliverable": "Du brief au livrable",
    "Create a task with your inputs. Your team keeps the assignment, approvals and resulting files together.": "Créez une tâche avec vos informations. L’équipe regroupe son attribution, les validations et les fichiers produits.",
    "Assign a smart agent to the team before creating a task.": "Affectez un agent à l’équipe avant de créer une tâche.",
    "Create a task, choose its worker and supply the requested inputs. Interactive tasks open their production workspace; other tasks enter the team queue.": "Créez une tâche, choisissez son agent et renseignez les informations demandées. Les tâches interactives ouvrent leur espace de production ; les autres rejoignent la file de l’équipe.",
    "Follow progress and blockers. Resume unfinished interactive tasks from Production.": "Suivez la progression et les blocages. Reprenez les tâches interactives inachevées depuis Production.",
    "Review sensitive actions before execution.": "Validez les actions sensibles avant leur exécution.",
    "Review saved results. For interactive tasks, use Attach result to link the output before completing the task.": "Vérifiez les résultats enregistrés. Pour une tâche interactive, utilisez Joindre le résultat avant de la terminer.",
    'Sales & customer relations':'Ventes et relation client', 'Customers & sales':'Clients et ventes', 'Save customer case':'Enregistrer le dossier client', 'Share accepted work':'Transmettre les travaux acceptés', 'Create intervention from accepted work':'Créer une intervention depuis les travaux acceptés', 'Review customer follow-ups':'Vérifier les suivis clients', 'Share business evidence':'Partager un justificatif métier', 'Read shared evidence':'Lire les justificatifs partagés', 'List shared evidence':'Lister les justificatifs partagés', 'Record payment response':'Enregistrer la réponse de paiement', 'Preview technician route':'Prévisualiser la tournée', 'Confirm technician route':'Confirmer la tournée', 'Update warranty claim':'Mettre à jour la garantie',

    "Update logistics assessment": "Mettre à jour le suivi logistique",
    "Purchasing & logistics": "Achats et logistique",
    "Logistics & margin": "Logistique et marge",
    "Unable to play this video. The file may be unavailable or its format unsupported.": "Impossible de lire cette vidéo. Le fichier est peut-être indisponible ou son format non pris en charge.",
    "Animate": "Animer",
    "Animate this image": "Animer cette image",
    "Mint token": "Créer le token",
    'Asset Floors': 'Prix planchers des actifs',
    'Channel Slug': 'Identifiant du canal',
    'Upload': 'Importer',
    'Unique Viewers': 'Spectateurs uniques',
    'Clear the visible audit history (does not affect outcomes, tasks, or treasury)': 'Effacer l’historique d’audit affiché (sans modifier les résultats, les tâches ni la trésorerie)',
    'Computing attention over the system prompt before generation starts': 'Calcul de l’attention sur le message système avant le début de la génération',
    'Data source rejected the request — wait a minute and retry, or pick a different symbol.': 'La source de données a refusé la requête. Patientez une minute avant de réessayer ou choisissez un autre symbole.',
    'Describe how to edit the image...': 'Décrivez les modifications à apporter à l’image…',
    'Describe what you see or ask about the image...': 'Décrivez ce que vous voyez ou posez une question sur l’image…',
    'Dictation could not start': 'La dictée n’a pas pu démarrer',
    'Download failed · retry available': 'Échec du téléchargement · réessayer',
    'Download Qwen3.5 4B MTP from the Chat tab first': 'Téléchargez d’abord Qwen3.5 4B MTP depuis l’onglet Discussion',
    'Downloaded · ready to load': 'Téléchargé · prêt à charger',
    'Downloading card analysis models': 'Téléchargement des modèles d’analyse de cartes',
  },
  zh: {
    "Animate": "生成动画",
    "Animate this image": "为这张图片生成动画",
    "Mint token": "铸造代币",
    "Prepare compliance report": "编写合规报告",
    "Prepare financial report": "编写财务报告",
    "Prepare product report": "编写产品报告",
    "Prepare experiment report": "编写实验报告",
    "Legal and compliance": "法务与合规",
    "Document management": "文档管理",
    'Asset Floors': '资产地板价',
    'Channel Slug': '频道标识符',
    'Unique Viewers': '独立观众数',
    'Attach contributors and revenue.': '关联贡献者和收入分配。',
    'Bubbling flask on gimbal with pouring potion': '万向支架上的烧瓶冒着气泡，药水正从瓶中倒出',
    'Clear saved text history': '清除已保存的文本历史记录',
  },
  es: {
    "Animate": "Animar",
    "Animate this image": "Animar esta imagen",
    "Mint token": "Crear token",
    "Prepare compliance report": "Preparar informe de cumplimiento",
    "Prepare financial report": "Preparar informe financiero",
    "Prepare product report": "Preparar informe de producto",
    "Prepare experiment report": "Preparar informe de experimentación",
    "Legal and compliance": "Asuntos jurídicos y cumplimiento",
    "Document management": "Gestión documental",
    'Asset Floors': 'Precios mínimos de los activos',
    'Channel Slug': 'Identificador del canal',
  },
  ru: {
    "Animate": "Анимировать",
    "Animate this image": "Анимировать это изображение",
    "Mint token": "Выпустить токен",
    "Prepare compliance report": "Подготовить отчёт о соответствии",
    "Prepare financial report": "Подготовить финансовый отчёт",
    "Prepare product report": "Подготовить отчёт о продукте",
    "Prepare experiment report": "Подготовить отчёт об эксперименте",
    "Legal and compliance": "Право и соответствие требованиям",
    "Document management": "Управление документами",
    'Asset Floors': 'Минимальные цены активов',
    'Channel Slug': 'Идентификатор канала',
  },
}

// Exact technical/product names only. Adding prose here would conceal missing
// translations. A brand inside a sentence does not exempt that sentence.
export const identicalTechnicalPhrases = [
  'Microsoft Visual Studio Code',
  'Uniswap V4 Position Manager',
  'Open Wallet Standard',
  'Qwen3.5 4B MTP',
]

// Mint is product terminology, never the herb or a localized synonym.
for (const locale of ['en','fr','es','ru','zh','ja','ko']) {
  reviewedCatalogOverrides[locale] ||= {};
  for (const phrase of ['Mint','Mint NFT','Mint token','Mint Collectible','Mint collectible ·','Mint answer','Mint answer as NFT','Mint failed','Minted successfully','Minting','Minting failed. Please try again.','Connect wallet to mint']) {
    reviewedCatalogOverrides[locale][phrase] = phrase;
  }
}

// Persistent cross-application execution status.
const teamExecutionCopy = {
  fr: ['Activité des équipes', 'Équipes', 'En cours', 'En pause', 'À vérifier', 'Mode actif · en attente de travail', 'Vérification du statut', 'Statut d’exécution indisponible', 'À valider'],
  es: ['Actividad de los equipos', 'Equipos', 'En curso', 'En pausa', 'Requiere atención', 'Modo activo · esperando trabajo', 'Comprobando estado', 'Estado de ejecución no disponible', 'Pendiente de revisión'],
  ja: ['チームの活動', 'チーム', '実行中', '一時停止中', '確認が必要', '稼働モード · 作業待ち', '状態を確認中', '実行状態を取得できません', 'レビュー待ち'],
  ko: ['팀 활동', '팀', '작업 중', '일시 중지', '확인 필요', '실행 모드 · 작업 대기', '상태 확인 중', '실행 상태를 확인할 수 없습니다', '검토 대기'],
  zh: ['团队活动', '团队', '工作中', '已暂停', '需要关注', '运行模式 · 等待任务', '正在检查状态', '执行状态不可用', '等待审核'],
  ru: ['Активность команд', 'Команды', 'В работе', 'На паузе', 'Требует внимания', 'Активный режим · ожидание задач', 'Проверка статуса', 'Статус выполнения недоступен', 'Ожидает проверки'],
};
for (const [locale, values] of Object.entries(teamExecutionCopy)) {
  const keys = ['Team activity', 'Teams', 'Working', 'Paused', 'Needs attention', 'Play mode · waiting for work', 'Checking status', 'Execution status unavailable', 'Awaiting review'];
  Object.assign(reviewedCatalogOverrides[locale] ||= {}, Object.fromEntries(keys.map((key, index) => [key, values[index]])));
}

Object.assign(reviewedCatalogOverrides.fr ||= {}, {
 'Company workspace':'Espace entreprise',
 'One purchase for all your teams and their business workflows.':'Un achat pour toutes vos équipes et leurs processus métier.',
 'One-time test price · no subscription':'Prix de test unique · sans abonnement',
 'Card checkout: US$1. Local model execution remains free.':'Paiement par carte : 1 USD. L’exécution locale des modèles reste gratuite.',
 'Pay by card':'Payer par carte', 'Pay with wallet':'Payer avec un portefeuille',
 'Check payment':'Vérifier le paiement', 'Restore license':'Restaurer la licence',
 'Back up license':'Sauvegarder la licence', 'Unlock workspace':'Activer l’espace',
 'Read-only workspace':'Espace en lecture seule', 'Test activation':'Activation de test',
 'Company workspace unlocked':'Espace entreprise activé', 'View existing records':'Consulter les dossiers existants',
 'Checkout is not configured yet. You can run the demonstrations and read your existing records.':'Le paiement n’est pas encore configuré. Vous pouvez lancer les démonstrations et consulter vos dossiers existants.',
 'Try a business workflow':'Tester un parcours métier',
 'Creates a separate, paused demo team. No emails, portal submissions or payments are sent.':'Crée une équipe de démonstration distincte, en pause. Aucun e-mail, dépôt sur un portail ou paiement n’est envoyé.',
 'Maintenance intervention':'Intervention de maintenance', 'Invoice to payment':'De la facture au règlement',
 'Grant application to settlement':'Du dossier de prime au versement',
 'Demonstration · simulated external evidence':'Démonstration · justificatifs externes simulés',
 'Workflow checks passed':'Vérifications du parcours réussies', 'Workflow needs attention':'Parcours à vérifier',
 'Saved in a separate DEMO team. Open it from All teams to inspect the records.':'Enregistré dans une équipe DEMO distincte. Retrouvez-la dans Toutes les équipes pour consulter les dossiers.',
 'Create client and site':'Créer le client et le site', 'Register and schedule intervention':'Enregistrer et planifier l’intervention',
 'Assign technician and record arrival':'Affecter le technicien et enregistrer son arrivée',
 'Record completed field work':'Enregistrer les travaux réalisés', 'Record sample customer acceptance':'Enregistrer un service fait fictif',
 'Hand off to billing':'Transmettre à la facturation', 'Verify saved outcome':'Vérifier le résultat enregistré',
 'Prepare invoice':'Préparer la facture', 'Validate and number invoice':'Valider et numéroter la facture',
 'Generate invoice document':'Générer le PDF de la facture', 'Record simulated delivery and acceptance':'Enregistrer l’envoi et l’acceptation simulés',
 'Reconcile sample partial payment':'Rapprocher un acompte fictif', 'Reconcile sample final payment':'Rapprocher le solde fictif',
 'Store reusable company document':'Enregistrer une pièce réutilisable de l’entreprise',
 'Create installation application':'Créer le dossier de l’installation',
 'Review eligibility and prepare documents':'Vérifier l’éligibilité et préparer les pièces',
 'Record simulated submission and award':'Enregistrer le dépôt et l’attribution simulés',
 'Reconcile sample payment':'Rapprocher un versement fictif',
 'Restored intervention, customer acceptance and billing handoff saved.':'Intervention rétablie, service fait et transmission à la facturation enregistrés.',
 'Numbered invoice, PDF, partial payment and final settlement saved. Payments are simulated.':'Facture numérotée, PDF, acompte et solde enregistrés. Les règlements sont simulés.',
 'Reusable document, preparation, submission evidence, award and settlement saved. Provider and bank evidence are simulated.':'Pièce réutilisable, préparation, preuve de dépôt, attribution et versement enregistrés. Les justificatifs du financeur et de la banque sont simulés.'
});

Object.assign(reviewedCatalogOverrides.fr, {'Open demo records':'Ouvrir les dossiers de démonstration','Start another checkout':'Commencer un autre paiement','Sign in with email':'Se connecter par e-mail'});

Object.assign(reviewedCatalogOverrides.fr, Object.fromEntries(Object.values(demoGuide)));

Object.assign(reviewedCatalogOverrides.fr, {
 'Follow each step and inspect what was saved. External actions are simulated; your real teams are unchanged.':'Suivez chaque étape et consultez les données enregistrées. Les actions externes sont simulées ; vos équipes réelles restent inchangées.',
 'Verified in this rehearsal':'Vérifié dans ce parcours',
 'The operation completed in the local database. The records below belong only to this demonstration.':'L’opération a abouti dans la base locale. Ces données appartiennent uniquement à cette démonstration.',
 'Inspect saved evidence':'Consulter les justificatifs enregistrés',
 'No emails, portal submissions or payments are sent. This rehearsal does not test autonomous agent execution or live connectors.':'Aucun email, dépôt sur un portail ou paiement n’est envoyé. Ce parcours ne teste pas l’exécution autonome des agents ni les connecteurs réels.',
 'Previous demonstrations':'Démonstrations précédentes',
 'Next step':'Étape suivante', 'Record reference':'Référence du dossier',
 'Received amount (cents)':'Montant reçu (centimes)', 'Total (cents)':'Total (centimes)', 'Paid amount (cents)':'Montant réglé (centimes)'
});

Object.assign(reviewedCatalogOverrides.fr, {Step:'Étape', Previous:'Précédent', Running:'En cours'});

Object.assign(reviewedCatalogOverrides.fr, {
 'Skip':'Passer',
 'Temporary free access: open your teams and create new ones without payment.':'Accès gratuit temporaire : retrouvez vos équipes et créez-en de nouvelles sans paiement.'
});

Object.assign(reviewedCatalogOverrides.fr, {
 'Open demo workspace':'Ouvrir l’espace de démonstration',
 'View demo deliverables':'Voir les livrables de démonstration',
 'Demo workspace':'Espace de démonstration',
 'Sample records only. This team stays outside your operating teams.':'Données fictives uniquement. Cette équipe reste séparée de vos équipes opérationnelles.',
 'Guided walkthrough':'Parcours guidé',
 'Back to my teams':'Retour à mes équipes'
});

Object.assign(reviewedCatalogOverrides.fr, {
 'Standard unlock price · one-time purchase':'Tarif standard de déblocage · achat unique',
 'Test checkout only: charged 1 USDC with a wallet or US$1 by card, not 1 ETH.':'Paiement de test uniquement : 1 USDC par portefeuille ou 1 $ US par carte sera débité, et non 1 ETH.'
});

Object.assign(reviewedCatalogOverrides.fr, {
 'Demonstration — fictional records and simulated external actions.':'Démonstration — données fictives et actions externes simulées.',
 'See the operational record for this step.':'Consultez le dossier métier associé à cette étape.',
 'DEMO invoice PDF':'Facture de démonstration PDF',
 'passed':'Réussi', 'failed':'Échec', 'running':'En cours'
});

Object.assign(reviewedCatalogOverrides.fr, {
 'Describe what you want, then send your message.':'Décrivez ce que vous souhaitez créer, puis envoyez votre message.',
});

Object.assign(reviewedCatalogOverrides.fr, {
 'Files & email':'Fichiers et emails',
 'Import files to prepare linked records automatically.':'Importez des fichiers pour préparer automatiquement les dossiers liés.',
 'Document saved. The team will process it in the background.':'Document enregistré. L’équipe le traitera en arrière-plan.',
 'Analyze incoming information':'Analyser les informations reçues',
 'Process incoming information':'Traiter les informations reçues',
 'Read source document':'Consulter le document source',
 'Read saved record':'Consulter le dossier enregistré',
 'Read imports':'Consulter les imports',
 'Can the team turn files and emails into work?':'L’équipe peut-elle transformer des fichiers et emails en tâches ?',
 'Open Inbox → Files & email. Import a client list, schedule, proforma or business request, or enable a connected Gmail or Outlook inbox. The team saves the source, matches existing records and queues preparation work. Review only uncertain fields and missing evidence; external actions still require approval.':'Ouvrez À traiter → Fichiers et emails. Importez une liste de clients, un planning, une proforma ou une demande, ou activez une boîte Gmail ou Outlook connectée. L’équipe conserve la source, rapproche les dossiers existants et prépare les tâches. Vous vérifiez les champs incertains et justificatifs manquants ; les actions externes restent soumises à validation.',
 'Yes. Inbox → Files & email accepts PDF, spreadsheets, images and text. Recognized client lists and schedules use direct field mapping; other documents use the team model. Original files, extracted facts and saved records remain linked. Reimporting the same source does not create another copy. Missing or conflicting data appears for review. Enable email intake explicitly in that view after connecting Gmail or Outlook in Tools.':'Oui. À traiter → Fichiers et emails accepte PDF, tableurs, images et textes. Les listes de clients et plannings reconnus sont importés directement ; les autres documents sont analysés par le modèle de l’équipe. Les originaux, informations extraites et dossiers restent liés. Un même import ne crée pas de doublon. Les données manquantes ou contradictoires sont signalées. Activez l’import email dans cette vue après avoir connecté Gmail ou Outlook dans Outils.',
 'Extracted evidence does not match the source.':'L’extrait justificatif ne correspond pas au document source.',
 'A line description or part reference is not present in the source.':'Une désignation ou référence de pièce ne figure pas dans la source.',
 'A line amount, quantity or tax rate is not supported by the source.':'Un montant, une quantité ou un taux de TVA ne correspond pas à la source.',
 'The source does not contain an unambiguous date, time and time zone.':'La source ne précise pas une date, une heure et un fuseau horaire sans ambiguïté.',
 'Add a work-order reference or an explicit visit time to avoid duplicate requests.':'Ajoutez une référence d’intervention ou un horaire précis pour éviter les doublons.',
 'Invoice lines do not reconcile with the source total.':'Les lignes de facture ne correspondent pas au total du document.',
 'Each invoice line needs an explicit quantity and VAT rate.':'Chaque ligne de facture doit préciser la quantité et le taux de TVA.',
 'Invoice reference already exists with different lines or amounts.':'Cette référence de facture existe avec des lignes ou montants différents.',
 'This proforma reference already exists with different lines or terms. Review the saved quote.':'Cette référence de proforma existe avec des lignes ou conditions différentes. Vérifiez l’offre enregistrée.',
 'Share the intervention parts request with this team before attaching its proforma.':'Partagez la demande de pièces de l’intervention avec cette équipe avant de rattacher la proforma.',
 'Proforma line cannot be matched to the parts request.':'Une ligne de la proforma ne correspond pas à la demande de pièces.',
 'No readable text. Enable local OCR or provide a text version.':'Aucun texte lisible. Activez l’OCR local ou fournissez une version texte.',
 'Choose an assigned member of this team.':'Choisissez un membre affecté à cette équipe.',
 'Team is paused.':'L’équipe est en pause.',
 'Mailbox import settings changed.':'Les réglages d’import de cette boîte email ont changé.',
 'Reconnect the mailbox in Tools.':'Reconnectez la boîte email dans Outils.',
});

for (const [locale,messages] of Object.entries(companyWorkspaceMessages)) Object.assign(reviewedCatalogOverrides[locale],messages);

for (const [locale, values] of Object.entries(activityMessages)) Object.assign(reviewedCatalogOverrides[locale] ||= {}, values);

for (const catalog of [smartWorkflowResultsMessages, smartWorkflowDiscoveryMessages, smartWorkflowWorkspaceMessages, smartWorkflowSetupMessages, smartWorkflowOutcomeMessages]) {
  for (const [locale, messages] of Object.entries(catalog)) Object.assign(reviewedCatalogOverrides[locale] ||= {}, messages);
}
