import { i18n } from './index.js'
import generatedCatalog from './generated-ui.json'
import { isSafeCatalogPhrase } from './catalogQuality.js'
import { reviewedCatalogOverrides } from './reviewed-catalog.js'

// Exact UI phrases used by older screens while they migrate to explicit $t keys.
// Keep this list limited to interface chrome: never translate generated or user content.
const rows = [
  ['Level navigation', '关卡导航', '레벨 탐색', 'レベルの移動', 'Navegación del nivel', 'Navigation du niveau', 'Навигация по уровню'],
  ['Explore', '自由探索', '자유 탐색', '自由移動', 'Explorar', 'Explorer', 'Свободный полёт'],
  ['Orbit', '环绕', '궤도 회전', '周回', 'Orbitar', 'Orbite', 'Орбита'],
  ['Overview', '全景', '전체 보기', '全体表示', 'Vista general', 'Vue d’ensemble', 'Общий вид'],
  ['Speed', '速度', '속도', '速度', 'Velocidad', 'Vitesse', 'Скорость'],
  ['Click scene · WASD / arrows to move · Drag to look · Q / E down / up · Shift faster', '点击场景 · WASD / 方向键移动 · 拖动查看 · Q / E 下降 / 上升 · Shift 加速', '장면 클릭 · WASD / 방향키로 이동 · 드래그로 둘러보기 · Q / E 하강 / 상승 · Shift 가속', 'シーンをクリック · WASD / 矢印キーで移動 · ドラッグで見回す · Q / E で下降 / 上昇 · Shift で加速', 'Haz clic en la escena · WASD / flechas para moverte · Arrastra para mirar · Q / E bajar / subir · Mayús para acelerar', 'Cliquez dans la scène · ZQSD / flèches pour avancer · Glissez pour regarder · A / E descendre / monter · Maj pour accélérer', 'Нажмите на сцену · WASD / стрелки — движение · Перетаскивание — обзор · Q / E — вниз / вверх · Shift — быстрее'],
  ['History', '历史记录', '기록', '履歴', 'Historial', 'Historique', 'История'],
  ['Generate', '生成', '생성', '生成', 'Generar', 'Générer', 'Создать'],
  ['Generating…', '生成中…', '생성 중…', '生成中…', 'Generando…', 'Génération…', 'Создание…'],
  ['Crafting…', '创作中…', '생성 중…', '生成中…', 'Creando…', 'Création…', 'Создание…'],
  ['Ready to create', '随时可创作', '생성 준비 완료', '作成の準備完了', 'Listo para crear', 'Prêt à créer', 'Готово к созданию'],
  ['No outputs yet', '暂无作品', '아직 결과 없음', 'まだ出力はありません', 'Aún no hay resultados', 'Aucun résultat', 'Пока нет результатов'],
  ['Negative prompt', '反向提示词', '부정 프롬프트', 'ネガティブプロンプト', 'Prompt negativo', 'Prompt négatif', 'Негативный промпт'],
  ['(things to avoid)', '（需要避免的内容）', '(피할 요소)', '（避けたい要素）', '(cosas que evitar)', '(éléments à éviter)', '(чего избегать)'],
  ['Prompt', '提示词', '프롬프트', 'プロンプト', 'Prompt', 'Prompt', 'Промпт'],
  ['Model', '模型', '모델', 'モデル', 'Modelo', 'Modèle', 'Модель'],
  ['Select Model', '选择模型', '모델 선택', 'モデルを選択', 'Seleccionar modelo', 'Choisir le modèle', 'Выбрать модель'],
  ['Base Model', '基础模型', '기본 모델', 'ベースモデル', 'Modelo base', 'Modèle de base', 'Базовая модель'],
  ['Settings', '设置', '설정', '設定', 'Ajustes', 'Réglages', 'Настройки'],
  ['Status', '状态', '상태', '状態', 'Estado', 'Statut', 'Статус'],
  ['Details', '详情', '상세', '詳細', 'Detalles', 'Détails', 'Подробности'],
  ['Name', '名称', '이름', '名前', 'Nombre', 'Nom', 'Название'],
  ['Description', '描述', '설명', '説明', 'Descripción', 'Description', 'Описание'],
  ['Type', '类型', '유형', '種類', 'Tipo', 'Type', 'Тип'],
  ['Private', '私密', '비공개', '非公開', 'Privado', 'Privé', 'Приватно'],
  ['Local', '本地', '로컬', 'ローカル', 'Local', 'Local', 'Локально'],
  ['Connected', '已连接', '연결됨', '接続済み', 'Conectado', 'Connecté', 'Подключено'],
  ['Disconnected', '未连接', '연결 해제됨', '未接続', 'Desconectado', 'Déconnecté', 'Отключено'],
  ['Enabled', '已启用', '활성화', '有効', 'Activado', 'Activé', 'Включено'],
  ['Disabled', '已禁用', '비활성화', '無効', 'Desactivado', 'Désactivé', 'Выключено'],
  ['Working…', '处理中…', '처리 중…', '処理中…', 'Procesando…', 'Traitement…', 'Обработка…'],
  ['Downloading…', '下载中…', '다운로드 중…', 'ダウンロード中…', 'Descargando…', 'Téléchargement…', 'Скачивание…'],
  ['Download model', '下载模型', '모델 다운로드', 'モデルをダウンロード', 'Descargar modelo', 'Télécharger le modèle', 'Скачать модель'],
  ['Import', '导入', '가져오기', 'インポート', 'Importar', 'Importer', 'Импорт'],
  ['Share', '分享', '공유', '共有', 'Compartir', 'Partager', 'Поделиться'],
  ['Preview', '预览', '미리보기', 'プレビュー', 'Vista previa', 'Aperçu', 'Предпросмотр'],
  ['Learn more', '了解更多', '자세히 보기', '詳しく見る', 'Más información', 'En savoir plus', 'Подробнее'],
  ['Clear history', '清除历史', '기록 지우기', '履歴を消去', 'Borrar historial', 'Effacer l’historique', 'Очистить историю'],
  ['Clear all', '全部清除', '모두 지우기', 'すべて消去', 'Borrar todo', 'Tout effacer', 'Очистить всё'],
  ['No results', '无结果', '결과 없음', '結果なし', 'Sin resultados', 'Aucun résultat', 'Нет результатов'],
  ['Search…', '搜索…', '검색…', '検索…', 'Buscar…', 'Rechercher…', 'Поиск…'],
  ['Loading…', '加载中…', '불러오는 중…', '読み込み中…', 'Cargando…', 'Chargement…', 'Загрузка…'],
  ['Try again', '重试', '다시 시도', 'もう一度', 'Intentar de nuevo', 'Réessayer', 'Повторить'],
  ['Start', '开始', '시작', '開始', 'Iniciar', 'Démarrer', 'Запустить'],
  ['Stop', '停止', '중지', '停止', 'Detener', 'Arrêter', 'Остановить'],
  ['Create companion', '创建伴侣', '컴패니언 생성', 'コンパニオンを作成', 'Crear compañero', 'Créer un companion', 'Создать компаньона'],
  ['My Companions', '我的伴侣', '내 컴패니언', 'マイコンパニオン', 'Mis compañeros', 'Mes companions', 'Мои компаньоны'],
  ['Network', '网络', '네트워크', 'ネットワーク', 'Red', 'Réseau', 'Сеть'],
  ['Provider', '提供者', '제공자', 'プロバイダー', 'Proveedor', 'Fournisseur', 'Провайдер'],
  ['Consumer', '使用节点', '사용자', 'コンシューマー', 'Consumidor', 'Client', 'Клиент'],
  ['Connect wallet', '连接钱包', '지갑 연결', 'ウォレット接続', 'Conectar cartera', 'Connecter le portefeuille', 'Подключить кошелёк'],
  ['Mint', '铸造', '민팅', 'ミント', 'Acuñar', 'Minter', 'Минт'],
  ['Mint NFT', '铸造 NFT', 'NFT 민팅', 'NFTをミント', 'Acuñar NFT', 'Minter le NFT', 'Минт NFT'],
  ['Rewards', '奖励', '보상', '報酬', 'Recompensas', 'Récompenses', 'Награды'],
  ['Licenses', '许可证', '라이선스', 'ライセンス', 'Licencias', 'Licences', 'Лицензии'],
  ['Memory Graph', '记忆图谱', '메모리 그래프', 'メモリグラフ', 'Grafo de memoria', 'Graphe mémoire', 'Граф памяти'],
  ['Refresh', '刷新', '새로고침', '更新', 'Actualizar', 'Actualiser', 'Обновить'],
  ['Previous', '上一个', '이전', '前へ', 'Anterior', 'Précédent', 'Назад'],
  ['Next', '下一个', '다음', '次へ', 'Siguiente', 'Suivant', 'Далее'],
  ['Focus', '聚焦', '집중', 'フォーカス', 'Enfocar', 'Centrer', 'Фокус'],
  ['Choose a model', '选择模型', '모델을 선택하세요', 'モデルを選択', 'Elige un modelo', 'Choisissez un modèle', 'Выберите модель'],
  ['Send', '发送', '보내기', '送信', 'Enviar', 'Envoyer', 'Отправить'],
  ['Quality', '高质量', '고품질', '高品質', 'Calidad', 'Qualité', 'Качество'],
  ['Network Error', '网络错误', '네트워크 오류', 'ネットワークエラー', 'Error de red', 'Erreur réseau', 'Ошибка сети'],
  ['Browse models', '浏览模型', '모델 탐색', 'モデルを探す', 'Explorar modelos', 'Parcourir les modèles', 'Выбрать модель'],
  ['Load model', '加载模型', '모델 로드', 'モデルを読み込む', 'Cargar modelo', 'Charger le modèle', 'Загрузить модель'],
  ['Model required', '需要模型', '모델 필요', 'モデルが必要です', 'Modelo necesario', 'Modèle requis', 'Требуется модель'],
]

const localeIndex = { zh: 1, ko: 2, ja: 3, es: 4, fr: 5, ru: 6 }
const rowByEnglish = new Map(rows.map(row => [row[0], row]))
const reviewedOverrides = {
  fr: {
    'Create companion': 'Créer un compagnon',
    'My Companions': 'Mes compagnons',
    'Companion': 'Compagnon',
    'Companions': 'Compagnons',
    'Consumer': 'Client',
    'Provider': 'Fournisseur',
    'Connected': 'Connecté',
    'Disconnected': 'Déconnecté',
    'Sign In': 'Se connecter',
    'Connect Wallet': 'Connecter le portefeuille',
    'Network Settings': 'Réglages réseau',
    'Session Status': 'État de la session',
    'Open Wallet': 'Ouvrir le portefeuille',
    'Not installed': 'Non installé',
    'Private / offline': 'Privé / hors ligne',
    'Loaded LLM': 'Modèle de langage chargé',
    'Generation History': 'Historique des créations',
    'Tokenomics': 'Économie du token',
    'Mint': 'Créer le token',
    'Mint NFT': 'Créer le NFT',
    'Inference Budget': 'Mémoire disponible pour l’inférence',
    'Average Performance': 'Performances moyennes',
    'Hardware Specifications': 'Caractéristiques matérielles',
    'Session': 'Session',
    'Generation': 'Génération',
    'Roleplay': 'Jeu de rôle',
    'Ownership and skills': 'Propriété et compétences',
    'Autonomy and network': 'Autonomie et réseau',
    'Show companion, scenario, content level, model, media toggles, and network mode.': 'Afficher le compagnon, le scénario, le niveau de contenu, le modèle, les médias et le mode réseau.',
    'List the full command menu in the current messaging client.': 'Afficher toutes les commandes dans la messagerie actuelle.',
    'Clear conversation history and restore the pre-roleplay model.': 'Effacer la conversation et restaurer le modèle utilisé avant le jeu de rôle.',
    'List available LLM models.': 'Afficher les modèles de langage disponibles.',
    'Load a specific local LLM.': 'Charger un modèle de langage local précis.',
    'Restore the model that was loaded before companion chat.': 'Restaurer le modèle chargé avant la discussion avec le compagnon.',
    'OpenAI-compatible endpoint for external tools.': 'Endpoint compatible OpenAI pour les outils externes.',
    'Webhook entry for OpenClaw and Hermes requests.': 'Point d’entrée webhook pour les requêtes OpenClaw et Hermes.',
    'List available companions.': 'Afficher les compagnons disponibles.',
    'Bind a companion to the current channel.': 'Associer un compagnon au canal actuel.',
    'List available scenarios.': 'Afficher les scénarios disponibles.',
    'Set the current scene.': 'Définir la scène actuelle.',
    'Toggle multimodal generation per channel.': 'Activer ou désactiver les générations multimodales pour ce canal.',
    'Set the content level.': 'Définir le niveau de contenu.',
    'Fast image generation with FLUX Klein.': 'Génération rapide d’images avec FLUX Klein.',
    'Quality image generation with Z-Image Turbo.': 'Génération d’images de qualité avec Z-Image Turbo.',
    'Standard SDXL image generation.': 'Génération d’images standard avec SDXL.',
    'Video generation with LTX-2.': 'Génération vidéo avec LTX-2.',
    'Fast TTS.': 'Synthèse vocale rapide.',
    'Quality Chatterbox V3 TTS.': 'Synthèse vocale de qualité avec Chatterbox V3.',
    'Music generation with ACE-Step.': 'Génération musicale avec ACE-Step.',
    'Analyze the attached image with Qwen3-VL.': 'Analyser l’image jointe avec Qwen3-VL.',
    'List BonzAI skills.': 'Afficher les compétences BonzAI.',
    'Show skill details.': 'Afficher les détails de la compétence.',
    'Execute a skill.': 'Exécuter une compétence.',
    'Toggle autonomous mode.': 'Activer ou désactiver le mode autonome.',
    'Show current autonomous configuration.': 'Afficher la configuration autonome actuelle.',
    'Configure idle, interval, or max behavior.': 'Configurer l’inactivité, l’intervalle ou la limite maximale.',
    'Show mode, providers, pipelines, and peer routing.': 'Afficher le mode, les fournisseurs, les pipelines et le routage entre pairs.',
    'Alias for network status.': 'Alias de l’état du réseau.',
  },
}
const originalText = new WeakMap()
const renderedText = new WeakMap()
const renderedAttributes = new WeakMap()
const originalAttributes = new WeakMap()
const ignoredSelector = [
  '[data-i18n-skip]',
  'option',
  '[contenteditable="true"]',
  '.chat-message',
  '.company-switcher__name',
  '.company-workspace-nav__identity',
  '.all-message__content p',
  '.all-message__meta strong',
  '.team-tag',
  '.goal-message__body p',
  '.chat-message .message-content',
  '.generation-result',
  '.generated-content',
  '.memory-detail__text',
  'pre',
  'code',
].join(',')

function translated(source) {
  if (/\bmint\b/i.test(source)) return source;
  if (i18n.state.locale === 'en') return source
  const reviewed = reviewedCatalogOverrides[i18n.state.locale]?.[source] || reviewedOverrides[i18n.state.locale]?.[source]
  if (reviewed) return reviewed
  const row = rowByEnglish.get(source)
  return row?.[localeIndex[i18n.state.locale]] || generatedCatalog[i18n.state.locale]?.[source] || source
}

function hasTranslation(source) {
  return isSafeLegacyPhrase(source) && (
    Boolean(reviewedCatalogOverrides[i18n.state.locale]?.[source]) ||
    Boolean(reviewedOverrides[i18n.state.locale]?.[source]) ||
    rowByEnglish.has(source) ||
    Boolean(generatedCatalog.en?.[source])
  )
}

function isSafeLegacyPhrase(source) {
  return isSafeCatalogPhrase(source)
}

function isIgnored(element) {
  return !element || element.closest?.(ignoredSelector)
}

function translateTextNode(node) {
  const parent = node.parentElement
  if (isIgnored(parent)) return
  const current = node.nodeValue || ''
  const leading = current.match(/^\s*/)?.[0] || ''
  const trailing = current.match(/\s*$/)?.[0] || ''
  const visible = current.trim()
  const previous=renderedText.get(node)
  const source = previous!=null && previous!==visible ? visible : originalText.get(node) || visible
  if (!hasTranslation(source)) { originalText.delete(node); renderedText.delete(node); return }
  originalText.set(node, source)
  const next = translated(source)
  renderedText.set(node,next)
  const value = `${leading}${next}${trailing}`
  if (current !== value) node.nodeValue = value
}

function translateAttributes(element) {
  if (isIgnored(element)) return
  const names = ['placeholder', 'title', 'aria-label']
  const known = originalAttributes.get(element) || {}
  const rendered = renderedAttributes.get(element) || {}
  let touched = false
  for (const name of names) {
    const current = element.getAttribute?.(name)
    if (!current) continue
    const source = rendered[name]!=null && rendered[name]!==current ? current : known[name] || current
    if (!hasTranslation(source)) { delete known[name]; delete rendered[name]; continue }
    known[name] = source
    touched = true
    const next = translated(source)
    rendered[name]=next
    if (current !== next) element.setAttribute(name, next)
  }
  if (touched) { originalAttributes.set(element, known); renderedAttributes.set(element,rendered) }
}

function translateTree(root) {
  if (!root) return
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root)
    return
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return
  if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) translateTextNode(node)
    else translateAttributes(node)
    node = walker.nextNode()
  }
}

export function installLegacyI18nBridge(root) {
  let applying = false
  const apply = target => {
    if (applying) return
    applying = true
    try { translateTree(target) } finally { applying = false }
  }
  apply(root)
  const observer = new MutationObserver(mutations => {
    if (applying) return
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') apply(mutation.target)
      if (mutation.type === 'attributes') apply(mutation.target)
      for (const node of mutation.addedNodes || []) apply(node)
    }
  })
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['placeholder', 'title', 'aria-label'],
  })
  const onLocale = () => apply(root)
  window.addEventListener('bonzai:locale-changed', onLocale)
  return () => {
    observer.disconnect()
    window.removeEventListener('bonzai:locale-changed', onLocale)
  }
}
