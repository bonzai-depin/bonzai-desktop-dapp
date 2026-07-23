import { web3Service } from './web3.service.js'

const USER_MEMORY_ID = 'default'
const MEMORY_KEY_PREFIX = 'bonzai-memory-v1'
const LOCAL_MEMORY_ID_KEY = 'bonzai-local-memory-id-v1'
const MAX_RAW_SOURCES = 500
const MAX_ATOMIC_NOTES = 1200
const MAX_LOG_ENTRIES = 800

function nowIso() {
  return new Date().toISOString()
}

function safeString(value, max = 4000) {
  if (value === undefined || value === null) return ''
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max)
}

function slug(value) {
  return safeString(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'untitled'
}

function stableId(prefix, parts = []) {
  const raw = parts.map(part => safeString(part, 200)).join('|')
  let hash = 0
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0
  }
  return `${prefix}-${Math.abs(hash).toString(36)}`
}

function storeApi() {
  return typeof window !== 'undefined' ? window.electronAPI?.store : null
}

function databaseMemoryApi() {
  return typeof window !== 'undefined' ? window.electronAPI?.db?.memory : null
}

function memoryKey(scope, id = USER_MEMORY_ID) {
  return `${MEMORY_KEY_PREFIX}:${scope}:${slug(id || USER_MEMORY_ID)}`
}

async function localMemoryId() {
  const api = storeApi()
  if (!api?.get || !api?.set) return 'local-browser'
  const existing = await api.get(LOCAL_MEMORY_ID_KEY, '')
  if (existing) return existing
  const next = `local-${crypto.randomUUID?.() || stableId('device', [Date.now(), Math.random()])}`
  await api.set(LOCAL_MEMORY_ID_KEY, next)
  return next
}

async function userMemoryIdentity() {
  const wallet = web3Service.state?.walletAddress
  if (wallet) {
    return {
      id: `wallet-${wallet.toLowerCase()}`,
      label: `Wallet ${wallet.slice(0, 6)}...${wallet.slice(-4)} Memory`,
      wallet,
      identityType: 'wallet',
    }
  }
  const localId = await localMemoryId()
  return {
    id: localId,
    label: 'Local User Memory',
    wallet: null,
    identityType: 'local',
  }
}

function companionMemoryIdentity(sessionOrCompanion = {}) {
  const companion = sessionOrCompanion.companion || sessionOrCompanion
  const tokenId = companion.tokenId || companion.nft?.tokenId || companion.companionTokenId
  const agentWallet = companion.agentWallet || companion.agentWalletAddress || companion.walletAddress
  const ownerWallet = companion.owner || companion.ownerWallet || companion.ownerAddress
  const id = tokenId
    ? `nft-${tokenId}`
    : agentWallet
      ? `agent-${agentWallet.toLowerCase()}`
      : companion.id || sessionOrCompanion.companionId

  return {
    id,
    label: `${companion.name || id} Memory`,
    companionName: companion.name || id,
    tokenId: tokenId || null,
    agentWallet: agentWallet || null,
    ownerWallet: ownerWallet || null,
    identityType: tokenId ? 'companion_nft' : agentWallet ? 'agent_wallet' : 'local_companion',
  }
}

function teamMemoryIdentity(company = {}, roleKey = null) {
  const companyId = company.id || company.companyId || company.name || 'team'
  const baseId = `company-${companyId}`
  const roleId = roleKey ? `${baseId}:role-${roleKey}` : baseId
  const roleLabel = roleKey ? ` - ${roleKey}` : ''

  return {
    id: roleId,
    label: `${company.name || 'Agentic Team'}${roleLabel} Memory`,
    companyId: company.id || null,
    companyName: company.name || null,
    roleKey: roleKey || null,
    identityType: roleKey ? 'team_role_memory' : 'team_memory',
  }
}

function createMemoryInstance(scope, id = USER_MEMORY_ID, metadata = {}) {
  const createdAt = nowIso()
  return {
    schema: 'bonzai-memory-instance',
    version: 1,
    scope,
    id: slug(id || USER_MEMORY_ID),
    label: metadata.label || (scope === 'user' ? 'User Memory' : `Companion ${id}`),
    createdAt,
    updatedAt: createdAt,
    architecture: {
      vault: 'obsidian-style-local-vault',
      notes: 'zettelkasten-atomic-linked-notes',
      maintainer: 'local-llm-maintainer-layer',
    },
    rawSources: [],
    atomicNotes: [],
    pages: {},
    backlinks: {},
    indexes: {
      people: [],
      projects: [],
      skills: [],
      companies: [],
      datasets: [],
      generations: [],
      contributions: [],
    },
    logs: [],
    reviewQueue: [],
    contributionParents: [],
    metadata,
  }
}

async function loadMemory(scope, id = USER_MEMORY_ID, metadata = {}) {
  const dbApi = databaseMemoryApi()
  if (dbApi?.load) {
    const persisted = await dbApi.load(scope, slug(id || USER_MEMORY_ID))
    if (persisted?.schema === 'bonzai-memory-instance') return persisted
  }
  const api = storeApi()
  if (!api?.get) return createMemoryInstance(scope, id, metadata)

  const existing = await api.get(memoryKey(scope, id), null)
  if (existing?.schema === 'bonzai-memory-instance') {
    const migrated = {
      ...createMemoryInstance(scope, id, metadata),
      ...existing,
      architecture: {
        ...createMemoryInstance(scope, id, metadata).architecture,
        ...(existing.architecture || {}),
      },
      indexes: {
        ...createMemoryInstance(scope, id, metadata).indexes,
        ...(existing.indexes || {}),
      },
    }
    if (dbApi?.save) {
      const saved = await dbApi.save(migrated)
      await api.delete?.(memoryKey(scope, id))
      return saved || migrated
    }
    return migrated
  }
  return createMemoryInstance(scope, id, metadata)
}

async function saveMemory(memory) {
  const dbApi = databaseMemoryApi()
  const api = storeApi()
  const trimmed = {
    ...memory,
    rawSources: (memory.rawSources || []).slice(0, MAX_RAW_SOURCES),
    atomicNotes: (memory.atomicNotes || []).slice(0, MAX_ATOMIC_NOTES),
    logs: (memory.logs || []).slice(0, MAX_LOG_ENTRIES),
    updatedAt: nowIso(),
  }
  if (dbApi?.save) return dbApi.save(trimmed)
  if (!api?.set) return trimmed
  await api?.set?.(memoryKey(trimmed.scope, trimmed.id), trimmed)
  return trimmed
}

export async function recallMemory(scope, id, query, limit = 12) {
  const dbApi = databaseMemoryApi()
  if (dbApi?.recall) return dbApi.recall(scope, slug(id || USER_MEMORY_ID), query, limit)
  const memory = await loadMemory(scope, id)
  const terms = safeString(query, 1000).toLowerCase().split(/\W+/).filter(term => term.length > 2)
  return (memory.atomicNotes || []).map(note => ({
    ...note,
    score: terms.reduce((score, term) => score + (String(note.text || '').toLowerCase().includes(term) ? 1 : 0), 0),
  })).filter(note => note.score > 0).sort((a, b) => b.score - a.score).slice(0, limit)
}

export async function buildRecallContext(query, options = {}) {
  const blocks = []
  const add = async (scope, identity) => {
    if (!identity?.id) return
    const notes = await recallMemory(scope, identity.id, query, options.limit || 8)
    if (notes.length) blocks.push(`${identity.label || scope}:\n${notes.map(note => `- ${note.text}`).join('\n')}`)
  }
  if (options.companion) await add('companion', companionMemoryIdentity(options.companion))
  if (options.company) {
    await add('team', teamMemoryIdentity(options.company))
    if (options.roleKey) await add('team', teamMemoryIdentity(options.company, options.roleKey))
  }
  if (options.includeUser !== false) await add('user', await userMemoryIdentity())
  return blocks.length ? `Relevant local memory (use only when helpful):\n${blocks.join('\n\n')}` : ''
}

export function exportObsidianVault(memory) {
  const files = []
  for (const page of Object.values(memory?.pages || {})) {
    const linkedNotes = (page.noteIds || []).map(id => memory.atomicNotes?.find(note => note.id === id)).filter(Boolean)
    files.push({
      path: `${page.type || 'notes'}/${slug(page.title)}.md`,
      content: `---\ntype: ${page.type || 'page'}\nupdated: ${page.updatedAt || nowIso()}\n---\n\n# ${page.title}\n\n${page.summary || ''}\n\n${linkedNotes.map(note => `- ${note.text} ^${note.id}`).join('\n')}`,
    })
  }
  return files
}

function pageId(type, title) {
  return `${type}:${slug(title)}`
}

function upsertPage(memory, type, title, patch = {}) {
  const id = pageId(type, title)
  const previous = memory.pages[id] || {
    id,
    type,
    title: safeString(title, 160) || type,
    summary: '',
    noteIds: [],
    sourceIds: [],
    createdAt: nowIso(),
  }
  memory.pages[id] = {
    ...previous,
    ...patch,
    updatedAt: nowIso(),
    noteIds: Array.from(new Set([...(previous.noteIds || []), ...(patch.noteIds || [])])).slice(-120),
    sourceIds: Array.from(new Set([...(previous.sourceIds || []), ...(patch.sourceIds || [])])).slice(-120),
  }
  return id
}

function addIndex(memory, indexName, value) {
  if (!value) return
  const list = memory.indexes[indexName] || []
  memory.indexes[indexName] = Array.from(new Set([safeString(value, 120), ...list])).slice(0, 200)
}

function appendBacklink(memory, fromId, toId) {
  if (!fromId || !toId) return
  const links = memory.backlinks[fromId] || []
  memory.backlinks[fromId] = Array.from(new Set([toId, ...links])).slice(0, 80)
}

function contributionParent(source) {
  return source.contributionId || source.contribution_id || source.contributionHash || source.contentHash || null
}

function makeAtomicNote(memory, source, text, kind = 'observation', links = []) {
  const noteText = safeString(text, 1000)
  if (!noteText) return null

  const id = stableId('note', [memory.scope, memory.id, source.sourceId, kind, noteText])
  const existing = memory.atomicNotes.find(note => note.id === id)
  if (existing) return existing

  const note = {
    id,
    kind,
    text: noteText,
    sourceId: source.sourceId,
    links,
    createdAt: nowIso(),
    confidence: source.confidence || 'observed',
  }
  memory.atomicNotes = [note, ...(memory.atomicNotes || [])]
  for (const link of links) appendBacklink(memory, id, link)
  return note
}

function inferGenerationSummary(record) {
  const type = record.type || 'generation'
  const prompt = record.question || record.prompt || ''
  const outputText = record.answer?.text || record.outputText || record.notes || ''
  const pipeline = record.pipeline || record.model || record.mode || ''
  return `${type} generation: ${safeString(prompt, 260)}${outputText ? ` -> ${safeString(outputText, 260)}` : ''}${pipeline ? ` (${pipeline})` : ''}`
}

async function ingestSource(scope, id, source, metadata = {}) {
  const memory = await loadMemory(scope, id, metadata)
  const sourceId = source.sourceId || stableId('source', [scope, id, source.type, source.recordId, source.text, source.createdAt])
  const normalizedSource = {
    ...source,
    sourceId,
    type: source.type || 'event',
    createdAt: source.createdAt || nowIso(),
    ingestedAt: nowIso(),
  }

  const existingIndex = (memory.rawSources || []).findIndex(item => item.sourceId === sourceId)
  if (existingIndex >= 0) {
    memory.rawSources[existingIndex] = {
      ...memory.rawSources[existingIndex],
      ...normalizedSource,
      updatedAt: nowIso(),
    }
  } else {
    memory.rawSources = [normalizedSource, ...(memory.rawSources || [])]
  }

  const parent = contributionParent(normalizedSource)
  if (parent) {
    memory.contributionParents = Array.from(new Set([parent, ...(memory.contributionParents || [])])).slice(0, 500)
    addIndex(memory, 'contributions', parent)
  }

  const pageLinks = []
  if (normalizedSource.companionName) {
    const pid = upsertPage(memory, 'person', normalizedSource.companionName, { sourceIds: [sourceId] })
    pageLinks.push(pid)
    addIndex(memory, 'people', normalizedSource.companionName)
  }
  if (normalizedSource.project) {
    const pid = upsertPage(memory, 'project', normalizedSource.project, { sourceIds: [sourceId] })
    pageLinks.push(pid)
    addIndex(memory, 'projects', normalizedSource.project)
  }
  if (normalizedSource.skill) {
    const pid = upsertPage(memory, 'skill', normalizedSource.skill, { sourceIds: [sourceId] })
    pageLinks.push(pid)
    addIndex(memory, 'skills', normalizedSource.skill)
  }
  if (normalizedSource.company) {
    const pid = upsertPage(memory, 'company', normalizedSource.company, { sourceIds: [sourceId] })
    pageLinks.push(pid)
    addIndex(memory, 'companies', normalizedSource.company)
  }
  if (normalizedSource.generationType) {
    const pid = upsertPage(memory, 'generation', normalizedSource.generationType, { sourceIds: [sourceId] })
    pageLinks.push(pid)
    addIndex(memory, 'generations', normalizedSource.generationType)
  }

  const note = makeAtomicNote(memory, normalizedSource, normalizedSource.text || normalizedSource.summary, normalizedSource.noteKind, pageLinks)
  if (note) {
    for (const link of pageLinks) {
      const page = memory.pages[link]
      if (page) {
        page.noteIds = Array.from(new Set([note.id, ...(page.noteIds || [])])).slice(0, 120)
        page.summary = page.summary || note.text
      }
    }
  }

  memory.logs = [{
    id: stableId('log', [sourceId, Date.now()]),
    type: 'memory_ingest',
    sourceId,
    noteId: note?.id || null,
    createdAt: nowIso(),
  }, ...(memory.logs || [])]

  return saveMemory(memory)
}

export async function ingestGeneration(record) {
  if (!record?.id) return null
  const identity = await userMemoryIdentity()
  return ingestSource('user', identity.id, {
    sourceId: `generation:${record.type}:${record.id}`,
    type: 'generation',
    recordId: record.id,
    generationType: record.type,
    text: inferGenerationSummary(record),
    createdAt: record.createdAt || nowIso(),
    noteKind: 'generation',
    contributionId: record.contribution?.id,
    contributionHash: record.contribution?.contentHash,
    utility: record.bonzaiUtility || null,
    wallet: identity.wallet,
  }, identity)
}

export async function ingestRoleplaySession(sessionKey, session) {
  const companionIdentity = companionMemoryIdentity(session)
  if (!companionIdentity.id) return null
  const history = Array.isArray(session.history) ? session.history : []
  const latest = history.slice(-8)
  const companionName = session.companion?.name || companionIdentity.companionName || companionIdentity.id || 'Companion'
  const scenarioName = session.scenario?.name || session.scenarioKey || 'Roleplay'
  const content = latest
    .map(msg => `${msg.role || 'message'}: ${safeString(msg.content || msg.text, 320)}`)
    .filter(Boolean)
    .join(' | ')

  const companionMemory = await ingestSource('companion', companionIdentity.id, {
    sourceId: `roleplay:${sessionKey}:${history.length}`,
    type: 'roleplay_session',
    recordId: sessionKey,
    companionName,
    project: scenarioName,
    text: content,
    summary: `${companionName} session in ${scenarioName}: ${safeString(content, 900)}`,
    createdAt: session.updatedAt ? new Date(session.updatedAt).toISOString() : nowIso(),
    noteKind: 'episodic',
    companionTokenId: companionIdentity.tokenId,
    agentWallet: companionIdentity.agentWallet,
    ownerWallet: companionIdentity.ownerWallet,
  }, companionIdentity)

  const userIdentity = await userMemoryIdentity()
  await ingestSource('user', userIdentity.id, {
    sourceId: `use:roleplay:${sessionKey}:${history.length}`,
    type: 'use_history',
    recordId: sessionKey,
    companionName,
    project: scenarioName,
    text: `User interacted with ${companionName} in ${scenarioName}. ${safeString(content, 700)}`,
    createdAt: session.updatedAt ? new Date(session.updatedAt).toISOString() : nowIso(),
    noteKind: 'use_history',
    wallet: userIdentity.wallet,
  }, userIdentity)

  return companionMemory
}

export async function getCompanionMemory(companion, metadata = {}) {
  const identity = companionMemoryIdentity(typeof companion === 'object' ? companion : { id: companion })
  return loadMemory('companion', identity.id, { ...identity, ...metadata })
}

export async function getTeamMemory(company, metadata = {}) {
  const identity = teamMemoryIdentity(company)
  return loadMemory('team', identity.id, { ...identity, ...metadata })
}

export async function getTeamRoleMemory(company, roleKey, metadata = {}) {
  const identity = teamMemoryIdentity(company, roleKey)
  return loadMemory('team', identity.id, { ...identity, ...metadata })
}

export async function getUserMemory() {
  const identity = await userMemoryIdentity()
  return loadMemory('user', identity.id, identity)
}

export async function ingestTeamMemory(company, source, metadata = {}) {
  const identity = teamMemoryIdentity(company)
  return ingestSource('team', identity.id, {
    ...source,
    company: source?.company || company?.name,
    project: source?.project || company?.name,
  }, { ...identity, ...metadata })
}

export async function ingestTeamRoleMemory(company, roleKey, source, metadata = {}) {
  const identity = teamMemoryIdentity(company, roleKey)
  const role = company?.roles?.[roleKey] || {}
  return ingestSource('team', identity.id, {
    ...source,
    company: source?.company || company?.name,
    project: source?.project || company?.name,
    companionName: source?.companionName || role.companion || roleKey,
    skill: source?.skill || roleKey,
  }, { ...identity, ...metadata })
}

export const memoryService = {
  getUserMemory,
  getCompanionMemory,
  getTeamMemory,
  getTeamRoleMemory,
  userMemoryIdentity,
  companionMemoryIdentity,
  teamMemoryIdentity,
  ingestGeneration,
  ingestRoleplaySession,
  ingestTeamMemory,
  ingestTeamRoleMemory,
  ingestSource,
  recallMemory,
  buildRecallContext,
  exportObsidianVault,
}

export default memoryService
