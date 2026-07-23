import { i18n } from './index.js'
import generatedCatalog from './generated-ui.json'

// Exact UI phrases used by older screens while they migrate to explicit $t keys.
// Keep this list limited to interface chrome: never translate generated or user content.
const rows = [
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
const originalText = new WeakMap()
const originalAttributes = new WeakMap()
const ignoredSelector = [
  '[contenteditable="true"]',
  '.chat-message',
  '.chat-message .message-content',
  '.generation-result',
  '.generated-content',
  '.memory-detail__text',
  'pre',
  'code',
].join(',')

function translated(source) {
  if (i18n.state.locale === 'en') return source
  const row = rowByEnglish.get(source)
  return row?.[localeIndex[i18n.state.locale]] || generatedCatalog[i18n.state.locale]?.[source] || source
}

function hasTranslation(source) {
  return rowByEnglish.has(source) || Boolean(generatedCatalog.en?.[source])
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
  const source = originalText.get(node) || visible
  if (!hasTranslation(source)) return
  originalText.set(node, source)
  const next = translated(source)
  const value = `${leading}${next}${trailing}`
  if (current !== value) node.nodeValue = value
}

function translateAttributes(element) {
  if (isIgnored(element)) return
  const names = ['placeholder', 'title', 'aria-label']
  const known = originalAttributes.get(element) || {}
  let touched = false
  for (const name of names) {
    const current = element.getAttribute?.(name)
    if (!current) continue
    const source = known[name] || current
    if (!hasTranslation(source)) continue
    known[name] = source
    touched = true
    const next = translated(source)
    if (current !== next) element.setAttribute(name, next)
  }
  if (touched) originalAttributes.set(element, known)
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
