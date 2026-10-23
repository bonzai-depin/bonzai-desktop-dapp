<template>
  <div ref="workspaceRoot" class="dash company-workspace company-screen" :class="{ 'dash--fullscreen': isFullscreen }">
    <div class="company-navigation">
    <div class="team-command-veil" :class="{ 'is-visible': hoveredCommand }" :style="teamVeilStyle" aria-hidden="true">
      <span class="team-command-veil__label fira-sans-condensed-black-italic">{{ $ui(hoveredCommand || '') }}</span>
    </div>

    <nav class="company-view-nav" :aria-label="$ui('Team workspace')" data-i18n-skip>
      <div class="company-view-nav__operations" role="group" :aria-label="$ui('Operations')">
        <button v-for="view in primaryViews.filter(view => !view.utility)" :key="view.key" type="button" :class="{ 'company-view-nav__settings': view.iconOnly }" :aria-label="view.iconOnly ? $ui(view.label) : undefined" :title="view.iconOnly ? $ui(view.label) : undefined" :aria-current="activeSection === view.section ? 'page' : undefined" @click="openChannel(view)">
          <span class="material-symbols-outlined" aria-hidden="true">{{ view.icon }}</span><span v-if="!view.iconOnly">{{ $ui(view.label) }}</span><span v-if="view.badge" class="bz-metric">{{ view.badge }}</span>
        </button>
      <button type="button" class="company-market-link" :aria-current="active === 'market' ? 'page' : undefined" @click="active = 'market'"><span class="material-symbols-outlined" aria-hidden="true">person_search</span>{{ $ui('Agent Market') }}</button>
      </div>
      <div class="company-view-nav__team" :style="teamDockStyle" @mouseenter="showCommandLabel('Team')" @mouseleave="hoveredCommand = ''" role="group" :aria-label="$ui('Team views')">
        <button v-for="view in primaryViews.filter(view => view.utility)" @mouseenter="showCommandLabel(view.label)" :key="view.key" type="button" :class="{ 'company-view-nav__icon': view.iconOnly }" :aria-label="view.iconOnly ? $ui(view.label) : undefined" :aria-current="activeSection === view.section ? 'page' : undefined" @click="hoveredCommand = ''; openChannel(view)">
          <span class="material-symbols-outlined" aria-hidden="true">{{ view.icon }}</span><span v-if="!view.iconOnly">{{ $ui(view.label) }}</span>
        </button>
      </div>
    </nav>
    </div>

    <header v-if="active !== 'studio'" class="company-channel-head bz-page-header">
      <div class="company-channel-head__copy">
        <span class="company-channel-head__symbol bz-title-icon material-symbols-outlined" aria-hidden="true">{{ currentChannel.icon }}</span>
        <div>
          <h1 class="fira-sans-condensed-black-italic">{{ $ui(currentChannel.label) }}</h1>
        </div>
      </div>
      <CompanyTeamStatus :health="automationHealth" :members="filledRoles.length" :playing="charter.status === 'active'" :fullscreen="isFullscreen" @toggle-execution="toggleExecution" @toggle-fullscreen="isFullscreen = !isFullscreen">
        <button v-if="active !== 'market'" type="button" class="bz-btn bz-btn--ghost company-hire" @click="active = 'market'"><span class="material-symbols-outlined" aria-hidden="true">person_search</span>{{ $ui('Hire a Smart Agent') }}</button>
        <template v-if="active === 'charter'">
          <button type="button" class="bz-iconbtn" :title="$ui('Export team')" :aria-label="$ui('Export team')" @click="exportCompany"><span class="material-symbols-outlined" aria-hidden="true">download</span></button>
          <button type="button" class="bz-iconbtn bz-iconbtn--danger" :title="$ui('Delete team')" :aria-label="$ui('Delete team')" @click="$emit('delete-company')"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>
        </template>
      </CompanyTeamStatus>
    </header>


    <DownloadRequirement
      v-if="missingRoleModels.length && !['command', 'studio'].includes(active)"
      class="company-model-requirements"
      category="language"
      :items="roleDownloadItems"
      :active="missingRoleModelsDownloading"
      :progress="roleDownloadProgress"
      :error="roleDownloadError"
      cancellable
      :cancelling="isCancellingRoleDownloads"
      :disabled="isCancellingRoleDownloads"
      @download="downloadMissingRoleModels"
      @cancel="cancelRoleDownloads"
    />

    <section v-if="active === 'activity' || active === 'connectors'" class="company-execution-strip" :class="{ 'is-running': !runtime.error && runtime.snapshot?.activeRequests > 0 }" :aria-label="$ui('Local execution')" data-i18n-skip>
      <span class="material-symbols-outlined" aria-hidden="true">memory</span><strong>{{ $ui('Local execution') }}</strong>
      <span class="company-execution-strip__scope">{{ $ui('Language models · this device') }}</span>
      <span v-if="runtime.error" class="company-execution-strip__error" role="status">{{ $ui(runtime.error) }}</span>
      <template v-else-if="runtime.snapshot">
        <span><b class="bz-metric">{{ runtime.snapshot.loaded }}</b> {{ $ui(runtime.snapshot.loaded === 1 ? 'model loaded' : 'models loaded') }}</span>
        <span v-if="runtime.snapshot.loading"><b class="bz-metric">{{ runtime.snapshot.loading }}</b> {{ $ui('loading') }}</span>
        <span v-if="runtime.snapshot.activityComplete || runtime.snapshot.activeRequests > 0"><b class="bz-metric">{{ runtime.snapshot.activityComplete ? '' : '≥ ' }}{{ runtime.snapshot.activeRequests }}</b> {{ $ui(runtime.snapshot.activeRequests === 1 ? 'active request' : 'active requests') }}</span>
        <span v-if="!runtime.snapshot.activityComplete" class="company-execution-strip__error">{{ $ui('Activity partially available') }}</span>
      </template>
      <span v-else role="status">{{ $ui('Checking local models…') }}</span>
      <button type="button" class="bz-iconbtn bz-iconbtn--sm" :disabled="runtime.checking" :aria-label="$ui('Refresh local execution')" @click="refreshRuntime"><span class="material-symbols-outlined" aria-hidden="true">refresh</span></button>
    </section>
    <div v-if="state.gmaoRefreshError" class="company-record-refresh-error" role="alert" data-i18n-skip>
      <span>{{ $ui('Operational data could not be refreshed. Saved changes remain on this device.') }} {{ state.gmaoRefreshError }}</span>
      <button type="button" class="bz-btn bz-btn--ghost" @click="store.refreshActive().catch(() => {})">{{ $ui('Refresh') }}</button>
    </div>
    <div class="company-dashboard-shell">
      <!-- ════════════ Sub-tab body ════════════ -->
      <section class="dash-body">
      <CompanySales v-if="active === 'gmao' && gmaoView === 'today'" :key="charter.id + '-handoffs'" :company-id="charter.id" incoming-only :sites="state.gmao?.sites || []" @open-work-order="openOperationalWorkOrder" />
      <CompanyMission v-show="active === 'mission'" :charter="charter" :goals="state.goals" :store="store" @open-view="openChannelByKey" />
      <!-- Interactive production owns in-progress inputs, streams and media.
           Mount it only when opened, then retain it while browsing this team. -->
      <CompanyWorkflowStudio ref="workflowStudio" class="company-production" v-if="studioOpened" v-show="active === 'studio'" :charter="charter" :state="state" @open-view="openChannelByKey" @refresh="$emit('reload')">
        <template #controls><CompanyTeamStatus :health="automationHealth" :members="filledRoles.length" :playing="charter.status === 'active'" :fullscreen="isFullscreen" @toggle-execution="toggleExecution" @toggle-fullscreen="isFullscreen = !isFullscreen" /></template>
        <template #requirements>
          <DownloadRequirement v-if="missingRoleModels.length" class="company-model-requirements company-model-requirements--studio" category="language" :items="roleDownloadItems" :active="missingRoleModelsDownloading" :progress="roleDownloadProgress" :error="roleDownloadError" cancellable :cancelling="isCancellingRoleDownloads" :disabled="isCancellingRoleDownloads" @download="downloadMissingRoleModels" @cancel="cancelRoleDownloads" />
        </template>
      </CompanyWorkflowStudio>
      <!-- ─── Command center ─── -->
      <div v-if="active === 'command'" class="company-command">
        <CompanyGoalRoom :charter="charter" :state="state" @open-view="openChannelByKey" @open-maintenance="openChannelByKey" @open-result="openWorkResult" />
      </div>

      <CompanyToday v-else-if="active === 'overview'" :charter="charter" :state="state" :views="primaryViews" @open-view="openChannelByKey" @open-result="openWorkResult" />
      <CompanyLiveFeed v-else-if="active === 'activity'" :charter="charter" :state="state" @open-view="openChannelByKey" @open-result="openWorkResult" />
      <CompanyGettingStarted v-else-if="active === 'getting-started'" :key="charter.id" :charter="charter" :views="primaryViews" :state="state" @open-view="openChannelByKey" />
      <CompanySales v-else-if="active === 'sales'" :key="charter.id" :company-id="charter.id" />
      <CompanyGrants v-else-if="active === 'grants'" ref="grantsWorkspace" :key="charter.id" :company-id="charter.id" @open-intake="openCompanyIntake" />
      <CompanyBilling v-else-if="active === 'billing'" ref="billingWorkspace" :key="charter.id" :company-id="charter.id" :gmao-data="state.gmao" @open-work-order="openOperationalWorkOrder" @open-task="openOperationalTask" />
      <CompanyPurchasing v-else-if="active === 'purchasing'" ref="purchasingWorkspace" :key="charter.id" :company-id="charter.id" @open-chat="openChannelByKey('command')" @open-task="openOperationalTask" />
      <!-- ─── HVAC GMAO ─── -->
      <CompanyGmao
        v-else-if="active === 'gmao' && state.gmao"
        ref="operationalWorkspace"
        :gmao="state.gmao"
        :store="store"
        :initial-view="gmaoView"
        embedded integrated
        :client-filter="gmaoClientId"
        :pending-approvals="state.approvals.length"
        @update:client-filter="gmaoClientId = $event"
        @prepare-invoice="startPartsInvoice"
        @open-invoice="openOperationalRecord({kind:'invoice',id:$event})"
        @view-change="gmaoView = $event"
        @open-review="active = 'approvals'"
        @open-intake="openCompanyIntake"
        @open-connectors="active = 'connectors'"
        @open-task="openOperationalTask"
      />
      <div v-else-if="active === 'gmao' && !state.gmaoRefreshError" class="panel empty">{{ $ui("Initialisation du référentiel GMAO…") }}</div>

      <div v-else-if="active === 'market'" class="team-agent-market">
        <AgentWorkersPanel :company-id="charter.id" @request-agent-action="requestAgentJobAction" />
        <SmartAgentJobsPanel :company-id="charter.id" :charter="charter" @request-agent-action="requestAgentJobAction" />
      </div>
      <!-- ─── Workflow team ─── -->
      <div v-else-if="active === 'org'" class="team-members">
        <div class="section-head section-head--stack">
          <div>
            <span class="team-section-count"><b class="bz-metric">{{ filledRoles.length }}</b> {{ $ui('Members') }}</span>
          </div>
          <div class="section-head__actions">
          <button class="bz-btn bz-btn--primary" @click="active = 'market'"><span class="material-symbols-outlined" aria-hidden="true">person_search</span>{{ $ui('Hire a Smart Agent') }}</button>
          <button
            class="bz-btn bz-btn--primary"
            @click="openRoleEdit(availableRoleOptions[0]?.key)"
            :disabled="!availableRoleOptions.length"
          >
            <span class="material-symbols-outlined" aria-hidden="true">person_add</span>{{ $ui("Add teammate") }}</button>
          </div>
        </div>
        <CompanyHiredSpecialists :company-id="charter.id" @open-market="active = 'market'" />
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
            <div class="org-card__identity">
              <span class="org-card__avatar">
                <img v-if="companionImage(charter.roles[roleKey].companion)" :src="companionImage(charter.roles[roleKey].companion)" :alt="companionName(charter.roles[roleKey].companion)" />
                <span v-else class="material-symbols-outlined" aria-hidden="true">person</span>
              </span>
              <div class="org-card__companion fira-sans-condensed-black-italic">
                {{ companionName(charter.roles[roleKey].companion) }}<small class="org-card__team">{{ charter.name }}</small>
              </div>
            </div>
            <button v-if="companionList.find(agent => agent.id === charter.roles[roleKey].companion)?.tokenAddress" type="button" class="bz-btn bz-btn--ghost" @click.stop="hireAgent = companionList.find(agent => agent.id === charter.roles[roleKey].companion)"><span class="material-symbols-outlined" aria-hidden="true">handshake</span>{{ $ui('Hire agent') }}</button>
            <CompanyWorkerModel :model-value="charter.roles[roleKey].llm" :role-key="roleKey" :role-label="roleDisplayName(roleKey)" :worker-id="charter.roles[roleKey].companion" :save="key => saveWorkerModel(roleKey, key)" @saved="refreshModelAvailability" />
            <div
              v-if="roleConnectorCount(roleKey) > 0"
              class="org-card__capability-summary"
            >
              <span class="material-symbols-outlined">cable</span>
              {{ roleConnectorCount(roleKey) }} connector{{ roleConnectorCount(roleKey) === 1 ? '' : 's' }}
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
                  class="bz-btn bz-btn--sm bz-btn--ghost org-card__run-btn"
                  @click="store.tickRoleNow(roleKey)"
                  title="Run this teammate now: take one queued task, draft work, or request approval"
                  aria-label="Run next task"
                >
                  <span class="material-symbols-outlined">play_arrow</span>
                  Run next task
                </button>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="empty">
          No teammates assigned yet. Add one teammate to start handling this workflow.
        </div>
      </div>

      <!-- ─── Goals & Issues — work primitives, grouped by goal ─── -->
      <div v-else-if="active === 'issues'" class="team-backlog">
        <p v-if="currentChannel?.description" class="company-muted work-domain-brief">{{ $ui(currentChannel.description) }}</p>
        <div class="goals-head">
          <div>
            <span class="team-section-count"><b class="bz-metric">{{ workStatusCount('all') }}</b> {{ $ui('Work items') }}</span>
          </div>
          <div class="section-head__actions">
            <button
              class="bz-btn bz-btn--primary"
              @click="newTeamTask"
            >
              <span class="material-symbols-outlined" aria-hidden="true">task_alt</span>
              New task
            </button>
            <button
              v-if="!charter.workspace?.executionWorkflowId"
              class="bz-btn bz-btn--ghost"
              @click="openNewGoalModal"
            >
              <span class="material-symbols-outlined" aria-hidden="true">add_circle</span>
              New outcome
            </button>
          </div>
        </div>

        <label class="company-search work-search"><span class="material-symbols-outlined" aria-hidden="true">search</span><input v-model="workQuery" :aria-label="$ui('Search work')" :placeholder="$ui('Search work')" /></label>
        <div class="work-status-tabs" aria-label="Work status filter">
          <button
            v-for="filter in workStatusFilters"
            :key="filter.id"
            class="issue-filter__chip"
            :class="{ 'is-active': workStatusFilter === filter.id }"
            :aria-pressed="workStatusFilter === filter.id"
            @click="workStatusFilter = filter.id"
          >
            {{ filter.label }}
            <span class="bz-metric">{{ workStatusCount(filter.id) }}</span>
          </button>
        </div>

        <div v-if="earlierPlanningItems.length" class="backlog-planning-note">
          <button class="bz-btn bz-btn--ghost bz-btn--sm" :aria-expanded="showEarlierPlanning" @click="showEarlierPlanning = !showEarlierPlanning; clearWorkFilters()"><span class="material-symbols-outlined" aria-hidden="true">history</span>{{ $ui(showEarlierPlanning ? 'Back to requested work' : 'Earlier automatic planning') }}<span class="bz-metric">{{ earlierPlanningItems.length }}</span></button>
          <p v-if="showEarlierPlanning">{{ $ui('These earlier planner-created items are kept for reference. They will not run automatically.') }}</p>
        </div>
        <div v-if="todoWorkItems.length" class="work-todo-list" aria-label="Team work list">
          <article
            v-for="item in todoWorkItems"
            :key="item.id"
            :data-issue-id="item.issue?.id"
            tabindex="-1"
            class="work-todo"
            :class="[`work-todo--${item.column}`, { 'work-todo--goal': item.type === 'goal' }]"
          >
            <div class="work-todo__check">
              <span class="material-symbols-outlined" aria-hidden="true">
                {{ item.column === 'done' ? 'check_circle' : item.column === 'blocked' ? 'report' : item.column === 'cancelled' ? 'block' : 'radio_button_unchecked' }}
              </span>
            </div>
            <div class="work-todo__main">
              <div class="work-todo__topline">
                <span class="company-pill" :class="item.type === 'goal' ? goalStatusClass(item.goal.status) : statusClass(item.issue.status)">
                  {{ item.type === 'goal' ? item.goal.status : item.issue.status.replace('_', ' ') }}
                </span>
                <span v-if="item.type === 'issue'" class="company-pill" :class="priorityClass(item.issue.priority)">
                  {{ item.issue.priority }}
                </span>
                <span class="work-todo__role">
                  {{ item.type === 'issue' ? roleDisplayName(item.issue.assigneeRole) : (item.goal.createdBy === 'ceo' ? 'Coordinator outcome' : 'Owner outcome') }}
                </span>
                <span>{{ fmtTime(item.type === 'goal' ? (item.goal.updatedAt || item.goal.createdAt) : (item.issue.updatedAt || item.issue.createdAt)) }}</span>
              </div>
              <div v-if="item.goal && item.type === 'issue'" class="work-todo__goal">
                <span class="material-symbols-outlined" aria-hidden="true">flag</span>
                {{ sentenceCaseTask(item.goal.title) }}
              </div>
              <h4 class="work-todo__title fira-sans-condensed-black-italic">
                {{ item.type === 'goal' ? sentenceCaseTask(item.goal.title) : sentenceCaseTask(item.issue.title) }}
              </h4>
              <p v-if="item.type === 'goal' && (item.goal.rationale || item.goal.missionAlignment)" class="work-todo__copy">
                {{ item.goal.rationale || item.goal.missionAlignment }}
              </p>
              <p v-else-if="item.type === 'issue' && item.issue.description" class="work-todo__copy">
                {{ item.issue.description }}
              </p>
              <CompanyWorkflowProgress v-if="item.type === 'issue'" :stages="taskProgress(item.issue)" :issue="item.issue" />
              <CompanyQuestion v-if="item.type === 'issue' && item.issue.execution?.agent?.status === 'waiting_owner'" inline :issue="item.issue" :company-id="charter.id" :team-name="charter.name" @answered="store.refreshActive()" />
              <p v-if="item.type === 'issue' && item.issue.execution?.agent?.status === 'waiting_team'" class="work-todo__copy">{{ $ui('Waiting for another team') }} · {{ item.issue.execution.agent.wait.reason }} <button class="bz-btn bz-btn--ghost bz-btn--sm" @click="openChannelByKey('team-exchanges')">{{ $ui('Open conversation') }}</button></p>
              <p v-if="item.type === 'issue' && item.issue.lastError" class="work-todo__copy" role="status">{{ item.issue.lastError }}</p>
              <div v-if="item.type === 'goal'" class="work-todo__progress">
                <div class="goal-progress-bar">
                  <div class="goal-progress-bar__fill" :style="{ width: goalProgress(item.goal).pct + '%' }"></div>
                </div>
                <span>{{ goalProgress(item.goal).done }}/{{ goalProgress(item.goal).total }} tasks</span>
              </div>
            </div>
            <div class="work-todo__actions">
              <select v-if="item.type === 'issue' && domainViews.length" class="company-admin-select" :aria-label="$ui('Workspace')" :value="issueWorkspace(item.issue)" @change="moveIssueWorkspace(item.issue, $event.target.value)">
                <option value="">{{ $ui('Backlog') }}</option>
                <option v-for="view in domainViews" :key="view.key" :value="view.key">{{ $ui(view.label) }}</option>
              </select>
              <button v-if="item.type==='issue' && item.issue.labels?.includes('record-reminder')" class="bz-btn bz-btn--ghost" @click="openOperationalRecord({kind:item.issue.labels[1],id:item.issue.labels[2]})">{{ $ui('Open record') }}<span class="material-symbols-outlined">arrow_forward</span></button>
              <button v-if="item.type === 'issue' && interactiveWorkflowStep(item.issue) && !isEarlierPlanningItem(item)" class="bz-btn bz-btn--sm bz-btn--primary" @click="continueWorkflowTask(item.issue)">{{ $ui(interactiveWorkflowStep(item.issue).output?.status === 'ready_for_review' ? 'Review results' : 'Continue') }}</button>
              <button v-else-if="item.type === 'issue' && !isEarlierPlanningItem(item) && item.issue.status === 'blocked' && item.issue.execution?.steps?.some(step => ['unknown','failed','unsupported','rejected','requires_input','simulated'].includes(step.status))" class="bz-btn bz-btn--sm bz-btn--primary" @click="taskReview = item.issue">Review outcome</button>
              <button v-if="item.type === 'issue' && !isEarlierPlanningItem(item) && item.issue.status === 'blocked' && !['waiting_owner', 'waiting_team'].includes(item.issue.execution?.agent?.status) && (!item.issue.execution || item.issue.execution.steps.every(step => ['planned','completed','superseded'].includes(step.status)))" class="bz-btn bz-btn--sm bz-btn--ghost" @click="reopenIssue(item.issue.id)">Resume task</button>
              <button
                v-if="item.type === 'issue' && item.issue.status === 'open' && !isEarlierPlanningItem(item)"
                class="bz-btn bz-btn--sm bz-btn--warning fira-sans-condensed-black-italic"
                @click="store.tickRoleNow(item.issue.assigneeRole)"
                title="Run this teammate now to pick up one queued task"
              >
                <span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>
                Run
              </button>
              <button
                v-if="item.type === 'issue' && ['open', 'in_progress', 'blocked'].includes(item.issue.status)"
                class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
                @click="setIssueStatus(item.issue.id, 'cancelled')"
              >
                Cancel
              </button>
              <button
                v-if="item.type === 'issue' && !isEarlierPlanningItem(item) && ['done', 'cancelled'].includes(item.issue.status)"
                class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
                @click="reopenIssue(item.issue.id)"
              >
                Reopen
              </button>
              <button
                v-if="item.type === 'issue' && item.issue.status === 'done'"
                class="bz-btn bz-btn--sm bz-btn--primary fira-sans-condensed-black-italic"
                @click="openWorkResult(item.issue.id)"
              >
                <span class="material-symbols-outlined" aria-hidden="true">visibility</span>
                Open result
              </button>
              <button
                v-if="item.type === 'goal' && item.goal.status === 'active'"
                class="bz-btn bz-btn--sm bz-btn--ghost fira-sans-condensed-black-italic"
                @click="cancelGoal(item.goal.id)"
              >
                Cancel
              </button>
              <button
                v-if="item.type === 'issue' && item.issue.status !== 'done'"
                class="bz-iconbtn bz-iconbtn--sm issue-card__delete"
                @click="requestDeleteIssue(item.issue)"
                aria-label="Delete issue"
              >
                <span class="material-symbols-outlined">delete</span>
              </button>
            </div>
          </article>
          <button
            v-if="todoWorkItems.length < matchedWorkItems.length"
            class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic load-more-btn"
            @click="goalLimit += 20"
          >
            <span class="material-symbols-outlined" aria-hidden="true">expand_more</span>
            Load more
          </button>
        </div>
        <div v-else class="team-empty">
          <span class="material-symbols-outlined" aria-hidden="true">checklist</span>
          <p>{{ $ui(selectedWorkItems.length ? 'No work matches this filter.' : charter.workspace?.executionWorkflowId ? 'No requested work yet. Start a task in Production.' : 'No work yet. Add a task or brief the team in Chat.') }}</p>
          <button class="bz-btn bz-btn--ghost" @click="selectedWorkItems.length ? clearWorkFilters() : charter.workspace?.executionWorkflowId ? newTeamTask() : openChannelByKey('command')">{{ $ui(selectedWorkItems.length ? 'Show all work' : charter.workspace?.executionWorkflowId ? 'New task' : 'Open chat') }}</button>
        </div>
      </div>

      <!-- ─── Results / catalog ─── -->
      <div v-else-if="active === 'deliverables'" class="company-deliverables">
        <nav class="company-modes" :aria-label="$ui('Result type')"><button v-for="section in deliverableSections" :key="section.key" :aria-pressed="deliverableSection===section.key" @click="deliverableSection=section.key"><span class="material-symbols-outlined" aria-hidden="true">{{ section.icon }}</span>{{ $ui(section.label) }}<span v-if="section.key==='work'" class="bz-metric">{{ completedWorkRows.length }}</span><span v-if="section.key==='assets'" class="bz-metric">{{ catalogRows.length }}</span></button></nav>
        <template v-if="deliverableSection==='work'">
        <div v-if="completedWorkRows.length" class="section-head section-head--stack">
          <span class="team-section-count"><b class="bz-metric">{{ completedWorkRows.length }}</b> {{ $ui('Completed work') }}</span>

        </div>
        <section v-if="completedWorkRows.length" class="result-work">
          <h3>{{ $ui("Task history") }}</h3>
          <article v-for="row in completedWorkRows" :key="row.id" class="result-work__row" :class="{ 'is-open': expandedWorkResults.has(row.id) }">
            <button type="button" class="result-work__summary" @click="toggleWorkResult(row.id)">
              <span class="result-work__icon material-symbols-outlined" aria-hidden="true">check_circle</span>
              <span class="result-work__main">
                <strong>{{ sentenceCaseTask(row.title) }}</strong>
                <span>{{ row.goalTitle || 'Direct task' }} · {{ roleDisplayName(row.assigneeRole) }} · {{ fmtTime(row.completedAt) }}</span>
                <span>{{ row.summary }}</span>
              </span>
              <span class="result-work__open">{{ expandedWorkResults.has(row.id) ? 'Close' : 'View task' }}<span class="material-symbols-outlined">{{ expandedWorkResults.has(row.id) ? 'expand_less' : 'expand_more' }}</span></span>
            </button>
            <section v-if="expandedWorkResults.has(row.id)" class="work-dossier">
              <div class="work-dossier__context">
                <div><span>Objective</span><p>{{ row.title }}</p></div>
                <div><span>Why this work</span><CompanyMarkdown :source="row.justification" /></div>
                <div><span>Outcome</span><CompanyMarkdown :source="row.summary" /></div>
              </div>
              <div v-if="row.actions.length" class="work-dossier__actions">
                <h4>Execution record</h4>
                <article v-for="(action, index) in row.actions" :key="`${row.id}:${index}`">
                  <span class="work-dossier__step bz-mono">{{ String(index + 1).padStart(2, '0') }}</span>
                  <div><strong>{{ humanizeAction(action.type) }}</strong><p>{{ action.description }}</p><small>{{ action.reason }}</small></div>
                  <span class="company-pill" :class="action.status === 'executed' ? 'company-pill--success' : action.status === 'error' ? 'company-pill--danger' : 'company-pill--warning'">{{ action.status }}</span>
                </article>
              </div>
              <div v-if="row.artifacts.length" class="work-dossier__artifacts">
                <h4>{{ $ui("Saved results") }}</h4>
                <article v-for="artifact in row.artifacts" :key="artifact.id">
                  <CompanyArtifactPreview :row="artifact" />
                  <div class="work-dossier__artifact-meta"><span class="bz-mono">{{ artifact.id }}</span><button class="bz-btn bz-btn--sm bz-btn--ghost" @click="downloadDeliverable(artifact)"><span class="material-symbols-outlined">download</span>Download</button></div>
                </article>
              </div>
              <footer class="work-dossier__footer"><span>Record</span><code>{{ row.recordId }}</code><span>{{ fmtTime(row.completedAt) }}</span></footer>
            </section>
          </article>
        </section>

        <div v-if="!completedWorkRows.length" class="company-empty"><span class="material-symbols-outlined" aria-hidden="true">task_alt</span><h3>{{ $ui('No completed work yet') }}</h3><p>{{ $ui('Completed work and its evidence will appear here.') }}</p><button class="bz-btn" @click="openChannelByKey('issues')">{{ $ui('Backlog') }}</button></div>
        </template>
        <CompanyOperationalFiles v-if="deliverableSection==='documents'" :key="charter.id" :company-id="charter.id" @open-record="openOperationalRecord" />
        <p v-if="deliverableSection==='assets' && state.catalogError" class="result-library-error" role="alert">{{ $ui(state.catalogError) }} <button class="bz-btn bz-btn--ghost" @click="store.refreshActive()">{{ $ui('Retry') }}</button></p>
        <CompanyDeliverableLibrary v-if="deliverableSection==='assets'" :key="charter.id" :rows="catalogRows" :issues="state.issues" :load-error="state.catalogError" :has-records="deliverableSections.some(section => section.key === 'documents')" @open-records="deliverableSection = 'documents'" :role-name="roleDisplayName" :copy="copyDeliverable" :download="downloadDeliverable" :format-money="fmtMoney" @open-task="openResultTask" @start-task="newTeamTask" />


      </div>

      <!-- Review queue uses the same approval and operational actions as the existing forms. -->
      <div v-else-if="active === 'approvals'" class="company-inbox">
        <CompanyInbox ref="inboxWorkspace" :key="charter.id" :state="state" :charter="charter" :store="store" :maintenance="hasMaintenance" :role-name="roleDisplayName"
          @open-operational-record="openOperationalRecord" @open-view="openChannelByKey"
          @open-workflow-result="task => openChannelByKey({ view: 'studio', issueId: task.id })"
          @open-tools="active = 'connectors'" @review="item => inboxReview?.openReview(item.kind, item.id)" />
        <p v-if="hasMaintenance && !state.gmao" role="status">{{ $ui('Initialisation du référentiel GMAO…') }}</p>
        <CompanyGmao v-if="hasMaintenance && state.gmao" ref="inboxReview" :gmao="state.gmao" :store="store" initial-view="review" embedded review-queue review-dialogs-only
          @open-connectors="active = 'connectors'" @open-intake="openCompanyIntake" @open-work="gmaoView = 'interventions'; active = 'gmao'" />
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
            <div class="kpi-tile__label fira-sans-condensed-black-italic">Per-run cap</div>
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
      <div v-else-if="active === 'connectors'">

        <CompanyConnectors :charter="charter" :state="state" />
      </div>

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
          <template #cell-action="{ row }">
            <span>{{ auditActionLabel(row) }}</span>
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

      <!-- ─── Settings ─── -->
      <div v-else-if="active === 'charter'" class="company-team-settings">
        <p v-if="exportMessage" role="status">{{ exportMessage }}</p>
        <div class="company-settings-layout">
          <nav class="company-settings-nav" :aria-label="$ui('Team settings categories')" data-i18n-skip>
            <button v-for="section in teamSettingsSections" :key="section.id" type="button" :aria-current="teamSettingsSection === section.id ? 'page' : undefined" @click="teamSettingsSection = section.id"><span class="material-symbols-outlined" aria-hidden="true">{{ section.icon }}</span>{{ $ui(section.label) }}</button>
          </nav>
          <div class="company-settings-content">
        <div class="charter-studio">
          <section v-show="teamSettingsSection === 'identity'" class="charter-card charter-card--identity">
            <div class="charter-card__head">
              <span class="material-symbols-outlined">badge</span>
              <h3 class="fira-sans-condensed-black-italic">Team identity</h3>
            </div>
            <label class="charter-field charter-field--wide">
              <span>Team name</span>
              <input v-model.trim="charterDraft.name" class="input is-medium" />
            </label>
            <button class="bz-btn bz-btn--ghost" type="button" @click="openChannelByKey('mission')">{{ $ui('Edit mission') }}<span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></button>
          </section>

          <section v-show="teamSettingsSection === 'style'" class="charter-card">
            <div class="charter-card__head">
              <span class="material-symbols-outlined">chat</span>
              <h3 class="fira-sans-condensed-black-italic">Working style</h3>
            </div>
            <div class="charter-card__grid">
              <label class="charter-field charter-field--wide">
                <span>Team voice</span>
                <select :aria-label="$ui('Team voice')" v-model="charterDraft.tone" class="company-admin-select">
                  <option value="direct">Direct and concise</option>
                  <option value="analytical">Analytical</option>
                  <option value="warm">Warm and collaborative</option>
                  <option value="formal">Formal</option>
                </select>
              </label>
              <label class="charter-field">
                <span>Working language</span>
                <select :aria-label="$ui('Working language')" v-model="charterDraft.language" class="company-admin-select">
                  <option value="auto">Match the owner</option>
                  <option value="en">English</option>
                  <option value="fr">French</option>
                </select>
              </label>
              <label class="charter-field">
                <span>Response detail</span>
                <select :aria-label="$ui('Response detail')" v-model="charterDraft.responseDetail" class="company-admin-select">
                  <option value="brief">Brief</option>
                  <option value="balanced">Balanced</option>
                  <option value="thorough">Thorough</option>
                </select>
              </label>

            </div>
          </section>

          <section v-show="teamSettingsSection === 'money'" class="charter-card">
            <div class="charter-card__head">
              <span class="material-symbols-outlined">savings</span>
              <h3 class="fira-sans-condensed-black-italic">Money guardrails</h3>
            </div>
            <div class="charter-card__grid">
              <label class="charter-field">
                <span>Currency</span>
                <select :aria-label="$ui('Currency')" v-model="charterDraft.currency" class="company-admin-select">
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
            </div>
          </section>

          <section v-show="teamSettingsSection === 'autonomy'" class="charter-card">
            <div class="charter-card__head">
              <span class="material-symbols-outlined">verified_user</span>
              <h3 class="fira-sans-condensed-black-italic">Autonomy and memory</h3>
            </div>
            <div class="charter-card__grid">
              <label class="charter-field">
                <span>Autonomy</span>
                <select :aria-label="$ui('Autonomy')" v-model="charterDraft.autonomy" class="company-admin-select">
                  <option value="guided">Guided</option>
                  <option value="balanced">Balanced</option>
                  <option value="autonomous">Autonomous within guardrails</option>
                </select>
              </label>
              <label class="charter-field">
                <span>Conversation memory</span>
                <select :aria-label="$ui('Conversation memory')" v-model="charterDraft.memory" class="company-admin-select">
                  <option value="full">Full local history</option>
                  <option value="summarized">Summaries and decisions</option>
                  <option value="session">Current session only</option>
                </select>
              </label>
              <label class="charter-field">
                <span>Timezone</span>
                <input v-model.trim="charterDraft.timezone" class="input is-medium" placeholder="Europe/Paris" />
              </label>
              <label class="charter-field">
                <span>Daily brief</span>
                <input v-model="charterDraft.dailyBrief" type="checkbox" class="charter-toggle" />
              </label>
            </div>
          </section>

          <section v-show="teamSettingsSection === 'cadence'" class="charter-card">
            <div class="charter-card__head">
              <span class="material-symbols-outlined">schedule</span>
              <h3 class="fira-sans-condensed-black-italic">Cadence</h3>
            </div>
            <div class="charter-card__grid">
              <label class="charter-field">
                <span>Coordinator cadence (min)</span>
                <input v-model.number="charterDraft.ceoMin" class="input is-medium" type="number" min="1" step="1" />
              </label>
              <label class="charter-field">
                <span>Teammate cadence (min)</span>
                <input v-model.number="charterDraft.roleMin" class="input is-medium" type="number" min="1" step="1" />
              </label>
            </div>
          </section>

          <section v-show="teamSettingsSection === 'execution'" class="charter-card charter-card--execution">
            <div class="charter-card__head">
              <span class="material-symbols-outlined">memory</span>
              <h3 class="fira-sans-condensed-black-italic">Model execution</h3>
            </div>
            <div class="charter-card__grid">
              <label class="charter-field">
                <span>LLM execution</span>
                <select :aria-label="$ui('LLM execution')" v-model="charterDraft.llmMode" class="company-admin-select">
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
                <select :aria-label="$ui('Media execution')" v-model="charterDraft.diffusionMode" class="company-admin-select">
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
          </section>
        </div>

        <div class="charter-actions">
          <button
            class="bz-btn bz-btn--primary"
            :class="{ 'is-loading': charterBusy }"
            :disabled="charterBusy || !charterDraft.name"
            @click="saveCharter"
          >
            <span class="material-symbols-outlined" aria-hidden="true">save</span>
            {{ $ui('Save settings') }}
          </button>
          <button class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" @click="resetCharterDraft">
            <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
            Reset
          </button>
        </div>
          <p v-if="charterError" class="company-settings-error" role="alert">{{ charterError }}</p>
          <p v-else-if="charterSaved" class="company-settings-saved" role="status">{{ $ui('Settings saved') }}</p>
          </div>
        </div>
      </div>
      </section>
    </div>

    <Transition name="bz-image-toast">
      <div
        v-if="pendingDelete"
        class="bz-image-delete-toast"
        role="status"
        aria-live="polite"
      >
        <span class="material-symbols-outlined" aria-hidden="true">delete</span>
        <span class="bz-image-delete-toast__body">
          Delete {{ pendingDelete.label }}?
        </span>
        <button type="button" class="bz-image-delete-toast__ghost" @click="dismissDelete">
          Cancel
        </button>
        <button type="button" class="bz-image-delete-toast__danger" @click="confirmDelete">
          Delete
        </button>
      </div>
    </Transition>

    <SmartAgentHireModal v-if="hireAgent" :agent="hireAgent" :company-id="charter.id" @close="hireAgent = null" />

    <!-- ════════════ Role-edit modal ════════════ -->
    <div
      v-if="editingRoleKey"
      class="role-modal-overlay"
      @click.self="closeRoleEdit"
    >
      <div class="role-modal">
        <div class="role-modal__header">
          <h2 class="fira-sans-condensed-black-italic">
            <span class="material-symbols-outlined" aria-hidden="true">settings</span>
            <span class="role-modal__title">{{ charter.roles[editingRoleKey]?.companion ? roleDisplayName(editingRoleKey) : 'Add smart agent' }}</span>
          </h2>
          <BzCloseButton size="md" aria-label="Close" @click="closeRoleEdit" />
        </div>

        <div class="field">
          <label class="label fira-sans-condensed-black-italic">Function</label>
          <div class="select is-fullwidth is-medium">
            <select v-model="editingRoleKey">
              <option v-for="role in rolePickerOptions" :key="role.key" :value="role.key">
                {{ role.label }}
              </option>
            </select>
          </div>
        </div>

        <div class="field">
          <label class="label fira-sans-condensed-black-italic">Smart agent</label>
          <div class="select is-fullwidth is-medium">
            <select v-model="editDraft.companion" @change="selectRoleAgent">
              <option :value="null">Unassigned</option>
              <option v-for="comp in companionList" :key="comp.id" :value="comp.id">
                {{ comp.name }}
              </option>
            </select>
          </div>
        </div>

        <p v-if="!companionList.length" class="muted">Create a smart agent in Agent, then add it to this team.</p>
        <div v-if="selectedSmartAgent" class="field">
          <p class="muted">{{ selectedSmartAgent.mission }}</p>
          <button v-if="selectedAgentCanHire" type="button" class="bz-btn bz-btn--ghost" @click="hireAgent = selectedSmartAgent">Review paid job in ${{ selectedSmartAgent.tokenSymbol }}</button>
          <p class="muted">Adding to this team configures local work. Paid marketplace jobs require a separate quote and approval.</p>
        </div>

        <div class="field">
          <CompanyWorkerModel v-model="editDraft.llm" :role-key="editingRoleKey" :role-label="roleDisplayName(editingRoleKey)" :worker-id="editDraft.companion" />
        </div>

        <div class="field">
          <label class="label">{{ $ui('Shared team connectors') }}</label>
          <p class="muted">{{ $ui('Every agent can use this team’s connectors. External actions still require their configured approvals.') }}</p>
          <div class="connector-checks">
            <span v-for="connector in roleConnectorOptions" :key="connector.kind" class="connector-check">
              <span class="material-symbols-outlined" aria-hidden="true">{{ connector.icon }}</span>
              <span class="connector-check__copy"><strong>{{ connector.name }}</strong><small>{{ $ui(connector.status) }}</small></span>
            </span>
          </div>
        </div>

        <div class="field">
          <label class="label fira-sans-condensed-black-italic">Create capabilities</label>
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
          <label class="label fira-sans-condensed-black-italic">Per-run budget cap</label>
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
            title="Remove this smart agent from the local role."
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
            <span class="role-modal__title">New outcome</span>
          </h2>
          <BzCloseButton size="md" aria-label="Close" @click="closeNewGoalModal" />
        </div>
        <label class="goal-modal__label">Title</label>
        <input
          v-model.trim="goalDraft.title"
          class="input is-medium"
          placeholder="e.g. 'Launch this week's haiku release'"
          maxlength="160"
        />

        <label class="goal-modal__label">Why this matters</label>
        <textarea
          v-model="goalDraft.rationale"
          class="textarea"
          rows="2"
          placeholder="Optional but recommended: a sentence on why this outcome matters now."
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
              <option value="">Let BonzAI route it</option>
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
              Create outcome
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── New Issue modal ────────────────────────────────────────── -->
    <div
      v-if="issueModalOpen"
      class="role-modal-overlay"
      @click.self="closeNewIssueModal"
    >
      <div class="role-modal models__activity--payouts goal-modal">
        <div class="role-modal__header">
          <h2 class="fira-sans-condensed-black-italic">
            <span class="material-symbols-outlined" aria-hidden="true">task_alt</span>
            <span class="role-modal__title">New task</span>
          </h2>
          <BzCloseButton size="md" aria-label="Close" @click="closeNewIssueModal" />
        </div>
        <label class="goal-modal__label">Task</label>
        <input
          v-model.trim="issueDraft.title"
          class="input is-medium"
          placeholder="e.g. Draft three UGC hooks for Client A"
          maxlength="200"
        />

        <label class="goal-modal__label">Details</label>
        <textarea
          v-model="issueDraft.description"
          class="textarea"
          rows="3"
          placeholder="Constraints, source material, expected output, or acceptance criteria."
        ></textarea>

        <div class="issue-modal-grid">
          <label v-if="domainViews.length" class="goal-modal__field">
            <span class="goal-modal__label">{{ $ui('Workspace') }}</span>
            <select v-model="issueDraft.workspaceChannel" class="company-admin-select">
              <option value="">{{ $ui('Backlog') }}</option>
              <option v-for="view in domainViews" :key="view.key" :value="view.key">{{ $ui(view.label) }}</option>
            </select>
          </label>
          <label class="goal-modal__field">
            <span class="goal-modal__label">Assign to teammate</span>
            <select v-model="issueDraft.assigneeRole" class="company-admin-select">
              <option value="">Select a role</option>
              <option v-for="roleKey in filledRoles" :key="roleKey" :value="roleKey">
                {{ roleDisplayName(roleKey) }}
              </option>
            </select>
          </label>
          <label class="goal-modal__field">
            <span class="goal-modal__label">Priority</span>
            <select v-model="issueDraft.priority" class="company-admin-select">
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label class="goal-modal__field">
            <span class="goal-modal__label">Attach to outcome</span>
            <select v-model="issueDraft.goalId" class="company-admin-select">
              <option :value="null">No outcome</option>
              <option v-for="goal in filteredGoals" :key="goal.id" :value="goal.id">
                {{ goal.title }}
              </option>
            </select>
          </label>
        </div>

        <hr />

        <div class="role-modal__actions">
          <div class="role-modal__actions-right" style="margin-left:auto;">
            <button class="bz-btn bz-btn--ghost fira-sans-condensed-black-italic" @click="closeNewIssueModal">
              Cancel
            </button>
            <button
              class="bz-btn bz-btn--primary fira-sans-condensed-black-italic"
              :class="{ 'is-loading': issueBusy }"
              :disabled="issueBusy || !issueDraft.title.trim() || !issueDraft.assigneeRole"
              @click="submitIssue"
            >
              <span class="material-symbols-outlined" aria-hidden="true">add_task</span>
              Create task
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <CompanyTaskReview v-if="taskReview" :company-id="charter.id" :issue="taskReview" @close="taskReview = null" @saved="store.refreshActive()" @open-operational-record="openOperationalRecord" />
</template>

<script>
import CompanyHiredSpecialists from "./CompanyHiredSpecialists.vue";
import CompanyWorkflowStudio from "./CompanyWorkflowStudio.vue";
import CompanyTeamStatus from "./CompanyTeamStatus.vue";
import { isAutonomousWorkflowTask } from "../../shared/companyAutomation.js";
import { setCompanyWorkflowHandoff } from "../../services/company/workflowHandoff.js";
import DownloadRequirement from "../DownloadRequirement.vue";
import { cancelLocalDownloads } from "../../services/downloadCancellation.js";
import "./company-design.css";
import { actionDisplayName } from "../../services/company/actionLabels.js";
import { computed, reactive, ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import companyStore from "../../stores/companyStore.js";
import { DEFAULT_COMPANIONS, listAllLLMs } from "../../skills/flagship.js";
import { SKILL_MANIFESTS } from "../../services/company/skillManifests.js";
import CompanyConnectors from "./CompanyConnectors.vue";
import SmartAgentHireModal from "../SmartAgentHireModal.vue";
import AgentWorkersPanel from "../AgentWorkersPanel.vue";
import SmartAgentJobsPanel from "../SmartAgentJobsPanel.vue";
import { requestSmartAgentJobAction } from '../../services/company.service.js';
import { loadSmartAgents, smartAgentCatalog, SMART_AGENT_CREATE_CAPABILITIES } from "../../services/smartAgentCatalog.js";
import CompanyTaskReview from './CompanyTaskReview.vue';
import CompanyWorkflowProgress from "./CompanyWorkflowProgress.vue";
import { taskProgress } from "../../services/company/workflowProgress.js";
import CompanyMission from "./CompanyMission.vue";
import CompanyLiveFeed from "./CompanyLiveFeed.vue";
import { domainWorkspaceViews, workInDomain, workspaceNavigation, workspaceViews, workspaceSection, maintenanceDestination, resolveWorkspaceDestination } from "../../services/company/workspaceNavigation.js";
import CompanyQuestion from "./CompanyQuestion.vue";
import CompanyGoalRoom from "./CompanyGoalRoom.vue";
import { visibleText as stripReasoningTags, visibleRecord } from "../../shared/visibleText.js";
import CompanyGmao from "./CompanyGmao.vue";
import CompanyToday from "./CompanyToday.vue";
import CompanyWorkerModel from "./CompanyWorkerModel.vue";
import { canonicalWorkerModelKey } from "../../services/company/workerModels.js";
import CompanyOperationalFiles from "./CompanyOperationalFiles.vue";
import CompanyGettingStarted from "./CompanyGettingStarted.vue";
import CompanyGrants from "./CompanyGrants.vue";
import CompanyBilling from "./CompanyBilling.vue";
import CompanySales from './CompanySales.vue';
import CompanyPurchasing from "./CompanyPurchasing.vue";
import CompanyArtifactPreview from "./CompanyArtifactPreview.vue";
import CompanyInbox from "./CompanyInbox.vue";
import CompanyDeliverableLibrary from "./CompanyDeliverableLibrary.vue";
import { downloadArtifact, artifactPlainText, resultLibrarySections } from "../../services/company/artifactMedia.js";
import CompanyMarkdown from "./CompanyMarkdown.vue";
import BzCloseButton from "../BzCloseButton.vue";
import BonzaiDataTable from "../BonzaiDataTable.vue";
import BonzaiEmptyState from "../BonzaiEmptyState.vue";
import {operationText} from "../../i18n/operations.js";
import { i18n } from "../../i18n/index.js";
import { companionAvatar, formatModelLabel, formatRoleTitle } from "../../services/company/presentation.js";
import { buildWorkspaceBlueprint, hydrateWorkspaceChannels } from "../../services/company/workspaceBlueprints.js";

export default {
  name: "CompanyDashboard",
  components: {
    CompanyHiredSpecialists, CompanyTeamStatus, DownloadRequirement, CompanyWorkflowStudio, CompanyWorkerModel, CompanyToday, CompanyOperationalFiles, CompanySales, CompanyGettingStarted, CompanyGrants, CompanyBilling, CompanyPurchasing, CompanyInbox, CompanyDeliverableLibrary, CompanyMarkdown, CompanyQuestion, CompanyMission,
    CompanyWorkflowProgress, CompanyTaskReview, AgentWorkersPanel, SmartAgentJobsPanel, SmartAgentHireModal, BzCloseButton, BonzaiDataTable, BonzaiEmptyState, CompanyArtifactPreview, CompanyConnectors, CompanyLiveFeed, CompanyGoalRoom, CompanyGmao },
  props: {
    charter: { type: Object, required: true },
    state: { type: Object, required: true },
    initialView: { type: String, default: "" },
    initialResultId: { type: String, default: "" },
  },
  emits: ["edit", "reload", "new-company", "delete-company"],
  setup(props) {
    const workspaceRoot = ref(null);
    const teamDockStyle = ref({});
    const teamVeilStyle = ref({});
    const hoveredCommand = ref('');
    const showCommandLabel = label => { positionTeamDock(); hoveredCommand.value = label; };
    let dockObserver;
    const positionTeamDock = () => {
      const bounds = workspaceRoot.value?.getBoundingClientRect();
      if (!bounds) return;
      const viewport = workspaceRoot.value.closest('.bz-main__workspace')?.getBoundingClientRect();
      const frame = viewport || {left:bounds.left, top:0, right:bounds.right, bottom:window.innerHeight};
      const x = Math.max(0, frame.left), y = Math.max(0, frame.top);
      teamVeilStyle.value = {left:x+'px', top:y+'px',
        width:Math.max(0, Math.min(window.innerWidth,frame.right)-x)+'px',
        height:Math.max(0, Math.min(window.innerHeight,frame.bottom)-y)+'px'};
      const left = Math.max(16, bounds.left);
      teamDockStyle.value = {left: left + 'px', maxWidth: Math.max(160, Math.min(bounds.width, window.innerWidth - left - 20)) + 'px'};
    };
    onMounted(() => {
      dockObserver = new ResizeObserver(positionTeamDock);
      dockObserver.observe(workspaceRoot.value);
      window.addEventListener('resize', positionTeamDock);
      positionTeamDock();
    });
    onUnmounted(() => { dockObserver?.disconnect(); window.removeEventListener('resize', positionTeamDock); });

    const displayState = computed(() => visibleRecord(props.state));
    const taskReview = ref(null);
    const store = companyStore;

    const active = ref("command");
    const studioOpened = ref(false);
    const workflowStudio = ref(null);
    watch(active, view => { if (view === 'studio') studioOpened.value = true; }, { immediate: true });
    const activeChannel = ref("command");
    const inboxReview = ref(null);
    const inboxWorkspace = ref(null);
    async function openCompanyIntake() {
      active.value = 'approvals';
      await nextTick();
      inboxWorkspace.value?.openIntake();
    }
    const operationalWorkspace = ref(null);
    const billingWorkspace = ref(null), purchasingWorkspace = ref(null);
    const gmaoView = ref("today");
    const gmaoClientId = ref("");
    const manual = reactive({ amount: 0, memo: "" });
    const goalLimit = ref(20);
    const expandedWorkResults = reactive(new Set());
    const auditLimit = ref(80);
    const charterBusy = ref(false), charterError = ref(''), charterSaved = ref(false);
    const teamSettingsSection = ref('identity');
    const teamSettingsSections = [
      { id: 'identity', label: 'Team identity', icon: 'badge' },
      { id: 'style', label: 'Working style', icon: 'chat' },
      { id: 'money', label: 'Money guardrails', icon: 'account_balance_wallet' },
      { id: 'autonomy', label: 'Autonomy and memory', icon: 'verified_user' },
      { id: 'cadence', label: 'Cadence', icon: 'schedule' },
      { id: 'execution', label: 'Model execution', icon: 'memory' },
    ];
    const exportMessage = ref('');
    const isFullscreen = ref(false);
    const pendingDelete = ref(null);
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
      tone: "direct",
      language: "auto",
      responseDetail: "balanced",
      instructions: "",
      autonomy: "balanced",
      memory: "full",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      dailyBrief: true,
    });
    const modelAvailability = reactive({});
    const modelDownloading = reactive({});
    const roleDownloadError = ref('');
    const isCancellingRoleDownloads = ref(false);
    let roleDownloadRun = 0;
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
      charterDraft.tone = props.charter.experience?.tone || "direct";
      charterDraft.language = props.charter.experience?.language || "auto";
      charterDraft.responseDetail = props.charter.experience?.responseDetail || "balanced";
      charterDraft.instructions = props.charter.experience?.instructions || "";
      charterDraft.autonomy = props.charter.experience?.autonomy || "balanced";
      charterDraft.memory = props.charter.experience?.memory || "full";
      charterDraft.timezone = props.charter.experience?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      charterDraft.dailyBrief = props.charter.experience?.dailyBrief !== false;
    }

    watch(() => props.charter?.id, () => { resetCharterDraft(); charterError.value = ''; charterSaved.value = false; }, { immediate: true });
    watch(charterDraft, () => { charterSaved.value = false; });

    async function saveCharter() {
      charterBusy.value = true; charterError.value = ''; charterSaved.value = false;
      try {
        const next = JSON.parse(JSON.stringify(props.charter));
        next.name = charterDraft.name.trim();
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
        next.experience = {
          ...(next.experience || {}),
          tone: charterDraft.tone,
          language: charterDraft.language,
          responseDetail: charterDraft.responseDetail,
          instructions: props.charter.experience?.instructions || "",
          autonomy: charterDraft.autonomy,
          memory: charterDraft.memory,
          timezone: charterDraft.timezone,
          dailyBrief: charterDraft.dailyBrief,
        };
        await store.update(next); charterSaved.value = true;
      } catch (err) {
        charterError.value = err.message || String(err);
      } finally {
        charterBusy.value = false;
      }
    }

    // ─── Role-edit modal ─────────────────────────────────────────
    const editingRoleKey = ref(null);
    const mediaPipelineOptions = [
      { key: "text", label: "Text", icon: "chat" },
      { key: "fineTune", label: "Training · approval required", icon: "model_training" },
      { key: "image", label: "Image", icon: "image" },
      { key: "video", label: "Video", icon: "movie" },
      { key: "audio", label: "Audio", icon: "graphic_eq" },
      { key: "music", label: "Music", icon: "music_note" },
      { key: "3d", label: "3D", icon: "deployed_code" },
      { key: "vision", label: "Vision", icon: "visibility" },
    ];
    const editDraft = reactive({ companion: null, llm: null, gateway: null, budget: null, pipelines: [], connectors: [], grantedSkills: [] });
    const editBusy = ref(false);

    const companionList = computed(() => smartAgentCatalog.agents);
    const hireAgent = ref(null);
    async function requestAgentJobAction(action) {
      try {
        await requestSmartAgentJobAction(props.charter.id, action);
        await store.refreshActive();
        active.value = 'approvals'; activeChannel.value = 'approvals';
      } catch (error) { alert(error.message); }
    }
    const selectedSmartAgent = computed(() => smartAgentCatalog.agents.find(agent => agent.id === editDraft.companion));
    const selectedAgentCanHire = computed(() => selectedSmartAgent.value?.tokenId != null && selectedSmartAgent.value?.agentWallet && selectedSmartAgent.value?.tokenAddress);
    function consumeHireRequest() {
      const id = smartAgentCatalog.pendingHireId;
      if (!id || !smartAgentCatalog.loaded) return;
      active.value = 'org'; activeChannel.value = 'org';
      const role = availableRoleOptions.value[0]?.key;
      if (!role) return;
      openRoleEdit(role);
      editDraft.companion = id;
      editDraft.pipelines = [...SMART_AGENT_CREATE_CAPABILITIES];
      smartAgentCatalog.pendingHireId = null;
    }
    watch(() => [smartAgentCatalog.pendingHireId, smartAgentCatalog.loaded], consumeHireRequest);
    function selectRoleAgent() {
      // A different companion does not inherit the previous role holder's integrations.
      const previous = props.charter.roles?.[editingRoleKey.value];
      const sameCompanion = previous?.companion === editDraft.companion;
      editDraft.grantedSkills = sameCompanion ? [...(previous.grantedSkills || [])] : [];
      editDraft.connectors = sameCompanion ? [...(previous.connectors || connectorsForSkills(editDraft.grantedSkills))] : [];
    }
    const availableRoleOptions = computed(() =>
      Object.keys(displayState.value.roleLibrary || {})
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
          label: formatModelLabel(model.name),
          params: model.parameters || 0,
          filesizeBytes: model.filesizeBytes || 0,
          filename: model.filename,
          url: model.url,
        }))
        .sort((a, b) => a.params - b.params || a.label.localeCompare(b.label)),
    );
    const roleConnectorOptions = computed(() => (displayState.value.connectors || []).map(connector => ({
      kind: connector.kind, name: connectorLabel(connector.kind), icon: connectorIcon(connector.kind), status: connector.status || 'not_connected',
    })));
    function roleConnectorCount() { return roleConnectorOptions.value.length; }
    function connectorsForSkills(skillIds) {
      const out = new Set();
      for (const sid of skillIds || []) {
        for (const kind of SKILL_MANIFESTS[sid]?.requiredConnectors || []) out.add(kind);
      }
      return [...out];
    }
    function connectorLabel(kind) {
      return String(kind || "")
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }
    function connectorIcon(kind) {
      return ({
        twilio: "call",
        quickbooks: "receipt_long",
        stripe: "credit_card",
        google_calendar: "event",
        hubspot: "hub",
        sendgrid: "mail",
        shopify: "storefront",
        printful: "local_shipping",
        printify: "inventory",
        optimoroute: "alt_route",
        google_business: "storefront",
        docusign: "draw",
        clio: "gavel",
        meta_ads: "ads_click",
        google_ads: "campaign",
        notion: "menu_book",
        convertkit: "newspaper",
        teachable: "school",
        calendly: "event_available",
        slack: "tag",
        linear: "list_alt",
      })[kind] || "cable";
    }
    function toggleRoleConnector(kind, checked) {
      const next = new Set(editDraft.connectors || []);
      if (checked) next.add(kind);
      else next.delete(kind);
      editDraft.connectors = [...next];
    }
    function defaultBudgetForRole(roleKey) {
      const def = displayState.value.roleLibrary[roleKey];
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
      editDraft.pipelines = Array.isArray(cur.pipelines) ? [...cur.pipelines] : [...SMART_AGENT_CREATE_CAPABILITIES];
      editDraft.grantedSkills = Array.isArray(cur.grantedSkills) ? [...cur.grantedSkills] : [];
      editDraft.connectors = Array.isArray(cur.connectors) ? [...cur.connectors] : connectorsForSkills(editDraft.grantedSkills);
      editingRoleKey.value = roleKey;
    }
    async function saveWorkerModel(roleKey, key) {
      // Read the current prop at apply time, after any download has completed.
      const next = JSON.parse(JSON.stringify(props.charter));
      if (!next.roles?.[roleKey]?.companion) throw new Error("This teammate is no longer assigned to this role.");
      if (!smartAgentCatalog.agents.find(agent => agent.id === next.roles[roleKey].companion)?.isCustom) throw new Error('Custom models are available for custom agents only.');
      next.roles[roleKey].llm = key;
      await store.update(next);
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
            alert("Pick a smart agent before adding this role.");
            editBusy.value = false;
            return;
          }
          // Unassign — drop the row entirely. Role becomes inheritable.
          delete next.roles[roleKey];
        } else {
          next.roles[roleKey] = next.roles[roleKey] || {};
          next.roles[roleKey].companion = editDraft.companion;
          next.roles[roleKey].employment = {
            type: "companion-hire",
            companionId: editDraft.companion,
          };
          if (editDraft.llm && selectedSmartAgent.value?.isCustom) next.roles[roleKey].llm = editDraft.llm;
          else delete next.roles[roleKey].llm;
          if (editDraft.gateway) next.roles[roleKey].gateway = editDraft.gateway;
          else delete next.roles[roleKey].gateway;
          if (editDraft.pipelines.length) next.roles[roleKey].pipelines = [...editDraft.pipelines];
          else delete next.roles[roleKey].pipelines;
          if (editDraft.connectors.length) next.roles[roleKey].connectors = [...new Set(editDraft.connectors)];
          else delete next.roles[roleKey].connectors;
          delete next.roles[roleKey].assignedWorkflowIds;
          // Legacy connector action grants are retained only for the same role holder.
          if (editDraft.grantedSkills.length) next.roles[roleKey].grantedSkills = [...editDraft.grantedSkills];
          else delete next.roles[roleKey].grantedSkills;
          next.grantedSkills = [...new Set(
            Object.values(next.roles).flatMap((role) => role.grantedSkills || []),
          )];
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
      if (!confirm(`Unassign ${roleDisplayName(roleKey)}? The coordinator will route future work to another available teammate.`)) return;
      editDraft.companion = null;
      editDraft.llm = null;
      editDraft.gateway = null;
      editDraft.budget = null;
      editDraft.pipelines = [];
      editDraft.grantedSkills = [];
      editDraft.connectors = [];
      await saveRoleEdit();
    }

    // ─── Issues form state (panel-local) ─────────────────────────
    const issueDraft = reactive({
      title: "",
      description: "",
      assigneeRole: "",
      priority: "normal",
      goalId: null,
      workspaceChannel: "",
    });
    const issueModalOpen = ref(false);
    const issueFilter = ref("open");
    const issueBusy = ref(false);

    function openNewIssueModal() {
      issueDraft.workspaceChannel = selectedDomain.value?.key || "";
      issueDraft.title = "";
      issueDraft.description = "";
      issueDraft.assigneeRole = filledRoles.value[0] || "";
      issueDraft.priority = "normal";
      issueDraft.goalId = filteredGoals.value[0]?.id || null;
      issueModalOpen.value = true;
    }
    function closeNewIssueModal() {
      issueModalOpen.value = false;
    }

    async function submitIssue() {
      if (!issueDraft.title.trim() || !issueDraft.assigneeRole) return;
      issueBusy.value = true;
      try {
        await store.createIssue({
          title: issueDraft.title,
          description: issueDraft.description,
          assigneeRole: issueDraft.assigneeRole,
          priority: issueDraft.priority,
          goalId: issueDraft.goalId || null,
          createdBy: "user",
          labels: issueDraft.workspaceChannel ? [`workspace:${issueDraft.workspaceChannel}`] : [],
        });
        issueDraft.title = "";
        issueDraft.description = "";
        issueDraft.goalId = null;
        issueModalOpen.value = false;
      } finally {
        issueBusy.value = false;
      }
    }
    function issueWorkspace(issue) {
      return domainViews.value.find(view => workInDomain(issue, view.key))?.key || '';
    }
    async function moveIssueWorkspace(issue, key) {
      try {
        await store.updateIssue(issue.id, {
          labels: [...(issue.labels || []).filter(label => !label.startsWith('workspace:')), ...(key ? [`workspace:${key}`] : [])],
        });
      } catch (error) { exportMessage.value = error.message; }
    }
    async function setIssueStatus(issueId, status) {
      await store.updateIssue(issueId, { status });
    }
    async function reopenIssue(issueId) { await store.reopenIssue(issueId); }
    function requestDeleteIssue(issue) {
      if (!issue?.id) return;
      pendingDelete.value = {
        type: "issue",
        id: issue.id,
        label: `"${sentenceCaseTask(issue.title || "issue")}"`,
      };
    }
    function requestDeleteContent(row) {
      if (!row?.id) return;
      pendingDelete.value = {
        type: "content",
        id: row.id,
        label: row.pipeline ? `${row.pipeline} artifact` : "artifact",
      };
    }
    function dismissDelete() {
      pendingDelete.value = null;
    }
    async function confirmDelete() {
      const target = pendingDelete.value;
      pendingDelete.value = null;
      if (!target?.id) return;
      if (target.type === "issue") await store.removeIssue(target.id);
      if (target.type === "content") await store.removeContent(target.id);
    }
    const filteredIssues = computed(() => {
      const all = displayState.value.issues || [];
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
    function sentenceCaseTask(value) {
      const text = String(value || "").trim();
      if (!text) return "";
      const lowered = text
        .split(/\s+/)
        .map((word) => (/^[A-Z0-9]{2,}$/.test(word.replace(/[^\p{L}\p{N}]/gu, "")) ? word : word.toLocaleLowerCase()))
        .join(" ");
      return lowered.charAt(0).toLocaleUpperCase() + lowered.slice(1);
    }

    // ─── Goals (parent of issues) — filters + grouping ──────────────
    const workStatusFilter = ref("all"), workQuery = ref(''), showEarlierPlanning = ref(false);
    function clearWorkFilters() { workStatusFilter.value='all'; workQuery.value=''; }
    const deliverableSection = ref('assets');
    const deliverableSections = computed(() => resultLibrarySections(props.charter));
    watch(() => props.charter.id, () => { deliverableSection.value = 'assets'; });
    function openResultTask(issueId) {
      if (props.charter.workspace?.executionWorkflowId) return openChannelByKey({ view: 'studio', issueId });
      return openWorkResult(issueId);
    }
    const workStatusFilters = [
      { id: "all", label: "All" },
      { id: "active", label: "Active" },
      { id: "attention", label: "Needs attention" },
      { id: "completed", label: "Completed" },
    ];
    function goalStatusClass(s) {
      return ({
        active: "company-pill--info",
        completed: "company-pill--success",
        cancelled: "company-pill--neutral",
      })[s] || "company-pill--neutral";
    }
    const filteredGoals = computed(() => {
      return (displayState.value.goals || []).slice().sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    });
    function issuesForGoal(goalId) {
      return (displayState.value.issues || []).filter((i) => i.goalId === goalId);
    }
    function goalProgress(goal) {
      const list = issuesForGoal(goal.id);
      const done = list.filter((i) => i.status === "done").length;
      const total = list.length || 1;
      return { done, total, pct: Math.round((done / total) * 100) };
    }
    const ungroupedIssues = computed(() => {
      const goalIds = new Set((displayState.value.goals || []).map(goal => goal.id));
      return (displayState.value.issues || []).filter(issue => !issue.goalId || !goalIds.has(issue.goalId));
    });
    const kanbanColumnDefs = [
      { id: "open", label: "Open", hint: "Outcomes ready to be decomposed and tasks waiting for a teammate.", icon: "radio_button_unchecked", statuses: ["open"] },
      { id: "in_progress", label: "In Progress", hint: "Assigned work currently being handled by a teammate.", icon: "pending", statuses: ["in_progress"] },
      { id: "blocked", label: "Blocked", hint: "Tasks that need intervention before they can move.", icon: "report", statuses: ["blocked"] },
      { id: "done", label: "Done", hint: "Completed tasks and finished outcomes.", icon: "check_circle", statuses: ["done"] },
      { id: "cancelled", label: "Cancelled", hint: "Work intentionally stopped or superseded.", icon: "block", statuses: ["cancelled"] },
    ];
    function goalOnlyColumn(goal) {
      if (goal.status === "completed") return "done";
      if (goal.status === "cancelled") return "cancelled";
      return "open";
    }
    const kanbanColumns = computed(() => {
      const items = [];
      for (const goal of filteredGoals.value) {
        const linkedIssues = issuesForGoal(goal.id);
        if (!linkedIssues.length) {
          items.push({
            id: `goal-${goal.id}`,
            type: "goal",
            column: goalOnlyColumn(goal),
            goal,
          });
          continue;
        }
        for (const issue of linkedIssues) {
          items.push({
            id: `issue-${issue.id}`,
            type: "issue",
            column: issue.status || "open",
            goal,
            issue,
          });
        }
      }
      for (const issue of ungroupedIssues.value) {
        items.push({
          id: `issue-${issue.id}`,
          type: "issue",
          column: issue.status || "open",
          goal: null,
          issue,
        });
      }
      return kanbanColumnDefs.map((column) => ({
        ...column,
        items: items.filter((item) => column.statuses.includes(item.column) && (!selectedDomain.value || workInDomain(item.issue, selectedDomain.value.key))),
      }));
    });
    const allWorkItems = computed(() => kanbanColumns.value.flatMap((column) =>
      column.items.map((item) => ({ ...item, columnLabel: column.label })),
    ));
    function isEarlierPlanningItem(item) {
      if (!props.charter.workspace?.executionWorkflowId) return false;
      return item.type === 'goal' ? item.goal.createdBy === 'ceo' : isAutonomousWorkflowTask(props.charter, item.issue, item.goal);
    }
    const earlierPlanningItems = computed(() => allWorkItems.value.filter(isEarlierPlanningItem));
    const selectedWorkItems = computed(() => allWorkItems.value.filter(item => showEarlierPlanning.value ? isEarlierPlanningItem(item) : !isEarlierPlanningItem(item)));
    const matchedWorkItems = computed(() => {
      const query=workQuery.value.trim().toLocaleLowerCase();
      return selectedWorkItems.value.filter(item=>{
        const status=workStatusFilter.value;
        if(status==='active' && !['open','in_progress'].includes(item.column))return false;
        if(status==='attention' && item.column!=='blocked')return false;
        if(status==='completed' && item.column!=='done')return false;
        const record=item.issue || item.goal;
        return !query || [record?.title,record?.description,record?.rationale,roleDisplayName(record?.assigneeRole)].some(value=>String(value||'').toLocaleLowerCase().includes(query));
      });
    });
    const todoWorkItems = computed(() => matchedWorkItems.value.slice(0, goalLimit.value));
    watch([workStatusFilter, workQuery, showEarlierPlanning], () => { goalLimit.value = 20; });
    function workStatusCount(status) {
      if (status === "all") return selectedWorkItems.value.length;
      if (status === "active") return selectedWorkItems.value.filter((item) => ["open", "in_progress"].includes(item.column)).length;
      if (status === "attention") return selectedWorkItems.value.filter((item) => item.column === "blocked").length;
      if (status === "completed") return selectedWorkItems.value.filter((item) => item.column === "done").length;
      return 0;
    }

    // ─── New outcome modal ─────────────────────────────────────────
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

    // Shared server + parallel pool, measured in the main process. Never use
    // configured role models or a team's memory budget as runtime telemetry.
    const runtime = reactive({ snapshot: null, checking: false, error: '' });
    let runtimeTimer = null, runtimeUnsubscribe = null, runtimeMounted = false;
    async function refreshRuntime() {
      if (!runtimeMounted || document.hidden || runtime.checking) return;
      if (!window.electronAPI?.localExecutionStatus) {
        runtime.error = 'Restart BonzAI to enable live execution status.';
        return;
      }
      runtime.checking = true;
      let timeout;
      try {
        const snapshot = await Promise.race([
          window.electronAPI.localExecutionStatus(),
          new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('timeout')), 4000); }),
        ]);
        if (!snapshot || !Number.isFinite(snapshot.loaded) || !Number.isFinite(snapshot.observedAt)) throw new Error('Invalid runtime status');
        if (runtimeMounted) { runtime.snapshot = snapshot; runtime.error = ''; }
      } catch {
        if (runtimeMounted) { runtime.snapshot = null; runtime.error = 'Local execution status unavailable'; }
      } finally {
        clearTimeout(timeout);
        runtime.checking = false;
      }
    }
    function onVisibilityChange() {
      // Hide stale readings until a fresh snapshot arrives after resuming.
      if (!document.hidden) { runtime.snapshot = null; refreshRuntime(); }
    }
    onMounted(() => {
      void loadSmartAgents().then(consumeHireRequest).catch(console.warn);
      runtimeMounted = true;
      refreshRuntime();
      runtimeTimer = setInterval(refreshRuntime, 2000);
      runtimeUnsubscribe = window.electronAPI?.onModelChanged?.(() => refreshRuntime());
      document.addEventListener("visibilitychange", onVisibilityChange);
    });
    onUnmounted(() => {
      runtimeMounted = false;
      clearInterval(runtimeTimer);
      if (typeof runtimeUnsubscribe === 'function') runtimeUnsubscribe();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    });

    const workspaceBlueprint = computed(() => props.charter.workspace || buildWorkspaceBlueprint({
      templateId: props.charter.template?.id,
      businessType: props.charter.businessContext?.businessType,
      currentWorkflow: props.charter.businessContext?.existingProcessSummary,
    }));
    const subtabs = computed(() => hydrateWorkspaceChannels(workspaceBlueprint.value, displayState.value, props.charter.template?.id).map((item) => ({
      ...item,
      value: item.view,
      badge: item.badgeValue,
      focus: item.domainView,
    })));
    const hasMaintenance = computed(() => subtabs.value.some(view => view.value === 'gmao'));
    const primaryViews = computed(() => workspaceNavigation(subtabs.value, displayState.value, props.charter));
    const domainViews = computed(() => domainWorkspaceViews(subtabs.value));
    const selectedDomain = computed(() => active.value === 'issues' ? domainViews.value.find(view => view.key === activeChannel.value) : null);
    const activeSection = computed(() => selectedDomain.value?.key || workspaceSection(active.value, gmaoView.value, hasMaintenance.value));
    const currentChannel = computed(() => (active.value === 'market' ? {icon:'person_search',label:'Agent Market'} : null) || selectedDomain.value || (active.value === 'gmao' ? maintenanceDestination(gmaoView.value)
      : primaryViews.value.find(view => view.value === active.value) || workspaceViews.find(view => view.value === active.value) || workspaceViews[0]));
    function openChannel(channel) {
      const destination = channel.value === 'gmao' ? maintenanceDestination(channel.focus) : channel;
      active.value = destination.value;
      activeChannel.value = destination.key;
      if (destination.focus) gmaoView.value = destination.focus;
    }
    async function newTeamTask() {
      if (!props.charter.workspace?.executionWorkflowId) return openNewIssueModal();
      await openChannelByKey('studio');
      workflowStudio.value?.newTask();
    }
    function interactiveWorkflowStep(issue) {
      if (issue.status !== 'blocked') return null;
      return issue.execution?.steps?.find(step => step.action?.type === 'runWorkflow' && (step.status === 'requires_input' || (step.status === 'failed' && step.output?.status === 'requires_input')));
    }
    async function continueWorkflowTask(issue) {
      const step = interactiveWorkflowStep(issue);
      if (!step) return;
      setCompanyWorkflowHandoff({ companyId: props.charter.id, issueId: issue.id, skillId: step.action.workflowId, agentId: issue.assigneeCompanion });
      await openChannelByKey('studio');
      workflowStudio.value?.focusTask();
    }
    const grantsWorkspace = ref(null);
    async function openChannelByKey(target) {
      const key = typeof target === 'object' ? target.view : target;
      if (key === 'studio' && target?.issueId) {
        const issue = props.state.issues.find(item => item.id === target.issueId && (!item.companyId || item.companyId === props.charter.id));
        const workflowId = props.charter.workspace?.executionWorkflowId;
        if (!issue || !workflowId || !issue.execution?.steps?.some(step => step.action?.type === 'runWorkflow' && step.action.workflowId === workflowId)) return;
        setCompanyWorkflowHandoff({ companyId: props.charter.id, issueId: issue.id, skillId: workflowId, agentId: issue.assigneeCompanion });
      }
      if (key === 'intake') return openCompanyIntake();
      if(key==='issues' && target?.filter) { workStatusFilter.value=target.filter; workQuery.value=''; }
      openChannel(resolveWorkspaceDestination(key, subtabs.value, hasMaintenance.value));
      await nextTick();
      if (key === 'studio' && target?.issueId) workflowStudio.value?.focusTask();
      if (key === 'grants' && target?.section) grantsWorkspace.value?.openSection(target.section);
      if (key === 'purchasing' && target?.section) purchasingWorkspace.value?.openSection?.(target.section);
    }
    async function startPartsInvoice(parts) {
      active.value='billing';await nextTick();await billingWorkspace.value?.createFromParts(parts);
    }
    async function openOperationalRecord(target) {
      if (target?.kind==='recordMessage') {
        try {
          const record=await window.electronAPI.db.recordOperations.messageTarget(props.charter.id,target.id);
          await openOperationalRecord(record);
          for(let attempt=0;attempt<20;attempt++) {
            await nextTick();
            const button=[...document.querySelectorAll('[data-review-message]')].find(el=>el.dataset.reviewMessage===target.id);
            if(button){button.click();break;}
            await new Promise(resolve=>setTimeout(resolve,100));
          }
        } catch(error){exportMessage.value=error.message;}
        return;
      }
      if (!target?.id || !['invoice', 'customerInvoice', 'workOrder', 'supplierInvoice', 'rfq', 'purchaseRequest', 'purchaseOrder', 'grant'].includes(target.kind)) return;
      taskReview.value = null;
      if(target.kind==='grant'){await openChannelByKey('grants');await grantsWorkspace.value?.openRecord(target.id);return;}
      if(target.kind==='workOrder'){await openOperationalWorkOrder(target.id);return;}
      active.value = ['invoice','customerInvoice'].includes(target.kind) ? 'billing' : 'purchasing';
      activeChannel.value = active.value;
      await nextTick();
      if (['invoice','customerInvoice'].includes(target.kind)) await billingWorkspace.value?.openInvoice(target.id, target.revision);
      else if (target.kind === 'purchaseOrder') await purchasingWorkspace.value?.openOrder(target.id);
      else if (target.kind === 'supplierInvoice') await purchasingWorkspace.value?.openSupplierInvoice(target.id);
      else if (target.kind === 'purchaseRequest') await purchasingWorkspace.value?.openRequest(target.id, target.revision);
      else await purchasingWorkspace.value?.openRfq(target.id, target.revision);
    }
    async function openOperationalWorkOrder(id) {
      await store.refreshActive();
      gmaoClientId.value = '';
      openChannelByKey('work-orders');
      await nextTick();
      operationalWorkspace.value?.openWorkOrder(id);
    }
    async function openOperationalTask(id) {
      await store.refreshActive();
      workStatusFilter.value = 'all';
      openChannelByKey('issues');
      await nextTick();
      const row = [...document.querySelectorAll('[data-issue-id]')].find(element => element.dataset.issueId === id);
      row?.scrollIntoView({block:'center'});
      row?.focus({preventScroll:true});
    }
    watch(() => [props.charter.id, props.initialView, props.initialResultId, hasMaintenance.value], ([id, view, resultId], previous) => {
      if (previous && id === previous[0] && view === previous[1] && resultId === previous[2]) return;
      if (id !== previous?.[0]) gmaoClientId.value = '';
      const welcomeKey = `bonzai:workflow-welcome:${id}`;
      const firstVisit = !localStorage.getItem(welcomeKey);
      openChannelByKey(view || (firstVisit ? 'getting-started' : ''));
      if (firstVisit) localStorage.setItem(welcomeKey, 'seen');
      if (resultId) expandedWorkResults.add(resultId);
    }, { immediate: true });

    const filledRoles = computed(() =>
      Object.keys(props.charter.roles || {})
        .filter((k) => props.charter.roles[k]?.companion),
    );
    const treasuryEntries = computed(() =>
      displayState.value.audit.filter((e) => e.kind === "treasury"),
    );
    const totalSales = computed(() =>
      displayState.value.catalog.reduce((acc, e) => acc + (e.sales || 0), 0),
    );
    const latestProduced = computed(() =>
      (displayState.value.catalog || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null,
    );
    const catalogRows = computed(() =>
      (displayState.value.catalog || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    );
    const completedWorkRows = computed(() => {
      const goals = new Map((displayState.value.goals || []).map((goal) => [goal.id, goal]));
      const catalog = displayState.value.catalog || [];
      return (displayState.value.issues || [])
        .filter((issue) => issue.status === "done")
        .map((issue) => {
          const attempt = (issue.attempts || []).slice().sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0] || null;
          const report = attempt?.result || {};
          const issueEvents = (displayState.value.audit || [])
            .filter((event) => event.issueId === issue.id)
            .sort((a, b) => (a.ts || a.createdAt || 0) - (b.ts || b.createdAt || 0));
          const receipt = (displayState.value.audit || [])
            .filter((event) => event.issueId === issue.id && (event.txOrLink || (event.kind === "action" && event.note)))
            .sort((a, b) => (b.ts || b.createdAt || 0) - (a.ts || a.createdAt || 0))[0];
          const contentIds = new Set([
            ...(report.contentIds || []),
            ...issueEvents.map((event) => event.contentId).filter(Boolean),
            attempt?.txOrLink,
          ].filter(Boolean).map(String));
          const artifacts = catalog.filter((row) => contentIds.has(String(row.id)) || row.meta?.issueId === issue.id);
          const actions = Array.isArray(report.actions) && report.actions.length
            ? report.actions
            : issueEvents.filter((event) => ["action", "production", "treasury"].includes(event.kind)).map((event) => ({
                type: event.action,
                status: event.status || "executed",
                description: event.note || humanizeAction(event.action),
                reason: "Recorded while completing this work.",
              }));
          const goal = goals.get(issue.goalId);
          return {
            ...issue,
            goalTitle: goal?.title || "",
            resultLink: receipt?.txOrLink || "",
            resultNote: receipt?.note || "",
            recordId: attempt?.id || issue.id,
            completedAt: attempt?.finishedAt || issue.updatedAt || issue.createdAt,
            summary: report.summary || receipt?.note || `Completed “${issue.title}”.`,
            justification: report.justification || goal?.rationale || goal?.missionAlignment || issue.description || "This task was created from your request.",
            actions,
            artifacts,
          };
        })
        .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    });
    const visibleAuditEntries = computed(() =>
      (displayState.value.audit || []).slice(0, auditLimit.value),
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
      (displayState.value.issues || []).filter((i) => i.status === "open"),
    );
    const inProgressIssues = computed(() =>
      (displayState.value.issues || []).filter((i) => i.status === "in_progress"),
    );
    const blockedIssues = computed(() =>
      (displayState.value.issues || []).filter((i) => i.status === "blocked"),
    );
    const todayActiveWork = computed(() =>
      [...inProgressIssues.value, ...openIssues.value].slice(0, 6),
    );
    const recentProof = computed(() =>
      (displayState.value.audit || []).filter((e) => e.status === "executed").length,
    );
    const workflowName = computed(() => {
      const id = props.charter.template?.id || "";
      if (id === "business_ops_team") return "Workflow team";
      return props.charter.template?.id
        ? String(props.charter.template.id).replace(/_/g, " ")
        : "Workflow team";
    });
    const operatingMetrics = computed(() => [
      {
        label: "Mode",
        value: props.charter.demoMode ? "Sample" : props.charter.status === "active" ? "Connected" : "Paused",
        hint: props.charter.demoMode ? "example work visible" : `${workflowName.value}`,
      },
      {
        label: "Work",
        value: String(displayState.value.goalCounts?.active || 0),
        hint: `${openIssues.value.length} open items`,
      },
      {
        label: "Memory",
        value: String(recentProof.value),
        hint: "audit and learning entries",
      },
      {
        label: "Autonomy",
        value: automationHealth.value.label,
        hint: automationHealth.value.detail,
      },
      {
        label: "Guardrail",
        value: fmtMoney(displayState.value.treasuryState?.balance, displayState.value.treasuryState?.currency),
        hint: `${fmtMoney(props.charter.rules?.reserveFloor, displayState.value.treasuryState?.currency)} reserve`,
      },
    ]);
    const automationHealth = computed(() => displayState.value.runtimeError
      ? {level:'error',label:'Needs attention',detail:displayState.value.runtimeError}
      : props.charter.status !== 'active'
      ? { level: 'idle', label: 'Paused', detail: 'This team is paused.' }
      : displayState.value.automation?.health || { level: 'idle', label: 'Ready', detail: 'No run recorded yet' });
    const _companionMap = Object.fromEntries(DEFAULT_COMPANIONS.map((c) => [c.id, c.name]));
    function companionName(id) { return smartAgentCatalog.agents.find(agent => agent.id === id)?.name || _companionMap[id] || id; }

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
    function roleDisplayName(roleKey) { return operationText(formatRoleTitle(roleKey),i18n.state.locale); }
    function llmLabel(llmKey) {
      if (!llmKey) return operationText("Current model", i18n.state.locale);
      const model = modelSpec(llmKey);
      return formatModelLabel(model?.label || llmKey);
    }
    function companionImage(id) { return companionAvatar(smartAgentCatalog.agents.find((agent) => agent.id === id) || id); }
    function modelSpec(llmKey) { return llmOptionsList.value.find((item) => item.key === canonicalWorkerModelKey(llmKey)); }
    function modelNeedsDownload(llmKey) {
      const spec = modelSpec(llmKey);
      return Boolean(spec?.filename && modelAvailability[spec.filename] === false);
    }
    const missingRoleModels = computed(() => {
      const seen = new Set();
      return Object.values(props.charter.roles || {})
        .filter(role => smartAgentCatalog.agents.find(agent => agent.id === role?.companion)?.isCustom).map((role) => role?.llm)
        .filter((key) => key && modelNeedsDownload(key) && !seen.has(key) && seen.add(key))
        .map((key) => ({ key, label: llmLabel(key) }));
    });
    const missingRoleModelsDownloading = computed(() => missingRoleModels.value.some((model) => modelDownloading[model.key] != null));
    const roleDownloadItems = computed(() => {
      const sizes = missingRoleModels.value.map(model => modelSpec(model.key)?.filesizeBytes || 0);
      const bytes = sizes.reduce((sum, size) => sum + size, 0);
      return [{ category: 'language', size: sizes.length && sizes.every(size => size > 0) ? `${(bytes / 1e9).toFixed(1)} GB` : '' }];
    });
    const roleDownloadProgress = computed(() => {
      const progress = Object.values(modelDownloading);
      return progress.length ? progress.reduce((sum, value) => sum + value, 0) / progress.length : 0;
    });
    async function cancelRoleDownloads() {
      if (isCancellingRoleDownloads.value) return;
      isCancellingRoleDownloads.value = true;
      roleDownloadRun++;
      try {
        await cancelLocalDownloads({ filenames: Object.keys(modelDownloading).map(key => modelSpec(key)?.filename) });
      } catch (error) {
        roleDownloadError.value = error.message;
      } finally {
        isCancellingRoleDownloads.value = false;
      }
    }
    async function refreshModelAvailability() {
      if (!window.electronAPI?.checkModel) return;
      const used = [...new Set(Object.values(props.charter.roles || {}).filter(role => smartAgentCatalog.agents.find(agent => agent.id === role?.companion)?.isCustom).map((role) => role?.llm).filter(Boolean))];
      await Promise.all(used.map(async (key) => {
        const spec = modelSpec(key);
        if (spec?.filename) modelAvailability[spec.filename] = await window.electronAPI.checkModel(spec.filename);
      }));
    }
    // The roster loads asynchronously. Recheck when custom-agent assignments
    // resolve or change, including when this dashboard is reused for another team.
    watch(() => JSON.stringify(Object.values(props.charter.roles || {})
      .filter(role => smartAgentCatalog.agents.some(agent => agent.id === role?.companion && agent.isCustom))
      .map(role => role.llm).filter(Boolean)), () => {
      refreshModelAvailability().catch(error => { roleDownloadError.value = error.message || 'Model availability could not be checked'; });
    }, { immediate: true });
    async function downloadRoleModel(llmKey) {
      const spec = modelSpec(llmKey);
      if (!spec?.url || !spec?.filename || modelDownloading[llmKey] != null) return;
      roleDownloadError.value = '';
      modelDownloading[llmKey] = 0;
      const unsubscribe = window.electronAPI?.onDownloadProgress?.((_event, data) => {
        if (data.filename === spec.filename) modelDownloading[llmKey] = Math.round((data.percent || 0) * 100);
      });
      try {
        const result = await window.electronAPI.downloadModel(spec.url, spec.filename);
        modelAvailability[spec.filename] = Boolean(result === true || result?.savedPath);
        if (!modelAvailability[spec.filename] && !result?.canceled && !isCancellingRoleDownloads.value) {
          roleDownloadError.value = result?.error || 'Model download failed';
        }
        return modelAvailability[spec.filename];
      } catch (error) {
        if (!isCancellingRoleDownloads.value) roleDownloadError.value = error.message;
        return false;
      } finally {
        unsubscribe?.();
        delete modelDownloading[llmKey];
      }
    }
    async function downloadMissingRoleModels() {
      if (isCancellingRoleDownloads.value || missingRoleModelsDownloading.value) return;
      const run = ++roleDownloadRun;
      for (const model of missingRoleModels.value) {
        if (run !== roleDownloadRun) return;
        if (!await downloadRoleModel(model.key)) return;
      }
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
        return d.toLocaleTimeString(i18n.state.locale, { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleString(i18n.state.locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    }
    function outputPreview(row) {
      if (!row) return "";
      const payload = row.payload;
      if (payload && typeof payload === "string") return truncate(stripReasoningTags(payload).replace(/\s+/g, " ").trim(), 420);
      if (row.blobId) return `${row.pipeline || "media"} artifact saved as ${row.blobExt || "blob"} (${row.blobId})`;
      if (row.shareLink) return row.shareLink;
      return "Artifact recorded. Payload is stored externally or was not returned by the connector.";
    }
    function truncate(s, n) {
      if (!s) return "";
      return s.length > n ? `${s.slice(0, n - 1)}…` : s;
    }
    function toggleWorkResult(id) {
      if (expandedWorkResults.has(id)) expandedWorkResults.delete(id);
      else expandedWorkResults.add(id);
    }
    async function openWorkResult(id) {
      const issue=displayState.value.issues.find(item=>item.id===id);
      if(issue && issue.status!=='done') {
        clearWorkFilters();await openChannelByKey('issues');
        await nextTick();
        const row=[...(workspaceRoot.value?.querySelectorAll('[data-issue-id]')||[])].find(el=>el.dataset.issueId===id);
        row?.scrollIntoView({block:'center',behavior:'auto'});row?.focus({preventScroll:true});return;
      }
      deliverableSection.value='work';
      expandedWorkResults.add(id);
      await openChannelByKey("deliverables");
    }
    function humanizeAction(value) {
      return actionDisplayName(value, i18n.state.locale);
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
    async function clearCatalog() {
      if (!displayState.value.catalog.length) return;
      if (!confirm("Clear all outputs? Audit, outcomes, and treasury stay intact.")) return;
      await store.clearCatalog();
    }
    async function removeContent(id) { await store.removeContent(id); }
    async function clearAuditConfirm() {
      if (!displayState.value.audit.length) return;
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
      const value = String(text || "");
      if (!value) return;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
          return;
        }
      } catch {}
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      try { document.execCommand("copy"); }
      finally { document.body.removeChild(area); }
    }
    async function copyDeliverable(row) {
      await copy(await artifactPlainText(row));
    }
    function deliverableFilename(row) {
      const ts = row?.createdAt ? new Date(row.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, "-") : Date.now();
      const pipeline = (row?.pipeline || "deliverable").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
      const ext = row?.blobExt || (typeof row?.payload === "string" ? "txt" : "json");
      return `${pipeline}-${ts}.${ext.replace(/^\./, "")}`;
    }
    function deliverableBody(row) {
      if (typeof row?.payload === "string") return stripReasoningTags(row.payload);
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
    async function downloadDeliverable(row) {
      await downloadArtifact(row);
    }
    async function runCEO() {
      await store.tickNow();
    }
    function auditActionLabel(row) {
      if (row?.action === "tickCEO") return "Plan next tasks";
      if (row?.action === "tickRole" || row?.action === "tickRoles") return "Run teammate";
      if (row?.action === "createGoal") return "Create outcome";
      if (row?.action === "createIssue") return "Create task";
      if (row?.action === "publishContent") return "Produce deliverable";
      return String(row?.action || "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^issue\./, "Issue ");
    }
    async function toggleExecution() {
      if (props.charter.status === "active") await store.pause(props.charter.id);
      else await store.resume(props.charter.id);
      await store.refreshActive();
    }
    async function exportCompany() {
      exportMessage.value = '';
      try {
        const bundle = await store.exportActive({ includePayloads: true });
        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url;
        link.download = `${props.charter.name.replace(/\s+/g, '_')}-export.json`;
        link.click(); URL.revokeObjectURL(url);
        exportMessage.value = bundle.warnings?.length
          ? `Backup created with missing attachments: ${bundle.warnings.join(' ')}`
          : 'Company backup created, including task history, memory and attachments. Credentials are excluded.';
      } catch (error) { exportMessage.value = `Backup failed: ${error.message}`; }
    }

    return {
      workspaceRoot, teamDockStyle, teamVeilStyle, hoveredCommand, showCommandLabel,
      inboxReview, inboxWorkspace, openCompanyIntake, operationalWorkspace, billingWorkspace, purchasingWorkspace, taskReview, exportMessage, openOperationalTask, openOperationalWorkOrder, openOperationalRecord, startPartsInvoice,
      taskProgress, store, active, studioOpened, workflowStudio, activeChannel, gmaoView, gmaoClientId, subtabs, primaryViews, activeSection, hasMaintenance,
      grantsWorkspace, currentChannel, domainViews, issueWorkspace, moveIssueWorkspace, openChannel, openChannelByKey, manual,
      isFullscreen,
      charterDraft, charterBusy, charterError, charterSaved, teamSettingsSection, teamSettingsSections, companyDisplayName, saveCharter, resetCharterDraft,
      state: displayState,
      goalLimit, auditLimit, expandedWorkResults,
      filledRoles, treasuryEntries, totalSales,
      openIssues,
      catalogRows, completedWorkRows, visibleAuditEntries,
      catalogColumns, treasuryColumns, auditColumns,
      companionName, companionImage, roleDisplayName, llmLabel, pipelineLabel, skillShortName, fmtMoney, fmtCount, fmtTime,
      modelAvailability, modelDownloading, modelNeedsDownload, downloadRoleModel, saveWorkerModel, refreshModelAvailability,
      missingRoleModels, missingRoleModelsDownloading, downloadMissingRoleModels,
      roleDownloadItems, roleDownloadProgress, roleDownloadError, isCancellingRoleDownloads, cancelRoleDownloads,
      roleConnectorCount, auditActionLabel,
      clearCatalog, removeContent, requestDeleteIssue, requestDeleteContent,
      pendingDelete, dismissDelete, confirmDelete,
      downloadDeliverable, copyDeliverable, toggleWorkResult, openWorkResult, openResultTask, humanizeAction,
      clearAuditConfirm,
      recordRevenue, recordSpend, copy, toggleDemoMode,
      toggleExecution, exportCompany,
      // live execution
      runtime, refreshRuntime,
      // issues
      issueDraft, issueFilter, issueBusy, issueModalOpen, filteredIssues,
      openNewIssueModal, closeNewIssueModal,
      submitIssue, setIssueStatus, reopenIssue,
      priorityClass, statusClass,
      sentenceCaseTask,
      // goals
      workQuery, clearWorkFilters, showEarlierPlanning, earlierPlanningItems, selectedWorkItems, isEarlierPlanningItem, newTeamTask, interactiveWorkflowStep, continueWorkflowTask, deliverableSection, deliverableSections, workStatusFilter, workStatusFilters,
      filteredGoals, ungroupedIssues, kanbanColumns, allWorkItems, todoWorkItems, matchedWorkItems, workStatusCount,
      issuesForGoal, goalProgress, goalStatusClass,
      goalModalOpen, goalBusy, goalDraft,
      openNewGoalModal, closeNewGoalModal, addGoalTask, removeGoalTask,
      submitNewGoal, cancelGoal,
      // command center
      operatingMetrics, automationHealth,
      latestProduced, outputPreview,
      blockedIssues, inProgressIssues, todayActiveWork, runCEO,
      // role-edit modal
      editingRoleKey, editDraft, editBusy,
      requestAgentJobAction, selectRoleAgent, hireAgent, selectedSmartAgent, selectedAgentCanHire, companionList, llmOptionsList, mediaPipelineOptions, roleConnectorOptions, availableRoleOptions, rolePickerOptions, defaultBudgetForRole,
      toggleRoleConnector,
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
  background: var(--bz-border);
}
.material-symbols-outlined {
  font-variation-settings: "FILL" 0, "wght" 100, "GRAD" -25, "opsz" 48;
  border-radius: 100%;
}

.dash {
  color: var(--bz-fg);
  height: auto;
  min-height: 0;
  display: grid;
  grid-template-columns: 196px minmax(0, 1fr);
  grid-template-rows: auto auto minmax(260px, 1fr) clamp(144px, 15vh, 180px);
  gap: var(--bz-space-3);
  overflow: visible;
}
.dash--fullscreen {
  position: fixed;
  inset: 0;
  z-index: 70;
  padding: var(--bz-space-4);
  background: var(--bz-canvas);
  overflow: auto;
}

.company-channel-head {
  grid-column: 2;
  grid-row: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-4);
  padding: var(--bz-space-3) var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: color-mix(in srgb, var(--bz-card) 92%, transparent);
}
.company-channel-head__copy { min-width: 0; display: flex; align-items: center; gap: var(--bz-space-3); }
.company-channel-head__symbol { width: 34px; height: 34px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 10px; background: var(--bz-purple-soft); color: var(--bz-purple-100); font-size: 22px; font-weight: 800; }
.company-channel-head__copy > div { min-width: 0; }
.company-channel-head h1 { margin: 0 !important; color: var(--bz-fg) !important; font-size: 28px !important; line-height: 1.2 !important; text-align: left !important; }
.company-channel-head p { max-width: 640px; margin: 5px 0 0; overflow: hidden; color: var(--bz-fg-low); font-size: var(--bz-size-micro); text-overflow: ellipsis; white-space: nowrap; }
.company-channel-head__signals { display: flex; align-items: center; gap: var(--bz-space-2); }
.company-channel-head__signals > span { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 9px; border: 1px solid var(--bz-border); border-radius: var(--bz-r-pill); color: var(--bz-fg-mid); font-size: var(--bz-size-micro); white-space: nowrap; }
.company-channel-head__signals > span i { width: 7px; height: 7px; border-radius: 50%; background: var(--bz-warning); }
.company-channel-head__signals > span i.is-healthy, .company-channel-head__signals > span i.is-running { background: var(--bz-emerald-500); }
.company-channel-head__signals > span i.is-error { background: var(--bz-danger); }

.company-model-requirements { margin: 0 0 var(--bz-space-6); }
.company-dashboard-shell { grid-column: 2; grid-row: 3; }
.company-telemetry-bar { grid-column: 2; grid-row: 4; }

.company-cockpit {
  display: grid;
  grid-template-columns: minmax(300px, 0.72fr) minmax(460px, 1.28fr);
  gap: var(--bz-space-4);
  align-items: stretch;
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: color-mix(in srgb, var(--bz-card) 92%, transparent);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.18);
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
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--bz-space-2);
}
.company-cockpit__actions {
  justify-content: flex-end;
  margin-top: auto;
}
.company-mode-button {
  min-width: 126px;
  justify-content: center;
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
  width: 100%;
  margin-bottom: 0;
  display: flex;
  gap: var(--bz-space-2);
  overflow-x: auto;
  padding-bottom: 2px;
}
.company-subtabs :deep(.bz-mode-chip) {
  min-width: 118px;
  flex: 1 0 118px;
  height: 42px;
  justify-content: center;
  padding: 0 var(--bz-space-3);
  border-radius: var(--bz-r-sm);
  background: color-mix(in srgb, var(--bz-canvas) 86%, transparent);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.company-subtabs :deep(.bz-mode-chip--compact) {
  height: 42px;
  font-size: 12px;
}
.company-subtabs :deep(.bz-mode-chip--on) {
  background: var(--bz-purple-soft);
  border-color: var(--bz-purple-300);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--bz-purple-300) 28%, transparent);
}
.company-subtabs :deep(.bz-mode-chip__label) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.company-subtabs :deep(.material-symbols-outlined) {
  flex: 0 0 auto;
  font-size: 19px !important;
}
.company-dashboard-shell {
  min-height: 0;
  overflow: visible;
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
.bz-image-delete-toast {
  position: fixed;
  right: max(var(--bz-space-5), env(safe-area-inset-right));
  bottom: max(var(--bz-space-5), env(safe-area-inset-bottom));
  z-index: 80;
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  max-width: min(460px, calc(100vw - 32px));
  padding: var(--bz-space-3);
  background: var(--bz-panel);
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r);
  box-shadow: var(--bz-shadow-lg);
  color: var(--bz-fg);
}
.bz-image-delete-toast .material-symbols-outlined {
  font-size: 18px !important;
  color: var(--bz-danger);
}
.bz-image-delete-toast__body {
  min-width: 0;
  color: var(--bz-fg-mid);
  font-size: var(--bz-size-meta);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bz-image-delete-toast__ghost,
.bz-image-delete-toast__danger {
  height: 30px;
  border-radius: var(--bz-r-sm);
  padding: 0 var(--bz-space-3);
  font-family: var(--bz-font-body);
  font-size: var(--bz-size-meta);
  cursor: pointer;
}
.bz-image-delete-toast__ghost {
  background: transparent;
  border: 1px solid var(--bz-border);
  color: var(--bz-fg-mid);
}
.bz-image-delete-toast__ghost:hover {
  background: var(--bz-raised);
  color: var(--bz-fg);
}
.bz-image-delete-toast__danger {
  background: var(--bz-danger-soft);
  border: 1px solid var(--bz-danger-soft);
  color: var(--bz-danger);
  font-weight: 700;
}
.bz-image-delete-toast__danger:hover {
  filter: brightness(1.08);
}
.bz-image-toast-enter-active,
.bz-image-toast-leave-active {
  transition:
    opacity var(--bz-dur-base) var(--bz-ease-out),
    transform var(--bz-dur-base) var(--bz-ease-out);
}
.bz-image-toast-enter-from,
.bz-image-toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
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
  align-items: flex-start;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-warning);
  border-radius: var(--bz-r-sm);
  background: var(--bz-warning-soft);
  color: var(--bz-fg-mid);
}
.rail-error .material-symbols-outlined {
  color: var(--bz-warning);
  -webkit-text-fill-color: currentColor;
  background: none;
}
.rail-error strong,
.rail-error span {
  display: block;
}
.rail-error strong {
  margin-bottom: 2px;
  color: var(--bz-fg);
  font-family: var(--bz-font-ui);
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.company-telemetry-bar {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(440px, 0.9fr) minmax(0, 1.6fr);
  gap: var(--bz-space-3);
  overflow: visible;
}

.work-status-tabs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
  margin: var(--bz-space-3) 0;
}
.work-status-tabs .issue-filter__chip span {
  min-width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: var(--bz-space-1);
  border-radius: 999px;
  background: var(--bz-raised);
  color: var(--bz-fg-mid);
  font-size: 11px;
}
.work-todo-list {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
}
.work-todo {
  min-width: 0;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: var(--bz-space-3);
  align-items: start;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
}
.work-todo--goal {
  border-color: var(--bz-border-brand);
  background: color-mix(in srgb, var(--bz-purple-soft) 58%, var(--bz-canvas));
}
.work-todo__check {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-card);
  color: var(--bz-purple-300);
}
.work-todo__check .material-symbols-outlined {
  font-size: 20px;
  -webkit-text-fill-color: currentColor;
  background: none;
}
.work-todo__main {
  min-width: 0;
}
.work-todo__topline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
  color: var(--bz-fg-low);
  font-size: 12px;
  line-height: 1.2;
}
.work-todo__role {
  color: var(--bz-fg-mid);
}
.work-todo__goal {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: var(--bz-space-2);
  color: var(--bz-purple-300);
  font-size: 12px;
  font-weight: 700;
}
.work-todo__goal .material-symbols-outlined {
  font-size: 15px;
  -webkit-text-fill-color: currentColor;
  background: none;
}
.work-todo__title {
  margin: var(--bz-space-1) 0 0 !important;
  color: var(--bz-fg) !important;
  font-size: 18px !important;
  line-height: 1.05 !important;
  text-align: left !important;
}
.work-todo__copy {
  margin: var(--bz-space-1) 0 0 !important;
  color: var(--bz-fg-mid) !important;
  font-size: 13px !important;
  line-height: 1.4;
  text-align: left !important;
}
.work-todo__progress {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--bz-space-2);
  align-items: center;
  margin-top: var(--bz-space-2);
  color: var(--bz-fg-low);
  font-size: 12px;
}
.work-todo__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}
.llm-strip {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.llm-strip .rail-panel__head {
  margin-bottom: var(--bz-space-2);
}
.llm-strip__stats {
  min-height: 0;
}
.llm-strip__stats > div {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.llm-strip__instances {
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
  scrollbar-width: thin;
  scrollbar-color: var(--bz-border-strong) transparent;
}

/* ───────── Panels ───────── */
.dash-body {
  min-width: 0;
  height: auto;
  min-height: 0;
  overflow: visible;
  padding: 0;
}
.panel {
  padding: 2em 2.5em !important;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg) !important;
  background: var(--bz-card);
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
  margin-bottom: var(--bz-space-3);
}
.section-head--stack {
  align-items: flex-start;
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
.settings-overview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--bz-space-3);
  margin-bottom: var(--bz-space-3);
}
.settings-overview article {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--bz-space-2);
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
}
.settings-overview .material-symbols-outlined {
  color: var(--bz-purple-300);
  -webkit-text-fill-color: currentColor;
  background: none;
  font-size: 22px;
}
.settings-overview strong,
.settings-overview small {
  display: block;
}
.settings-overview strong {
  color: var(--bz-fg);
  font-size: 16px;
  line-height: 1;
}
.settings-overview small {
  margin-top: 5px;
  color: var(--bz-fg-low);
  font-size: 12px;
  line-height: 1.35;
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
.charter-editor,
.charter-studio {
  display: grid;
  gap: var(--bz-space-3);
}
.charter-studio {
  grid-template-columns: minmax(0, 760px);
  justify-content: center;
  align-items: start;
}
.charter-card {
  min-width: 0;
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
}
.charter-card--identity {
  grid-row: auto;
}
.charter-card--execution {
  grid-column: auto;
}
.charter-card__head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--bz-space-3);
  margin-bottom: var(--bz-space-4);
}
.charter-card__head .material-symbols-outlined {
  color: var(--bz-purple-300);
  -webkit-text-fill-color: currentColor;
  background: none;
}
.charter-card__head h3 {
  margin: 0 !important;
  color: var(--bz-fg) !important;
  font-size: 20px !important;
  line-height: 1;
  text-align: left !important;
}
.charter-card__head p {
  margin: var(--bz-space-1) 0 0 !important;
  color: var(--bz-fg-low) !important;
  font-size: 12px !important;
  line-height: 1.45;
  text-align: left !important;
}
.charter-card__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
.charter-field .input,
.charter-field .textarea,
.charter-field .company-admin-select {
  margin-top: var(--bz-space-1);
}
.charter-field .textarea {
  min-height: 120px;
}
.charter-toggle { width: 20px; height: 20px; accent-color: var(--bz-purple-500); }
.org-card__identity { display: flex; align-items: center; gap: var(--bz-space-3); }
.org-card__avatar { width: 38px; height: 38px; display: grid; place-items: center; flex: 0 0 auto; overflow: hidden; border: 1px solid var(--bz-border); border-radius: 50%; background: var(--bz-raised); color: var(--bz-fg-mid); }
.org-card__avatar img { width: 100%; height: 100%; object-fit: cover; }
.org-card__model-action { margin-left: auto; padding: 2px 7px; border: 1px solid var(--bz-border-brand); border-radius: var(--bz-r-sm); background: var(--bz-purple-soft); color: var(--bz-purple-100); font: inherit; cursor: pointer; }
.org-card__model-ready { margin-left: auto; color: var(--bz-emerald-500); font-size: var(--bz-size-micro); }
.work-todo-list { gap: var(--bz-space-3); }
.work-todo { padding: var(--bz-space-4); }
.work-todo__main { display: grid; gap: var(--bz-space-2); }
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
.today-command__head,
.today-lane__head,
.today-output__meta,
.today-action-row__actions {
  display: flex;
  align-items: center;
}
.today-command__head {
  justify-content: space-between;
  min-height: 34px;
}
.today-command__head h2,
.today-lane__head h3 {
  margin: 0 !important;
  color: var(--bz-fg) !important;
  line-height: 1 !important;
  text-align: left !important;
}
.today-command__head h2 { font-size: 25px !important; }
.today-command__status {
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-2);
  color: var(--bz-fg-mid);
  font-size: 12px;
}
.today-command__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--bz-space-3);
}
.today-lane,
.today-output {
  min-width: 0;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-card);
}
.today-lane--attention:has(.today-action-row) {
  border-color: color-mix(in srgb, var(--bz-warning) 55%, var(--bz-border));
}
.today-lane__head {
  justify-content: space-between;
  gap: var(--bz-space-3);
  min-height: 30px;
  margin-bottom: var(--bz-space-2);
}
.today-lane__head h3 { font-size: 19px !important; }
.today-lane__head > span {
  min-width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--bz-raised);
  color: var(--bz-fg-mid);
  font-size: 11px;
  font-weight: 800;
}
.today-lane__list {
  display: flex;
  flex-direction: column;
}
.today-action-row {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--bz-space-2);
  min-height: 50px;
  padding: var(--bz-space-2) 0;
  border-bottom: 1px solid var(--bz-border);
}
.today-action-row:last-child { border-bottom: 0; }
.today-action-row__icon {
  color: var(--bz-warning);
  font-size: 18px !important;
}
.today-action-row__state {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--bz-fg-low);
}
.today-action-row__state.is-in_progress { background: var(--bz-purple-300); }
.today-action-row__state.is-open { background: var(--bz-emerald-500); }
.today-action-row__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.today-action-row__body strong,
.today-action-row__body span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.today-action-row__body strong {
  color: var(--bz-fg);
  font-size: 14px;
  line-height: 1.2;
}
.today-action-row__body span,
.today-output__meta {
  color: var(--bz-fg-low);
  font-size: 11px;
}
.today-action-row__actions { gap: var(--bz-space-1); }
.today-lane__empty {
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--bz-space-2);
  color: var(--bz-fg-low);
  font-size: 12px;
}
.today-lane__empty .material-symbols-outlined {
  color: var(--bz-emerald-500);
  font-size: 18px !important;
}
.today-lane__link {
  min-height: 28px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--bz-purple-300);
  font-family: var(--bz-font-ui);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.today-lane__link:hover { color: var(--bz-fg); }
.today-output__content {
  min-width: 0;
}
.today-output__meta {
  flex-wrap: wrap;
  gap: var(--bz-space-2);
  margin-bottom: var(--bz-space-2);
}
.today-output pre {
  max-height: 110px;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--bz-fg-mid);
  font-family: var(--bz-font-body);
  font-size: 12px;
  line-height: 1.45;
}
.owner-brief {
  display: grid;
  grid-template-columns: minmax(260px, 0.72fr) minmax(0, 1.28fr);
  gap: var(--bz-space-3);
  align-items: start;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: color-mix(in srgb, var(--bz-card) 88%, transparent);
}
.owner-brief__copy {
  min-width: 0;
}
.owner-brief__title {
  margin: var(--bz-space-1) 0 var(--bz-space-2) !important;
  color: var(--bz-fg) !important;
  font-size: 22px !important;
  line-height: 1;
  text-align: left !important;
}
.owner-brief__text {
  display: -webkit-box;
  max-width: 68ch;
  margin: 0 !important;
  overflow: hidden;
  color: var(--bz-fg-mid) !important;
  font-size: 12px !important;
  line-height: 1.45;
  text-align: left !important;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.owner-brief__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--bz-space-2);
}
.owner-brief__tile {
  min-width: 0;
  min-height: 76px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--bz-space-1);
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
}
.owner-brief__tile--attention {
  border-color: var(--bz-warning);
  background: var(--bz-warning-soft);
}
.owner-brief__tile--clear {
  border-color: var(--bz-emerald-soft);
}
.owner-brief__label,
.owner-brief__hint {
  color: var(--bz-fg-low);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.07em;
  line-height: 1.2;
  text-transform: uppercase;
}
.owner-brief__value {
  color: var(--bz-fg);
  font-size: 24px;
  line-height: 0.95;
}
.owner-brief__hint {
  color: var(--bz-fg-mid);
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: none;
}
.team-action-guide {
  display: block;
}
.team-action-guide article {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--bz-space-2);
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-purple-soft);
}
.team-action-guide .material-symbols-outlined {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--bz-r-sm);
  background: var(--bz-purple-soft);
  color: var(--bz-purple-300);
  font-size: 17px;
}
.team-action-guide strong {
  display: block;
  color: var(--bz-fg);
  font-size: 16px;
  line-height: 1;
}
.team-action-guide p {
  margin: var(--bz-space-1) 0 0 !important;
  color: var(--bz-fg-mid) !important;
  font-size: 12px !important;
  line-height: 1.35;
  text-align: left !important;
}
.today-work-preview {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-card);
}
.today-work-preview__head,
.command-details-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--bz-space-3);
}
.today-work-preview__title {
  margin: 0 !important;
  color: var(--bz-fg) !important;
  font-size: 21px !important;
  line-height: 1;
  text-align: left !important;
}
.today-work-preview__list {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
}
.today-work-item {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--bz-space-3);
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
}
.today-work-item--blocked {
  border-color: var(--bz-warning);
  background: var(--bz-warning-soft);
}
.today-work-item__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.today-work-item__body strong {
  color: var(--bz-fg);
  font-size: 17px;
  line-height: 1.05;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.today-work-item__body span,
.today-work-preview__empty {
  color: var(--bz-fg-mid);
  font-size: 12px;
  line-height: 1.35;
}
.today-work-preview__empty {
  padding: var(--bz-space-4);
  border: 1px dashed var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
  text-align: center;
}
.command-details-toggle {
  justify-content: flex-end;
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
  min-height: 58px;
  padding: var(--bz-space-3);
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
  font-size: 22px;
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
  background: color-mix(in srgb, var(--bz-card) 92%, transparent);
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
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ops-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
  gap: 1em;
}
.ops-panel {
  min-width: 0;
  padding: 1.25em;
  background: color-mix(in srgb, var(--bz-card) 92%, transparent);
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
.deliverable-board {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: var(--bz-space-3);
}
.deliverable-board > h3,
.result-work > h3 {
  grid-column: 1 / -1;
  margin: 0 0 var(--bz-space-2);
  color: var(--bz-fg);
  font-size: 15px;
  font-weight: 500;
}
.result-work {
  display: grid;
  gap: var(--bz-space-2);
  margin-bottom: var(--bz-space-6);
}
.result-work__row {
  display: block;
  overflow: hidden;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
}
.result-work__row.is-open { border-color: var(--bz-border-brand); }
.result-work__summary { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: center; gap: var(--bz-space-3); width: 100%; padding: var(--bz-space-3) var(--bz-space-4); border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.result-work__summary:hover { background: var(--bz-raised); }
.result-work__icon { color: var(--bz-emerald-500); font-size: 22px; }
.result-work__main { display: grid; gap: 3px; min-width: 0; }
.result-work__main strong { color: var(--bz-fg); font-size: 14px; font-weight: 500; }
.result-work__main span,
.result-work__receipt { color: var(--bz-fg-low); font-size: 11px; }
.result-work__main p { margin: var(--bz-space-1) 0 0; color: var(--bz-fg-mid); font-size: 12px; line-height: 1.45; }
.result-work__open { display: flex; align-items: center; gap: var(--bz-space-1); color: var(--bz-purple-100); font-size: var(--bz-size-meta); white-space: nowrap; }
.result-work__open .material-symbols-outlined { font-size: 17px; }
.work-dossier { display: grid; gap: var(--bz-space-5); padding: var(--bz-space-5); border-top: 1px solid var(--bz-border); background: var(--bz-panel); }
.work-dossier__context { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--bz-space-4); }
.work-dossier__context div { min-width: 0; }
.work-dossier__context span, .work-dossier h4 { color: var(--bz-fg-low); font-size: var(--bz-size-micro); font-weight: 400; text-transform: uppercase; }
.work-dossier__context p { margin: var(--bz-space-2) 0 0; color: var(--bz-fg-mid); font-size: var(--bz-size-meta); line-height: 1.5; }
.work-dossier h4 { margin: 0; }
.work-dossier__actions, .work-dossier__artifacts { display: grid; gap: var(--bz-space-2); }
.work-dossier__actions article { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: start; gap: var(--bz-space-3); padding: var(--bz-space-3) 0; border-top: 1px solid var(--bz-border); }
.work-dossier__actions article div { display: grid; gap: var(--bz-space-1); min-width: 0; }
.work-dossier__actions strong { color: var(--bz-fg); font-size: var(--bz-size-meta); font-weight: 400; text-transform: capitalize; }
.work-dossier__actions p { margin: 0; color: var(--bz-fg-mid); font-size: var(--bz-size-meta); line-height: 1.45; }
.work-dossier__actions small { color: var(--bz-fg-low); font-size: var(--bz-size-micro); line-height: 1.4; }
.work-dossier__step { color: var(--bz-purple-100); font-size: var(--bz-size-meta); }
.work-dossier__artifacts > article { overflow: hidden; border: 1px solid var(--bz-border); border-radius: var(--bz-r-sm); background: var(--bz-canvas); }
.work-dossier__artifact-meta { display: flex; align-items: center; justify-content: space-between; gap: var(--bz-space-3); padding: var(--bz-space-2) var(--bz-space-3); border-top: 1px solid var(--bz-border); }
.work-dossier__artifact-meta > span { min-width: 0; overflow: hidden; color: var(--bz-fg-low); font-size: var(--bz-size-micro); text-overflow: ellipsis; white-space: nowrap; }
.work-dossier__footer { display: flex; align-items: center; gap: var(--bz-space-2); color: var(--bz-fg-low); font-size: var(--bz-size-micro); }
.work-dossier__footer code { min-width: 0; overflow: hidden; color: var(--bz-fg-mid); text-overflow: ellipsis; }
@media (max-width: 980px) { .work-dossier__context { grid-template-columns: minmax(0, 1fr); } }
.deliverable-card {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-3);
  padding: var(--bz-space-4);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
}
.deliverable-card__meta,
.deliverable-card__footer,
.deliverable-card__money,
.deliverable-card__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}
.deliverable-card__meta,
.deliverable-card__money {
  color: var(--bz-fg-low);
  font-size: 12px;
}
.catalog-output--full {
  width: 100%;
  min-height: 190px;
  max-height: 360px;
  overflow: auto;
  padding: var(--bz-space-4);
}
.deliverable-markdown {
  font-family: var(--bz-font-ui);
  color: var(--bz-fg);
  white-space: normal;
}
.deliverable-markdown :deep(p),
.deliverable-markdown :deep(ul),
.deliverable-markdown :deep(ol),
.deliverable-markdown :deep(blockquote) {
  margin: 0 0 0.85em;
  color: var(--bz-fg-mid);
  font-size: 14px;
  line-height: 1.6;
}
.deliverable-markdown :deep(h1),
.deliverable-markdown :deep(h2),
.deliverable-markdown :deep(h3),
.deliverable-markdown :deep(h4) {
  margin: 0 0 0.55em;
  color: var(--bz-fg);
  font-family: "Fira Sans Condensed", var(--bz-font-ui);
  font-weight: 900;
  line-height: 1.08;
  text-transform: uppercase;
}
.deliverable-markdown :deep(h1) { font-size: 25px; }
.deliverable-markdown :deep(h2) { font-size: 21px; }
.deliverable-markdown :deep(h3) { font-size: 18px; }
.deliverable-markdown :deep(ul),
.deliverable-markdown :deep(ol) {
  padding-left: 1.2em;
}
.deliverable-markdown :deep(li + li) {
  margin-top: 0.35em;
}
.deliverable-markdown :deep(code) {
  padding: 0.1em 0.35em;
  border: 1px solid var(--bz-border);
  border-radius: 4px;
  background: var(--bz-card);
  color: var(--bz-fg);
  font-family: "Fira Code", "JetBrains Mono", "SF Mono", monospace;
  font-size: 0.88em;
}
.deliverable-markdown :deep(pre) {
  overflow: auto;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-card);
}
.deliverable-markdown :deep(pre code) {
  padding: 0;
  border: 0;
  background: transparent;
}
.deliverable-card__prompt {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--bz-space-2);
  color: var(--bz-fg-mid);
  font-size: 13px;
  line-height: 1.45;
}
.deliverable-card__prompt .material-symbols-outlined {
  color: var(--bz-purple-300);
  -webkit-text-fill-color: currentColor;
  background: none;
  font-size: 18px;
}
.deliverable-card__footer {
  justify-content: space-between;
  margin-top: auto;
}
.deliverable-card__actions {
  justify-content: flex-end;
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
  .charter-editor,
  .charter-studio {
    grid-template-columns: 1fr;
  }
  .company-subtabs {
    flex-wrap: wrap;
  }
  .company-telemetry-bar {
    height: auto;
    min-height: 248px;
  }
  .company-cockpit__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .command-center__main,
  .ops-grid,
  .owner-brief,
  .today-command__grid {
    grid-template-columns: 1fr;
  }
  .command-center__actions {
    min-width: 0;
  }
  .command-center__metrics,
  .owner-brief__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .work-kanban {
    grid-template-columns: repeat(5, minmax(260px, 1fr));
    overflow-x: auto;
    padding-bottom: var(--bz-space-2);
  }
  .kanban-column__lane {
    max-height: 540px;
  }
  .company-channel-head__signals > span { display: none; }
}

@media (max-width: 720px) {
  .dash { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(260px, 1fr); }
  .company-channel-head { grid-column: 1; grid-row: 1; }
  .company-dashboard-shell { grid-column: 1; grid-row: 2; }
  .company-telemetry-bar { display: none; }
  .company-channel-head p { display: none; }
  .command-center__metrics,
  .company-cockpit__metrics,
  .owner-brief__grid {
    grid-template-columns: 1fr;
  }
  .company-cockpit__actions,
  .today-work-preview__head,
  .section-head {
    align-items: stretch;
    flex-direction: column;
  }
  .today-work-item {
    grid-template-columns: 1fr;
    align-items: stretch;
  }
  .today-action-row {
    grid-template-columns: auto minmax(0, 1fr);
  }
  .today-action-row > button,
  .today-action-row__actions {
    grid-column: 2;
    justify-self: start;
  }
  .deliverable-board {
    grid-template-columns: 1fr;
  }
  .company-subtabs {
    flex-wrap: nowrap;
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
.team-memory-strip {
  display: flex;
  gap: 0.85rem;
  align-items: flex-start;
  margin: 0 0 1rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--bz-border);
  border-radius: 4px;
  background: color-mix(in srgb, var(--bz-card) 82%, transparent);
  color: var(--bz-fg-mid);
}
.team-memory-strip .material-symbols-outlined {
  color: var(--bz-purple-300);
  font-size: 24px;
  flex: 0 0 auto;
}
.team-memory-strip strong {
  display: block;
  color: var(--bz-fg);
  font-size: 1.05rem;
  line-height: 1;
  margin-bottom: 0.25rem;
}
.team-memory-strip p {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.35;
}
.org-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--bz-space-3);
}
.org-card {
  background: var(--bz-canvas);
  padding: var(--bz-space-4);
  border-radius: var(--bz-r-sm);
  border: 1px solid var(--bz-border);
  transition:
    background-color var(--bz-dur-fast) var(--bz-ease-stand),
    border-color var(--bz-dur-fast) var(--bz-ease-stand);
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
}
.org-card:hover {
  background: var(--bz-card);
  border-color: var(--bz-border-strong);
}
.org-card__role {
  font-size: 1.35rem;
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

.org-card__grants,
.org-card__capability-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3em;
  margin-top: 0.4em;
}
.org-card__grants .material-symbols-outlined,
.org-card__capability-summary .material-symbols-outlined {
  font-size: 14px;
  color: var(--bz-purple-300);
  margin-right: 0.2em;
  -webkit-text-fill-color: currentColor;
  background: none;
}
.org-card__capability-summary {
  color: var(--bz-fg-mid);
  font-size: 0.78em;
}
.org-card__capability-dot {
  color: var(--bz-fg-low);
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
  font-size: 1.05rem;
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
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: stretch;
  gap: var(--bz-space-2);
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
  justify-content: flex-end;
  gap: var(--bz-space-2);
  min-width: 0;
}
.org-card__run-btn {
  min-width: 132px;
  justify-content: center;
}
.org-card__run-btn:hover {
  background: var(--bz-warning-soft) !important;
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
.work-kanban {
  display: grid;
  grid-template-columns: repeat(5, minmax(220px, 1fr));
  gap: var(--bz-space-3);
  align-items: stretch;
}
.kanban-column {
  min-width: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-canvas);
  overflow: hidden;
}
.kanban-column__head {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: var(--bz-space-2);
  align-items: start;
  padding: var(--bz-space-3);
  border-bottom: 1px solid var(--bz-border);
  background: var(--bz-card);
}
.kanban-column__head .material-symbols-outlined {
  color: var(--bz-purple-300);
  -webkit-text-fill-color: currentColor;
  background: none;
  font-size: 21px;
}
.kanban-column__head h3 {
  margin: 0 !important;
  color: var(--bz-fg) !important;
  font-size: 17px !important;
  line-height: 1;
  text-align: left !important;
}
.kanban-column__head p {
  margin: 0.35em 0 0 !important;
  color: var(--bz-fg-low) !important;
  font-size: 11px !important;
  line-height: 1.35;
  text-align: left !important;
}
.kanban-column__count {
  min-width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--bz-border);
  border-radius: 4px;
  color: var(--bz-fg);
  background: var(--bz-canvas);
  font-size: 16px;
  line-height: 1;
}
.kanban-column__lane {
  min-height: 360px;
  max-height: min(62vh, 720px);
  overflow: auto;
  padding: var(--bz-space-2);
  scrollbar-width: thin;
  scrollbar-color: var(--bz-border-strong) transparent;
}
.kanban-card {
  min-width: 0;
  padding: var(--bz-space-3);
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-sm);
  background: var(--bz-card);
}
.kanban-card + .kanban-card {
  margin-top: var(--bz-space-2);
}
.kanban-card--goal {
  border-color: var(--bz-border-brand);
  background: var(--bz-purple-soft);
}
.kanban-card__meta,
.kanban-card__foot,
.kanban-card__actions,
.kanban-card__progress {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}
.kanban-card__meta {
  margin-bottom: var(--bz-space-2);
}
.kanban-card__goal {
  display: flex;
  align-items: center;
  gap: var(--bz-space-1);
  margin-bottom: var(--bz-space-2);
  color: var(--bz-fg-low);
  font-size: 11px;
  line-height: 1.35;
}
.kanban-card__goal .material-symbols-outlined,
.kanban-card__role .material-symbols-outlined {
  color: var(--bz-purple-300);
  -webkit-text-fill-color: currentColor;
  background: none;
  font-size: 16px;
}
.kanban-card__title {
  margin: 0 !important;
  color: var(--bz-fg) !important;
  font-size: 18px !important;
  line-height: 1.05;
  text-align: left !important;
}
.kanban-card__copy {
  margin: var(--bz-space-2) 0 0 !important;
  color: var(--bz-fg-mid) !important;
  font-size: 12px !important;
  line-height: 1.45;
  text-align: left !important;
}
.kanban-card__foot {
  justify-content: space-between;
  margin-top: var(--bz-space-3);
  color: var(--bz-fg-low);
  font-size: 11px;
}
.kanban-card__role {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--bz-space-1);
}
.kanban-card__progress {
  margin-top: var(--bz-space-3);
  color: var(--bz-fg-low);
  font-size: 11px;
}
.kanban-card__progress .goal-progress-bar {
  min-width: 80px;
}
.kanban-card__actions {
  justify-content: flex-end;
  margin-top: var(--bz-space-3);
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
.issue-modal-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--bz-space-3);
}
.goal-modal__field {
  display: flex;
  flex-direction: column;
  gap: var(--bz-space-2);
}
.goal-modal__field .goal-modal__label {
  margin-bottom: 0;
}

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
  backdrop-filter: blur(10px);
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
  border-radius: var(--bz-r-lg) !important;
  box-shadow: var(--bz-shadow-xl);
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
  font-style: normal;
}
.role-modal .field { margin-bottom: 24px; }
.role-modal .label { color: var(--bz-fg) !important; font: 500 14px/1.45 var(--bz-font-body); margin-bottom: 10px; }
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
.pipeline-checks,
.capability-checks,
.connector-checks {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bz-space-2);
}
.connector-checks {
  max-height: 190px;
  overflow: auto;
  padding-right: var(--bz-space-1);
}
.capability-checks {
  max-height: 230px;
  overflow: auto;
  padding-right: var(--bz-space-1);
}
.pipeline-check,
.capability-check,
.connector-check {
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
.capability-check {
  align-items: flex-start;
  width: min(240px, 100%);
  padding: 0.65em 0.75em;
}
.connector-check {
  align-items: flex-start;
  width: min(220px, 100%);
  padding: 0.65em 0.75em;
}
.pipeline-check input,
.capability-check input,
.connector-check input { display: none; }
.pipeline-check .material-symbols-outlined,
.connector-check .material-symbols-outlined { font-size: 16px !important; }
.pipeline-check.is-on,
.capability-check.is-on,
.connector-check.is-on {
  background: var(--bz-control-selected-bg);
  border-color: var(--bz-control-selected-border);
  color: var(--bz-control-selected-fg);
}
.connector-check.needs-auth:not(.is-on) {
  border-color: var(--bz-warning-soft);
}
.skill-check.needs-connector:not(.is-on) {
  border-color: color-mix(in srgb, var(--bz-warning) 34%, var(--bz-border));
}
.capability-check__main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.capability-check__main strong {
  color: var(--bz-fg);
  font-size: 13px;
  line-height: 1.15;
}
.capability-check__main small {
  color: var(--bz-fg-low);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.skill-check__requires {
  color: var(--bz-fg-low);
  font-family: "Fira Sans", sans-serif;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.25;
}
.skill-check.is-on .skill-check__requires {
  color: var(--bz-fg-mid);
}
.connector-check__copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.connector-check__copy strong {
  color: var(--bz-fg);
  font-size: 13px;
  line-height: 1.15;
}
.connector-check__copy small {
  color: var(--bz-fg-low);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
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

.team-members,.team-backlog{min-width:0;color:var(--bz-fg)}
.team-section-count{display:inline-flex;align-items:baseline;gap:8px;color:var(--bz-fg-mid);font-size:14px}
.team-section-count b{font-size:28px;color:var(--bz-fg)}
.team-members .section-head,.team-backlog .goals-head{margin-bottom:24px;align-items:center}
.team-members .org-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr));gap:24px}
.team-members .org-card{padding:28px;border-radius:var(--bz-r-lg);background:var(--bz-card);gap:20px;min-width:0;overflow-wrap:anywhere;transition:border-color var(--bz-dur-fast) var(--bz-ease)}
.team-members .org-card:hover,.team-members .org-card:focus-within{border-color:var(--bz-border-strong);box-shadow:none;transform:none}
.team-members .org-card__role{font:500 13px/1.4 var(--bz-font-body);color:var(--bz-accent);order:0;letter-spacing:0}
.team-members .org-card__avatar{width:64px;height:64px;box-shadow:none;border:1px solid var(--bz-border-strong)}
.team-members .org-card__companion{font-size:24px;line-height:1.3;min-width:0}
.org-card__team{display:block;font:400 12px/1.5 var(--bz-font-body);color:var(--bz-fg-mid);margin-top:4px}
.team-members .org-card__llm{font-size:13px;line-height:1.5;padding:12px;border-radius:var(--bz-r);text-transform:none;letter-spacing:0;flex-wrap:wrap;white-space:normal;overflow-wrap:anywhere}
.team-members .org-card__capability-summary{font-size:13px;line-height:1.5;color:var(--bz-fg-mid);gap:10px}
.team-members .org-card__divider{margin-top:auto}
.team-members .org-card__meta{flex-wrap:wrap;gap:12px}
.team-members .org-card__queue-badge{background:transparent;border:0;padding:0}
.team-members .org-card__queue-count{font-size:24px}
.team-members .org-card__run-btn{color:var(--bz-fg);background:var(--bz-raised);border-color:var(--bz-border)}
.team-backlog .work-status-tabs{gap:6px;padding:0 0 20px;margin:0 0 24px;border-bottom:1px solid var(--bz-border)}
.team-backlog .issue-filter__chip{min-height:40px;padding:8px 12px;text-transform:none;letter-spacing:0;font:500 13px/1.4 var(--bz-font-body);border-radius:var(--bz-r);gap:8px;transition:background var(--bz-dur-fast) var(--bz-ease),border-color var(--bz-dur-fast) var(--bz-ease)}
.team-backlog .issue-filter__chip .bz-metric{font-size:17px;min-width:18px}
.team-backlog .work-todo{border-radius:var(--bz-r-lg);padding:24px;background:var(--bz-card);gap:20px;border-color:var(--bz-border);transition:border-color var(--bz-dur-fast) var(--bz-ease)}
.team-backlog .work-todo:hover{border-color:var(--bz-border-strong)}
.team-backlog .work-todo--goal{background:var(--bz-panel);border-left:3px solid var(--bz-accent)}
.team-backlog .work-todo__title{font-size:21px;line-height:1.3;margin:2px 0}
.team-backlog .work-todo__copy{font-size:14px;line-height:1.7;margin:0;max-width:82ch;color:var(--bz-fg-mid)}
.team-backlog .work-todo__main{gap:12px;min-width:0}
.team-backlog .work-todo__topline{row-gap:8px}
.team-empty{display:grid;justify-items:center;gap:16px;padding:48px 16px;color:var(--bz-fg-mid)}.team-empty>span{font-size:32px}.team-empty p{margin:0;text-align:center}
.team-backlog .work-todo__actions{flex-wrap:wrap;align-self:start}
@media(max-width:760px){.team-members .section-head,.team-backlog .goals-head{align-items:flex-start;flex-direction:column;gap:16px}.team-members .org-card{padding:20px}.team-backlog .work-todo{grid-template-columns:24px minmax(0,1fr);padding:16px;gap:12px}.team-backlog .work-todo__check{width:24px;height:24px;border:0;background:none}.team-backlog .work-todo__actions{grid-column:2;justify-content:flex-start}}
</style>

<style scoped>
.approval-business{display:grid;gap:8px;margin:16px 0}.approval-business>div{display:grid;grid-template-columns:130px minmax(0,1fr);gap:12px}.approval-business dt{color:var(--bz-fg-mid);font-size:12px}.approval-business dd{margin:0;color:var(--bz-fg);white-space:pre-wrap;overflow-wrap:anywhere}.approval-card details{margin:12px 0;color:var(--bz-fg-mid);font-size:12px}@media(max-width:600px){.approval-business>div{grid-template-columns:1fr;gap:3px}}

.dash{display:flex;flex-direction:column;min-width:0;gap:0}
.company-view-nav{display:flex;flex-wrap:wrap;align-items:center;gap:12px 24px;padding:12px 0 20px;margin-bottom:24px;border-bottom:1px solid var(--bz-border);font-size:13px}
.company-view-nav__operations,.company-view-nav__team{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-width:0}
.company-view-nav__team{margin-left:auto;padding:4px;border:1px solid var(--bz-border);border-radius:var(--bz-r-lg);background:var(--bz-card)}
.company-view-nav button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:8px 10px;border:1px solid transparent;border-radius:var(--bz-r-sm);background:transparent;color:var(--bz-fg-mid);font:inherit;cursor:pointer;white-space:nowrap}
.company-view-nav button[aria-current=page]{background:var(--bz-accent-soft);border-color:var(--bz-border-brand);color:var(--bz-fg)}
.company-view-nav button:hover{color:var(--bz-fg);background:var(--bz-raised)}
.company-view-nav button:focus-visible{outline:2px solid var(--bz-accent);outline-offset:2px}
.company-view-nav .material-symbols-outlined{font-size:18px}
.company-channel-head__signals .company-ask-team{white-space:nowrap}

.company-context-nav{display:flex;flex-wrap:wrap;gap:4px;margin:0}.company-context-nav>button{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;min-height:36px;border:0;border-radius:var(--bz-r-sm);font:inherit;font-size:13px;background:transparent;color:var(--bz-fg-mid);cursor:pointer}.company-context-nav>button:hover,.company-context-nav>button[aria-current=page]{background:var(--bz-raised);color:var(--bz-fg)}.company-context-nav .material-symbols-outlined{font-size:17px}
.company-view-nav select{max-width:200px;min-height:42px;background:var(--bz-canvas);color:var(--bz-fg);border:1px solid var(--bz-border);border-radius:var(--bz-r-sm);padding:var(--bz-space-2);font:inherit}
.company-channel-head{padding:0 0 var(--bz-space-4);background:transparent;border:0;min-width:0;flex-wrap:wrap;gap:var(--bz-space-3)}
.company-channel-head h1{font-size:30px}.company-channel-head p{margin-top:var(--bz-space-1);color:var(--bz-fg-mid)}
.company-dashboard-shell{flex:1;min-height:0;width:100%}
@media(max-width:720px){.company-view-nav{gap:12px;width:100%;margin-bottom:20px}.company-view-nav__team{width:100%;margin-left:0}.company-view-nav button{flex:1 0 auto}.company-channel-head p{display:block}.company-channel-head h1{font-size:26px}}

.company-inbox{padding:4px 0}.company-inbox__approvals{padding-bottom:20px;margin-bottom:20px;border-bottom:1px solid var(--bz-border)}.company-inbox .empty{padding:16px 0;text-align:left;font-size:14px;font-style:normal}.company-inbox .panel-title{font-size:22px}
.company-execution-strip{display:flex;align-items:center;flex-wrap:wrap;gap:8px 16px;border-block:1px solid var(--bz-border);padding:10px 0;margin-bottom:18px;font-size:12px;color:var(--bz-fg-mid)}
.company-execution-strip strong{color:var(--bz-fg);font-weight:600}.company-execution-strip>.material-symbols-outlined{font-size:19px}.company-execution-strip .bz-iconbtn{margin-left:auto}.company-execution-strip__error{color:var(--bz-warning)}
</style>

<style src="./company-workspace.css"></style>

<style scoped>
.team-command-veil {
 position:fixed;z-index:39;display:grid;place-items:center;pointer-events:none;
 opacity:0;backdrop-filter:blur(0);-webkit-backdrop-filter:blur(0);
 background:transparent;transition:opacity 220ms ease,backdrop-filter 280ms ease,background 280ms ease;
}
.team-command-veil.is-visible {
 opacity:1;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
 background:color-mix(in srgb,var(--bz-canvas) 55%,transparent);
}
.team-command-veil__label {
 color:var(--bz-fg);font-size:clamp(30px,4vw,64px);line-height:1.15;
 text-align:center;padding:24px;max-width:90%;overflow-wrap:anywhere;
 transform:translateY(8px);transition:transform 220ms ease;
}
.team-command-veil.is-visible .team-command-veil__label{transform:translateY(0)}
@media(prefers-reduced-motion:reduce){.team-command-veil,.team-command-veil__label{transition:none}}
.company-workspace .company-view-nav__team {
 position:fixed;bottom:24px;z-index:40;margin:0;width:max-content;
 flex-wrap:nowrap;overflow-x:auto;box-sizing:border-box;padding:8px;gap:4px;
 border:1px solid var(--bz-border);border-radius:16px;background:var(--bz-panel);
 box-shadow:0 8px 28px rgb(0 0 0 / .18);
}
.company-workspace .company-view-nav__team button {flex:0 0 auto;min-height:42px}
.company-workspace {padding-bottom:104px!important}
@media(max-width:720px){.company-workspace .company-view-nav__team{bottom:16px;padding:6px}}
</style>

<style scoped>
.company-model-requirements--studio { margin: 0; }
.company-production { padding-top: var(--bz-space-6); }
.backlog-planning-note { display: flex; align-items: center; flex-wrap: wrap; gap: var(--bz-space-3); margin-bottom: var(--bz-space-5); }
.backlog-planning-note p { margin: 0; color: var(--bz-fg-mid); font-size: var(--bz-size-meta); line-height: 1.6; max-width: 70ch; }
</style>
