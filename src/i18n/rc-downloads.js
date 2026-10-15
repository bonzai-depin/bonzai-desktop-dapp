export const rcDownloadMessages = {
  en: { rcDownloads: { loadModel: 'Load model', chooseModel: 'Choose another model', modelRequired: 'Model required', authRequired: 'Model access requires authentication. Add the required repository credentials in settings.', downloadFailed: 'Download failed. Retry to continue.' } },
  zh: { rcDownloads: { loadModel: '加载模型', chooseModel: '选择其他模型', modelRequired: '需要模型', authRequired: '访问模型需要身份验证。请在设置中添加所需的仓库凭据。', downloadFailed: '下载失败。请重试以继续。' } },
  ko: { rcDownloads: { loadModel: '모델 불러오기', chooseModel: '다른 모델 선택', modelRequired: '모델 필요', authRequired: '모델에 접근하려면 인증이 필요합니다. 설정에서 필요한 저장소 인증 정보를 추가하세요.', downloadFailed: '다운로드에 실패했습니다. 다시 시도하세요.' } },
  ja: { rcDownloads: { loadModel: 'モデルを読み込む', chooseModel: '別のモデルを選ぶ', modelRequired: 'モデルが必要です', authRequired: 'モデルへのアクセスには認証が必要です。設定で必要なリポジトリの認証情報を追加してください。', downloadFailed: 'ダウンロードに失敗しました。再試行してください。' } },
  es: { rcDownloads: { loadModel: 'Cargar modelo', chooseModel: 'Elegir otro modelo', modelRequired: 'Se necesita un modelo', authRequired: 'El acceso al modelo requiere autenticación. Añade las credenciales del repositorio en los ajustes.', downloadFailed: 'La descarga falló. Vuelve a intentarlo para continuar.' } },
  fr: { rcDownloads: { loadModel: 'Charger le modèle', chooseModel: 'Choisir un autre modèle', modelRequired: 'Modèle requis', authRequired: 'L’accès au modèle nécessite une authentification. Ajoutez les identifiants du dépôt dans les paramètres.', downloadFailed: 'Le téléchargement a échoué. Réessayez pour continuer.' } },
  ru: { rcDownloads: { loadModel: 'Загрузить модель', chooseModel: 'Выбрать другую модель', modelRequired: 'Требуется модель', authRequired: 'Для доступа к модели нужна авторизация. Добавьте учётные данные репозитория в настройках.', downloadFailed: 'Не удалось скачать. Повторите попытку, чтобы продолжить.' } },
};

// Download rows describe capabilities, never underlying model identifiers.
const categories = {
  en: ['language', 'image', 'audio', 'music', 'video', '3d', 'vision', 'forecasting', 'resources', 'downloading', 'completed', 'failed'],
  zh: ['语言', '图像', '音频', '音乐', '视频', '3d', '视觉', '预测', '资源', '下载中', '已完成', '失败'],
  ko: ['언어', '이미지', '오디오', '음악', '동영상', '3d', '시각', '예측', '리소스', '다운로드 중', '완료', '실패'],
  ja: ['言語', '画像', '音声', '音楽', '動画', '3d', '視覚', '予測', 'リソース', 'ダウンロード中', '完了', '失敗'],
  es: ['lenguaje', 'imagen', 'audio', 'música', 'vídeo', '3d', 'visión', 'previsión', 'recursos', 'descargando', 'completado', 'fallido'],
  fr: ['langage', 'image', 'audio', 'musique', 'vidéo', '3d', 'vision', 'prévision', 'ressources', 'téléchargement', 'terminé', 'échec'],
  ru: ['язык', 'изображения', 'аудио', 'музыка', 'видео', '3d', 'зрение', 'прогнозирование', 'ресурсы', 'скачивание', 'завершено', 'ошибка'],
};
for (const [locale, values] of Object.entries(categories)) {
  rcDownloadMessages[locale].rcDownloads.categories = Object.fromEntries(
    ['language', 'image', 'audio', 'music', 'video', '3d', 'vision', 'forecast', 'resources'].map((key, index) => [key, values[index]]),
  );
  Object.assign(rcDownloadMessages[locale].rcDownloads, { downloading: values[9], completed: values[10], failed: values[11] });
}
