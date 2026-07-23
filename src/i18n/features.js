const localeCodes = ['en', 'zh', 'ko', 'ja', 'es', 'fr', 'ru']
const phrase = (...values) => Object.fromEntries(localeCodes.map((code, index) => [code, values[index]]))

const phrases = {
  createEyebrow: phrase('Create', '创作', '만들기', '作成', 'Crear', 'Créer', 'Создать'),
  imageTitle: phrase('Generative Image', '图像生成', '이미지 생성', '画像生成', 'Imagen generativa', 'Image générative', 'Генерация изображений'),
  audioTitle: phrase('Generative Audio', '音频生成', '오디오 생성', '音声生成', 'Audio generativo', 'Audio génératif', 'Генерация аудио'),
  videoTitle: phrase('Generative Video', '视频生成', '비디오 생성', '動画生成', 'Video generativo', 'Vidéo générative', 'Генерация видео'),
  threeTitle: phrase('Generative 3D', '3D 生成', '3D 생성', '3D 生成', '3D generativo', '3D génératif', 'Генерация 3D'),
  history: phrase('Generation History', '生成历史', '생성 기록', '生成履歴', 'Historial de generaciones', 'Historique des générations', 'История генераций'),
  resolution: phrase('Resolution', '分辨率', '해상도', '解像度', 'Resolución', 'Résolution', 'Разрешение'),
  quality: phrase('Quality', '质量', '품질', '品質', 'Calidad', 'Qualité', 'Качество'),
  mode: phrase('Mode', '模式', '모드', 'モード', 'Modo', 'Mode', 'Режим'),
  duration: phrase('Duration', '时长', '길이', '長さ', 'Duración', 'Durée', 'Длительность'),
  downloadRequired: phrase('Download Required', '需要下载', '다운로드 필요', 'ダウンロードが必要です', 'Descarga necesaria', 'Téléchargement requis', 'Требуется скачивание'),
  generationFailed: phrase('Generation Failed', '生成失败', '생성 실패', '生成に失敗しました', 'Error de generación', 'Échec de la génération', 'Ошибка генерации'),
  downloading: phrase('Downloading', '正在下载', '다운로드 중', 'ダウンロード中', 'Descargando', 'Téléchargement', 'Скачивание'),
  noImages: phrase('No images yet', '暂无图像', '아직 이미지 없음', 'まだ画像はありません', 'Aún no hay imágenes', 'Aucune image', 'Пока нет изображений'),
  noImagesCopy: phrase('Generated images will appear here with reuse, edit, animate, mint, and download actions.', '生成的图像将显示在此，可重用、编辑、动画化、铸造和下载。', '생성된 이미지와 재사용, 편집, 애니메이션, 민팅, 다운로드 작업이 여기에 표시됩니다.', '生成画像と再利用・編集・アニメ化・ミント・保存操作がここに表示されます。', 'Las imágenes generadas aparecerán aquí con acciones para reutilizar, editar, animar, acuñar y descargar.', 'Les images générées apparaîtront ici avec les actions de réutilisation, modification, animation, mint et téléchargement.', 'Здесь появятся изображения и действия повтора, редактирования, анимации, минта и скачивания.'),
  ready: phrase('Ready to create', '随时可创作', '생성 준비 완료', '作成の準備完了', 'Listo para crear', 'Prêt à créer', 'Готово к созданию'),
  noOutputs: phrase('No outputs yet', '暂无作品', '아직 결과 없음', 'まだ出力はありません', 'Aún no hay resultados', 'Aucun résultat', 'Пока нет результатов'),
  negative: phrase('Negative prompt', '反向提示词', '부정 프롬프트', 'ネガティブプロンプト', 'Prompt negativo', 'Prompt négatif', 'Негативный промпт'),
  avoid: phrase('(things to avoid)', '（需要避免的内容）', '(피할 요소)', '（避けたい要素）', '(cosas que evitar)', '(éléments à éviter)', '(чего избегать)'),
  defaultPrompt: phrase('Describe what you want…', '描述你想要的内容…', '원하는 결과를 설명하세요…', '作りたいものを説明してください…', 'Describe lo que quieres…', 'Décrivez ce que vous voulez…', 'Опишите, что вы хотите…'),
  blurryPrompt: phrase('blurry, low quality, distorted…', '模糊、低质量、扭曲…', '흐림, 낮은 품질, 왜곡…', 'ぼやけ、低品質、歪み…', 'borroso, baja calidad, deformado…', 'flou, basse qualité, déformé…', 'размыто, низкое качество, искажения…'),
}

export const featureMessages = Object.fromEntries(localeCodes.map(code => [code, {
  workspace: {
    ready: phrases.ready[code],
    noOutputs: phrases.noOutputs[code],
    negative: phrases.negative[code],
    avoid: phrases.avoid[code],
    defaultPrompt: phrases.defaultPrompt[code],
    blurryPrompt: phrases.blurryPrompt[code],
  },
  create: {
    eyebrow: phrases.createEyebrow[code],
    imageTitle: phrases.imageTitle[code],
    audioTitle: phrases.audioTitle[code],
    videoTitle: phrases.videoTitle[code],
    threeTitle: phrases.threeTitle[code],
    history: phrases.history[code],
    resolution: phrases.resolution[code],
    quality: phrases.quality[code],
    mode: phrases.mode[code],
    duration: phrases.duration[code],
    downloadRequired: phrases.downloadRequired[code],
    generationFailed: phrases.generationFailed[code],
    downloading: phrases.downloading[code],
    noImages: phrases.noImages[code],
    noImagesCopy: phrases.noImagesCopy[code],
  },
}]))
