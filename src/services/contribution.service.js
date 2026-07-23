const CONTRIBUTION_LEDGER_KEY = 'bonzai-contribution-ledger-v1'
const CONTRIBUTION_PACK_SCHEMA = 'bonzai-contribution-pack'
const TRAINING_PROVENANCE_SCHEMA = 'bonzai-training-provenance-manifest'

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null || value === '') return []
  return [value]
}

function compact(value) {
  return value === undefined || value === null || value === '' ? undefined : value
}

function normalizeWallet(value) {
  const wallet = compact(value)
  return /^0x[a-fA-F0-9]{40}$/.test(wallet || '') ? wallet.toLowerCase() : undefined
}

function normalizeTags(record) {
  const raw = record.tags || record.keywords || record.labels || []
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String)
  if (typeof raw === 'string') return raw.split(',').map(t => t.trim()).filter(Boolean)
  return []
}

function contributionFromRecord(record) {
  return record.contribution || record.manifest || record.contribution_manifest || {}
}

function inferKind(record, contribution) {
  const asset = contribution.asset || {}
  if (asset.type) return asset.type
  if (record.kind) return record.kind
  if (record.type) return record.type
  if (record.video || record.video_url || record.frames || record.transcript) return 'dataset_video'
  if (record.audio || record.audio_url || record.waveform) return 'dataset_audio'
  if (record.image || record.image_url || record.image_base64) return 'dataset_image'
  if (record.text || record.content || record.caption || record.prompt) return 'dataset_text'
  return 'dataset_text'
}

function normalizeKind(kind) {
  const normalized = String(kind || '').toLowerCase()
  if (normalized === 'text') return 'dataset_text'
  if (normalized === 'image') return 'dataset_image'
  if (normalized === 'video') return 'dataset_video'
  if (normalized === 'audio') return 'dataset_audio'
  return normalized || 'dataset_text'
}

function pickText(record) {
  return compact(record.text)
    || compact(record.content)
    || compact(record.caption)
    || compact(record.description)
    || compact(record.prompt)
    || compact(record.transcript)
}

function defaultRoyaltyRoute({ creatorWallet, contributionId, contributionHash, royaltyBearing }) {
  if (!royaltyBearing || !creatorWallet) return undefined
  return [{
    wallet: creatorWallet,
    role: 'data_owner',
    weight: 1,
    contributionId,
    contributionHash,
  }]
}

export function normalizeContributionRecord(record) {
  if (!isObject(record)) return null

  const contribution = contributionFromRecord(record)
  const provenance = contribution.provenance || {}
  const permissions = contribution.permissions || {}
  const quality = contribution.quality || {}
  const asset = contribution.asset || {}
  const creator = contribution.creator || {}
  const kind = normalizeKind(inferKind(record, contribution))
  const tags = normalizeTags(record)
  const contributionId = compact(contribution.contributionId || contribution.id || record.contribution_id || record.id)
  const contributionHash = compact(provenance.contentHash || contribution.contentHash || record.content_hash)
  const creatorWallet = normalizeWallet(creator.wallet || creator.address || record.creator_wallet || record.wallet)
  const royaltyBearing = permissions.royaltyBearing === true || record.royalty_bearing === true
  const royaltyRoute = contribution.royaltyRoute || contribution.royalty_route || record.royalty_route
    || defaultRoyaltyRoute({
      creatorWallet,
      contributionId,
      contributionHash,
      royaltyBearing,
    })

  return {
    kind,
    text: pickText(record),
    image_url: compact(record.image_url || record.imageUrl || record.image),
    image_base64: compact(record.image_base64 || record.imageBase64),
    video_url: compact(record.video_url || record.videoUrl || record.video),
    audio_url: compact(record.audio_url || record.audioUrl || record.audio),
    transcript: compact(record.transcript),
    tags: tags.join(', '),
    rating: compact(record.rating),
    source_url: compact(record.source_url || record.sourceUrl || provenance.sourceUrl),
    page_title: compact(record.page_title || record.pageTitle || provenance.pageTitle),
    captured_at: compact(record.captured_at || record.capturedAt || provenance.capturedAt),
    contribution_id: contributionId,
    contribution_hash: contributionHash,
    contribution_license: compact(contribution.license || record.license),
    contribution_quality: compact(quality.score || record.quality_score),
    contribution_visibility: compact(contribution.visibility || record.visibility),
    contribution_task: compact(asset.taskTarget || record.task_target),
    contribution_model_target: compact(asset.modelTarget || record.model_target),
    contribution_role: compact(contribution.role || record.contribution_role),
    contribution_weight: compact(contribution.weight || contribution.contributionWeight || record.contribution_weight),
    contribution_parents: asArray(contribution.parents || contribution.parentIds || record.contribution_parents).filter(Boolean),
    royalty_route: royaltyRoute,
    bonzai_level_snapshot: contribution.bonzaiLevelSnapshot || contribution.bonzaiUtility?.level || record.bonzai_level_snapshot,
    training_allowed: permissions.trainingAllowed !== false,
    commercial_allowed: permissions.commercialAllowed === true,
    royalty_bearing: royaltyBearing,
    publishable: contribution.visibility === 'publishable' || permissions.publishable === true,
    redaction_status: compact(quality.redactionStatus || record.redaction_status),
    creator_wallet: creatorWallet,
    data_owner_wallet: creatorWallet,
    training_material_policy: {
      trainingAllowed: permissions.trainingAllowed !== false,
      commercialAllowed: permissions.commercialAllowed === true,
      royaltyBearing,
      downstreamRevenueRoute: royaltyRoute || [],
    },
    contribution_manifest: Object.keys(contribution).length ? contribution : undefined,
  }
}

function parseJsonl(text) {
  const rows = []
  for (const line of text.split('\n').filter(l => l.trim())) {
    try {
      const parsed = JSON.parse(line)
      if (isObject(parsed)) rows.push(parsed)
    } catch {
      // Keep parity with the previous importer: malformed lines are ignored.
    }
  }
  return rows
}

function isContributionPack(value) {
  return isObject(value)
    && (value.schema === CONTRIBUTION_PACK_SCHEMA || Array.isArray(value.records))
    && Array.isArray(value.records)
}

function previewColumns(rows) {
  const allKeys = new Set()
  rows.forEach(row => Object.keys(row).forEach(key => allKeys.add(key)))

  const priority = [
    'kind',
    'text',
    'image_url',
    'video_url',
    'transcript',
    'tags',
    'contribution_quality',
    'contribution_license',
    'source_url',
    'contribution_id',
  ]

  const ordered = [
    ...priority.filter(key => allKeys.has(key)),
    ...[...allKeys].filter(key => !priority.includes(key) && !key.includes('base64') && key !== 'contribution_manifest'),
  ]

  return ordered.slice(0, 6)
}

function summarizePack(pack, rows, skippedRecords) {
  const counts = rows.reduce((acc, row) => {
    acc.byKind[row.kind] = (acc.byKind[row.kind] || 0) + 1
    if (row.publishable) acc.publishable += 1
    if (row.training_allowed) acc.trainingAllowed += 1
    if (row.commercial_allowed) acc.commercialAllowed += 1
    if (row.royalty_bearing) acc.royaltyBearing += 1
    if (row.contribution_visibility === 'private') acc.private += 1
    return acc
  }, {
    byKind: {},
    publishable: 0,
    trainingAllowed: 0,
    commercialAllowed: 0,
    royaltyBearing: 0,
    private: 0,
  })

  const qualityScores = rows
    .map(row => Number(row.contribution_quality))
    .filter(score => Number.isFinite(score))

  const averageQuality = qualityScores.length
    ? Math.round(qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length)
    : null
  const dataOwnerWallets = Array.from(new Set(rows.map(row => row.data_owner_wallet || row.creator_wallet).filter(Boolean)))
  const royaltyRoutes = rows
    .flatMap(row => asArray(row.royalty_route))
    .filter(isObject)

  return {
    schema: pack.schema || CONTRIBUTION_PACK_SCHEMA,
    packId: pack.id || pack.packId || '',
    createdAt: pack.createdAt || pack.created_at || '',
    source: pack.source || 'BonzAI+',
    recordCount: rows.length,
    skippedRecords,
    averageQuality,
    dataOwnerCount: dataOwnerWallets.length,
    dataOwnerWallets: dataOwnerWallets.slice(0, 200),
    royaltyRouteCount: royaltyRoutes.length,
    ...counts,
  }
}

function validatePack(pack, rows, skippedRecords) {
  const warnings = []
  const errors = []

  if (!rows.length) errors.push('No training-allowed contribution records were found.')
  if (skippedRecords > 0) warnings.push(`${skippedRecords} record${skippedRecords === 1 ? ' was' : 's were'} marked as not allowed for training and skipped.`)

  const privateRows = rows.filter(row => row.contribution_visibility === 'private')
  if (privateRows.length) warnings.push(`${privateRows.length} private record${privateRows.length === 1 ? '' : 's'} can train locally but should not be published without review.`)

  const missingSource = rows.filter(row => !row.source_url)
  if (missingSource.length) warnings.push(`${missingSource.length} record${missingSource.length === 1 ? '' : 's'} are missing source URLs.`)

  const missingLicense = rows.filter(row => !row.contribution_license)
  if (missingLicense.length) warnings.push(`${missingLicense.length} record${missingLicense.length === 1 ? '' : 's'} are missing a license.`)

  const redactionNeeded = rows.filter(row => row.redaction_status && row.redaction_status !== 'clear')
  if (redactionNeeded.length) warnings.push(`${redactionNeeded.length} record${redactionNeeded.length === 1 ? '' : 's'} need redaction review before publishing.`)

  const lowQuality = rows.filter(row => Number(row.contribution_quality) > 0 && Number(row.contribution_quality) < 60)
  if (lowQuality.length) warnings.push(`${lowQuality.length} low-quality record${lowQuality.length === 1 ? '' : 's'} should be reviewed before training.`)

  const hashes = rows.map(row => row.contribution_hash).filter(Boolean)
  const duplicateHashes = hashes.filter((hash, index) => hashes.indexOf(hash) !== index)
  if (duplicateHashes.length) warnings.push(`${new Set(duplicateHashes).size} duplicate content hash${new Set(duplicateHashes).size === 1 ? '' : 'es'} detected.`)

  const royaltyRowsWithoutWallet = rows.filter(row => row.royalty_bearing && !(row.creator_wallet || row.data_owner_wallet))
  if (royaltyRowsWithoutWallet.length) {
    warnings.push(`${royaltyRowsWithoutWallet.length} royalty-bearing record${royaltyRowsWithoutWallet.length === 1 ? '' : 's'} are missing data owner wallets.`)
  }

  if (pack.schema && pack.schema !== CONTRIBUTION_PACK_SCHEMA) {
    warnings.push(`Pack schema is ${pack.schema}; expected ${CONTRIBUTION_PACK_SCHEMA}.`)
  }

  return { warnings, errors }
}

function buildTrainingRevenuePlan(rows) {
  const owners = new Map()
  rows.forEach(row => {
    const wallet = row.data_owner_wallet || row.creator_wallet
    if (!wallet || !row.royalty_bearing) return
    const current = owners.get(wallet) || {
      wallet,
      role: 'data_owner',
      contributionIds: [],
      qualityTotal: 0,
      records: 0,
      weight: 0,
    }
    current.contributionIds.push(row.contribution_id || row.contribution_hash)
    current.qualityTotal += Number(row.contribution_quality || 70)
    current.records += 1
    owners.set(wallet, current)
  })

  const participants = [...owners.values()].map(owner => ({
    ...owner,
    contributionIds: owner.contributionIds.filter(Boolean).slice(0, 100),
    averageQuality: Math.round(owner.qualityTotal / Math.max(1, owner.records)),
    weight: owner.records * (owner.qualityTotal / Math.max(1, owner.records)) / 100,
  }))
  const totalWeight = participants.reduce((sum, item) => sum + item.weight, 0)

  return {
    schema: 'bonzai-training-revenue-plan',
    version: 1,
    mode: 'proof-of-contribution',
    allocationBasis: 'royalty-bearing data owner contributions weighted by record count and quality',
    participants: participants.map(item => ({
      ...item,
      shareBps: totalWeight ? Math.round((item.weight / totalWeight) * 10000) : 0,
    })),
  }
}

function rowOrigin(row, index) {
  return {
    index,
    kind: row.kind,
    contributionId: row.contribution_id,
    contributionHash: row.contribution_hash,
    sourceUrl: row.source_url,
    pageTitle: row.page_title,
    capturedAt: row.captured_at,
    creatorWallet: row.creator_wallet || row.data_owner_wallet,
    dataOwnerWallet: row.data_owner_wallet || row.creator_wallet,
    license: row.contribution_license,
    visibility: row.contribution_visibility,
    qualityScore: Number(row.contribution_quality || 0) || null,
    royaltyBearing: row.royalty_bearing === true,
    trainingAllowed: row.training_allowed !== false,
    commercialAllowed: row.commercial_allowed === true,
    redactionStatus: row.redaction_status,
    tags: normalizeTags(row),
    textPreview: String(row.text || row.caption || row.transcript || '').slice(0, 240),
    media: {
      imageUrl: row.image_url,
      hasImageBase64: Boolean(row.image_base64),
      videoUrl: row.video_url,
      audioUrl: row.audio_url,
    },
  }
}

export function buildTrainingProvenanceManifest({
  rows = [],
  contributionPack = null,
  datasetType = '',
  datasetName = '',
  trainerWallet = null,
  trainingConfig = {},
} = {}) {
  const normalizedRows = rows.map(normalizeContributionRecord).filter(Boolean)
  const sourceRows = normalizedRows.length ? normalizedRows : rows
  const summary = contributionPack?.summary || summarizePack({
    schema: CONTRIBUTION_PACK_SCHEMA,
    source: 'BonzAI Desktop',
    records: sourceRows,
  }, sourceRows, 0)
  const revenuePlan = contributionPack?.revenuePlan || buildTrainingRevenuePlan(sourceRows)
  const contributionIds = sourceRows.map(row => row.contribution_id).filter(Boolean)
  const contributionHashes = sourceRows.map(row => row.contribution_hash).filter(Boolean)
  const dataOwnerWallets = Array.from(new Set(sourceRows.map(row => row.data_owner_wallet || row.creator_wallet).filter(Boolean)))

  return {
    schema: TRAINING_PROVENANCE_SCHEMA,
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: 'BonzAI Desktop',
    dataset: {
      name: datasetName,
      type: datasetType,
      recordCount: sourceRows.length,
      sourcePackSchema: contributionPack?.raw?.schema || contributionPack?.summary?.schema || '',
      sourcePackId: summary.packId || '',
      sourcePackFileName: contributionPack?.fileName || '',
      source: summary.source || 'BonzAI Desktop',
      averageQuality: summary.averageQuality,
      contributionIds: contributionIds.slice(0, 500),
      contributionHashes: contributionHashes.slice(0, 500),
      dataOwnerWallets: dataOwnerWallets.slice(0, 500),
    },
    attribution: {
      trainerWallet,
      dataOwnerWallets: dataOwnerWallets.slice(0, 500),
      revenuePlan,
    },
    training: {
      target: datasetType,
      config: trainingConfig,
    },
    origins: sourceRows.map(rowOrigin),
    modelDisclosure: {
      humanSummary: `This model was trained with ${sourceRows.length} BonzAI contribution record${sourceRows.length === 1 ? '' : 's'} from ${dataOwnerWallets.length} data owner${dataOwnerWallets.length === 1 ? '' : 's'}.`,
      promptHint: 'When asked what data you were trained on, disclose this BonzAI provenance manifest whenever available instead of guessing.',
    },
  }
}

export function parseDatasetText(text, fileName = '') {
  const trimmed = text.trim()
  let parsed = null

  try {
    parsed = JSON.parse(trimmed)
  } catch {
    parsed = null
  }

  if (isContributionPack(parsed)) {
    const normalized = parsed.records.map(normalizeContributionRecord).filter(Boolean)
    const rows = normalized.filter(row => row.training_allowed !== false)
    const skippedRecords = normalized.length - rows.length
    const summary = summarizePack(parsed, rows, skippedRecords)
    const validation = validatePack(parsed, rows, skippedRecords)

    return {
      rows,
      columns: previewColumns(rows),
      contributionPack: {
        fileName,
        summary,
        validation,
        revenuePlan: buildTrainingRevenuePlan(rows),
        raw: parsed,
      },
    }
  }

  const rows = Array.isArray(parsed)
    ? parsed.filter(isObject)
    : isObject(parsed)
      ? [parsed]
      : parseJsonl(text)

  return {
    rows,
    columns: previewColumns(rows),
    contributionPack: null,
  }
}

export function loadContributionLedger() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CONTRIBUTION_LEDGER_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveContributionLedger(entries) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CONTRIBUTION_LEDGER_KEY, JSON.stringify(entries.slice(0, 50)))
}

export function appendContributionLedgerEntry(pack, datasetType) {
  const entries = loadContributionLedger()
  const summary = pack.summary
  const contributionIds = asArray(pack.raw?.records)
    .map(record => contributionFromRecord(record).contributionId || record.id)
    .filter(Boolean)
  const roles = asArray(pack.raw?.records)
    .map(record => contributionFromRecord(record).role || record.contribution_role)
    .filter(Boolean)
  const parentCount = asArray(pack.raw?.records)
    .reduce((sum, record) => sum + asArray(contributionFromRecord(record).parents || record.contribution_parents).length, 0)
  const dataOwnerWallets = summary.dataOwnerWallets || []

  const entry = {
    id: `contribution-ledger-${Date.now()}`,
    importedAt: new Date().toISOString(),
    fileName: pack.fileName,
    source: summary.source,
    packId: summary.packId,
    packCreatedAt: summary.createdAt,
    recordCount: summary.recordCount,
    averageQuality: summary.averageQuality,
    datasetType,
    byKind: summary.byKind,
    publishable: summary.publishable,
    royaltyBearing: summary.royaltyBearing,
    dataOwnerCount: summary.dataOwnerCount || 0,
    dataOwnerWallets,
    downstreamRevenuePolicy: {
      mode: 'proof-of-contribution',
      allocationBasis: 'data-owner-wallet-plus-contribution-quality',
      note: 'Fine-tune revenue should route to creator/trainer plus data owners referenced by royalty-bearing training records.',
    },
    trainingProvenance: pack.revenuePlan
      ? {
        schema: TRAINING_PROVENANCE_SCHEMA,
        revenuePlan: pack.revenuePlan,
      }
      : null,
    contributionIds: contributionIds.slice(0, 200),
    roles: Array.from(new Set(roles)).slice(0, 20),
    parentCount,
    status: 'imported',
  }

  saveContributionLedger([entry, ...entries])
  return entry
}

export function updateContributionLedgerEntry(id, patch) {
  if (!id) return
  const entries = loadContributionLedger()
  const next = entries.map(entry => entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString() } : entry)
  saveContributionLedger(next)
}
