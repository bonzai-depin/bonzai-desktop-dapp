import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_COMPANIONS, flagshipSkills } from "../src/skills/flagship.js";
import { SKILL_MANIFESTS } from "../src/services/company/skillManifests.js";
import { TEMPLATES, applyTemplate } from "../src/services/company/templates.js";
import {
  COMPANION_CAREER_LIST,
  getCompanionCareer,
  getMarketplaceSkillOwners,
} from "../src/skills/companionSkillRoadmap.js";

test("every default companion has a first-name token and a career", () => {
  assert.equal(COMPANION_CAREER_LIST.length, DEFAULT_COMPANIONS.length);
  for (const companion of DEFAULT_COMPANIONS) {
    const career = getCompanionCareer(companion.id);
    assert.ok(career, `missing career for ${companion.id}`);
    assert.equal(career.tokenSymbol, companion.firstName.toUpperCase());
    assert.ok(career.companySkills.length, `${companion.id} has no Company workflows`);
    assert.ok(career.marketplaceSkills.length, `${companion.id} has no marketplace skill`);
  }
});

test("every marketplace skill has profile-aligned companion owners", () => {
  for (const skill of flagshipSkills) {
    const owners = getMarketplaceSkillOwners(skill.id);
    assert.ok(owners.length, `${skill.id} has no companion owners`);
    for (const owner of owners) {
      const companion = DEFAULT_COMPANIONS.find((item) => item.id === owner.id);
      assert.ok(companion.spendingHabits[skill.category] >= 5, `${owner.id} is not aligned with ${skill.category}`);
    }
  }
});

test("every Company workflow belongs to at least one companion specialization", () => {
  const owned = new Set(COMPANION_CAREER_LIST.flatMap((career) => career.companySkills));
  for (const skillId of Object.keys(SKILL_MANIFESTS)) {
    assert.ok(owned.has(skillId), `${skillId} has no companion owner`);
  }
});

test("Company templates only grant workflows owned by the hired companion", () => {
  for (const template of Object.values(TEMPLATES)) {
    const { draft } = applyTemplate(template.id, {}, { demoMode: true });
    for (const [roleKey, role] of Object.entries(draft.roles)) {
      const owned = new Set(getCompanionCareer(role.companion)?.companySkills || []);
      for (const skillId of role.grantedSkills || []) {
        assert.ok(owned.has(skillId), `${template.id}/${roleKey} grants ${skillId} outside ${role.companion}'s career`);
      }
      assert.equal(role.employment?.type, "companion-hire");
    }
  }
});
