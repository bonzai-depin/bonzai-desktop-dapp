<template>
  <div class="dash">
    <header class="company-cockpit">
      <div class="company-cockpit__identity">
        <p class="command-center__eyebrow">Operating console</p>
        <h1 class="company-cockpit__title fira-sans-condensed-black-italic">
          {{ companyDisplayName }}
        </h1>
        <div class="company-cockpit__chips">
          <span
            class="company-pill"
            :class="charter.status === 'active' ? 'company-pill--success' : 'company-pill--warning'"
          >
            <span class="status-dot" :class="`status-${charter.status}`"></span>
            {{ charter.status }}
          </span>
          <span class="company-pill">{{ filledRoles.length }} roles</span>
          <span class="company-pill">{{ fmtCount(openIssues.length) }} open tasks</span>
          <span class="company-pill" :class="state.approvals.length ? 'company-pill--warning' : 'company-pill--neutral'">
            {{ fmtCount(state.approvals.length) }} approvals
          </span>
        </div>
      </div>

      <div class="company-cockpit__side">
        <div class="company-cockpit__metrics" aria-label="Company health">
          <div v-for="metric in operatingMetrics" :key="metric.label" class="command-metric">
            <span class="command-metric__label">{{ metric.label }}</span>
            <span class="command-metric__value fira-sans-condensed-black-italic">{{ metric.value }}</span>
            <span class="command-metric__hint">{{ metric.hint }}</span>
          </div>
        </div>
        <div class="company-cockpit__actions">
          <button
            class="bz-btn fira-sans-condensed-black-italic"
            :class="charter.demoMode ? 'bz-btn--warning' : 'bz-btn--ghost'"
            @click="toggleDemoMode"
            :title="charter.demoMode
              ? 'Demo mode is on: the company uses sample activity so you can explore the workflow. Click to use real execution.'
              : 'Demo mode is off: the company uses real execution. Click to switch back to sample activity.'"
          >
            <span class="material-symbols-outlined" aria-hidden="true">
              {{ charter.demoMode ? 'auto_awesome_motion' : 'bolt' }}
            </span>
            Demo mode: {{ charter.demoMode ? 'On' : 'Off' }}
          </button>
          <button
            class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic"
            @click="toggleExecution"
            :title="charter.status === 'active'
              ? 'Pause scheduled company runs. Existing work stays visible.'
              : 'Resume scheduled company runs.'"
          >
            <span class="material-symbols-outlined" aria-hidden="true">
              {{ charter.status === 'active' ? 'pause' : 'play_arrow' }}
            </span>
            {{ charter.status === 'active' ? 'Pause automation' : 'Resume automation' }}
          </button>
          <button
            class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic"
            @click="openNewGoalModal"
            title="Add a concrete goal for the company to turn into tasks."
          >
            <span class="material-symbols-outlined" aria-hidden="true">add_task</span>
            Add goal
          </button>
          <button
            class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic"
            @click="$emit('new-company')"
            title="Create another company."
          >
            <span class="material-symbols-outlined" aria-hidden="true">add_business</span>
            New company
          </button>
          <button
            class="bz-btn bz-btn--primary fira-sans-condensed-black-italic"
            @click="runCEO"
            title="Ask the CEO role to review the company goals now and queue the next tasks."
          >
            <span class="material-symbols-outlined" aria-hidden="true">psychology</span>
            Plan next work
          </button>
        </div>
      </div>
    </header>

    <ModeChipBar
      v-model="active"
      :items="subtabs"
      class="company-subtabs"
      compact
    />

    <div class="company-dashboard-shell">
      <!-- ════════════ Sub-tab body ════════════ -->
      <section class="dash-body">
      <!-- ─── Command center ─── -->
      <div v-if="active === 'command'" class="company-command">
        <section class="operating-loop">
          <div
            v-for="step in operatingLoop"
            :key="step.label"
            class="loop-step"
            :class="`loop-step--${step.state}`"
          >
            <div class="loop-step__icon">
              <span class="material-symbols-outlined">{{ step.icon }}</span>
            </div>
            <div>
              <div class="loop-step__label fira-sans-condensed-black-italic">{{ step.label }}</div>
              <div class="loop-step__text">{{ step.text }}</div>
            </div>
          </div>
        </section>

        <section class="ops-grid">
          <div class="ops-panel ops-panel--org">
            <div class="ops-panel__head">
              <div>
                <p class="command-center__eyebrow">Agentic Team</p>
                <h3 class="ops-panel__title fira-sans-condensed-black-italic">Delegation map</h3>
              </div>
              <button
                class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
                @click="active = 'org'"
              >
                Open
              </button>
            </div>
            <div class="command-org">
              <article
                v-for="role in commandRoles"
                :key="role.key"
                class="command-role"
                :class="{ 'is-ceo': role.key === 'CEO', 'has-work': role.queue > 0 }"
              >
                <div class="command-role__top">
                  <span class="command-role__role fira-sans-condensed-black-italic">{{ role.name }}</span>
                  <span class="command-role__queue">{{ role.queue }} queued</span>
                </div>
                <div class="command-role__agent">{{ role.companion }}</div>
                <div class="command-role__meta">
                  <span>{{ role.llm }}</span>
                  <span>{{ role.budget }}</span>
                </div>
              </article>
            </div>
          </div>

          <div class="ops-panel">
            <div class="ops-panel__head">
              <div>
                <p class="command-center__eyebrow">Work pipeline</p>
                <h3 class="ops-panel__title fira-sans-condensed-black-italic">What is happening now</h3>
              </div>
              <button
                class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
                @click="active = 'issues'"
              >
                Goals
              </button>
            </div>
            <div class="work-stack">
              <div v-for="item in workStack" :key="item.label" class="work-stack__row">
                <span class="work-stack__dot" :class="`is-${item.state}`"></span>
                <span class="work-stack__label">{{ item.label }}</span>
                <span class="work-stack__value fira-sans-condensed-black-italic">{{ fmtCount(item.value) }}</span>
              </div>
            </div>
          </div>

          <div class="ops-panel ops-panel--lanes">
            <div class="ops-panel__head">
              <div>
                <p class="command-center__eyebrow">Operating model</p>
                <h3 class="ops-panel__title fira-sans-condensed-black-italic">How work moves</h3>
              </div>
            </div>
            <div class="ops-lanes ops-lanes--model">
              <article v-for="item in operatingModel" :key="item.label" class="ops-lane">
                <span class="material-symbols-outlined">{{ item.icon }}</span>
                <div>
                  <div class="ops-lane__label fira-sans-condensed-black-italic">{{ item.label }}</div>
                  <p>{{ item.text }}</p>
                </div>
              </article>
            </div>
          </div>

          <div class="ops-panel ops-panel--proof">
            <div class="ops-panel__head">
              <div>
                <p class="command-center__eyebrow">Latest output</p>
                <h3 class="ops-panel__title fira-sans-condensed-black-italic">Produced work</h3>
              </div>
              <button
                class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
                @click="active = 'deliverables'"
              >
                Deliverables
              </button>
            </div>
            <article v-if="latestProduced" class="proof-card">
              <div class="proof-card__meta">
                <span class="company-pill company-pill--info">{{ latestProduced.pipeline }}</span>
                <span>{{ roleDisplayName(latestProduced.role) }}</span>
                <span>{{ fmtTime(latestProduced.createdAt) }}</span>
              </div>
              <pre class="proof-card__output">{{ outputPreview(latestProduced) }}</pre>
              <p v-if="latestProduced.prompt" class="proof-card__prompt">
                {{ latestProduced.prompt }}
              </p>
            </article>
            <div v-else class="proof-card proof-card--empty">
              No deliverable yet. Create a goal with a concrete output, then run the assigned role.
            </div>
          </div>

          <div class="ops-panel">
            <div class="ops-panel__head">
              <div>
                <p class="command-center__eyebrow">Money controls</p>
                <h3 class="ops-panel__title fira-sans-condensed-black-italic">Save and make money</h3>
              </div>
              <button
                class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
                @click="active = 'treasury'"
              >
                Treasury
              </button>
            </div>
            <div class="money-stack">
              <div class="money-stack__row">
                <span>Revenue captured</span>
                <strong>{{ fmtMoney(state.summary.revenue || state.treasuryState?.totalIn, state.treasuryState?.currency) }}</strong>
              </div>
              <div class="money-stack__row">
                <span>Spend guarded</span>
                <strong>{{ fmtMoney(state.summary.spend || state.treasuryState?.totalOut, state.treasuryState?.currency) }}</strong>
              </div>
              <div class="money-stack__row">
                <span>Per run cap</span>
                <strong>{{ fmtMoney(charter.rules?.perHeartbeatSpendCap, state.treasuryState?.currency) }}</strong>
              </div>
              <div class="money-stack__row">
                <span>Connector gaps</span>
                <strong>{{ connectorRisk }}</strong>
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- ─── Agentic Team ─── -->
      <div v-else-if="active === 'org'" class="panel models__activity--payouts">
        <div class="section-head">
          <h2 class="panel-title fira-sans-condensed-black-italic">
            <span class="material-symbols-outlined">schema</span>
            Agentic Team
          </h2>
          <button
            class="bz-btn bz-btn--primary fira-sans-condensed-black-italic"
            @click="openRoleEdit(availableRoleOptions[0]?.key)"
            :disabled="!availableRoleOptions.length"
          >
            <span class="material-symbols-outlined" aria-hidden="true">person_add</span>
            Add role
          </button>
        </div>
        <div v-if="filledRoles.length" class="org-grid">
          <div
            v-for="roleKey in filledRoles"
            :key="roleKey"
            class="org-card"
          >
            <div class="org-card__role fira-sans-condensed-black-italic">
              {{ roleDisplayName(roleKey) }}
              <span
                v-if="charter.roles[roleKey].kind === 'human_supported'"
                class="org-card__kind-badge"
                title="Hybrid role — companion coordinates a human"
              >
                <span class="material-symbols-outlined">handshake</span>
                Hybrid
              </span>
            </div>
            <div class="org-card__companion fira-sans-condensed-black-italic">
              {{ companionName(charter.roles[roleKey].companion) }}
            </div>
            <div class="org-card__llm">
              <span class="material-symbols-outlined">memory</span>
              {{ llmLabel(charter.roles[roleKey].llm) }}
            </div>
            <div class="org-card__desc">
              {{ state.roleLibrary[roleKey].description }}
            </div>
            <!-- Granted skills + humans, when relevant -->
            <div
              v-if="(charter.roles[roleKey].grantedSkills?.length || 0) > 0"
              class="org-card__grants"
            >
              <span class="material-symbols-outlined">extension</span>
              <span
                v-for="sid in charter.roles[roleKey].grantedSkills"
                :key="sid"
                class="org-card__grant-tag"
              >{{ skillShortName(sid) }}</span>
            </div>
            <div
              v-if="(charter.roles[roleKey].pipelines?.length || 0) > 0"
              class="org-card__grants org-card__pipelines"
            >
              <span class="material-symbols-outlined">auto_awesome_motion</span>
              <span
                v-for="pipeline in charter.roles[roleKey].pipelines"
                :key="pipeline"
                class="org-card__grant-tag"
              >{{ pipelineLabel(pipeline) }}</span>
            </div>
            <div
              v-if="charter.roles[roleKey].kind === 'human_supported'"
              class="org-card__humans"
            >
              <span class="material-symbols-outlined">person</span>
              <template v-if="(charter.roles[roleKey].humanResources?.length || 0) > 0">
                <span
                  v-for="(h, i) in charter.roles[roleKey].humanResources"
                  :key="i"
                  class="org-card__human-tag"
                >{{ h.name }}{{ h.contractorStatus ? ` · ${h.contractorStatus}` : '' }}</span>
              </template>
              <span v-else class="org-card__humans-empty">No humans assigned yet</span>
            </div>
            <hr class="org-card__divider" />
            <div class="org-card__meta">
              <div class="org-card__queue-badge" :class="{ 'has-work': (state.queueDepths[roleKey] || 0) > 0 }">
                <span class="material-symbols-outlined">inbox</span>
                <span class="org-card__queue-count fira-sans-condensed-black-italic">
                  {{ state.queueDepths[roleKey] || 0 }}
                </span>
                <span class="org-card__queue-label">queued</span>
              </div>
              <div class="org-card__meta-actions">
                <button
                  class="bz-iconbtn bz-iconbtn--sm"
                  @click="openRoleEdit(roleKey)"
                  title="Edit this role"
                  aria-label="Edit role"
                >
                  <span class="material-symbols-outlined">settings</span>
                </button>
                <button
                  class="bz-iconbtn bz-iconbtn--sm org-card__run-btn"
                  @click="store.tickRoleNow(roleKey)"
                  title="Wake this role up now: pop the next goal off its queue and execute"
                  aria-label="Run"
                >
                  <span class="material-symbols-outlined">room_service</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="empty">
          No roles assigned yet. Add a role to start delegating work.
        </div>
      </div>

      <!-- ─── Goals & Issues — work primitives, grouped by goal ─── -->
      <div v-else-if="active === 'issues'" class="panel models__activity--payouts">
        <div class="goals-head">
          <div>
            <h2 class="panel-title fira-sans-condensed-black-italic">
              <span class="material-symbols-outlined">flag</span>
              Goals &amp; Issues
            </h2>
            <p class="muted">
              Every issue belongs to a goal that ties it to the company's mission.
              The CEO heartbeat creates goals autonomously; you can also create
              your own. Each goal decomposes into one or more issues that route
              to a role by first verb.
            </p>
          </div>
          <button
            class="bz-btn bz-btn--primary fira-sans-condensed-black-italic"
            @click="openNewGoalModal"
          >
            <span class="material-symbols-outlined" aria-hidden="true">add_circle</span>
            New goal
          </button>
        </div>

        <hr />

        <!-- Filter chips: source + status -->
        <div class="goals-filters">
          <div class="goals-filters__group">
            <span class="goals-filters__label">Source:</span>
            <button
              v-for="f in [
                { id: 'all', label: 'All' },
                { id: 'ceo', label: 'CEO' },
                { id: 'user', label: 'You' },
              ]"
              :key="'src-' + f.id"
              class="issue-filter__chip"
              :class="{ 'is-active': goalSourceFilter === f.id }"
              @click="goalSourceFilter = f.id"
            >
              {{ f.label }}
            </button>
          </div>
          <div class="goals-filters__group">
            <span class="goals-filters__label">Status:</span>
            <button
              v-for="f in [
                { id: 'active', label: 'Active' },
                { id: 'completed', label: 'Completed' },
                { id: 'cancelled', label: 'Cancelled' },
                { id: 'all', label: 'All' },
              ]"
              :key="'st-' + f.id"
              class="issue-filter__chip"
              :class="{ 'is-active': goalStatusFilter === f.id }"
              @click="goalStatusFilter = f.id"
            >
              {{ f.label }}
            </button>
          </div>
        </div>

        <!-- Goal list -->
        <div v-if="filteredGoals.length" class="goal-list">
          <div v-for="goal in visibleGoals" :key="goal.id" class="goal-card">
            <div class="goal-card__head">
              <span class="company-pill" :class="goal.createdBy === 'ceo' ? 'company-pill--info' : 'company-pill--warning'">
                <span class="material-symbols-outlined" aria-hidden="true">{{ goal.createdBy === 'ceo' ? 'smart_toy' : 'person' }}</span>
                {{ goal.createdBy === 'ceo' ? 'CEO' : 'You' }}
              </span>
              <span class="company-pill" :class="goalStatusClass(goal.status)">
                {{ goal.status }}
              </span>
              <span class="goal-card__time">{{ fmtTime(goal.updatedAt || goal.createdAt) }}</span>
            </div>
            <div class="goal-card__title fira-sans-condensed-black-italic">
              {{ goal.title }}
            </div>
            <div v-if="goal.rationale || goal.missionAlignment" class="goal-card__rationale">
              <span class="material-symbols-outlined">north_star</span>
              {{ goal.rationale || goal.missionAlignment }}
            </div>

            <!-- Progress bar -->
            <div class="goal-card__progress">
              <div class="goal-progress-bar">
                <div
                  class="goal-progress-bar__fill"
                  :style="{ width: goalProgress(goal).pct + '%' }"
                ></div>
              </div>
              <span class="goal-card__progress-text">
                {{ goalProgress(goal).done }}/{{ goalProgress(goal).total }} done
              </span>
            </div>

            <!-- Child issues -->
            <div v-if="issuesForGoal(goal.id).length" class="goal-card__issues">
              <div
                v-for="issue in issuesForGoal(goal.id)"
                :key="issue.id"
                class="issue-card issue-card--nested"
              >
                <div class="issue-card__head">
                  <span class="company-pill" :class="priorityClass(issue.priority)">{{ issue.priority }}</span>
                  <span class="company-pill" :class="statusClass(issue.status)">
                    {{ issue.status.replace('_', ' ') }}
                  </span>
                  <span class="issue-card__role">
                    <span class="material-symbols-outlined">person</span>
                    {{ roleDisplayName(issue.assigneeRole) }}
                  </span>
                  <span class="issue-card__time">{{ fmtTime(issue.updatedAt || issue.createdAt) }}</span>
                </div>
                <div class="issue-card__title fira-sans-condensed-black-italic">
                  {{ issue.title }}
                </div>
                <div v-if="issue.description" class="issue-card__desc">
                  {{ issue.description }}
                </div>
                <div v-if="issue.attempts && issue.attempts.length" class="issue-card__attempts">
                  <span class="material-symbols-outlined">history</span>
                  {{ issue.attempts.length }} attempt{{ issue.attempts.length === 1 ? '' : 's' }}
                  <span v-if="issue.attempts.at(-1)?.txOrLink" class="issue-card__link">
                    · last: <code>{{ issue.attempts.at(-1).txOrLink }}</code>
                  </span>
                </div>
                <div class="issue-card__actions">
                  <button
                    v-if="issue.status === 'open'"
                    class="bz-btn bz-btn--sm bz-btn--warning fira-sans-condensed-black-italic"
                    @click="store.tickRoleNow(issue.assigneeRole)"
                    title="Run the assignee's role now to pick this up"
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">room_service</span>
                    Run
                  </button>
                  <button
                    v-if="issue.status === 'open' || issue.status === 'in_progress' || issue.status === 'blocked'"
                    class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
                    @click="setIssueStatus(issue.id, 'cancelled')"
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">close</span>
                    Cancel
                  </button>
                  <button
                    v-if="issue.status === 'done' || issue.status === 'cancelled'"
                    class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
                    @click="reopenIssue(issue.id)"
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
                    Reopen
                  </button>
                  <button
                    class="bz-iconbtn bz-iconbtn--sm issue-card__delete"
                    @click="removeIssue(issue.id)"
                    aria-label="Delete issue"
                  >
                    <span class="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </div>
            </div>
            <div v-else class="goal-card__no-issues muted">
              No tasks yet for this goal.
            </div>

            <!-- Goal-level actions -->
            <div v-if="goal.status === 'active'" class="goal-card__actions">
              <button
                class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
                @click="cancelGoal(goal.id)"
              >
                <span class="material-symbols-outlined" aria-hidden="true">cancel</span>
                Cancel goal
              </button>
            </div>
          </div>
          <button
            v-if="visibleGoals.length < filteredGoals.length"
            class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic load-more-btn"
            @click="goalLimit += 20"
          >
            <span class="material-symbols-outlined" aria-hidden="true">expand_more</span>
            Load more
          </button>
        </div>
        <div v-else class="empty">
          No goals match your filters. Click <em>New goal</em> above to create
          your first one — or wait for the next CEO tick to generate one
          autonomously.
        </div>

        <!-- Ungrouped issues (legacy, shouldn't accumulate in the unified model) -->
        <div v-if="ungroupedIssues.length" class="orphan-section">
          <hr />
          <h3 class="panel-subtitle fira-sans-condensed-black-italic">
            <span class="material-symbols-outlined">help</span>
            Ungrouped issues
          </h3>
          <p class="muted">
            These predate the unified goals model. They still run normally;
            attach them to a goal or cancel as you clean up.
          </p>
          <div class="goal-card__issues">
            <div
              v-for="issue in ungroupedIssues"
              :key="issue.id"
              class="issue-card issue-card--nested"
            >
              <div class="issue-card__head">
                <span class="company-pill" :class="priorityClass(issue.priority)">{{ issue.priority }}</span>
                <span class="company-pill" :class="statusClass(issue.status)">
                  {{ issue.status.replace('_', ' ') }}
                </span>
                <span class="issue-card__role">
                  <span class="material-symbols-outlined">person</span>
                  {{ roleDisplayName(issue.assigneeRole) }}
                </span>
              </div>
              <div class="issue-card__title fira-sans-condensed-black-italic">{{ issue.title }}</div>
              <div v-if="issue.description" class="issue-card__desc">{{ issue.description }}</div>
              <div class="issue-card__actions">
                <button
                  class="bz-iconbtn bz-iconbtn--sm issue-card__delete"
                  @click="removeIssue(issue.id)"
                  aria-label="Delete issue"
                >
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ─── Deliverables / catalog ─── -->
      <div v-else-if="active === 'deliverables'" class="panel models__activity--payouts">
        <div class="section-head">
          <h2 class="panel-title fira-sans-condensed-black-italic">
            <span class="material-symbols-outlined">factory</span>
            Deliverables
          </h2>
          <p class="section-head__hint">
            Finished text, media, reports, listings, and other work products created by staffed roles.
          </p>
          <div class="section-head__actions">
            <button
              class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
              :disabled="visibleCatalogRows.length >= catalogRows.length"
              @click="catalogLimit += 30"
            >
              <span class="material-symbols-outlined" aria-hidden="true">expand_more</span>
              More
            </button>
            <button
              class="bz-btn bz-btn--sm bz-btn--destructive fira-sans-condensed-black-italic"
              :disabled="!state.catalog.length"
              @click="clearCatalog"
            >
              <span class="material-symbols-outlined" aria-hidden="true">delete_sweep</span>
              Clear all
            </button>
          </div>
        </div>
        <BonzaiDataTable
          v-if="state.catalog.length"
          :columns="catalogColumns"
          :rows="visibleCatalogRows"
          :row-key="row => row.id"
          density="compact"
          empty-title="No produced content"
          empty-subtitle="Create a goal with a concrete output, then run the assigned role."
        >
          <template #cell-pipeline="{ row }">
            <span class="company-pill company-pill--info">{{ row.pipeline }}</span>
          </template>
          <template #cell-output="{ row }">
            <pre class="catalog-output">{{ outputPreview(row) }}</pre>
          </template>
          <template #cell-prompt="{ row }">
            <span class="ellipsis" :title="row.prompt">{{ row.prompt || '—' }}</span>
          </template>
          <template #cell-share="{ row }">
            <button class="bz-iconbtn bz-iconbtn--sm" @click="copy(row.shareLink || outputPreview(row))" title="Copy deliverable">
              <span class="material-symbols-outlined">content_copy</span>
            </button>
          </template>
          <template #cell-actions="{ row }">
            <button class="bz-iconbtn bz-iconbtn--sm" @click="downloadDeliverable(row)" title="Download deliverable">
              <span class="material-symbols-outlined">download</span>
            </button>
            <button class="bz-iconbtn bz-iconbtn--sm bz-iconbtn--danger" @click="removeContent(row.id)" title="Delete artifact">
              <span class="material-symbols-outlined">delete</span>
            </button>
          </template>
        </BonzaiDataTable>
        <BonzaiEmptyState
          v-else
          size="compact"
          icon="factory"
          title="No deliverables yet"
          subtitle="Create a goal with a concrete output, then run the assigned role."
          :show-orb="false"
        />
      </div>

      <!-- ─── Approvals ─── -->
      <div v-else-if="active === 'approvals'" class="panel models__activity--payouts">
        <div class="section-head">
          <h2 class="panel-title fira-sans-condensed-black-italic">
            <span class="material-symbols-outlined">rule</span>
            Pending approvals
          </h2>
          <div class="section-head__actions">
            <button
              class="bz-btn bz-btn--sm bz-btn--success fira-sans-condensed-black-italic"
              :disabled="!state.approvals.length"
              @click="approveAll"
            >
              <span class="material-symbols-outlined" aria-hidden="true">done_all</span>
              Approve all
            </button>
            <button
              class="bz-btn bz-btn--sm bz-btn--destructive fira-sans-condensed-black-italic"
              :disabled="!state.approvals.length"
              @click="rejectAll"
            >
              <span class="material-symbols-outlined" aria-hidden="true">delete_sweep</span>
              Reject all
            </button>
          </div>
        </div>
        <div v-if="!state.approvals.length" class="empty">All clear.</div>
        <div v-else class="approval-list">
          <div
            v-for="item in visibleApprovals"
            :key="item.id"
            class="approval-card"
          >
            <div class="approval-card__head">
              <strong class="fira-sans-condensed-black-italic">{{ item.action.type }}</strong>
              <span class="company-pill">{{ item.cls }}</span>
              <span class="approval-card__time">{{ fmtTime(item.requestedAt) }}</span>
            </div>
            <div class="approval-card__by">
              by {{ item.role }} · companion {{ item.requestedBy }}
            </div>
            <pre class="approval-card__action">{{ JSON.stringify(item.action, null, 2) }}</pre>
            <div class="approval-card__actions">
              <button class="bz-btn bz-btn--success fira-sans-condensed-black-italic" @click="approve(item.id)">
                <span class="material-symbols-outlined" aria-hidden="true">check</span>
                Approve
              </button>
              <button class="bz-btn bz-btn--destructive fira-sans-condensed-black-italic" @click="reject(item.id)">
                <span class="material-symbols-outlined" aria-hidden="true">close</span>
                Reject
              </button>
            </div>
          </div>
          <button
            v-if="visibleApprovals.length < state.approvals.length"
            class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic load-more-btn"
            @click="approvalLimit += 25"
          >
            <span class="material-symbols-outlined" aria-hidden="true">expand_more</span>
            Load more
          </button>
        </div>
      </div>

      <!-- ─── Treasury ─── -->
      <div v-else-if="active === 'treasury'" class="panel models__activity--payouts">
        <h2 class="panel-title fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">account_balance</span>
          Treasury
        </h2>

        <div class="dash-kpis dash-kpis--treasury">
          <div class="kpi-tile">
            <div class="kpi-tile__icon">
              <span class="material-symbols-outlined">savings</span>
            </div>
            <div class="kpi-tile__value fira-sans-condensed-black-italic">
              {{ fmtMoney(state.treasuryState?.balance, state.treasuryState?.currency) }}
            </div>
            <div class="kpi-tile__label fira-sans-condensed-black-italic">Balance</div>
          </div>
          <div class="kpi-tile">
            <div class="kpi-tile__icon">
              <span class="material-symbols-outlined">shield</span>
            </div>
            <div class="kpi-tile__value fira-sans-condensed-black-italic">
              {{ fmtMoney(charter.rules.reserveFloor, state.treasuryState?.currency) }}
            </div>
            <div class="kpi-tile__label fira-sans-condensed-black-italic">Reserve floor</div>
          </div>
          <div class="kpi-tile">
            <div class="kpi-tile__icon">
              <span class="material-symbols-outlined">speed</span>
            </div>
            <div class="kpi-tile__value fira-sans-condensed-black-italic">
              {{ fmtMoney(charter.rules.perHeartbeatSpendCap, state.treasuryState?.currency) }}
            </div>
            <div class="kpi-tile__label fira-sans-condensed-black-italic">Per-tick cap</div>
          </div>
        </div>

        <hr />

        <h3 class="panel-subtitle fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">add_circle</span>
          Record manual entry
        </h3>
        <div class="manual-entry">
          <input
            v-model.number="manual.amount"
            class="input is-medium"
            type="number"
            step="0.01"
            placeholder="amount"
          />
          <input
            v-model="manual.memo"
            class="input is-medium"
            placeholder="memo (e.g. 'Substack payout')"
          />
          <button class="bz-btn bz-btn--success fira-sans-condensed-black-italic" @click="recordRevenue">
            <span class="material-symbols-outlined" aria-hidden="true">arrow_upward</span>
            Revenue
          </button>
          <button class="bz-btn bz-btn--warning fira-sans-condensed-black-italic" @click="recordSpend">
            <span class="material-symbols-outlined" aria-hidden="true">arrow_downward</span>
            Spend
          </button>
        </div>

        <hr />

        <h3 class="panel-subtitle fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">receipt_long</span>
          Recent treasury activity
        </h3>
        <BonzaiDataTable
          v-if="treasuryEntries.length"
          :columns="treasuryColumns"
          :rows="treasuryEntries"
          :row-key="row => row.id"
          density="compact"
          empty-title="No treasury activity"
        >
          <template #cell-direction="{ row }">
            <span
              :class="row.direction === 'in' ? 'company-money--in' : 'company-money--out'"
              class="company-money fira-sans-condensed-black-italic"
            >
              {{ row.direction === 'in' ? '+ in' : '− out' }}
            </span>
          </template>
          <template #cell-memo="{ row }">
            <span class="ellipsis">{{ row.note || row.source || row.recipient || '—' }}</span>
          </template>
        </BonzaiDataTable>
        <BonzaiEmptyState
          v-else
          size="compact"
          icon="receipt_long"
          title="No treasury activity yet"
          :show-orb="false"
        />
      </div>

      <!-- ─── Connectors ─── -->
      <CompanyConnectors
        v-else-if="active === 'connectors'"
        :charter="charter"
        :state="state"
      />

      <!-- ─── Audit log ─── -->
      <div v-else-if="active === 'audit'" class="panel models__activity--payouts">
        <div class="section-head">
          <h2 class="panel-title fira-sans-condensed-black-italic">
            <span class="material-symbols-outlined">list_alt</span>
            Audit log
            <small class="muted">(last 200)</small>
          </h2>
          <button
            class="bz-btn bz-btn--sm bz-btn--destructive fira-sans-condensed-black-italic"
            :disabled="!state.audit.length"
            @click="clearAuditConfirm"
          >
            <span class="material-symbols-outlined" aria-hidden="true">delete_sweep</span>
            Clear all
          </button>
        </div>
        <BonzaiDataTable
          v-if="state.audit.length"
          :columns="auditColumns"
          :rows="visibleAuditEntries"
          :row-key="row => row.id"
          density="compact"
          empty-title="No actions logged"
        >
          <template #cell-role="{ row }">
            <span v-if="row.role" class="company-pill company-pill--info">{{ roleDisplayName(row.role) }}</span>
            <span v-else class="muted">—</span>
          </template>
          <template #cell-status="{ row }">
            <span :class="`status-${row.status} fira-sans-condensed-black-italic`">
              {{ row.status || '—' }}
            </span>
          </template>
          <template #cell-note="{ row }">
            <span class="ellipsis">{{ row.note || row.txOrLink || '' }}</span>
          </template>
          <template #cell-actions="{ row }">
            <button class="bz-iconbtn bz-iconbtn--sm bz-iconbtn--danger" @click="store.removeAuditEntry(row.id)" title="Delete audit entry">
              <span class="material-symbols-outlined">delete</span>
            </button>
          </template>
        </BonzaiDataTable>
        <button
          v-if="visibleAuditEntries.length < state.audit.length"
          class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic load-more-btn"
          @click="auditLimit += 80"
        >
          <span class="material-symbols-outlined" aria-hidden="true">expand_more</span>
          Load more
        </button>
        <BonzaiEmptyState
          v-if="!state.audit.length"
          size="compact"
          icon="list_alt"
          title="No actions logged yet"
          :show-orb="false"
        />
      </div>

      <!-- ─── Charter ─── -->
      <div v-else-if="active === 'charter'" class="panel models__activity--payouts">
        <div class="section-head">
          <h2 class="panel-title fira-sans-condensed-black-italic">
            <span class="material-symbols-outlined">edit_note</span>
            Charter
          </h2>
          <div class="section-head__actions">
            <button class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" @click="exportCompany">
              <span class="material-symbols-outlined" aria-hidden="true">download</span>
              Export
            </button>
            <button class="bz-btn bz-btn--destructive fira-sans-condensed-black-italic" @click="dissolveCompany">
              <span class="material-symbols-outlined" aria-hidden="true">delete</span>
              Delete
            </button>
          </div>
        </div>

        <div class="charter-editor">
          <label class="charter-field charter-field--wide">
            <span>Company name</span>
            <input v-model.trim="charterDraft.name" class="input is-medium" />
          </label>
          <label class="charter-field charter-field--wide">
            <span>Mission</span>
            <textarea v-model.trim="charterDraft.mission" class="textarea" rows="4"></textarea>
          </label>
          <label class="charter-field">
            <span>Currency</span>
            <select v-model="charterDraft.currency" class="company-admin-select">
              <option v-for="c in state.currencies" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
          <label class="charter-field">
            <span>Reserve floor</span>
            <input v-model.number="charterDraft.reserveFloor" class="input is-medium" type="number" min="0" step="1" />
          </label>
          <label class="charter-field">
            <span>Per run spend cap</span>
            <input v-model.number="charterDraft.perHeartbeatSpendCap" class="input is-medium" type="number" min="0" step="1" />
          </label>
          <label class="charter-field">
            <span>CEO cadence (min)</span>
            <input v-model.number="charterDraft.ceoMin" class="input is-medium" type="number" min="1" step="1" />
          </label>
          <label class="charter-field">
            <span>Role cadence (min)</span>
            <input v-model.number="charterDraft.roleMin" class="input is-medium" type="number" min="1" step="1" />
          </label>
          <label class="charter-field">
            <span>LLM execution</span>
            <select v-model="charterDraft.llmMode" class="company-admin-select">
              <option value="swap">Sequential, swap models</option>
              <option value="sequential">Sequential, current model</option>
              <option value="parallel">Parallel model pool</option>
            </select>
          </label>
          <label class="charter-field">
            <span>LLM parallel limit</span>
            <input
              v-model.number="charterDraft.llmMaxConcurrent"
              class="input is-medium"
              type="number"
              min="1"
              max="8"
              step="1"
              :disabled="charterDraft.llmMode !== 'parallel'"
            />
          </label>
          <label class="charter-field">
            <span>Media execution</span>
            <select v-model="charterDraft.diffusionMode" class="company-admin-select">
              <option value="sequential">Sequential</option>
              <option value="parallel">Parallel</option>
            </select>
          </label>
          <label class="charter-field">
            <span>Media parallel limit</span>
            <input
              v-model.number="charterDraft.diffusionMaxConcurrent"
              class="input is-medium"
              type="number"
              min="1"
              max="8"
              step="1"
              :disabled="charterDraft.diffusionMode !== 'parallel'"
            />
          </label>
        </div>

        <div class="charter-actions">
          <button
            class="bz-btn bz-btn--success fira-sans-condensed-black-italic"
            :class="{ 'is-loading': charterBusy }"
            :disabled="charterBusy || !charterDraft.name || !charterDraft.mission"
            @click="saveCharter"
          >
            <span class="material-symbols-outlined" aria-hidden="true">save</span>
            Save charter
          </button>
          <button class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" @click="resetCharterDraft">
            <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
            Reset
          </button>
        </div>
      </div>
      </section>
    </div>

    <section class="company-telemetry-bar" aria-label="Company telemetry">
      <section class="rail-panel llm-strip">
        <div class="rail-panel__head">
          <div>
            <p class="command-center__eyebrow">Model capacity</p>
            <h3 class="rail-panel__title fira-sans-condensed-black-italic">LLM Pool</h3>
          </div>
          <button
            class="bz-iconbtn bz-iconbtn--sm"
            @click="refreshPool"
            title="Refresh pool"
            aria-label="Refresh LLM pool"
          >
            <span class="material-symbols-outlined">refresh</span>
          </button>
        </div>

        <div v-if="pool.err" class="rail-error">
          <span class="material-symbols-outlined">error</span>
          {{ pool.err }}
        </div>
        <template v-else>
          <div class="llm-strip__stats">
            <div>
              <span class="llm-rail__value fira-sans-condensed-black-italic">{{ configuredRoleModels.length || pool.instances.length }}</span>
              <span class="llm-rail__label">models</span>
            </div>
            <div>
              <span class="llm-rail__value fira-sans-condensed-black-italic">{{ totalInFlight }}</span>
              <span class="llm-rail__label">in flight</span>
            </div>
            <div>
              <span class="llm-rail__value fira-sans-condensed-black-italic">{{ poolUsedPct }}%</span>
              <span class="llm-rail__label">budget</span>
            </div>
          </div>
          <div v-if="pool.instances.length" class="llm-strip__instances">
            <div v-for="i in pool.instances.slice(0, 3)" :key="i.modelKey" class="llm-instance">
              <span class="llm-instance__dot" :class="{ 'is-active': i.inFlight > 0 }"></span>
              <span class="llm-instance__name fira-sans-condensed-black-italic">{{ llmLabel(i.modelKey) }}</span>
              <span class="llm-instance__meta">{{ fmtBytes(i.sizeBytes) }}</span>
            </div>
          </div>
          <div v-else-if="configuredRoleModels.length" class="llm-strip__instances">
            <div v-for="model in configuredRoleModels.slice(0, 4)" :key="model.key" class="llm-instance">
              <span class="llm-instance__dot"></span>
              <span class="llm-instance__name fira-sans-condensed-black-italic">{{ model.label }}</span>
              <span class="llm-instance__meta">{{ model.roles.length }} role{{ model.roles.length === 1 ? '' : 's' }}</span>
            </div>
          </div>
          <div v-else class="rail-empty">
            No role models configured. Roles will use the current chat model until you assign one.
          </div>
        </template>
      </section>

      <CompanyLiveFeed
        compact
        horizontal
        :charter="charter"
        :state="state"
      />
    </section>

    <!-- ════════════ Role-edit modal ════════════ -->
    <div
      v-if="editingRoleKey"
      class="role-modal-overlay"
      @click.self="closeRoleEdit"
    >
      <div class="role-modal models__activity--payouts">
        <div class="role-modal__header">
          <h2 class="fira-sans-condensed-black-italic">
            <span class="material-symbols-outlined" aria-hidden="true">settings</span>
            <span class="role-modal__title">{{ charter.roles[editingRoleKey]?.companion ? roleDisplayName(editingRoleKey) : 'Add role' }}</span>
          </h2>
          <BzCloseButton size="md" aria-label="Close" @click="closeRoleEdit" />
        </div>

        <p class="role-modal__desc">
          {{ state.roleLibrary[editingRoleKey]?.description }}
        </p>

        <hr />

        <div class="field">
          <label class="label fira-sans-condensed-black-italic">Role</label>
          <div class="select is-fullwidth is-medium">
            <select v-model="editingRoleKey">
              <option v-for="role in rolePickerOptions" :key="role.key" :value="role.key">
                {{ role.label }}
              </option>
            </select>
          </div>
        </div>

        <div class="field">
          <label class="label fira-sans-condensed-black-italic">Companion</label>
          <p class="hint">Who owns this work.</p>
          <div class="select is-fullwidth is-medium">
            <select v-model="editDraft.companion">
              <option :value="null">Unassigned</option>
              <option v-for="comp in companionList" :key="comp.id" :value="comp.id">
                {{ comp.name }}
              </option>
            </select>
          </div>
        </div>

        <div class="field">
          <label class="label fira-sans-condensed-black-italic">Preferred LLM</label>
          <p class="hint">The intelligence model this role uses. If empty, the role uses the currently loaded chat model.</p>
          <div class="select is-fullwidth is-medium">
            <select v-model="editDraft.llm">
              <option :value="null">Current model</option>
              <option v-for="llm in llmOptionsList" :key="llm.key" :value="llm.key">
                {{ llm.label }}
              </option>
            </select>
          </div>
        </div>

        <div class="field">
          <label class="label fira-sans-condensed-black-italic">Media tools</label>
          <p class="hint">Allow this role to call BonzAI generation pipelines when a task needs creative assets.</p>
          <div class="pipeline-checks">
            <label
              v-for="pipeline in mediaPipelineOptions"
              :key="pipeline.key"
              class="pipeline-check"
              :class="{ 'is-on': editDraft.pipelines.includes(pipeline.key) }"
            >
              <input type="checkbox" :value="pipeline.key" v-model="editDraft.pipelines" />
              <span class="material-symbols-outlined" aria-hidden="true">{{ pipeline.icon }}</span>
              {{ pipeline.label }}
            </label>
          </div>
        </div>

        <div class="field">
          <label class="label fira-sans-condensed-black-italic">Prompt style</label>
          <p class="hint">Keep the default unless a role needs a different structured-output style.</p>
          <div class="select is-fullwidth is-medium">
            <select v-model="editDraft.gateway">
              <option :value="null">Default</option>
              <option value="openclaw">General</option>
              <option value="hermes">Structured JSON</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label class="label fira-sans-condensed-black-italic">
            Per-tick budget cap
            <span class="hint-inline">
              (optional override; default = {{ defaultBudgetForRole(editingRoleKey) }} {{ charter.rules.currency }})
            </span>
          </label>
          <input
            v-model.number="editDraft.budget"
            class="input is-medium"
            type="number"
            min="0"
            step="0.5"
            :placeholder="`${defaultBudgetForRole(editingRoleKey)} (default)`"
          />
        </div>

        <hr />

        <div class="role-modal__actions">
          <button
            v-if="charter.roles[editingRoleKey]?.companion"
            class="bz-btn bz-btn--destructive fira-sans-condensed-black-italic"
            @click="fireRole"
            title="Unassign the companion. Role becomes inheritable."
          >
            <span class="material-symbols-outlined" aria-hidden="true">person_remove</span>
            Unassign
          </button>
          <div class="role-modal__actions-right">
            <button class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" @click="closeRoleEdit">
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
              Cancel
            </button>
            <button
              class="bz-btn bz-btn--success fira-sans-condensed-black-italic"
              :class="{ 'is-loading': editBusy }"
              :disabled="editBusy || !editDraft.companion"
              @click="saveRoleEdit"
            >
              <span class="material-symbols-outlined" aria-hidden="true">save</span>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── New Goal modal ─────────────────────────────────────────── -->
    <div
      v-if="goalModalOpen"
      class="role-modal-overlay"
      @click.self="closeNewGoalModal"
    >
      <div class="role-modal models__activity--payouts goal-modal">
        <div class="role-modal__header">
          <h2 class="fira-sans-condensed-black-italic">
            <span class="material-symbols-outlined" aria-hidden="true">flag</span>
            <span class="role-modal__title">New goal</span>
          </h2>
          <BzCloseButton size="md" aria-label="Close" @click="closeNewGoalModal" />
        </div>
        <p class="role-modal__desc">
          Set a clear intent and the tasks that fulfill it. Each task auto-routes
          to a role by its first verb (write, broadcast, pay, audit, …).
        </p>

        <hr />

        <label class="goal-modal__label">Title</label>
        <input
          v-model.trim="goalDraft.title"
          class="input is-medium"
          placeholder="e.g. 'Launch this week's haiku release'"
          maxlength="160"
        />

        <label class="goal-modal__label">Why this matters (mission alignment)</label>
        <textarea
          v-model="goalDraft.rationale"
          class="textarea"
          rows="2"
          placeholder="Optional but recommended — a sentence on how this goal serves the mission."
        ></textarea>

        <label class="goal-modal__label">Tasks</label>
        <div
          v-for="(task, idx) in goalDraft.tasks"
          :key="idx"
          class="goal-modal__task"
        >
          <input
            v-model.trim="task.title"
            class="input"
            :placeholder="`Task ${idx + 1} — start with a verb (write, broadcast, pay…)`"
            maxlength="200"
          />
          <div class="select">
            <select v-model="task.assigneeRole">
              <option value="">Auto-route by verb</option>
              <option v-for="roleKey in filledRoles" :key="roleKey" :value="roleKey">
                {{ roleDisplayName(roleKey) }}
              </option>
            </select>
          </div>
          <div class="select">
            <select v-model="task.priority">
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>
          <button
            v-if="goalDraft.tasks.length > 1"
            class="bz-iconbtn bz-iconbtn--sm"
            @click="removeGoalTask(idx)"
            aria-label="Remove task"
          >
            <span class="material-symbols-outlined">remove</span>
          </button>
        </div>
        <button
          class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
          @click="addGoalTask"
        >
          <span class="material-symbols-outlined" aria-hidden="true">add</span>
          Add task
        </button>

        <hr />

        <div class="role-modal__actions">
          <div class="role-modal__actions-right" style="margin-left:auto;">
            <button class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" @click="closeNewGoalModal">
              Cancel
            </button>
            <button
              class="bz-btn bz-btn--primary fira-sans-condensed-black-italic"
              :class="{ 'is-loading': goalBusy }"
              :disabled="goalBusy || !goalDraft.title.trim() || !goalDraft.tasks.some(t => t.title.trim())"
              @click="submitNewGoal"
            >
              <span class="material-symbols-outlined" aria-hidden="true">add_circle</span>
              Create goal
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { computed, reactive, ref, watch, onMounted, onUnmounted } from "vue";
import companyStore from "../../stores/companyStore.js";
import { DEFAULT_COMPANIONS, listAllLLMs } from "../../skills/flagship.js";
import { SKILL_MANIFESTS } from "../../services/company/skillManifests.js";
import CompanyConnectors from "./CompanyConnectors.vue";
import CompanyLiveFeed from "./CompanyLiveFeed.vue";
import BzCloseButton from "../BzCloseButton.vue";
import BonzaiDataTable from "../BonzaiDataTable.vue";
import BonzaiEmptyState from "../BonzaiEmptyState.vue";
import ModeChipBar from "../generative/ModeChipBar.vue";

export default {
  name: "CompanyDashboard",
  components: {
    BzCloseButton, BonzaiDataTable, BonzaiEmptyState, CompanyConnectors, CompanyLiveFeed, ModeChipBar },
  props: {
    charter: { type: Object, required: true },
    state: { type: Object, required: true },
  },
  emits: ["edit", "reload", "new-company"],
  setup(props) {
    const store = companyStore;
    const active = ref("command");
    const manual = reactive({ amount: 0, memo: "" });
    const goalLimit = ref(20);
    const catalogLimit = ref(30);
    const approvalLimit = ref(25);
    const auditLimit = ref(80);
    const charterBusy = ref(false);
    const charterDraft = reactive({
      name: "",
      mission: "",
      currency: "USD",
      reserveFloor: 0,
      perHeartbeatSpendCap: 0,
      ceoMin: 60,
      roleMin: 30,
      llmMode: "swap",
      llmMaxConcurrent: 2,
      diffusionMode: "sequential",
      diffusionMaxConcurrent: 1,
    });
    const companyDisplayName = computed(() =>
      (props.charter.name || "Untitled Company").replace(/\s+\(Draft\)$/i, ""),
    );

    function resetCharterDraft() {
      charterDraft.name = companyDisplayName.value;
      charterDraft.mission = props.charter.mission || "";
      charterDraft.currency = props.charter.rules?.currency || "USD";
      charterDraft.reserveFloor = props.charter.rules?.reserveFloor || 0;
      charterDraft.perHeartbeatSpendCap = props.charter.rules?.perHeartbeatSpendCap || 0;
      charterDraft.ceoMin = props.charter.heartbeat?.ceoMin || 60;
      charterDraft.roleMin = props.charter.heartbeat?.roleMin || 30;
      charterDraft.llmMode = props.charter.execution?.llm?.mode || "swap";
      charterDraft.llmMaxConcurrent = props.charter.execution?.llm?.maxConcurrent || 2;
      charterDraft.diffusionMode = props.charter.execution?.diffusion?.mode || "sequential";
      charterDraft.diffusionMaxConcurrent = props.charter.execution?.diffusion?.maxConcurrent || 1;
    }

    watch(() => props.charter?.id, resetCharterDraft, { immediate: true });

    async function saveCharter() {
      charterBusy.value = true;
      try {
        const next = JSON.parse(JSON.stringify(props.charter));
        next.name = charterDraft.name.trim();
        next.mission = charterDraft.mission.trim();
        next.rules = {
          ...(next.rules || {}),
          currency: charterDraft.currency,
          reserveFloor: Number(charterDraft.reserveFloor) || 0,
          perHeartbeatSpendCap: Number(charterDraft.perHeartbeatSpendCap) || 0,
        };
        next.treasury = {
          ...(next.treasury || {}),
          currency: charterDraft.currency,
        };
        next.heartbeat = {
          ...(next.heartbeat || {}),
          ceoMin: Math.max(1, Number(charterDraft.ceoMin) || 60),
          roleMin: Math.max(1, Number(charterDraft.roleMin) || 30),
        };
        next.execution = {
          ...(next.execution || {}),
          llm: {
            ...(next.execution?.llm || {}),
            mode: charterDraft.llmMode || "swap",
            maxConcurrent: Math.max(1, Math.min(8, Number(charterDraft.llmMaxConcurrent) || 1)),
          },
          diffusion: {
            ...(next.execution?.diffusion || {}),
            mode: charterDraft.diffusionMode || "sequential",
            maxConcurrent: Math.max(1, Math.min(8, Number(charterDraft.diffusionMaxConcurrent) || 1)),
          },
        };
        next.identity = {
          ...(next.identity || {}),
          brandName: next.name,
        };
        await store.update(next);
      } catch (err) {
        alert("Save failed: " + (err.message || err));
      } finally {
        charterBusy.value = false;
      }
    }

    // ─── Role-edit modal ─────────────────────────────────────────
    const editingRoleKey = ref(null);
    const mediaPipelineOptions = [
      { key: "image", label: "Image", icon: "image" },
      { key: "video", label: "Video", icon: "movie" },
      { key: "audio", label: "Audio", icon: "graphic_eq" },
      { key: "music", label: "Music", icon: "music_note" },
      { key: "3d", label: "3D", icon: "deployed_code" },
      { key: "vision", label: "Vision", icon: "visibility" },
    ];
    const editDraft = reactive({ companion: null, llm: null, gateway: null, budget: null, pipelines: [] });
    const editBusy = ref(false);

    const companionList = DEFAULT_COMPANIONS.map((c) => ({ id: c.id, name: c.name }));
    const availableRoleOptions = computed(() =>
      Object.keys(props.state.roleLibrary || {})
        .filter((roleKey) => !props.charter.roles?.[roleKey]?.companion)
        .map((roleKey) => ({ key: roleKey, label: roleDisplayName(roleKey) })),
    );
    const rolePickerOptions = computed(() => {
      const current = editingRoleKey.value
        ? [{ key: editingRoleKey.value, label: roleDisplayName(editingRoleKey.value) }]
        : [];
      const seen = new Set(current.map((role) => role.key));
      return [
        ...current,
        ...availableRoleOptions.value.filter((role) => !seen.has(role.key)),
      ];
    });
    const llmOptionsList = computed(() =>
      listAllLLMs()
        .filter((model) => !model.draft)
        .map((model) => ({
          key: model.key,
          label: model.name,
          params: model.parameters || 0,
        }))
        .sort((a, b) => a.params - b.params || a.label.localeCompare(b.label)),
    );

    function defaultBudgetForRole(roleKey) {
      const def = props.state.roleLibrary[roleKey];
      if (!def) return 0;
      return ((props.charter.rules?.perHeartbeatSpendCap || 0) * (def.budgetPct || 0)).toFixed(2);
    }

    function openRoleEdit(roleKey) {
      if (!roleKey) return;
      const cur = props.charter.roles?.[roleKey] || {};
      editDraft.companion = cur.companion || null;
      editDraft.llm = cur.llm || null;
      editDraft.gateway = cur.gateway || null;
      editDraft.budget = Number.isFinite(cur.budgetPerHeartbeat) ? cur.budgetPerHeartbeat : null;
      editDraft.pipelines = Array.isArray(cur.pipelines) ? [...cur.pipelines] : [];
      editingRoleKey.value = roleKey;
    }
    function closeRoleEdit() {
      editingRoleKey.value = null;
      editBusy.value = false;
    }

    async function saveRoleEdit() {
      if (!editingRoleKey.value) return;
      editBusy.value = true;
      try {
        // Clone the charter so we don't mutate the prop directly.
        const next = JSON.parse(JSON.stringify(props.charter));
        const roleKey = editingRoleKey.value;
        next.roles = next.roles || {};
        if (!editDraft.companion) {
          if (!props.charter.roles?.[roleKey]?.companion) {
            alert("Pick a companion before adding this role.");
            editBusy.value = false;
            return;
          }
          // Unassign — drop the row entirely. Role becomes inheritable.
          delete next.roles[roleKey];
        } else {
          next.roles[roleKey] = next.roles[roleKey] || {};
          next.roles[roleKey].companion = editDraft.companion;
          if (editDraft.llm) next.roles[roleKey].llm = editDraft.llm;
          else delete next.roles[roleKey].llm;
          if (editDraft.gateway) next.roles[roleKey].gateway = editDraft.gateway;
          else delete next.roles[roleKey].gateway;
          if (editDraft.pipelines.length) next.roles[roleKey].pipelines = [...editDraft.pipelines];
          else delete next.roles[roleKey].pipelines;
          if (Number.isFinite(editDraft.budget) && editDraft.budget > 0) {
            next.roles[roleKey].budgetPerHeartbeat = editDraft.budget;
          } else {
            delete next.roles[roleKey].budgetPerHeartbeat;
          }
        }
        await store.update(next);
        closeRoleEdit();
      } catch (err) {
        alert("Save failed: " + (err.message || err));
        editBusy.value = false;
      }
    }

    async function fireRole() {
      if (!editingRoleKey.value) return;
      const roleKey = editingRoleKey.value;
      if (!confirm(`Unassign ${roleDisplayName(roleKey)}? The role becomes inheritable; CEO will pick up its work.`)) return;
      editDraft.companion = null;
      editDraft.llm = null;
      editDraft.gateway = null;
      editDraft.budget = null;
      editDraft.pipelines = [];
      await saveRoleEdit();
    }

    // ─── Issues form state (panel-local) ─────────────────────────
    const issueDraft = reactive({
      title: "",
      description: "",
      assigneeRole: "",
      priority: "normal",
    });
    const issueFilter = ref("open");
    const issueBusy = ref(false);

    async function submitIssue() {
      if (!issueDraft.title.trim() || !issueDraft.assigneeRole) return;
      issueBusy.value = true;
      try {
        await store.createIssue({
          title: issueDraft.title,
          description: issueDraft.description,
          assigneeRole: issueDraft.assigneeRole,
          priority: issueDraft.priority,
          createdBy: "user",
        });
        issueDraft.title = "";
        issueDraft.description = "";
      } finally {
        issueBusy.value = false;
      }
    }
    async function setIssueStatus(issueId, status) {
      await store.updateIssue(issueId, { status });
    }
    async function reopenIssue(issueId) { await store.reopenIssue(issueId); }
    async function removeIssue(issueId) {
      if (!confirm("Delete this issue permanently?")) return;
      await store.removeIssue(issueId);
    }
    const filteredIssues = computed(() => {
      const all = props.state.issues || [];
      if (issueFilter.value === "all") return all;
      if (issueFilter.value === "active") return all.filter((i) => i.status === "open" || i.status === "in_progress");
      return all.filter((i) => i.status === issueFilter.value);
    });
    function priorityClass(p) {
      return ({
        urgent: "company-pill--danger",
        high: "company-pill--warning",
        normal: "company-pill--info",
        low: "company-pill--neutral",
      })[p] || "company-pill--info";
    }
    function statusClass(s) {
      return ({
        open: "company-pill--info",
        in_progress: "company-pill--warning",
        blocked: "company-pill--danger",
        done: "company-pill--success",
        cancelled: "company-pill--neutral",
      })[s] || "company-pill--neutral";
    }

    // ─── Goals (parent of issues) — filters + grouping ──────────────
    const goalSourceFilter = ref("all");
    const goalStatusFilter = ref("active");
    function goalStatusClass(s) {
      return ({
        active: "company-pill--info",
        completed: "company-pill--success",
        cancelled: "company-pill--neutral",
      })[s] || "company-pill--neutral";
    }
    const filteredGoals = computed(() => {
      let all = props.state.goals || [];
      if (goalSourceFilter.value !== "all") all = all.filter((g) => g.createdBy === goalSourceFilter.value);
      if (goalStatusFilter.value !== "all") all = all.filter((g) => g.status === goalStatusFilter.value);
      return all;
    });
    const visibleGoals = computed(() => filteredGoals.value.slice(0, goalLimit.value));
    function issuesForGoal(goalId) {
      return (props.state.issues || []).filter((i) => i.goalId === goalId);
    }
    function goalProgress(goal) {
      const list = issuesForGoal(goal.id);
      const done = list.filter((i) => i.status === "done").length;
      const total = list.length || 1;
      return { done, total, pct: Math.round((done / total) * 100) };
    }
    const ungroupedIssues = computed(() =>
      (props.state.issues || []).filter((i) => !i.goalId),
    );

    // ─── New goal modal ────────────────────────────────────────────
    const goalModalOpen = ref(false);
    const goalBusy = ref(false);
    const goalDraft = reactive({
      title: "",
      rationale: "",
      tasks: [{ title: "", assigneeRole: "", priority: "normal" }],
    });
    function openNewGoalModal() {
      goalDraft.title = "";
      goalDraft.rationale = "";
      goalDraft.tasks = [{ title: "", assigneeRole: "", priority: "normal" }];
      goalModalOpen.value = true;
    }
    function closeNewGoalModal() {
      goalModalOpen.value = false;
      goalBusy.value = false;
    }
    function addGoalTask() {
      goalDraft.tasks.push({ title: "", assigneeRole: "", priority: "normal" });
    }
    function removeGoalTask(idx) {
      goalDraft.tasks.splice(idx, 1);
    }
    async function submitNewGoal() {
      if (!goalDraft.title.trim()) return;
      goalBusy.value = true;
      try {
        await store.createGoal({
          title: goalDraft.title,
          rationale: goalDraft.rationale,
          tasks: goalDraft.tasks
            .filter((t) => t.title.trim())
            .map((t) => ({
              title: t.title,
              assigneeRole: t.assigneeRole || null,
              priority: t.priority,
            })),
        });
        closeNewGoalModal();
      } catch (err) {
        alert("Failed to create goal: " + (err.message || err));
        goalBusy.value = false;
      }
    }
    async function cancelGoal(goalId) {
      if (!confirm("Cancel this goal? All open tasks under it will also be cancelled.")) return;
      await store.cancelGoal(goalId);
    }

    // ───── Live multi-instance LLM pool inventory ─────
    // The pool is always visible in the operations rail, so poll quietly
    // for lightweight status instead of tying visibility to a tab.
    const pool = reactive({
      ready: false,
      instances: [],
      totalBytes: 0,
      budgetBytes: 0,
      err: null,
    });
    let _poolTimer = null;
    async function refreshPool() {
      if (!window.electronAPI?.poolInventory) {
        pool.err = "Pool IPC not available — restart the app to pick up the new build.";
        return;
      }
      try {
        const res = await window.electronAPI.poolInventory();
        if (res?.ok) {
          pool.ready = true;
          pool.instances = res.instances || [];
          pool.totalBytes = res.totalBytes || 0;
          pool.budgetBytes = res.budgetBytes || 0;
          pool.err = null;
        } else {
          pool.err = res?.error || "unknown pool error";
        }
      } catch (err) {
        pool.ready = false;
        pool.instances = [];
        pool.totalBytes = 0;
        pool.budgetBytes = 0;
        pool.err = err.message || "Pool inventory unavailable";
      }
    }
    function startPoolPolling() {
      stopPoolPolling();
      refreshPool();
      _poolTimer = setInterval(refreshPool, 5000);
    }
    function stopPoolPolling() {
      if (_poolTimer) { clearInterval(_poolTimer); _poolTimer = null; }
    }
    onMounted(() => startPoolPolling());
    onUnmounted(() => stopPoolPolling());

    function fmtBytes(b) {
      if (!Number.isFinite(b) || b <= 0) return "0 GB";
      return `${(b / 1024 ** 3).toFixed(2)} GB`;
    }
    const poolUsedPct = computed(() => {
      if (!pool.budgetBytes) return 0;
      return Math.min(100, Math.round((pool.totalBytes / pool.budgetBytes) * 100));
    });
    const configuredRoleModels = computed(() => {
      const grouped = new Map();
      for (const [roleKey, role] of Object.entries(props.charter.roles || {})) {
        if (!role?.companion) continue;
        const key = role.llm || "__current__";
        const existing = grouped.get(key) || {
          key,
          label: key === "__current__" ? "Current chat model" : llmLabel(key),
          roles: [],
        };
        existing.roles.push(roleDisplayName(roleKey));
        grouped.set(key, existing);
      }
      return [...grouped.values()];
    });

    const totalInFlight = computed(() =>
      pool.instances.reduce((acc, i) => acc + (i.inFlight || 0), 0),
    );

    const subtabs = computed(() => [
      { value: "command", label: "Command", icon: "dashboard" },
      { value: "org", label: "Team", icon: "schema" },
      { value: "issues", label: "Work", icon: "flag",
        badge: props.state.goalCounts?.active || props.state.issueCounts?.open || null },
      { value: "deliverables", label: "Deliverables", icon: "inventory_2" },
      { value: "approvals", label: "Approvals", icon: "rule",
        badge: props.state.approvals.length || null },
      { value: "treasury", label: "Treasury", icon: "account_balance" },
      { value: "connectors", label: "Connectors", icon: "cable",
        badge: (props.state.connectorHealth?.needs_auth || 0) + (props.state.connectorHealth?.broken || 0) || null },
      { value: "audit", label: "Audit", icon: "list_alt" },
      { value: "charter", label: "Charter", icon: "edit_note" },
    ]);

    const filledRoles = computed(() =>
      Object.keys(props.charter.roles || {})
        .filter((k) => props.charter.roles[k]?.companion),
    );
    const treasuryEntries = computed(() =>
      props.state.audit.filter((e) => e.kind === "treasury"),
    );
    const totalSales = computed(() =>
      props.state.catalog.reduce((acc, e) => acc + (e.sales || 0), 0),
    );
    const latestProduced = computed(() =>
      (props.state.catalog || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null,
    );
    const catalogRows = computed(() =>
      (props.state.catalog || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    );
    const visibleCatalogRows = computed(() => catalogRows.value.slice(0, catalogLimit.value));
    const visibleApprovals = computed(() =>
      (props.state.approvals || []).slice(0, approvalLimit.value),
    );
    const visibleAuditEntries = computed(() =>
      (props.state.audit || []).slice(0, auditLimit.value),
    );
    const catalogColumns = computed(() => [
      { key: "createdAt", title: "Created", width: "96px", formatter: (v) => fmtTime(v) },
      { key: "pipeline", title: "Pipeline", width: "110px" },
      { key: "output", title: "Output", width: "260px" },
      { key: "prompt", title: "Prompt", width: "220px" },
      { key: "price", title: "Price", width: "88px", mono: true, formatter: (v, row) => fmtMoney(v, row.currency) },
      { key: "sales", title: "Sales", width: "70px", mono: true },
      { key: "revenue", title: "Revenue", width: "96px", mono: true, formatter: (v, row) => fmtMoney(v, row.currency) },
      { key: "share", title: "", width: "48px", align: "center" },
      { key: "actions", title: "", width: "84px", align: "center" },
    ]);
    const treasuryColumns = computed(() => [
      { key: "ts", title: "Time", width: "96px", formatter: (v) => fmtTime(v) },
      { key: "direction", title: "Direction", width: "110px" },
      { key: "amount", title: "Amount", width: "120px", mono: true, formatter: (v, row) => fmtMoney(v, row.currency) },
      { key: "memo", title: "Memo", width: "320px" },
      { key: "balanceAfter", title: "Balance after", width: "140px", mono: true, formatter: (v, row) => fmtMoney(v, row.currency) },
    ]);
    const auditColumns = computed(() => [
      { key: "ts", title: "Time", width: "96px", formatter: (v) => fmtTime(v) },
      { key: "role", title: "Role", width: "150px" },
      { key: "action", title: "Action", width: "160px" },
      { key: "status", title: "Status", width: "110px" },
      { key: "note", title: "Note", width: "360px" },
      { key: "actions", title: "", width: "48px", align: "center" },
    ]);

    const openIssues = computed(() =>
      (props.state.issues || []).filter((i) => i.status === "open"),
    );
    const inProgressIssues = computed(() =>
      (props.state.issues || []).filter((i) => i.status === "in_progress"),
    );
    const blockedIssues = computed(() =>
      (props.state.issues || []).filter((i) => i.status === "blocked"),
    );
    const recentProof = computed(() =>
      (props.state.audit || []).filter((e) => e.status === "executed").length,
    );
    const connectorRisk = computed(() => {
      const h = props.state.connectorHealth || {};
      const n = (h.needs_auth || 0) + (h.expired || 0) + (h.broken || 0);
      return n ? `${n} need attention` : "clear";
    });
    const operatingMetrics = computed(() => [
      {
        label: "Autonomy",
        value: props.charter.status === "active" ? "Live" : "Paused",
        hint: props.charter.demoMode ? "demo cadence" : `CEO ${props.charter.heartbeat?.ceoMin || 60}m / roles ${props.charter.heartbeat?.roleMin || 30}m`,
      },
      {
        label: "Delegated",
        value: String(props.state.goalCounts?.active || 0),
        hint: `${openIssues.value.length} open tasks`,
      },
      {
        label: "Proof",
        value: String(recentProof.value),
        hint: "executed audit entries",
      },
      {
        label: "Cash control",
        value: fmtMoney(props.state.treasuryState?.balance, props.state.treasuryState?.currency),
        hint: `${fmtMoney(props.charter.rules?.reserveFloor, props.state.treasuryState?.currency)} reserve`,
      },
    ]);
    const operatingLoop = computed(() => [
      {
        label: "Strategy",
        icon: "psychology",
        state: props.charter.status === "active" ? "active" : "idle",
        text: "CEO reads mission, treasury, connectors, and current goals.",
      },
      {
        label: "Delegation",
        icon: "account_tree",
        state: openIssues.value.length ? "active" : "idle",
        text: `${openIssues.value.length} tasks waiting across ${filledRoles.value.length} staffed roles.`,
      },
      {
        label: "Execution",
        icon: "bolt",
        state: inProgressIssues.value.length ? "active" : "idle",
        text: inProgressIssues.value.length ? `${inProgressIssues.value.length} tasks in progress.` : "Roles wake on heartbeat or manual run.",
      },
      {
        label: "Governance",
        icon: "verified_user",
        state: props.state.approvals.length || blockedIssues.value.length ? "attention" : "idle",
        text: `${props.state.approvals.length} approvals, ${blockedIssues.value.length} blocked tasks.`,
      },
      {
        label: "Proof",
        icon: "receipt_long",
        state: recentProof.value ? "active" : "idle",
        text: "Every action writes an audit trail and, when relevant, a receipt.",
      },
    ]);
    const commandRoles = computed(() =>
      filledRoles.value.map((roleKey) => {
        const role = props.charter.roles?.[roleKey] || {};
        return {
          key: roleKey,
          name: roleDisplayName(roleKey),
          companion: companionName(role.companion),
          queue: props.state.queueDepths?.[roleKey] || 0,
          llm: role.llm ? llmLabel(role.llm) : "current model",
          budget: `${defaultBudgetForRole(roleKey)} ${props.charter.rules?.currency || "USD"}`,
        };
      }),
    );
    const workStack = computed(() => [
      { label: "CEO-created goals", value: props.state.goals.filter((g) => g.createdBy === "ceo" && g.status === "active").length, state: "active" },
      { label: "Owner goals", value: props.state.goals.filter((g) => g.createdBy !== "ceo" && g.status === "active").length, state: "idle" },
      { label: "Open role tasks", value: openIssues.value.length, state: openIssues.value.length ? "active" : "idle" },
      { label: "Blocked or waiting", value: blockedIssues.value.length + props.state.approvals.length, state: blockedIssues.value.length + props.state.approvals.length ? "attention" : "idle" },
      { label: "Produced assets", value: props.state.catalog.length, state: props.state.catalog.length ? "active" : "idle" },
    ]);
    const operatingModel = computed(() => [
      {
        label: "Input",
        icon: "input",
        text: "Owner directives, template goals, connector state, treasury limits, and open issues.",
      },
      {
        label: "Plan",
        icon: "account_tree",
        text: "The CEO creates goals with child tasks and routes each task to the appropriate staffed role.",
      },
      {
        label: "Execute",
        icon: "bolt",
        text: "Roles wake on their cadence or manual run, call an LLM or connector, and finish one queued task.",
      },
      {
        label: "Gate",
        icon: "verified_user",
        text: "Risky actions pause in Approvals; spend is constrained by reserve floor and per-run caps.",
      },
      {
        label: "Record",
        icon: "receipt_long",
        text: "Finished work appears in Deliverables, with audit entries and treasury movement when applicable.",
      },
    ]);

    const _companionMap = Object.fromEntries(DEFAULT_COMPANIONS.map((c) => [c.id, c.name]));
    function companionName(id) { return _companionMap[id] || id; }

    /**
     * Short label for a granted-skill id ("skill.twilio_sms" → "twilio_sms").
     * Used inside the org card chips. Falls back to the manifest name if
     * the id doesn't match the convention.
     */
    function skillShortName(skillId) {
      if (!skillId) return "";
      const m = SKILL_MANIFESTS[skillId];
      if (!m) return skillId.replace(/^skill\./, "");
      return skillId.replace(/^skill\./, "");
    }

    /**
     * Pretty-print role keys for display. The internal keys are stable
     * ("Producer:text", "GeneralCounsel", "RnDLead") because they're
     * persisted in charters; this helper only changes the rendering.
     */
    function roleDisplayName(roleKey) {
      if (!roleKey) return "";
      if (roleKey.startsWith("Producer:")) {
        const pipeline = roleKey.split(":")[1] || "";
        let label;
        if (pipeline === "3d") label = "3D";
        else if (pipeline === "fineTune") label = "Fine-Tune";
        else label = pipeline.charAt(0).toUpperCase() + pipeline.slice(1);
        return `${label} Producer`;
      }
      const TITLES = {
        CEO: "CEO",
        CFO: "CFO",
        CPO: "CPO",
        CMO: "CMO",
        CSO: "CSO",
        COO: "COO",
        GeneralCounsel: "General Counsel",
        RnDLead: "R&D Lead",
      };
      return TITLES[roleKey] || roleKey;
    }
    function llmLabel(llmKey) {
      if (!llmKey) return "current model";
      const model = llmOptionsList.value.find((item) => item.key === llmKey);
      if (model) return model.label;
      return llmKey.replace(/^llm_/, "").replace(/_/g, " ");
    }
    function pipelineLabel(key) {
      return mediaPipelineOptions.find((pipeline) => pipeline.key === key)?.label || key;
    }

    function fmtMoney(amount, currency) {
      if (amount == null || isNaN(amount)) return `0 ${currency || ''}`;
      return `${(+amount).toFixed(2)} ${currency || 'USD'}`;
    }
    function fmtCount(value) {
      const n = Number(value) || 0;
      if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
      return String(n);
    }
    function fmtTime(ts) {
      if (!ts) return "";
      const d = new Date(ts);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    }
    function outputPreview(row) {
      if (!row) return "";
      const payload = row.payload;
      if (payload && typeof payload === "string") return truncate(payload.replace(/\s+/g, " ").trim(), 420);
      if (row.blobId) return `${row.pipeline || "media"} artifact saved as ${row.blobExt || "blob"} (${row.blobId})`;
      if (row.shareLink) return row.shareLink;
      return "Artifact recorded. Payload is stored externally or was not returned by the connector.";
    }
    function truncate(s, n) {
      if (!s) return "";
      return s.length > n ? `${s.slice(0, n - 1)}…` : s;
    }

    async function approve(id) { await store.approve(id); }
    async function approveAll() {
      if (!props.state.approvals.length) return;
      if (!confirm(`Approve all ${props.state.approvals.length} pending actions?`)) return;
      await store.approveMany(props.state.approvals.map((item) => item.id));
    }
    async function rejectAll() {
      if (!props.state.approvals.length) return;
      const reason = prompt(`Reason for rejecting all ${props.state.approvals.length} pending actions (optional):`, "");
      if (reason === null) return;
      await store.rejectMany(props.state.approvals.map((item) => item.id), reason);
    }

    /**
     * Flip demoMode on the charter at runtime. The store's update()
     * persists the charter, re-validates, and restarts the heartbeat
     * with the new (fast or normal) cadence.
     */
    async function toggleDemoMode() {
      const next = JSON.parse(JSON.stringify(props.charter));
      next.demoMode = !next.demoMode;
      try { await store.update(next); }
      catch (err) { alert("Could not toggle demo mode: " + (err.message || err)); }
    }
    async function reject(id) {
      const reason = prompt("Reason for rejection (optional):", "");
      if (reason !== null) await store.reject(id, reason);
    }
    async function clearCatalog() {
      if (!props.state.catalog.length) return;
      if (!confirm("Clear all deliverables? Audit, goals, and treasury stay intact.")) return;
      await store.clearCatalog();
    }
    async function removeContent(id) {
      if (!confirm("Delete this produced artifact from the catalog?")) return;
      await store.removeContent(id);
    }
    async function clearAuditConfirm() {
      if (!props.state.audit.length) return;
      if (!confirm("Clear the audit log? Goals, catalog, and treasury stay intact.")) return;
      await store.clearAudit();
    }
    async function recordRevenue() {
      if (!manual.amount) return;
      await store.recordRevenue({ amount: manual.amount, memo: manual.memo });
      manual.amount = 0; manual.memo = "";
    }
    async function recordSpend() {
      if (!manual.amount) return;
      await store.paySupplier({
        amount: manual.amount, memo: manual.memo,
        recipient: "manual entry",
      });
      manual.amount = 0; manual.memo = "";
    }
    async function copy(text) {
      try { await navigator.clipboard.writeText(text); } catch {}
    }
    function deliverableFilename(row) {
      const ts = row?.createdAt ? new Date(row.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, "-") : Date.now();
      const pipeline = (row?.pipeline || "deliverable").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
      const ext = row?.blobExt || (typeof row?.payload === "string" ? "txt" : "json");
      return `${pipeline}-${ts}.${ext.replace(/^\./, "")}`;
    }
    function deliverableBody(row) {
      if (typeof row?.payload === "string") return row.payload;
      return JSON.stringify({
        id: row?.id,
        pipeline: row?.pipeline,
        prompt: row?.prompt,
        payload: row?.payload ?? null,
        shareLink: row?.shareLink ?? null,
        blobId: row?.blobId ?? null,
        createdAt: row?.createdAt,
      }, null, 2);
    }
    function downloadDeliverable(row) {
      const type = typeof row?.payload === "string" ? "text/plain" : "application/json";
      const blob = new Blob([deliverableBody(row)], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = deliverableFilename(row);
      a.click();
      URL.revokeObjectURL(url);
    }
    async function runCEO() {
      await store.tickNow();
    }
    async function toggleExecution() {
      if (props.charter.status === "active") await store.pause(props.charter.id);
      else await store.resume(props.charter.id);
      await store.refreshActive();
    }
    async function exportCompany() {
      const bundle = await store.exportActive({ includePayloads: true });
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${props.charter.name.replace(/\s+/g, "_")}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
    async function dissolveCompany() {
      if (!confirm(`Permanently delete "${props.charter.name}"?\n\nThis wipes its charter, treasury, catalog, and audit log.`)) return;
      await store.dissolve(props.charter.id);
    }

    return {
      store, active, subtabs, manual,
      charterDraft, charterBusy, companyDisplayName, saveCharter, resetCharterDraft,
      goalLimit, catalogLimit, approvalLimit, auditLimit,
      filledRoles, treasuryEntries, totalSales,
      openIssues,
      visibleGoals, catalogRows, visibleCatalogRows, visibleApprovals, visibleAuditEntries,
      catalogColumns, treasuryColumns, auditColumns,
      companionName, roleDisplayName, llmLabel, pipelineLabel, skillShortName, fmtMoney, fmtCount, fmtTime,
      approve, reject, approveAll, rejectAll,
      clearCatalog, removeContent, downloadDeliverable,
      clearAuditConfirm,
      recordRevenue, recordSpend, copy, toggleDemoMode,
      toggleExecution, exportCompany, dissolveCompany,
      // pool
      pool, refreshPool, fmtBytes, poolUsedPct, totalInFlight, configuredRoleModels,
      // issues
      issueDraft, issueFilter, issueBusy, filteredIssues,
      submitIssue, setIssueStatus, reopenIssue, removeIssue,
      priorityClass, statusClass,
      // goals
      goalSourceFilter, goalStatusFilter, filteredGoals, ungroupedIssues,
      issuesForGoal, goalProgress, goalStatusClass,
      goalModalOpen, goalBusy, goalDraft,
      openNewGoalModal, closeNewGoalModal, addGoalTask, removeGoalTask,
      submitNewGoal, cancelGoal,
      // command center
      operatingMetrics, operatingLoop, commandRoles, workStack, operatingModel,
      latestProduced, outputPreview,
      connectorRisk, runCEO,
      // role-edit modal
      editingRoleKey, editDraft, editBusy,
      companionList, llmOptionsList, mediaPipelineOptions, availableRoleOptions, rolePickerOptions, defaultBudgetForRole,
      openRoleEdit, closeRoleEdit, saveRoleEdit, fireRole,
    };
  },
};
</script>

<style scoped>
hr {
  margin: 24px 0 !important;
  width: 100%;
  border: none;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--bz-fg), transparent);
}
.material-symbols-outlined {
  font-variation-settings: "FILL" 0, "wght" 100, "GRAD" -25, "opsz" 48;
  border-radius: 100%;
}

.dash {
  color: var(--bz-fg);
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) 132px;
  gap: var(--bz-space-3);
  overflow: hidden;
}

.company-cockpit {
  display: grid;
  grid-template-columns: minmax(320px, 0.88fr) minmax(420px, 1.12fr);
  gap: var(--bz-space-4);
  align-items: stretch;
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-card);
}
.company-cockpit__identity { min-width: 0; }
.company-cockpit__title {
  margin: 0 !important;
  color: var(--bz-fg) !important;
  font-size: 34px !important;
  line-height: 0.95;
  text-align: left !important;
}
.company-cockpit__chips,
.company-cockpit__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}
.company-cockpit__chips { margin-top: var(--bz-space-3); }
.company-cockpit__side {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
}
.company-cockpit__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--bz-space-2);
}
.company-cockpit__actions {
  justify-content: flex-end;
  margin-top: auto;
}
.company-demo-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45em;
  min-height: 26px;
  padding: 0 var(--bz-space-2);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
  color: var(--bz-fg-mid);
  cursor: pointer;
  font-family: var(--bz-font-ui);
  font-weight: 800;
  font-size: var(--bz-size-meta);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.company-demo-pill:hover {
  border-color: var(--bz-border-strong);
  color: var(--bz-fg);
}
.company-demo-pill.is-on {
  border-color: var(--bz-purple-300);
  background: var(--bz-purple-soft);
  color: var(--bz-purple-300);
}
.company-demo-pill .material-symbols-outlined {
  font-size: 15px !important;
  color: currentColor !important;
  -webkit-text-fill-color: currentColor !important;
}

/* ───────── KPI tiles — chat-aligned, low chrome ───────── */
.dash-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--bz-space-3);
  margin-bottom: var(--bz-space-4);
}
.dash-kpis--treasury {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  margin-bottom: var(--bz-space-4);
}

.kpi-tile {
  position: relative;
  min-height: 96px;
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-card);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: background var(--bz-dur-fast), border-color var(--bz-dur-fast);
  overflow: hidden;
}
.kpi-tile:hover {
  border-color: var(--bz-border-strong);
  background: var(--bz-raised);
}
.kpi-tile.is-attention {
  border-color: var(--bz-warning) !important;
  background: var(--bz-warning-soft);
}

.kpi-tile__icon {
  position: absolute;
  top: var(--bz-space-3);
  right: var(--bz-space-3);
  opacity: 1;
}
.kpi-tile__icon .material-symbols-outlined {
  font-size: 22px;
  color: var(--bz-purple-300);
}

.kpi-tile__value {
  font-size: 26px !important;
  color: var(--bz-fg-mid) !important;
  line-height: 1.1;
  margin: 0;
  text-align: left !important;
  word-break: break-word;
}
.kpi-tile__label {
  font-size: var(--bz-size-micro) !important;
  color: var(--bz-fg) !important;
  margin: 0 !important;
  text-align: left !important;
  font-style: italic;
  text-transform: uppercase;
  letter-spacing: 0;
}
.kpi-tile__sub {
  font-size: var(--bz-size-meta);
  color: var(--bz-fg-low);
  margin-top: var(--bz-space-1);
}

@media (max-width: 1180px) {
  .dash-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.company-subtabs {
  margin-bottom: 0;
}
.company-dashboard-shell {
  min-height: 0;
  overflow: hidden;
}
.rail-panel {
  box-sizing: border-box;
  min-width: 0;
  padding: var(--bz-space-3);
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
}
.rail-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
  margin-bottom: var(--bz-space-2);
}
.rail-panel__title {
  margin: 0 !important;
  color: var(--bz-fg) !important;
  font-size: 20px !important;
  line-height: 1;
  text-align: left !important;
}
.llm-rail__stats,
.llm-strip__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--bz-space-2);
}
.llm-rail__stats > div,
.llm-strip__stats > div,
.llm-instance {
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
}
.llm-rail__stats > div,
.llm-strip__stats > div {
  min-width: 0;
  padding: var(--bz-space-2);
}
.llm-rail__value,
.llm-rail__label {
  display: block;
}
.llm-rail__value {
  color: var(--bz-fg);
  font-size: 21px;
  line-height: 1;
}
.llm-rail__label {
  margin-top: var(--bz-space-1);
  color: var(--bz-fg-low);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.llm-rail__instances,
.llm-strip__instances {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
  margin-top: var(--bz-space-2);
}
.llm-instance {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--bz-space-2);
  min-height: 30px;
  padding: 0 var(--bz-space-3);
}
.llm-instance__dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--bz-fg-low);
}
.llm-instance__dot.is-active { background: var(--bz-emerald-500); }
.llm-instance__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--bz-fg);
  font-size: 14px;
  line-height: 1;
}
.llm-instance__meta,
.rail-empty,
.rail-error {
  color: var(--bz-fg-low);
  font-size: 12px;
  line-height: 1.45;
}
.rail-empty,
.rail-error { margin-top: var(--bz-space-3); }
.rail-error {
  display: flex;
  gap: var(--bz-space-2);
  color: var(--bz-danger);
}
.company-telemetry-bar {
  height: 132px;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(290px, 360px) minmax(0, 1fr);
  gap: var(--bz-space-3);
  overflow: hidden;
}
.llm-strip {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

/* ───────── Panels ───────── */
.dash-body {
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 0;
}
.panel {
  padding: 2em 2.5em !important;
  border: 1px solid var(--bz-border);
  border-radius: 4px !important;
  background: var(--bz-card);
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
  margin-bottom: var(--bz-space-3);
}
.section-head__hint {
  flex: 1;
  min-width: min(360px, 100%);
  margin: 0 !important;
  color: var(--bz-fg-mid) !important;
  font-size: 13px !important;
  line-height: 1.45;
  text-align: left !important;
}
.section-head .panel-title {
  margin-bottom: 0;
}
.section-head__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}
.load-more-btn {
  width: 100%;
  justify-content: center;
  margin-top: var(--bz-space-3);
}
.settings-block {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
}
.company-admin-grid {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) repeat(4, auto);
  gap: var(--bz-space-2);
  align-items: end;
}
.company-admin-field {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-1);
  min-width: 0;
  color: var(--bz-fg-low);
  font-family: var(--bz-font-ui);
  font-size: var(--bz-size-meta);
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.company-admin-select {
  width: 100%;
  min-height: 38px;
  padding: 0 var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
  color: var(--bz-fg);
  font-family: var(--bz-font-ui);
}
.charter-editor {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--bz-space-3);
}
.charter-field {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-1);
  color: var(--bz-fg-low);
  font-family: var(--bz-font-ui);
  font-size: var(--bz-size-meta);
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.charter-field--wide {
  grid-column: 1 / -1;
}
.charter-actions {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  margin-top: var(--bz-space-4);
}

/* ───────── Command center ───────── */
.company-command {
  display: flex;
  flex-direction: column;
  gap: 1em;
}
.command-center {
  padding: 2em 2.25em !important;
  background: var(--bz-card);
}
.command-center__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1.5em;
  align-items: start;
}
.command-center__copy {
  min-width: 0;
}
.command-center__eyebrow {
  margin: 0 0 0.4em !important;
  color: var(--bz-fg-low) !important;
  font-size: 11px !important;
  line-height: 1 !important;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  text-align: left !important;
  font-family: "Fira Sans", sans-serif;
  font-weight: 700;
}
.command-center__mission {
  max-width: 78ch;
  margin: 0 !important;
  color: var(--bz-fg-mid) !important;
  font-size: 15px !important;
  line-height: 1.5;
  text-align: left !important;
}
.command-center__actions {
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  gap: 0.6em;
  flex-wrap: wrap;
  min-width: 300px;
}
.command-center__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75em;
  margin-top: 1.5em;
}
.command-metric {
  min-width: 0;
  padding: var(--bz-space-2);
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: 4px;
}
.command-metric__label,
.command-metric__hint {
  display: block;
  color: var(--bz-fg-low);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.command-metric__value {
  display: block;
  margin: 0.15em 0;
  color: var(--bz-fg);
  font-size: 20px;
  line-height: 1.05;
  overflow-wrap: anywhere;
}

.operating-loop {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.75em;
}
.loop-step {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.75em;
  padding: 1em;
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: 4px;
}
.loop-step__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  background: var(--bz-canvas);
}
.loop-step__icon .material-symbols-outlined {
  font-size: 20px;
}
.loop-step--active .loop-step__icon {
  color: var(--bz-emerald-500);
  background: var(--bz-emerald-soft);
}
.loop-step--attention {
  border-color: var(--bz-warning);
}
.loop-step--attention .loop-step__icon {
  color: var(--bz-warning);
  background: var(--bz-warning-soft);
}
.loop-step__label {
  color: var(--bz-fg);
  font-size: 15px;
  line-height: 1.1;
  text-transform: uppercase;
}
.loop-step__text {
  margin-top: 0.35em;
  color: var(--bz-fg-mid);
  font-size: 12px;
  line-height: 1.4;
}

.ops-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
  gap: 1em;
}
.ops-panel {
  min-width: 0;
  padding: 1.25em;
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: 4px;
}
.ops-panel--proof,
.ops-panel--lanes,
.ops-panel--org {
  grid-row: span 2;
}
.ops-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1em;
  margin-bottom: 1em;
}
.ops-panel__title {
  margin: 0 !important;
  color: var(--bz-fg) !important;
  font-size: 22px !important;
  line-height: 1;
  text-align: left !important;
}
.command-org,
.ops-lanes,
.work-stack,
.money-stack {
  display: flex;
  flex-direction: column;
  gap: 0.6em;
}
.command-role {
  padding: 0.9em;
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: 4px;
}
.command-role.is-ceo {
  border-color: var(--bz-border-brand);
  background: var(--bz-purple-soft);
}
.command-role.has-work {
  border-color: var(--bz-emerald-500);
}
.command-role__top,
.command-role__meta,
.work-stack__row,
.money-stack__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75em;
}
.command-role__role {
  color: var(--bz-fg);
  font-size: 18px;
  line-height: 1;
  text-transform: uppercase;
}
.command-role__queue {
  color: var(--bz-fg-low);
  font-size: 11px;
  text-transform: uppercase;
  white-space: nowrap;
}
.command-role__agent {
  margin-top: 0.35em;
  color: var(--bz-fg-mid);
  font-size: 13px;
}
.command-role__meta {
  margin-top: 0.65em;
  color: var(--bz-fg-low);
  font-size: 11px;
}
.work-stack__row,
.money-stack__row {
  min-height: 38px;
  padding: 0.7em 0.85em;
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: 4px;
}
.work-stack__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--bz-fg-low);
  flex-shrink: 0;
}
.work-stack__dot.is-active { background: var(--bz-emerald-500); }
.work-stack__dot.is-attention { background: var(--bz-warning); }
.work-stack__label {
  flex: 1;
  min-width: 0;
  color: var(--bz-fg-mid);
  font-size: 13px;
}
.work-stack__value {
  color: var(--bz-fg);
  font-size: 18px;
}
.ops-lane {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.75em;
  padding: 0.9em;
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: 4px;
}
.ops-lane .material-symbols-outlined {
  font-size: 22px;
  color: var(--bz-purple-300);
}
.ops-lane__label {
  color: var(--bz-fg);
  font-size: 16px;
  line-height: 1;
  text-transform: uppercase;
}
.ops-lane p {
  margin: 0.35em 0 0 !important;
  color: var(--bz-fg-mid) !important;
  font-size: 12px !important;
  line-height: 1.45;
  text-align: left !important;
}
.proof-card {
  min-width: 0;
  padding: 0.95em;
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: 4px;
}
.proof-card--empty {
  color: var(--bz-fg-mid);
  font-size: 13px;
  line-height: 1.45;
}
.proof-card__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
  color: var(--bz-fg-low);
  font-size: 12px;
  margin-bottom: var(--bz-space-3);
}
.proof-card__output,
.catalog-output {
  margin: 0;
  max-width: 100%;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--bz-fg);
  font-family: "Fira Code", "JetBrains Mono", "SF Mono", monospace;
  font-size: 12px;
  line-height: 1.5;
  background: var(--bz-canvas);
  border: 1px solid var(--bz-border);
  border-radius: 4px;
}
.proof-card__output {
  max-height: 220px;
  overflow: auto;
  padding: var(--bz-space-3);
}
.catalog-output {
  width: min(42ch, 100%);
  max-height: 96px;
  overflow: hidden;
  padding: var(--bz-space-2);
}
.proof-card__prompt {
  margin: var(--bz-space-3) 0 0 !important;
  color: var(--bz-fg-low) !important;
  font-size: 12px !important;
  line-height: 1.45;
  text-align: left !important;
}
.money-stack__row span {
  color: var(--bz-fg-mid);
  font-size: 13px;
}
.money-stack__row strong {
  color: var(--bz-fg);
  font-size: 14px;
  text-align: right;
}

@media (max-width: 1180px) {
  .company-cockpit,
  .company-telemetry-bar,
  .company-admin-grid,
  .charter-editor {
    grid-template-columns: 1fr;
  }
  .company-cockpit__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .command-center__main,
  .ops-grid {
    grid-template-columns: 1fr;
  }
  .command-center__actions {
    min-width: 0;
  }
  .operating-loop,
  .command-center__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .operating-loop,
  .command-center__metrics,
  .company-cockpit__metrics {
    grid-template-columns: 1fr;
  }
  .company-cockpit__actions,
  .section-head {
    align-items: stretch;
    flex-direction: column;
  }
}

.panel-title {
  font-size: 24px !important;
  color: var(--bz-fg) !important;
  margin: 0 0 1em !important;
  text-align: left !important;
  display: flex;
  align-items: center;
  gap: 0.5em;
}
.panel-title .material-symbols-outlined {
  font-size: 32px;
  color: var(--bz-purple-300);
}
.panel-title .muted {
  color: var(--bz-fg-low);
  font-size: 0.7em;
  margin-left: 0.4em;
}
.panel-subtitle {
  font-size: 18px !important;
  color: var(--bz-fg) !important;
  margin: 0 0 1em !important;
  text-align: left !important;
  display: flex;
  align-items: center;
  gap: 0.4em;
}
.panel-subtitle .material-symbols-outlined {
  font-size: 24px;
  color: var(--bz-purple-300);
}
.muted { color: var(--bz-fg-mid); }

.empty {
  padding: 3em 2em;
  text-align: center;
  color: var(--bz-fg-low);
  font-style: italic;
  font-size: 16px;
}

/* ───────── Agentic team cards ───────── */
.org-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1em;
}
.org-card {
  background: var(--bz-canvas);
  padding: 1.25em;
  border-radius: 4px;
  border: 1px solid var(--bz-border);
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  gap: 0.4em;
}
.org-card:hover {
  background: var(--bz-card);
  border-color: var(--bz-border-strong);
}
.org-card__role {
  font-size: 1.45rem;
  line-height: 1.1;
  letter-spacing: 0.01em;
  color: var(--bz-fg);
  display: inline-flex;
  align-items: center;
  gap: 0.5em;
}
.org-card__kind-badge {
  font-size: 0.55em !important;
  font-family: "Fira Sans", sans-serif !important;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--bz-warning);
  background: var(--bz-warning-soft);
  -webkit-text-fill-color: var(--bz-warning) !important;
  background-clip: border-box !important;
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
}
.org-card__kind-badge .material-symbols-outlined {
  font-size: 14px;
  -webkit-text-fill-color: var(--bz-warning) !important;
}

.org-card__grants {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3em;
  margin-top: 0.4em;
}
.org-card__grants .material-symbols-outlined {
  font-size: 14px;
  color: var(--bz-purple-300);
  margin-right: 0.2em;
}
.org-card__grant-tag {
  font-size: 0.7em;
  padding: 1px 7px;
  border-radius: 3px;
  background: var(--bz-purple-soft);
  border: 1px solid var(--bz-border-brand);
  color: var(--bz-fg);
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.org-card__humans {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3em;
  margin-top: 0.35em;
  font-size: 0.78em;
}
.org-card__humans .material-symbols-outlined {
  font-size: 14px;
  color: var(--bz-warning);
}
.org-card__human-tag {
  padding: 1px 7px;
  border-radius: 3px;
  background: var(--bz-warning-soft);
  border: 1px solid var(--bz-warning);
  color: var(--bz-fg);
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
}
.org-card__humans-empty {
  font-style: italic;
  color: var(--bz-warning);
}
.org-card__companion {
  color: var(--bz-fg);
  font-size: 1.2rem;
  font-style: italic;
}
.org-card__llm {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  background: var(--bz-purple-soft);
  color: var(--bz-purple-300);
  border: 1px solid var(--bz-border-brand);
  padding: 0.2em 0.6em;
  border-radius: 3px;
  font-size: 0.78rem;
  width: fit-content;
}
.org-card__llm .material-symbols-outlined {
  font-size: 14px;
}
.org-card__desc {
  font-size: 13px;
  color: var(--bz-fg-mid);
  line-height: 1.4;
  flex: 1;
}

/* Subtle in-card divider — softer than the main app's gradient hr */
.org-card__divider {
  margin: 0.5em 0 !important;
  border: none !important;
  height: 1px;
  background: var(--bz-border-strong) !important;
  width: 100%;
}

.org-card__meta {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 0.5em;
}

/* Queue badge — height matches the .button.is-small Run button */
.org-card__queue-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  padding: 0 0.7em;
  border: 1px solid var(--bz-border-strong);
  border-radius: 4px;
  background: var(--bz-canvas);
  color: var(--bz-fg-low);
  font-size: 13px;
  height: 2.25em;
  line-height: 1;
  transition: all 0.15s ease;
}
.org-card__queue-badge.has-work {
  background: var(--bz-emerald-soft);
  border-color: var(--bz-emerald-500);
  color: var(--bz-fg);
}
.org-card__queue-badge .material-symbols-outlined {
  font-size: 18px;
  opacity: 0.8;
}
.org-card__queue-badge.has-work .material-symbols-outlined {
  color: var(--bz-emerald-500);
  opacity: 1;
}
.org-card__queue-count {
  color: var(--bz-fg);
  font-size: 14px;
  min-width: 1ch;
  text-align: center;
}
.org-card__queue-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: inherit;
  opacity: 0.7;
}

/* Per-employee action row — settings + run, both icon-only at queue-badge height */
.org-card__meta-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
}
.org-card__run-btn {
  border-color: var(--bz-warning) !important;
  color: var(--bz-warning) !important;
}
.org-card__run-btn:hover {
  background: var(--bz-warning-soft) !important;
}
.org-card__meta .icon-only-btn {
  width: 2.25em;
  height: 2.25em;
  min-width: 2.25em;
  padding: 0 !important;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.org-card__meta .icon-only-btn .material-symbols-outlined {
  font-size: 18px;
  margin: 0 !important;
}

.ellipsis {
  max-width: 28rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.company-pill {
  min-height: 22px;
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-1);
  padding: 0 var(--bz-space-2);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
  color: var(--bz-fg-mid);
  font-family: var(--bz-font-ui);
  font-size: var(--bz-size-meta);
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}
.company-pill--button {
  cursor: pointer;
}
.company-pill--button:hover {
  border-color: var(--bz-border-strong);
  color: var(--bz-fg);
}
.company-pill--info {
  border-color: var(--bz-purple-300);
  background: var(--bz-purple-soft);
  color: var(--bz-purple-300);
}
.company-pill--warning {
  border-color: var(--bz-warning);
  background: var(--bz-warning-soft);
  color: var(--bz-warning);
}
.company-pill--danger {
  border-color: var(--bz-danger);
  background: var(--bz-danger-soft);
  color: var(--bz-danger);
}
.company-pill--success {
  border-color: var(--bz-emerald-500);
  background: var(--bz-success-soft);
  color: var(--bz-emerald-500);
}
.company-pill--neutral {
  border-color: var(--bz-border);
  background: var(--bz-canvas);
  color: var(--bz-fg-mid);
}
.company-pill .material-symbols-outlined {
  font-size: 14px !important;
}
.status-dot {
  width: 7px;
  height: 7px;
  display: inline-block;
  border-radius: 999px;
  background: var(--bz-fg-low);
}
.status-active { background: var(--bz-emerald-500); }
.status-paused { background: var(--bz-warning); }
.status-dissolved { background: var(--bz-danger); }
.company-money {
  color: var(--bz-fg);
}
.company-money--in { color: var(--bz-emerald-500); }
.company-money--out { color: var(--bz-warning); }

/* ───────── Approvals ───────── */
.approval-list { display: flex; flex-direction: column; gap: 1em; }
.approval-card {
  background: var(--bz-canvas);
  padding: 1.25em 1.5em;
  border-radius: 4px;
  border-left: 3px solid var(--bz-warning);
  border-top: 1px solid var(--bz-border);
  border-right: 1px solid var(--bz-border);
  border-bottom: 1px solid var(--bz-border);
}
.approval-card__head {
  display: flex;
  align-items: center;
  gap: 0.6em;
  flex-wrap: wrap;
}
.approval-card__head strong {
  color: var(--bz-fg);
  font-size: 1.15rem;
  font-style: italic;
}
.approval-card__time {
  color: var(--bz-fg-low);
  font-size: 0.85rem;
  margin-left: auto;
}
.approval-card__by {
  font-size: 0.9rem;
  color: var(--bz-fg-mid);
  margin: 0.4em 0 0.75em;
}
.approval-card__action {
  background: var(--bz-card);
  padding: 0.85em 1em;
  border-radius: 3px;
  font-size: 0.8rem;
  max-height: 240px;
  overflow: auto;
  color: var(--bz-fg);
  font-family: "Fira Mono", monospace;
}
.approval-card__actions {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  margin-top: 1em;
}

/* ───────── Treasury manual entry ───────── */
.manual-entry {
  display: grid;
  grid-template-columns: 160px 1fr auto auto;
  gap: var(--bz-space-3);
  align-items: center;
}

/* ───────── Settings ───────── */
.setting-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-3);
  margin: 1em 0;
}
.charter-dump {
  background: var(--bz-card);
  padding: 1.25em;
  border-radius: 4px;
  font-size: 0.78rem;
  max-height: 500px;
  overflow: auto;
  color: var(--bz-fg);
  font-family: "Fira Mono", monospace;
  border: 1px solid var(--bz-border);
}

/* ───────── Goals (parent of issues) ───────── */
.goals-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1em;
}
.goals-head .panel-title { margin-bottom: 0.4em; }

.goals-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1.25em 1.5em;
  margin-bottom: 1em;
}
.goals-filters__group {
  display: flex;
  align-items: center;
  gap: 0.4em;
  flex-wrap: wrap;
}
.goals-filters__label {
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--bz-fg-low);
  margin-right: 0.25em;
}

.goal-list {
  display: flex;
  flex-direction: column;
  gap: 1em;
}
.goal-card {
  background: var(--bz-card);
  padding: 1.25em 1.5em;
  border-radius: 6px;
  border: 1px solid var(--bz-border-strong);
  transition: all 0.15s ease;
}
.goal-card:hover { border-color: var(--bz-border-strong); }
.goal-card__head {
  display: flex;
  align-items: center;
  gap: 0.6em;
  flex-wrap: wrap;
  margin-bottom: 0.4em;
}
.goal-card__time {
  margin-left: auto;
  font-size: 0.75em;
  color: var(--bz-fg-low);
}
.goal-card__title {
  font-size: 1.25rem;
  color: var(--bz-fg);
  margin-bottom: 0.4em;
}
.goal-card__rationale {
  display: flex;
  align-items: flex-start;
  gap: 0.5em;
  color: var(--bz-fg-mid);
  font-size: 0.9em;
  font-style: italic;
  margin-bottom: 0.75em;
  line-height: 1.45;
}
.goal-card__rationale .material-symbols-outlined {
  font-size: 18px;
  margin-top: 1px;
  color: var(--bz-purple-300);
}

.goal-card__progress {
  display: flex;
  align-items: center;
  gap: 0.75em;
  margin-bottom: 0.75em;
}
.goal-progress-bar {
  flex: 1;
  height: 6px;
  background: var(--bz-canvas);
  border-radius: 999px;
  overflow: hidden;
}
.goal-progress-bar__fill {
  height: 100%;
  background: var(--bz-purple-300);
  transition: width 0.3s ease;
}
.goal-card__progress-text {
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  font-size: 0.78em;
  color: var(--bz-fg-low);
  white-space: nowrap;
}

.goal-card__issues {
  display: flex;
  flex-direction: column;
  gap: 0.6em;
  margin-top: 0.75em;
}
.issue-card--nested {
  background: var(--bz-canvas);
  border-color: var(--bz-canvas);
}
.goal-card__no-issues {
  font-size: 0.85em;
  font-style: italic;
  margin-top: 0.5em;
}
.goal-card__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.75em;
}

.orphan-section { margin-top: 1.5em; }

/* New-goal modal extras */
.goal-modal { max-width: 720px !important; }
.goal-modal__label {
  display: block;
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--bz-fg-mid);
  margin: 1em 0 0.4em;
}
.goal-modal__task {
  display: flex;
  align-items: center;
  gap: 0.5em;
  margin-bottom: 0.5em;
}
.goal-modal__task .input { flex: 2; min-width: 0; }
.goal-modal__task .select { flex: 1; min-width: 130px; }
.goal-modal__task .select select { width: 100%; }

/* ───────── Issues ───────── */
.issue-form { display: flex; flex-direction: column; gap: 0.5em; margin-bottom: 0.5em; }
.issue-form__row {
  display: flex;
  align-items: center;
  gap: 0.5em;
  flex-wrap: wrap;
}
.issue-form__row .select { flex: 1; min-width: 180px; }
.issue-form__row .select select { width: 100%; }

.issue-filter {
  display: flex;
  gap: 0.4em;
  flex-wrap: wrap;
  margin-bottom: 1em;
}
.issue-filter__chip {
  padding: 4px 10px;
  border: 1px solid var(--bz-fg-faint);
  border-radius: 4px;
  background: transparent;
  color: var(--bz-fg-low);
  cursor: pointer;
  font-family: "Fira Sans", sans-serif !important;
  font-weight: 600 !important;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  transition: all 0.2s ease;
}
.issue-filter__chip:hover {
  background: var(--bz-purple-soft);
  border-color: var(--bz-fg-low);
  color: var(--bz-fg);
}
.issue-filter__chip.is-active {
  color: var(--bz-fg) !important;
  border-color: var(--bz-fg) !important;
  background: var(--bz-purple-soft) !important;
}

.issue-list {
  display: flex;
  flex-direction: column;
  gap: 0.75em;
}
.issue-card {
  background: var(--bz-canvas);
  padding: 1em 1.25em;
  border-radius: 4px;
  border: 1px solid var(--bz-border);
  transition: all 0.15s ease;
}
.issue-card:hover {
  background: var(--bz-card);
  border-color: var(--bz-border-strong);
}
.issue-card__head {
  display: flex;
  align-items: center;
  gap: 0.6em;
  flex-wrap: wrap;
  margin-bottom: 0.5em;
}
.issue-card__role {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  font-size: 13px;
  color: var(--bz-fg-mid);
}
.issue-card__role .material-symbols-outlined {
  font-size: 16px;
}
.issue-card__time {
  margin-left: auto;
  font-size: 12px;
  color: var(--bz-fg-low);
}
.issue-card__title {
  font-size: 1.15rem;
  color: var(--bz-fg);
  margin-bottom: 0.4em;
}
.issue-card__desc {
  font-size: 13px;
  color: var(--bz-fg-mid);
  line-height: 1.5;
  margin-bottom: 0.5em;
  white-space: pre-wrap;
}
.issue-card__attempts {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  font-size: 12px;
  color: var(--bz-fg-low);
  margin-bottom: 0.5em;
}
.issue-card__attempts .material-symbols-outlined { font-size: 14px; }
.issue-card__link code { font-size: 11px; }
.issue-card__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
  margin-top: 0.5em;
}
.issue-card__delete {
  border-color: var(--bz-danger-soft) !important;
  color: var(--bz-danger) !important;
}
.issue-card__delete:hover {
  background: var(--bz-danger-soft) !important;
  border-color: var(--bz-danger) !important;
}
.issue-card__actions .icon-only-btn {
  width: 2.25em;
  height: 2.25em;
  min-width: 2.25em;
  padding: 0 !important;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.issue-card__actions .icon-only-btn .material-symbols-outlined {
  font-size: 18px;
  margin: 0 !important;
}

code {
  background: var(--bz-card);
  padding: 0.15em 0.4em;
  border-radius: 3px;
  font-family: "Fira Mono", monospace;
  color: var(--bz-fg);
  font-size: 0.85em;
}

/* ───────── Role-edit modal ───────── */
.role-modal-overlay {
  position: fixed;
  inset: 0;
  background: var(--bz-overlay);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2em;
  animation: bz-fade-in 0.15s ease;
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.role-modal {
  width: 100%;
  max-width: 580px;
  max-height: calc(100vh - 4em);
  overflow-y: auto;
  padding: 2em 2.5em !important;
  border: 1px solid var(--bz-border-strong) !important;
  background: var(--bz-card) !important;
}
.role-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1em;
}
.role-modal__header h2 {
  font-size: 28px !important;
  margin: 0 !important;
  color: var(--bz-fg) !important;
  text-align: left !important;
  display: flex;
  align-items: center;
}
.role-modal__header h2 .material-symbols-outlined {
  font-size: 32px !important;
  color: var(--bz-fg) !important;
  background: none;
  -webkit-text-fill-color: initial;
}
.role-modal__title {
  color: var(--bz-fg);
}
.role-modal__desc {
  color: var(--bz-fg-mid) !important;
  margin: 0.5em 0 0 !important;
  font-size: 15px !important;
  text-align: left !important;
  font-style: italic;
}
.role-modal .field { margin-bottom: 1em; }
.role-modal .label { color: var(--bz-fg) !important; }
.role-modal .hint {
  font-size: 12px !important;
  color: var(--bz-fg-low) !important;
  margin: 0 0 0.5em !important;
  font-weight: 400;
  text-align: left !important;
  line-height: 1.4;
}
.role-modal .hint-inline {
  font-size: 11px;
  color: var(--bz-fg-low);
  font-weight: 400;
  font-style: italic;
  margin-left: 0.4em;
}
.pipeline-checks {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}
.pipeline-check {
  display: inline-flex;
  align-items: center;
  gap: 0.45em;
  padding: 0.45em 0.7em;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-card);
  color: var(--bz-fg-mid);
  cursor: pointer;
  font-size: var(--bz-size-meta);
  font-weight: 700;
}
.pipeline-check input { display: none; }
.pipeline-check .material-symbols-outlined { font-size: 16px !important; }
.pipeline-check.is-on {
  background: var(--bz-control-selected-bg);
  border-color: var(--bz-control-selected-border);
  color: var(--bz-control-selected-fg);
}
.role-modal__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1em;
  flex-wrap: wrap;
  margin-top: 1em;
}
.role-modal__actions-right {
  display: flex;
  align-items: center;
  gap: var(--bz-space-3);
  margin-left: auto;
}
.role-modal .icon-only-btn {
  width: 40px;
  padding: 0 !important;
  justify-content: center;
}
.role-modal .icon-only-btn .material-symbols-outlined {
  margin: 0 !important;
}

/* ───────── Settings demo-row + wiz-toggle ───────── */
.settings-row {
  display: flex;
  align-items: flex-start;
  gap: 1em;
  padding: 1em 1.25em;
  background: var(--bz-card);
  border: 1px solid var(--bz-border);
  border-radius: 4px;
  margin-bottom: 1em;
}
.settings-row__copy { flex: 1; }
.settings-row__title {
  display: flex;
  align-items: center;
  gap: var(--bz-space-2);
  font-size: 1.05rem;
  margin-bottom: 0.3em;
  color: var(--bz-fg);
}
.settings-row__title .material-symbols-outlined {
  color: var(--bz-purple-300) !important;
  -webkit-text-fill-color: currentColor !important;
  background: none !important;
  font-size: 22px;
}
.settings-row__badge {
  font-size: 0.6em !important;
  font-family: "Fira Sans", sans-serif !important;
  font-weight: 700 !important;
  letter-spacing: 0.1em;
  padding: 2px 8px;
  margin-left: 0.5em;
  border-radius: 999px;
  background: var(--bz-purple-soft);
  border: 1px solid var(--bz-border-brand);
  color: var(--bz-purple-300);
  -webkit-text-fill-color: currentColor !important;
  background-clip: border-box !important;
}
.settings-row__hint {
  color: var(--bz-fg-mid);
  font-size: 0.88em !important;
  line-height: 1.55;
  margin: 0 !important;
}

.wiz-toggle { display: flex; align-items: center; gap: 0.5em; cursor: pointer; }
.wiz-toggle input { display: none; }
.wiz-toggle__track {
  display: inline-block;
  width: 44px; height: 24px;
  background: var(--bz-border-strong);
  border-radius: 999px;
  position: relative;
  transition: background 0.2s;
  flex-shrink: 0;
}
.wiz-toggle__track::after {
  content: '';
  position: absolute;
  top: 3px; left: 3px;
  width: 18px; height: 18px;
  background: var(--bz-card);
  border-radius: 50%;
  transition: transform 0.2s;
}
.wiz-toggle input:checked + .wiz-toggle__track {
  background: var(--bz-purple-300);
}
.wiz-toggle input:checked + .wiz-toggle__track::after { transform: translateX(20px); }

/* ───────── Status colors ───────── */
.status-executed { color: var(--bz-emerald-500); }
.status-vetoed { color: var(--bz-warning); }
.status-error { color: var(--bz-danger); }
.status-queued { color: var(--bz-info); }
.status-approved { color: var(--bz-emerald-500); }
.status-rejected { color: var(--bz-danger); }

/* ───────── Form inputs (manual entry / treasury) ───────── */
:deep(.input), :deep(.textarea), :deep(.select select) {
  background: var(--bz-card) !important;
  border: 1px solid var(--bz-border-strong) !important;
  color: var(--bz-fg) !important;
}
:deep(.input:focus), :deep(.textarea:focus), :deep(.select select:focus) {
  border-color: var(--bz-purple-300) !important;
  box-shadow: 0 0 0 3px var(--bz-purple-soft) !important;
}
</style>
