export const roleProfileFields = [
  { key: 'userName', label: 'Character name', placeholder: 'What should your companion call you?' },
  { key: 'pronouns', label: 'Pronouns', placeholder: 'e.g. she/her, he/him, they/them' },
  { key: 'role', label: 'Role or occupation', placeholder: 'An archivist, an old friend, a visiting artist…' },
  { key: 'relationship', label: 'Your relationship', placeholder: 'How do you know your companion?' },
  { key: 'background', label: 'Backstory', placeholder: 'Where are you from? What brought you here?', multiline: true },
  { key: 'personality', label: 'Personality', placeholder: 'Your temperament, strengths, flaws and habits', multiline: true },
  { key: 'goals', label: 'Motivation', placeholder: 'What do you want from this encounter? What is at stake?', multiline: true },
  { key: 'boundaries', label: 'Story preferences and boundaries', placeholder: 'Preferred tone, topics to avoid, and things your companion should respect', multiline: true },
];
export function normalizeRoleplayProfile(stored = {}) {
  return Object.fromEntries([
    ...roleProfileFields.map(({key}) => [key, typeof stored?.[key] === 'string' ? stored[key] : '']),
    ['userDescription', typeof stored?.userDescription === 'string' ? stored.userDescription : ''],
    ['userImage', stored?.userImage || null],
  ]);
}
export function roleplayParticipantContext(profile) {
  const lines = [...roleProfileFields, {key:'userDescription', label:'Appearance'}]
    .filter(({key}) => profile?.[key]?.trim())
    .map(({key,label}) => `${label}: ${profile[key].trim()}`);
  return lines.length ? `USER'S ROLEPLAY CHARACTER\n${lines.join('\n')}\nUse this character context to ground dialogue and continuity. Respect their stated boundaries and leave their choices, thoughts and actions to the user. This profile does not override the session content rating.` : '';
}
