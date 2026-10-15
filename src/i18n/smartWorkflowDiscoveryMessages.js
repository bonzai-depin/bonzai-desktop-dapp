// Discovery copy is shared by the pre-purchase catalog and its detail panels.
const locales = ['fr', 'es', 'ja', 'ko', 'zh', 'ru'];
const rows = [
 ['Create, explore, get things done.', 'Créez, explorez, avancez.', 'Crea, explora y avanza.', '作る、探る、進める。', '만들고, 탐색하고, 완성하세요.', '创作、探索、完成目标。', 'Создавайте, исследуйте, действуйте.'],
 ['From a personal meditation to a maintenance operation: choose a workflow, give it your inputs, and keep the results.', 'D’une méditation personnelle à une intervention de maintenance : choisissez un workflow, fournissez vos éléments et retrouvez vos résultats.', 'Desde una meditación personal hasta una intervención de mantenimiento: elige un workflow, aporta tus datos y conserva los resultados.', '自分のための瞑想から保守作業まで。ワークフローを選び、必要な情報を渡し、結果を保存できます。', '개인 명상부터 유지보수 업무까지: 워크플로를 선택하고 자료를 제공한 뒤 결과를 보관하세요.', '从个人冥想到维护作业：选择工作流、提供所需内容并保存结果。', 'От личной медитации до обслуживания оборудования: выберите процесс, добавьте данные и сохраните результаты.'],
 ['Explore before you unlock', 'Explorez avant de débloquer', 'Explora antes de desbloquear', '購入前に確認', '잠금 해제 전에 살펴보기', '解锁前先探索', 'Изучите перед покупкой'],
 ['Choose the result you want. Every template below is available in this installation.', 'Choisissez le résultat souhaité. Tous les modèles ci-dessous sont disponibles dans cette installation.', 'Elige el resultado que buscas. Todas las plantillas de abajo están disponibles en esta instalación.', '必要な結果を選びましょう。以下のテンプレートはこのアプリで利用できます。', '원하는 결과를 선택하세요. 아래 템플릿은 모두 이 설치에서 사용할 수 있습니다.', '选择想要的结果。以下模板均可在此安装中使用。', 'Выберите нужный результат. Все шаблоны ниже доступны в этой установке.'],
 ['Search workflows or results', 'Rechercher un workflow ou un résultat', 'Buscar workflows o resultados', 'ワークフローや結果を検索', '워크플로 또는 결과 검색', '搜索工作流或结果', 'Поиск процессов и результатов'],
 ['You provide', 'Vous fournissez', 'Tú aportas', '用意するもの', '제공할 자료', '您提供', 'Что вы добавляете'],
 ['You get', 'Vous obtenez', 'Tú obtienes', '得られるもの', '받을 결과', '您获得', 'Что вы получаете'],
 ['Before you start', 'Avant de commencer', 'Antes de empezar', '開始前に', '시작하기 전에', '开始之前', 'Перед началом'],
 ['Models are downloaded separately when needed. Download size and device requirements are shown before installation.', 'Les modèles se téléchargent séparément si nécessaire. Leur taille et les prérequis de l’appareil sont affichés avant l’installation.', 'Los modelos se descargan por separado cuando hacen falta. El tamaño y los requisitos se muestran antes de instalarlos.', '必要に応じてモデルを別途ダウンロードします。サイズとデバイス要件はインストール前に表示されます。', '필요한 모델은 별도로 다운로드합니다. 설치 전에 용량과 기기 요구 사항이 표시됩니다.', '模型按需单独下载。安装前会显示下载大小及设备要求。', 'При необходимости модели загружаются отдельно. Размер и требования к устройству показаны перед установкой.'],
 ['Start with your files and instructions. Connect outside tools only when the work needs them.', 'Commencez avec vos fichiers et consignes. Connectez des outils externes uniquement lorsque le travail le nécessite.', 'Empieza con tus archivos e instrucciones. Conecta herramientas externas solo cuando las necesites.', 'ファイルと指示から始められます。外部ツールは作業に必要な場合だけ接続します。', '파일과 지시 사항으로 시작하세요. 작업에 필요한 경우에만 외부 도구를 연결하세요.', '从您的文件和说明开始。仅在任务需要时连接外部工具。', 'Начните с файлов и указаний. Подключайте внешние инструменты только при необходимости.'],
 ['Review before sharing or sending.', 'Vérifiez avant de partager ou d’envoyer.', 'Revisa antes de compartir o enviar.', '共有や送信の前に確認。', '공유하거나 보내기 전에 검토하세요.', '分享或发送前请先检查。', 'Проверьте перед отправкой или публикацией.'],
 ['Use this template', 'Utiliser ce modèle', 'Usar esta plantilla', 'このテンプレートを使う', '이 템플릿 사용', '使用此模板', 'Использовать шаблон'],
 ['See unlock options', 'Voir les options de déblocage', 'Ver opciones de desbloqueo', '購入方法を表示', '잠금 해제 옵션 보기', '查看解锁选项', 'Варианты разблокировки'],
 ['Try the guided demo', 'Essayer la démo guidée', 'Probar la demo guiada', 'ガイド付きデモを試す', '가이드 데모 체험', '试用引导演示', 'Попробовать демо'],
 ['Show all workflows', 'Afficher tous les workflows', 'Mostrar todos los workflows', 'すべてのワークフローを表示', '모든 워크플로 보기', '显示所有工作流', 'Все процессы'],
 ['No matching workflows', 'Aucun workflow correspondant', 'No hay workflows coincidentes', '一致するワークフローがありません', '일치하는 워크플로 없음', '没有匹配的工作流', 'Процессы не найдены'],
 ['Clear filters', 'Effacer les filtres', 'Borrar filtros', '絞り込みを解除', '필터 지우기', '清除筛选', 'Сбросить фильтры'],
 ['One unlock. All your workflows.', 'Un déblocage. Tous vos workflows.', 'Un desbloqueo. Todos tus workflows.', '一度の購入ですべてのワークフロー。', '한 번 해제로 모든 워크플로를.', '一次解锁，使用全部工作流。', 'Одна покупка. Все ваши процессы.'],
 ['Create workspaces, run tasks, review results and keep your projects organized. Personal local generation remains free.', 'Créez des espaces, lancez des tâches, vérifiez les résultats et organisez vos projets. La génération locale personnelle reste gratuite.', 'Crea espacios, ejecuta tareas, revisa resultados y organiza tus proyectos. La generación local personal sigue siendo gratuita.', 'ワークスペースの作成、タスクの実行、結果の確認、プロジェクトの整理ができます。個人向けのローカル生成は引き続き無料です。', '작업 공간을 만들고 작업을 실행하고 결과를 검토하며 프로젝트를 정리하세요. 개인 로컬 생성은 계속 무료입니다.', '创建工作区、执行任务、审核结果并整理项目。个人本地生成仍然免费。', 'Создавайте рабочие области, запускайте задачи, проверяйте результаты и организуйте проекты. Личная локальная генерация остаётся бесплатной.'],
 ['Browse now, decide later.', 'Explorez maintenant, décidez ensuite.', 'Explora ahora, decide después.', 'まず確認、購入はその後。', '먼저 살펴보고 나중에 결정하세요.', '先探索，再决定。', 'Сначала изучите, потом решайте.'],
 ['Your existing results remain readable and exportable without unlocking.', 'Vos résultats existants restent consultables et exportables sans déblocage.', 'Tus resultados existentes siguen disponibles para consultar y exportar sin desbloquear.', '購入しなくても既存の結果の閲覧とエクスポートはできます。', '잠금 해제 없이도 기존 결과를 보고 내보낼 수 있습니다.', '无需解锁，仍可查看和导出现有结果。', 'Существующие результаты доступны для чтения и экспорта без покупки.'],
 ['Loading available workflows…', 'Chargement des workflows disponibles…', 'Cargando workflows disponibles…', '利用可能なワークフローを読み込み中…', '사용 가능한 워크플로를 불러오는 중…', '正在加载可用工作流…', 'Загрузка доступных процессов…'],
 ['The installed workflow catalog could not be loaded. Operational templates remain available below.', 'Impossible de charger le catalogue des workflows installés. Les modèles opérationnels restent disponibles ci-dessous.', 'No se pudo cargar el catálogo instalado. Las plantillas operativas siguen disponibles abajo.', 'インストール済みワークフローを読み込めませんでした。業務テンプレートは以下から利用できます。', '설치된 워크플로 목록을 불러오지 못했습니다. 아래 업무 템플릿은 계속 사용할 수 있습니다.', '无法加载已安装的工作流目录。以下业务模板仍可使用。', 'Не удалось загрузить установленные процессы. Рабочие шаблоны доступны ниже.'],
 ['Smart Workflows unlocked', 'Smart Workflows débloqué', 'Smart Workflows desbloqueado', 'Smart Workflows 購入済み', 'Smart Workflows 잠금 해제됨', 'Smart Workflows 已解锁', 'Smart Workflows разблокирован'],
 ['Available workflows', 'Workflows disponibles', 'Workflows disponibles', '利用可能なワークフロー', '사용 가능한 워크플로', '可用工作流', 'Доступные процессы'],
 ['Your instructions', 'Vos consignes', 'Tus instrucciones', 'あなたの指示', '작업 지시', '您的说明', 'Ваши указания'],
 ['Source documents', 'Documents sources', 'Documentos de origen', '元の資料', '원본 문서', '源文件', 'Исходные документы'],
];
export const smartWorkflowDiscoveryMessages = Object.fromEntries(locales.map((locale, index) => [locale, Object.fromEntries(rows.map(([key, ...values]) => [key, values[index]]))]));
const inputRows = [
 ['Equipment and sites', 'Équipements et sites', 'Equipos e instalaciones', '設備と拠点', '장비 및 현장', '设备与场地', 'Оборудование и объекты'],
 ['Service requests', 'Demandes d’intervention', 'Solicitudes de servicio', 'サービス依頼', '서비스 요청', '服务请求', 'Заявки на обслуживание'],
 ['Application details', 'Informations du dossier', 'Datos de la solicitud', '申請情報', '신청 정보', '申请详情', 'Данные заявки'],
 ['Supporting documents', 'Pièces justificatives', 'Documentos justificativos', '証明資料', '증빙 서류', '证明文件', 'Подтверждающие документы'],
 ['Parts requests', 'Demandes de pièces', 'Solicitudes de piezas', '部品の依頼', '부품 요청', '零件请求', 'Заявки на запчасти'],
 ['Supplier quotations', 'Devis fournisseurs', 'Presupuestos de proveedores', '仕入先の見積もり', '공급업체 견적', '供应商报价', 'Предложения поставщиков'],
 ['Customer enquiries', 'Demandes des clients', 'Consultas de clientes', '顧客の問い合わせ', '고객 문의', '客户咨询', 'Запросы клиентов'],
 ['Product and service information', 'Informations sur les produits et services', 'Información de productos y servicios', '商品・サービス情報', '제품 및 서비스 정보', '产品与服务信息', 'Информация о продуктах и услугах'],
 ['Prospect details', 'Informations sur les prospects', 'Datos de clientes potenciales', '見込み客の情報', '잠재 고객 정보', '潜在客户信息', 'Данные потенциальных клиентов'],
 ['Previous conversations', 'Échanges précédents', 'Conversaciones anteriores', '過去のやり取り', '이전 대화', '先前对话', 'Предыдущие переписки'],
 ['Approved work', 'Travaux validés', 'Trabajo aprobado', '承認済みの作業', '승인된 작업', '已批准的工作', 'Одобренная работа'],
 ['Customer and invoice details', 'Informations du client et de facturation', 'Datos del cliente y de la factura', '顧客・請求情報', '고객 및 청구 정보', '客户与发票信息', 'Данные клиента и счёта'],
 ['Unpaid invoices', 'Factures impayées', 'Facturas pendientes', '未払い請求書', '미지급 청구서', '未付款发票', 'Неоплаченные счета'],
 ['Payment history', 'Historique des paiements', 'Historial de pagos', '支払い履歴', '결제 기록', '付款历史', 'История платежей'],
 ['Invoices', 'Factures', 'Facturas', '請求書', '청구서', '发票', 'Счета'],
 ['Payment records', 'Relevés de paiement', 'Registros de pagos', '支払い記録', '결제 내역', '付款记录', 'Платёжные записи'],
 ['Activity records', 'Données d’activité', 'Registros de actividad', '活動記録', '활동 기록', '活动记录', 'Записи об активности'],
 ['Reporting period', 'Période du rapport', 'Periodo del informe', '報告期間', '보고 기간', '报告期间', 'Отчётный период'],
 ['Reservations', 'Réservations', 'Reservas', '予約', '예약', '预订', 'Бронирования'],
 ['Property details', 'Informations du logement', 'Datos del alojamiento', '物件情報', '숙소 정보', '房产详情', 'Данные объекта'],
 ['Guest messages', 'Messages des voyageurs', 'Mensajes de huéspedes', 'ゲストのメッセージ', '투숙객 메시지', '住客消息', 'Сообщения гостей'],
 ['Repair requests', 'Demandes de réparation', 'Solicitudes de reparación', '修理依頼', '수리 요청', '维修请求', 'Заявки на ремонт'],
 ['Stay activity', 'Activité des séjours', 'Actividad de las estancias', '宿泊状況', '숙박 활동', '入住活动', 'Сведения о проживании'],
 ['Intention', 'Intention', 'Intención', '目的', '목적', '意图', 'Намерение'],
 ['Minutes', 'Minutes', 'Minutos', '分', '분', '分钟', 'Минуты'],
 ['Setting', 'Ambiance', 'Entorno', '情景', '환경', '场景', 'Обстановка'],
 ['Text', 'Texte', 'Texto', 'テキスト', '텍스트', '文本', 'Текст'],
 ['Images', 'Images', 'Imágenes', '画像', '이미지', '图片', 'Изображения'],
 ['Image analysis', 'Analyse d’images', 'Análisis de imágenes', '画像解析', '이미지 분석', '图像分析', 'Анализ изображений'],
 ['Forecasting', 'Prévision', 'Previsión', '予測', '예측', '预测', 'Прогнозирование'],
];
for (const [key, ...values] of inputRows) locales.forEach((locale, index) => { smartWorkflowDiscoveryMessages[locale][key] = values[index]; });
const setupRows = [
 ['Narration currently uses English voices. Artwork is needed for video export.', 'La narration utilise actuellement des voix anglaises. Une illustration est nécessaire pour exporter la vidéo.', 'La narración utiliza actualmente voces en inglés. Se necesita una imagen para exportar el vídeo.', 'ナレーションは現在英語の音声を使用します。動画のエクスポートには画像が必要です。', '현재 내레이션은 영어 음성을 사용합니다. 동영상 내보내기에는 이미지가 필요합니다.', '旁白目前使用英语语音。导出视频需要插图。', 'Сейчас озвучка использует английские голоса. Для экспорта видео нужна иллюстрация.'],
 ['Creates visual descriptions, not speech transcription.', 'Produit des descriptions visuelles, pas une transcription de la parole.', 'Crea descripciones visuales, no transcripciones del habla.', '映像を説明するもので、音声の書き起こしではありません。', '영상 설명을 만들며 음성을 받아쓰지는 않습니다.', '生成画面描述，而非语音转录。', 'Создаёт описания изображения, а не расшифровку речи.'],
 ['Requires a Twitch or TikTok chat connection and OBS. Paid audience requests are not available.', 'Nécessite une connexion au chat Twitch ou TikTok et OBS. Les demandes payantes du public ne sont pas disponibles.', 'Requiere una conexión al chat de Twitch o TikTok y OBS. Las solicitudes de pago del público no están disponibles.', 'Twitch または TikTok のチャット接続と OBS が必要です。有料の視聴者リクエストには対応していません。', 'Twitch 또는 TikTok 채팅 연결과 OBS가 필요합니다. 유료 시청자 요청은 지원하지 않습니다.', '需要连接 Twitch 或 TikTok 聊天及 OBS。暂不支持付费观众请求。', 'Нужны подключение к чату Twitch или TikTok и OBS. Платные запросы зрителей недоступны.'],
 ['Requires a configured brokerage connection. Account changes always need your approval.', 'Nécessite une connexion configurée au courtier. Toute modification du compte demande votre accord.', 'Requiere una conexión configurada al bróker. Los cambios en la cuenta siempre requieren tu aprobación.', '設定済みの証券会社への接続が必要です。口座の変更には必ず承認が必要です。', '설정된 증권사 연결이 필요합니다. 계좌 변경에는 항상 승인이 필요합니다.', '需要配置券商连接。账户变更始终需要您的批准。', 'Необходимо настроенное подключение к брокеру. Изменения счёта всегда требуют вашего одобрения.'],
 ['Condition is an estimate. Market price references currently cover Pokémon cards.', 'L’état est une estimation. Les références de prix couvrent actuellement les cartes Pokémon.', 'El estado es una estimación. Las referencias de precios cubren actualmente cartas Pokémon.', '状態は推定です。市場価格の参照は現在ポケモンカードに対応しています。', '상태는 추정치입니다. 현재 시세 참조는 포켓몬 카드에 제공됩니다.', '品相为估计值。市场价格参考目前涵盖宝可梦卡牌。', 'Состояние оценивается приблизительно. Рыночные цены сейчас доступны для карт Pokémon.'],
 ['Requires market data. Forecasts are estimates, not guaranteed outcomes.', 'Nécessite des données de marché. Les prévisions sont des estimations, sans résultat garanti.', 'Requiere datos de mercado. Las previsiones son estimaciones, no resultados garantizados.', '市場データが必要です。予測は推定であり、結果を保証するものではありません。', '시장 데이터가 필요합니다. 예측은 추정치이며 결과를 보장하지 않습니다.', '需要市场数据。预测仅为估计值，不保证结果。', 'Нужны рыночные данные. Прогнозы являются оценками и не гарантируют результат.'],
 ['Video Source', 'Vidéo source', 'Vídeo de origen', '元の動画', '원본 동영상', '源视频', 'Исходное видео'],
 ['Gesture clip', 'Vidéo du geste', 'Vídeo del gesto', 'ジェスチャー動画', '제스처 영상', '手势视频', 'Видео жеста'],
];
for (const [key, ...values] of setupRows) locales.forEach((locale, index) => { smartWorkflowDiscoveryMessages[locale][key] = values[index]; });
const overviewRows = [
 ['Open workflow', 'Ouvrir le workflow', 'Abrir workflow', 'ワークフローを開く', '워크플로 열기', '打开工作流', 'Открыть процесс'],
 ['Every active operational team', 'Toutes les équipes opérationnelles actives', 'Todos los equipos operativos activos', '稼働中のすべての業務チーム', '모든 활성 업무 팀', '所有活跃业务团队', 'Все активные рабочие команды'],
 ['Active operational teams', 'Équipes opérationnelles actives', 'Equipos operativos activos', '稼働中の業務チーム', '활성 업무 팀', '活跃业务团队', 'Активные рабочие команды'],
];
for (const [key, ...values] of overviewRows) locales.forEach((locale, index) => { smartWorkflowDiscoveryMessages[locale][key] = values[index]; });
const resultNavigationRows = [
 ['View results', 'Voir les résultats', 'Ver resultados', '結果を表示', '결과 보기', '查看结果', 'Посмотреть результаты'],
];
for (const [key, ...values] of resultNavigationRows) locales.forEach((locale, index) => { smartWorkflowDiscoveryMessages[locale][key] = values[index]; });
