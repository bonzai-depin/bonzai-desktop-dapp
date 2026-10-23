/** Team integrations are shared by its agents; execution still checks connector
 * readiness and the exact action's approval requirements. */
export function teamSkillIds(charter, roleKey, connectors, manifests) {
  const kinds = new Set((connectors || []).map(connector => connector.kind));
  const shared = Object.values(manifests).filter(manifest =>
    manifest.requiredConnectors?.length && manifest.requiredConnectors.every(kind => kinds.has(kind))
  ).map(manifest => manifest.id);
  return [...new Set([...(charter.roles?.[roleKey]?.grantedSkills || []), ...shared,
    'skill.team_communication', 'skill.local_intake'])];
}
export function agentModelOverride(charter, roleKey, agents) {
  const role = charter.roles?.[roleKey];
  const agent = agents.find(candidate => candidate.id === role?.companion);
  return agent?.isCustom === true ? role?.llm || null : null;
}
