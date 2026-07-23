/**
 * Skill Service — loading, validation, and execution of built-in and on-chain skills.
 */

import {
  SKILL_SCHEMA_VERSION,
  validateSkillDefinition,
} from '../skills/types.js';

import { flagshipSkills } from '../skills/flagship.js';
import { hasSkillTokenAccess, isDevMode } from './agent.service.js';

/** A skill is paid if it carries a positive `price` (USDC). */
function isPaidSkill(skill) {
  return typeof skill?.price === 'number' && skill.price > 0;
}

const skillCache = new Map();

export async function loadFlagshipSkills() {
  const skills = [];

  for (const skill of flagshipSkills) {
    if (skill && skill.id) {
      const validation = validateSkillDefinition(skill);
      if (validation.valid) {
        skillCache.set(skill.id, skill);
        skills.push(skill);
      } else {
        console.warn(`[SkillService] Invalid flagship skill ${skill.id}:`, validation.errors);
      }
    }
  }

  return skills;
}

export async function initializeSkills() {
  const skills = await loadFlagshipSkills();
  return { skills };
}

export function getSkill(skillId) {
  return skillCache.get(skillId) || null;
}

export function getAllSkills() {
  return Array.from(skillCache.values());
}

export function getSkillsByCategory(category) {
  return getAllSkills().filter(s => s.category === category);
}

export function searchSkills(query) {
  const lower = query.toLowerCase();
  return getAllSkills().filter(
    s =>
      s.name.toLowerCase().includes(lower) ||
      s.description.toLowerCase().includes(lower)
  );
}

export function buildSkillSystemPrompt(skill, inputs = {}) {
  let systemPrompt = skill.prompt.system;

  for (const [key, value] of Object.entries(inputs)) {
    const placeholder = `{{${key}}}`;
    systemPrompt = systemPrompt.replace(new RegExp(placeholder, 'g'), String(value));
  }

  return systemPrompt;
}

export function buildSkillTaskPrompt(skill, inputs = {}) {
  let taskPrompt = skill.prompt.task;

  for (const [key, value] of Object.entries(inputs)) {
    const placeholder = `{{${key}}}`;
    taskPrompt = taskPrompt.replace(new RegExp(placeholder, 'g'), String(value));
  }

  return taskPrompt;
}

export function validateSkillInputs(skill, inputs = {}) {
  const errors = [];
  const normalizedInputs = {};

  for (const [key, field] of Object.entries(skill.inputs)) {
    const value = inputs[key];

    // Use default if not provided
    if (value === undefined || value === null) {
      if (field.default !== undefined) {
        normalizedInputs[key] = field.default;
        continue;
      } else {
        errors.push(`Missing required input: ${key}`);
        continue;
      }
    }

    // Type validation
    switch (field.type) {
      case 'number':
        const num = Number(value);
        if (isNaN(num)) {
          errors.push(`${key} must be a number`);
        } else {
          if (field.min !== undefined && num < field.min) {
            errors.push(`${key} must be at least ${field.min}`);
          }
          if (field.max !== undefined && num > field.max) {
            errors.push(`${key} must be at most ${field.max}`);
          }
          normalizedInputs[key] = num;
        }
        break;

      case 'string':
        normalizedInputs[key] = String(value);
        break;

      case 'select':
        if (field.options && !field.options.includes(value)) {
          errors.push(`${key} must be one of: ${field.options.join(', ')}`);
        } else {
          normalizedInputs[key] = value;
        }
        break;

      case 'boolean':
        normalizedInputs[key] = Boolean(value);
        break;

      default:
        normalizedInputs[key] = value;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedInputs,
  };
}

export function getSkillToolsForBonzai(skill) {
  return skill.tools?.bonzai || [];
}

export function getSkillToolsForMCP(skill) {
  return skill.tools?.mcp || [];
}

export async function executeBonzaiTool(tool, args) {
  if (!window.electronAPI?.polymarketProxy && tool.proxy === 'polymarketProxy') {
    throw new Error('Polymarket proxy not available');
  }

  if (!window.electronAPI?.externalProxy && tool.proxy === 'externalProxy') {
    throw new Error('External proxy not available');
  }

  // Route to appropriate proxy
  switch (tool.proxy) {
    case 'polymarketProxy':
      return await window.electronAPI.polymarketProxy(tool.endpoint, args);

    case 'externalProxy':
      return await window.electronAPI.externalProxy(tool.endpoint, args);

    default:
      // Direct fetch for no-proxy tools
      const response = await fetch(tool.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      return await response.json();
  }
}

export function prepareSkillExecution(skillId, inputs = {}) {
  const skill = getSkill(skillId);
  if (!skill) {
    console.error(`[SkillService] Skill not found: ${skillId}`);
    return null;
  }

  const validation = validateSkillInputs(skill, inputs);
  if (!validation.valid) {
    console.error(`[SkillService] Invalid inputs for ${skillId}:`, validation.errors);
    return null;
  }

  return {
    skill,
    systemPrompt: buildSkillSystemPrompt(skill, validation.normalizedInputs),
    taskPrompt: buildSkillTaskPrompt(skill, validation.normalizedInputs),
    tools: getSkillToolsForBonzai(skill),
    inputs: validation.normalizedInputs,
  };
}

export async function executeSkill(skillId, inputs = {}, context = {}) {
  const skill = getSkill(skillId);
  if (!skill) {
    throw new Error(`Skill not found: ${skillId}`);
  }

  // Service-level companion-token gate. Defense in depth vs. UI bypass:
  // components should ALSO check access, but this guard covers any path that
  // reaches executeSkill directly. Dev mode bypasses (see isDevMode).
  if (isPaidSkill(skill) && !isDevMode()) {
    const hasAccess = await hasSkillTokenAccess(skill.id);
    if (!hasAccess) {
      return {
        success: false,
        requiresCompanionToken: true,
        skill: { id: skill.id, name: skill.name, category: skill.category },
        error: `Skill "${skill.name}" requires a token issued for one of its companion co-owners.`,
        executedAt: new Date().toISOString(),
      };
    }
  }

  const validation = validateSkillInputs(skill, inputs);
  if (!validation.valid) {
    throw new Error(`Invalid inputs: ${validation.errors.join(', ')}`);
  }

  const normalizedInputs = validation.normalizedInputs;

  if (skill.execution?.execute && typeof skill.execution.execute === 'function') {
    try {
      const result = await skill.execution.execute(normalizedInputs, context);
      return {
        success: true,
        skill: {
          id: skill.id,
          name: skill.name,
          category: skill.category,
        },
        inputs: normalizedInputs,
        result,
        executedAt: new Date().toISOString(),
      };
    } catch (e) {
      console.error(`[SkillService] Execution error for ${skill.name}:`, e);
      return {
        success: false,
        skill: {
          id: skill.id,
          name: skill.name,
          category: skill.category,
        },
        inputs: normalizedInputs,
        error: e.message,
        executedAt: new Date().toISOString(),
      };
    }
  }

  const prepared = prepareSkillExecution(skillId, inputs);
  if (!prepared) {
    throw new Error(`Failed to prepare skill execution: ${skillId}`);
  }

  return {
    success: true,
    type: 'prompt-based',
    skill: {
      id: skill.id,
      name: skill.name,
      category: skill.category,
    },
    inputs: normalizedInputs,
    systemPrompt: prepared.systemPrompt,
    taskPrompt: prepared.taskPrompt,
    tools: prepared.tools,
    executedAt: new Date().toISOString(),
  };
}

export const skillService = {
  loadFlagshipSkills, initializeSkills,
  getSkill, getAllSkills, getSkillsByCategory, searchSkills,
  buildSkillSystemPrompt, buildSkillTaskPrompt,
  validateSkillInputs,
  getSkillToolsForBonzai, getSkillToolsForMCP, executeBonzaiTool,
  prepareSkillExecution, executeSkill,
};

export default skillService;
