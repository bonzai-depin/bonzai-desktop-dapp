<template>
  <div class="dash">
    <!-- ════════════ KPI strip — square tiles ════════════ -->
    <div class="dash-kpis">
      <div class="kpi-tile">
        <div class="kpi-tile__icon">
          <span class="material-symbols-outlined">account_balance</span>
        </div>
        <div class="kpi-tile__value fira-sans-condensed-black-italic">
          {{ fmtMoney(state.treasuryState?.balance, state.treasuryState?.currency) }}
        </div>
        <div class="kpi-tile__label fira-sans-condensed-black-italic">Treasury</div>
        <div class="kpi-tile__sub">
          + {{ fmtMoney(state.treasuryState?.totalIn, state.treasuryState?.currency) }} ·
          − {{ fmtMoney(state.treasuryState?.totalOut, state.treasuryState?.currency) }}
        </div>
      </div>

      <div class="kpi-tile">
        <div class="kpi-tile__icon">
          <span class="material-symbols-outlined">history</span>
        </div>
        <div class="kpi-tile__value fira-sans-condensed-black-italic">
          {{ state.summary.executed }}
        </div>
        <div class="kpi-tile__label fira-sans-condensed-black-italic">Last 24h</div>
        <div class="kpi-tile__sub">
          {{ state.summary.vetoed }} vetoed · {{ state.summary.error }} err
        </div>
      </div>

      <div class="kpi-tile">
        <div class="kpi-tile__icon">
          <span class="material-symbols-outlined">factory</span>
        </div>
        <div class="kpi-tile__value fira-sans-condensed-black-italic">
          {{ state.catalog.length }}
        </div>
        <div class="kpi-tile__label fira-sans-condensed-black-italic">Catalog</div>
        <div class="kpi-tile__sub">{{ totalSales }} sales</div>
      </div>

      <div class="kpi-tile" :class="{ 'is-attention': state.approvals.length > 0 }">
        <div class="kpi-tile__icon">
          <span class="material-symbols-outlined">rule</span>
        </div>
        <div class="kpi-tile__value fira-sans-condensed-black-italic">
          {{ state.approvals.length }}
        </div>
        <div class="kpi-tile__label fira-sans-condensed-black-italic">Pending</div>
        <div class="kpi-tile__sub">approvals</div>
      </div>
    </div>

    <!-- ════════════ Sub-tab selector (chip-row, matches reasoning toggle pattern) ════════════ -->
    <nav class="subtabs">
      <button
        v-for="t in subtabs"
        :key="t.id"
        :class="{ 'is-active': active === t.id }"
        @click="active = t.id"
        class="subtab"
      >
        <span class="material-symbols-outlined">{{ t.icon }}</span>
        <span class="subtab__label">{{ t.label }}</span>
        <span v-if="t.badge" class="subtab__badge">{{ t.badge }}</span>
      </button>
    </nav>

    <!-- ════════════ Sub-tab body ════════════ -->
    <section class="dash-body">
      <!-- ─── Live feed ─── -->
      <CompanyLiveFeed
        v-if="active === 'live'"
        :charter="charter"
        :state="state"
      />

      <!-- ─── Org Chart ─── -->
      <div v-else-if="active === 'org'" class="panel models__activity--payouts">
        <h2 class="panel-title fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">schema</span>
          Organizational Chart
        </h2>
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
            <div class="org-card__llm" v-if="charter.roles[roleKey].llm">
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
                  class="button is-small fira-sans-condensed-black-italic icon-only-btn"
                  @click="openRoleEdit(roleKey)"
                  title="Configure this role: companion, LLM, budget"
                  aria-label="Edit role"
                >
                  <span class="material-symbols-outlined">settings</span>
                </button>
                <button
                  class="button is-small is-warning fira-sans-condensed-black-italic icon-only-btn ml-2"
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
          No roles assigned. Click <strong>Edit charter</strong> in Settings to add.
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
            class="button is-success is-medium fira-sans-condensed-black-italic"
            @click="openNewGoalModal"
          >
            <span class="material-symbols-outlined is-size-3 mr-2">add_circle</span>
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
          <div v-for="goal in filteredGoals" :key="goal.id" class="goal-card">
            <div class="goal-card__head">
              <span class="tag" :class="goal.createdBy === 'ceo' ? 'is-info' : 'is-warning'">
                <span class="material-symbols-outlined mr-1">{{ goal.createdBy === 'ceo' ? 'smart_toy' : 'person' }}</span>
                {{ goal.createdBy === 'ceo' ? 'CEO' : 'You' }}
              </span>
              <span class="tag" :class="goalStatusClass(goal.status)">
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
                  <span class="tag" :class="priorityClass(issue.priority)">{{ issue.priority }}</span>
                  <span class="tag" :class="statusClass(issue.status)">
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
                    class="button is-small is-warning fira-sans-condensed-black-italic"
                    @click="store.tickRoleNow(issue.assigneeRole)"
                    title="Run the assignee's role now to pick this up"
                  >
                    <span class="material-symbols-outlined mr-1">room_service</span>
                    Run
                  </button>
                  <button
                    v-if="issue.status === 'open' || issue.status === 'in_progress' || issue.status === 'blocked'"
                    class="button is-small is-light fira-sans-condensed-black-italic ml-5"
                    @click="setIssueStatus(issue.id, 'cancelled')"
                  >
                    <span class="material-symbols-outlined mr-1">close</span>
                    Cancel
                  </button>
                  <button
                    v-if="issue.status === 'done' || issue.status === 'cancelled'"
                    class="button is-small is-info fira-sans-condensed-black-italic ml-5"
                    @click="reopenIssue(issue.id)"
                  >
                    <span class="material-symbols-outlined mr-1">refresh</span>
                    Reopen
                  </button>
                  <button
                    class="button is-small is-danger fira-sans-condensed-black-italic ml-5 icon-only-btn"
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
                class="button is-small is-light fira-sans-condensed-black-italic"
                @click="cancelGoal(goal.id)"
              >
                <span class="material-symbols-outlined mr-1">cancel</span>
                Cancel goal
              </button>
            </div>
          </div>
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
                <span class="tag" :class="priorityClass(issue.priority)">{{ issue.priority }}</span>
                <span class="tag" :class="statusClass(issue.status)">
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
                  class="button is-small is-danger fira-sans-condensed-black-italic icon-only-btn"
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

      <!-- ─── Production / catalog ─── -->
      <div v-else-if="active === 'production'" class="panel models__activity--payouts">
        <h2 class="panel-title fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">factory</span>
          Production catalog
        </h2>
        <table v-if="state.catalog.length" class="table is-fullwidth dash-table">
          <thead>
            <tr>
              <th>Created</th>
              <th>Pipeline</th>
              <th>Prompt</th>
              <th>Price</th>
              <th>Sales</th>
              <th>Revenue</th>
              <th>Share link</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in state.catalog.slice().reverse()" :key="row.id">
              <td>{{ fmtTime(row.createdAt) }}</td>
              <td><span class="tag is-info">{{ row.pipeline }}</span></td>
              <td class="ellipsis" :title="row.prompt">{{ row.prompt }}</td>
              <td>{{ fmtMoney(row.price, row.currency) }}</td>
              <td>{{ row.sales }}</td>
              <td>{{ fmtMoney(row.revenue, row.currency) }}</td>
              <td>
                <button class="button is-small is-light" @click="copy(row.shareLink)">
                  <span class="material-symbols-outlined">content_copy</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">
          No produced content yet. The next CEO tick will start the assembly line.
        </div>
      </div>

      <!-- ─── Approvals ─── -->
      <div v-else-if="active === 'approvals'" class="panel models__activity--payouts">
        <h2 class="panel-title fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">rule</span>
          Pending approvals
        </h2>
        <div v-if="!state.approvals.length" class="empty">All clear.</div>
        <div v-else class="approval-list">
          <div
            v-for="item in state.approvals"
            :key="item.id"
            class="approval-card"
          >
            <div class="approval-card__head">
              <strong class="fira-sans-condensed-black-italic">{{ item.action.type }}</strong>
              <span class="tag is-light">{{ item.cls }}</span>
              <span class="approval-card__time">{{ fmtTime(item.requestedAt) }}</span>
            </div>
            <div class="approval-card__by">
              by {{ item.role }} · companion {{ item.requestedBy }}
            </div>
            <pre class="approval-card__action">{{ JSON.stringify(item.action, null, 2) }}</pre>
            <div class="approval-card__actions">
              <button class="button is-success fira-sans-condensed-black-italic" @click="approve(item.id)">
                <span class="material-symbols-outlined is-size-3 mr-1">check</span>
                Approve
              </button>
              <button class="button is-danger fira-sans-condensed-black-italic ml-5" @click="reject(item.id)">
                <span class="material-symbols-outlined is-size-3 mr-1">close</span>
                Reject
              </button>
            </div>
          </div>
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
          <button class="button is-success is-medium fira-sans-condensed-black-italic ml-5" @click="recordRevenue">
            <span class="material-symbols-outlined is-size-3 mr-1">arrow_upward</span>
            Revenue
          </button>
          <button class="button is-warning is-medium fira-sans-condensed-black-italic ml-5" @click="recordSpend">
            <span class="material-symbols-outlined is-size-3 mr-1">arrow_downward</span>
            Spend
          </button>
        </div>

        <hr />

        <h3 class="panel-subtitle fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">receipt_long</span>
          Recent treasury activity
        </h3>
        <table v-if="treasuryEntries.length" class="table is-fullwidth dash-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Direction</th>
              <th>Amount</th>
              <th>Memo</th>
              <th>Balance after</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in treasuryEntries" :key="e.id">
              <td>{{ fmtTime(e.ts) }}</td>
              <td>
                <span :class="e.direction === 'in' ? 'has-text-success' : 'has-text-warning'"
                      class="fira-sans-condensed-black-italic">
                  {{ e.direction === 'in' ? '+ in' : '− out' }}
                </span>
              </td>
              <td>{{ fmtMoney(e.amount, e.currency) }}</td>
              <td class="ellipsis">{{ e.note || e.source || e.recipient || '—' }}</td>
              <td>{{ fmtMoney(e.balanceAfter, e.currency) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">No treasury activity yet.</div>
      </div>

      <!-- ─── LLM Pool inventory ─── -->
      <div v-else-if="active === 'pool'" class="panel models__activity--payouts">
        <h2 class="panel-title fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">memory</span>
          LLM Pool
          <button
            class="button is-small is-light fira-sans-condensed-black-italic ml-5"
            @click="refreshPool"
            title="Refresh inventory now"
          >
            <span class="material-symbols-outlined is-size-3 mr-1">refresh</span>
            Refresh
          </button>
          <button
            class="button is-small is-danger fira-sans-condensed-black-italic ml-5"
            @click="shutdownPool"
            title="Stop every running pool instance"
            :disabled="!pool.instances.length"
          >
            <span class="material-symbols-outlined is-size-3 mr-1">power_off</span>
            Shutdown all
          </button>
        </h2>

        <div v-if="pool.err" class="pool-err">
          <span class="material-symbols-outlined">error</span>
          {{ pool.err }}
        </div>

        <div class="dash-kpis dash-kpis--pool">
          <div class="kpi-tile">
            <div class="kpi-tile__icon">
              <span class="material-symbols-outlined">layers</span>
            </div>
            <div class="kpi-tile__value fira-sans-condensed-black-italic">
              {{ pool.instances.length }}
            </div>
            <div class="kpi-tile__label fira-sans-condensed-black-italic">Active instances</div>
            <div class="kpi-tile__sub">live llama-server processes</div>
          </div>
          <div class="kpi-tile">
            <div class="kpi-tile__icon">
              <span class="material-symbols-outlined">memory</span>
            </div>
            <div class="kpi-tile__value fira-sans-condensed-black-italic">
              {{ fmtBytes(pool.totalBytes) }}
            </div>
            <div class="kpi-tile__label fira-sans-condensed-black-italic">Used</div>
            <div class="kpi-tile__sub">of {{ fmtBytes(pool.budgetBytes) }} budget</div>
          </div>
          <div class="kpi-tile" :class="{ 'is-attention': poolUsedPct > 80 }">
            <div class="kpi-tile__icon">
              <span class="material-symbols-outlined">monitoring</span>
            </div>
            <div class="kpi-tile__value fira-sans-condensed-black-italic">
              {{ poolUsedPct }}%
            </div>
            <div class="kpi-tile__label fira-sans-condensed-black-italic">Budget used</div>
            <div class="kpi-tile__sub">LRU evicts at 100%</div>
          </div>
          <div class="kpi-tile">
            <div class="kpi-tile__icon">
              <span class="material-symbols-outlined">bolt</span>
            </div>
            <div class="kpi-tile__value fira-sans-condensed-black-italic">
              {{ totalInFlight }}
            </div>
            <div class="kpi-tile__label fira-sans-condensed-black-italic">In flight</div>
            <div class="kpi-tile__sub">requests across all models</div>
          </div>
        </div>

        <hr />

        <h3 class="panel-subtitle fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">view_list</span>
          Live instances
        </h3>

        <table v-if="pool.instances.length" class="table is-fullwidth dash-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Port</th>
              <th>Footprint</th>
              <th>In-flight</th>
              <th>Last used</th>
              <th>PID</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="i in pool.instances" :key="i.modelKey">
              <td>
                <span class="fira-sans-condensed-black-italic">{{ llmLabel(i.modelKey) }}</span>
                <div class="model-key-sub">{{ i.modelKey }}</div>
              </td>
              <td><code>:{{ i.port }}</code></td>
              <td>{{ fmtBytes(i.sizeBytes) }}</td>
              <td>
                <span :class="i.inFlight > 0 ? 'has-text-success fira-sans-condensed-black-italic' : 'muted'">
                  {{ i.inFlight }}
                </span>
              </td>
              <td>{{ fmtAge(i.lastUsed) }}</td>
              <td><code>{{ i.pid || '—' }}</code></td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">
          No instances running.
          <br />
          <small>
            Set <strong>Execution mode → LLM = parallel</strong> in the charter,
            assign per-role LLMs, then trigger a tick to spawn the first instance.
          </small>
        </div>
      </div>

      <!-- ─── Connectors ─── -->
      <CompanyConnectors
        v-else-if="active === 'connectors'"
        :charter="charter"
        :state="state"
      />

      <!-- ─── Audit log ─── -->
      <div v-else-if="active === 'audit'" class="panel models__activity--payouts">
        <h2 class="panel-title fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">list_alt</span>
          Audit log
          <small class="muted">(last 200)</small>
        </h2>
        <table class="table is-fullwidth dash-table" v-if="state.audit.length">
          <thead>
            <tr>
              <th>Time</th>
              <th>Role</th>
              <th>Action</th>
              <th>Status</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in state.audit" :key="e.id">
              <td>{{ fmtTime(e.ts) }}</td>
              <td><span v-if="e.role" class="tag is-info is-light">{{ roleDisplayName(e.role) }}</span></td>
              <td>{{ e.action }}</td>
              <td>
                <span :class="`status-${e.status} fira-sans-condensed-black-italic`">
                  {{ e.status }}
                </span>
              </td>
              <td class="ellipsis">{{ e.note || e.txOrLink || '' }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">No actions logged yet.</div>
      </div>

      <!-- ─── Settings ─── -->
      <div v-else-if="active === 'settings'" class="panel models__activity--payouts">
        <h2 class="panel-title fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">settings</span>
          Settings
        </h2>
        <p class="muted">Edit the charter, toggle demo mode, dissolve.</p>

        <hr />

        <!-- Demo Mode toggle — runtime switch for an existing company -->
        <div class="settings-row">
          <label class="wiz-toggle">
            <input type="checkbox" :checked="charter.demoMode" @change="toggleDemoMode" />
            <span class="wiz-toggle__track"></span>
          </label>
          <div class="settings-row__copy">
            <div class="settings-row__title fira-sans-condensed-black-italic">
              <span class="material-symbols-outlined mr-2">auto_awesome_motion</span>
              Demo Mode
              <span v-if="charter.demoMode" class="settings-row__badge">ON</span>
            </div>
            <p class="settings-row__hint">
              {{ charter.demoMode
                ? 'Scripted ticks every 8–20 seconds. No LLM required. Perfect for pitches and onboarding.'
                : 'Real local-LLM inference. Requires a loaded model in Generative Text. Heartbeat runs at the charter cadence.' }}
            </p>
          </div>
        </div>

        <hr />

        <div class="setting-actions">
          <button class="button is-medium is-info fira-sans-condensed-black-italic" @click="$emit('edit')">
            <span class="material-symbols-outlined is-size-3 mr-2">edit</span>
            Edit charter
          </button>
        </div>

        <hr />

        <h3 class="panel-subtitle fira-sans-condensed-black-italic">
          <span class="material-symbols-outlined">data_object</span>
          Charter (read-only)
        </h3>
        <pre class="charter-dump">{{ JSON.stringify(charter, null, 2) }}</pre>
      </div>
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
            <span class="material-symbols-outlined is-size-1 mr-2">settings</span>
            <span class="role-modal__title">{{ roleDisplayName(editingRoleKey) }}</span>
          </h2>
          <BzCloseButton size="md" aria-label="Close" @click="closeRoleEdit" />
        </div>

        <p class="role-modal__desc">
          {{ state.roleLibrary[editingRoleKey]?.description }}
        </p>

        <hr />

        <div class="field">
          <label class="label fira-sans-condensed-black-italic">Companion</label>
          <p class="hint">Who does this work. Empty = inherit from parent role (CEO falls back to picking up unassigned roles).</p>
          <div class="select is-fullwidth is-medium">
            <select v-model="editDraft.companion">
              <option :value="null">— inherit (unassign) —</option>
              <option v-for="comp in companionList" :key="comp.id" :value="comp.id">
                {{ comp.name }}
              </option>
            </select>
          </div>
        </div>

        <div class="field">
          <label class="label fira-sans-condensed-black-italic">Preferred LLM</label>
          <p class="hint">
            Smaller models for fast strategic decisions, larger models for production roles.
            Empty = use whichever model is currently loaded by the legacy single-instance manager.
          </p>
          <div class="select is-fullwidth is-medium">
            <select v-model="editDraft.llm">
              <option :value="null">— current loaded model —</option>
              <option v-for="llm in llmOptionsList" :key="llm.key" :value="llm.key">
                {{ llm.label }}
              </option>
            </select>
          </div>
        </div>

        <div class="field">
          <label class="label fira-sans-condensed-black-italic">Inference gateway</label>
          <p class="hint">
            How the role's LLM call is wrapped. <strong>OpenClaw</strong> is the default
            OpenAI-compatible harness — works for every model. <strong>Hermes</strong> uses
            ChatML markers + native function-calling JSON mode — better for Hermes-family /
            Nous Research / function-tuned models.
          </p>
          <div class="select is-fullwidth is-medium">
            <select v-model="editDraft.gateway">
              <option :value="null">— OpenClaw (default) —</option>
              <option value="openclaw">OpenClaw</option>
              <option value="hermes">Hermes</option>
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
            class="button is-medium is-danger is-outlined fira-sans-condensed-black-italic"
            @click="fireRole"
            title="Unassign the companion. Role becomes inheritable."
          >
            <span class="material-symbols-outlined is-size-3 mr-2">person_remove</span>
            Unassign
          </button>
          <div class="role-modal__actions-right">
            <button class="button is-medium is-light fira-sans-condensed-black-italic" @click="closeRoleEdit">
              <span class="material-symbols-outlined is-size-3 mr-2">close</span>
              Cancel
            </button>
            <button
              class="button is-medium is-success fira-sans-condensed-black-italic ml-5"
              :class="{ 'is-loading': editBusy }"
              :disabled="editBusy"
              @click="saveRoleEdit"
            >
              <span class="material-symbols-outlined is-size-3 mr-2">save</span>
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
            <span class="material-symbols-outlined is-size-1 mr-2">flag</span>
            <span class="role-modal__title">New goal</span>
          </h2>
          <button
            class="button is-medium is-light icon-only-btn"
            @click="closeNewGoalModal"
            aria-label="Close"
          >
            <span class="material-symbols-outlined">close</span>
          </button>
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
            class="button is-light icon-only-btn"
            @click="removeGoalTask(idx)"
            aria-label="Remove task"
          >
            <span class="material-symbols-outlined">remove</span>
          </button>
        </div>
        <button
          class="button is-light is-small fira-sans-condensed-black-italic"
          @click="addGoalTask"
        >
          <span class="material-symbols-outlined mr-1">add</span>
          Add task
        </button>

        <hr />

        <div class="role-modal__actions">
          <div class="role-modal__actions-right" style="margin-left:auto;">
            <button class="button is-medium is-light fira-sans-condensed-black-italic" @click="closeNewGoalModal">
              Cancel
            </button>
            <button
              class="button is-medium is-success fira-sans-condensed-black-italic ml-5"
              :class="{ 'is-loading': goalBusy }"
              :disabled="goalBusy || !goalDraft.title.trim() || !goalDraft.tasks.some(t => t.title.trim())"
              @click="submitNewGoal"
            >
              <span class="material-symbols-outlined is-size-3 mr-2">add_circle</span>
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
import { DEFAULT_COMPANIONS, LLM_BASE_MODELS } from "../../skills/flagship.js";
import { SKILL_MANIFESTS } from "../../services/company/skillManifests.js";
import CompanyConnectors from "./CompanyConnectors.vue";
import CompanyLiveFeed from "./CompanyLiveFeed.vue";
import BzCloseButton from "../BzCloseButton.vue";

export default {
  name: "CompanyDashboard",
  components: {
    BzCloseButton, CompanyConnectors, CompanyLiveFeed },
  props: {
    charter: { type: Object, required: true },
    state: { type: Object, required: true },
  },
  emits: ["edit", "reload"],
  setup(props) {
    const store = companyStore;
    // Default landing tab: Live in demo mode (the showcase), Organizational
    // Chart otherwise (the working state for real companies).
    const active = ref(props.charter?.demoMode ? "live" : "org");
    const manual = reactive({ amount: 0, memo: "" });

    // ─── Role-edit modal ─────────────────────────────────────────
    const editingRoleKey = ref(null);
    const editDraft = reactive({ companion: null, llm: null, gateway: null, budget: null });
    const editBusy = ref(false);

    const companionList = DEFAULT_COMPANIONS.map((c) => ({ id: c.id, name: c.name }));
    const llmOptionsList = computed(() =>
      Object.keys(LLM_BASE_MODELS)
        .map((baseKey) => {
          const m = LLM_BASE_MODELS[baseKey];
          return {
            key: `llm_${baseKey}`,
            label: `${m.name} (${m.parameters >= 1e9 ? `${(m.parameters / 1e9).toFixed(1)}B` : m.parameters})`,
            params: m.parameters || 0,
          };
        })
        .sort((a, b) => a.params - b.params),
    );

    function defaultBudgetForRole(roleKey) {
      const def = props.state.roleLibrary[roleKey];
      if (!def) return 0;
      return ((props.charter.rules?.perHeartbeatSpendCap || 0) * (def.budgetPct || 0)).toFixed(2);
    }

    function openRoleEdit(roleKey) {
      const cur = props.charter.roles?.[roleKey] || {};
      editDraft.companion = cur.companion || null;
      editDraft.llm = cur.llm || null;
      editDraft.gateway = cur.gateway || null;
      editDraft.budget = Number.isFinite(cur.budgetPerHeartbeat) ? cur.budgetPerHeartbeat : null;
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
          // Unassign — drop the row entirely. Role becomes inheritable.
          delete next.roles[roleKey];
        } else {
          next.roles[roleKey] = next.roles[roleKey] || {};
          next.roles[roleKey].companion = editDraft.companion;
          if (editDraft.llm) next.roles[roleKey].llm = editDraft.llm;
          else delete next.roles[roleKey].llm;
          if (editDraft.gateway) next.roles[roleKey].gateway = editDraft.gateway;
          else delete next.roles[roleKey].gateway;
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
      return ({ urgent: "is-danger", high: "is-warning", normal: "is-info", low: "is-light" })[p] || "is-info";
    }
    function statusClass(s) {
      return ({ open: "is-info", in_progress: "is-warning", blocked: "is-danger", done: "is-success", cancelled: "is-light" })[s] || "is-light";
    }

    // ─── Goals (parent of issues) — filters + grouping ──────────────
    const goalSourceFilter = ref("all");
    const goalStatusFilter = ref("active");
    function goalStatusClass(s) {
      return ({ active: "is-info", completed: "is-success", cancelled: "is-light" })[s] || "is-light";
    }
    const filteredGoals = computed(() => {
      let all = props.state.goals || [];
      if (goalSourceFilter.value !== "all") all = all.filter((g) => g.createdBy === goalSourceFilter.value);
      if (goalStatusFilter.value !== "all") all = all.filter((g) => g.status === goalStatusFilter.value);
      return all;
    });
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
    // Polls the main-process pool every 3s while the Pool tab is active.
    // Stops polling when the user switches away to keep IPC quiet.
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
        pool.err = err.message;
      }
    }
    function startPoolPolling() {
      stopPoolPolling();
      refreshPool();
      _poolTimer = setInterval(refreshPool, 3000);
    }
    function stopPoolPolling() {
      if (_poolTimer) { clearInterval(_poolTimer); _poolTimer = null; }
    }
    watch(active, (v) => {
      if (v === "pool") startPoolPolling();
      else stopPoolPolling();
    });
    onMounted(() => { if (active.value === "pool") startPoolPolling(); });
    onUnmounted(() => stopPoolPolling());

    async function shutdownPool() {
      if (!confirm("Shut down all LLM pool instances? They will respawn on the next role tick.")) return;
      try { await window.electronAPI.poolShutdown(); } catch {}
      await refreshPool();
    }

    function fmtBytes(b) {
      if (!Number.isFinite(b) || b <= 0) return "0 GB";
      return `${(b / 1024 ** 3).toFixed(2)} GB`;
    }
    function fmtAge(ts) {
      if (!ts) return "—";
      const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
      if (sec < 60) return `${sec}s ago`;
      if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
      return `${Math.round(sec / 3600)}h ago`;
    }
    const poolUsedPct = computed(() => {
      if (!pool.budgetBytes) return 0;
      return Math.min(100, Math.round((pool.totalBytes / pool.budgetBytes) * 100));
    });
    const totalInFlight = computed(() =>
      pool.instances.reduce((acc, i) => acc + (i.inFlight || 0), 0),
    );

    const subtabs = computed(() => [
      { id: "live", label: "Live", icon: "graphic_eq",
        badge: props.charter?.demoMode ? "DEMO" : null },
      { id: "org", label: "Organizational Chart", icon: "schema" },
      { id: "issues", label: "Goals & Issues", icon: "flag",
        badge: props.state.goalCounts?.active || props.state.issueCounts?.open || null },
      { id: "production", label: "Production", icon: "factory" },
      { id: "approvals", label: "Approvals", icon: "rule",
        badge: props.state.approvals.length || null },
      { id: "treasury", label: "Treasury", icon: "account_balance" },
      { id: "connectors", label: "Connectors", icon: "cable",
        badge: (props.state.connectorHealth?.needs_auth || 0) + (props.state.connectorHealth?.broken || 0) || null },
      { id: "pool", label: "LLM Pool", icon: "memory" },
      { id: "audit", label: "Audit", icon: "list_alt" },
      { id: "settings", label: "Settings", icon: "settings" },
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
      const m = llmKey.match(/^llm_(.+)$/);
      if (!m) return llmKey;
      const base = LLM_BASE_MODELS[m[1]];
      return base?.name || llmKey;
    }

    function fmtMoney(amount, currency) {
      if (amount == null || isNaN(amount)) return `0 ${currency || ''}`;
      return `${(+amount).toFixed(2)} ${currency || 'USD'}`;
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

    async function approve(id) { await store.approve(id); }

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

    return {
      store, active, subtabs, manual,
      filledRoles, treasuryEntries, totalSales,
      companionName, roleDisplayName, llmLabel, skillShortName, fmtMoney, fmtTime,
      approve, reject, recordRevenue, recordSpend, copy, toggleDemoMode,
      // pool
      pool, refreshPool, shutdownPool, fmtBytes, fmtAge, poolUsedPct, totalInFlight,
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
      // role-edit modal
      editingRoleKey, editDraft, editBusy,
      companionList, llmOptionsList, defaultBudgetForRole,
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
  background: linear-gradient(to right, transparent, rgba(255, 255, 255, 1), transparent);
}
.material-symbols-outlined {
  font-variation-settings: "FILL" 0, "wght" 100, "GRAD" -25, "opsz" 48;
  border-radius: 100%;
}

.dash {
  color: var(--bz-fg);
  padding-bottom: 4em;
}

/* ───────── KPI tiles — square, glass, beautiful ───────── */
.dash-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1em;
  margin-bottom: 1.5em;
}
.dash-kpis--treasury {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  margin-bottom: 1em;
}

.kpi-tile {
  position: relative;
  aspect-ratio: 1 / 1;
  min-height: 180px;
  padding: 1.25em;
  border: 1px solid var(--bz-border);
  backdrop-filter: blur(32px) !important;
  border-radius: 4px;
  background: var(--bz-scrim);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: all 0.2s ease;
  overflow: hidden;
}
.kpi-tile:hover {
  border-color: var(--bz-border-strong);
  transform: translateY(-2px);
}
.kpi-tile.is-attention {
  border-color: var(--bz-warning) !important;
  box-shadow: 0 0 16px rgba(255, 224, 138, 0.4);
}

.kpi-tile__icon {
  position: absolute;
  top: 0.85em;
  right: 0.85em;
  opacity: 0.6;
}
.kpi-tile__icon .material-symbols-outlined {
  font-size: 36px;
  /* Brand gradient — same purple→orange used in .has-text-brand,
     the company name in the topbar, and the org-card role labels. */
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
}

.kpi-tile__value {
  font-size: 36px !important;
  color: var(--bz-fg) !important;
  line-height: 1.1;
  margin: 0;
  text-align: left !important;
  word-break: break-word;
}
.kpi-tile__label {
  font-size: 14px !important;
  color: var(--bz-fg) !important;
  margin: 0 !important;
  text-align: left !important;
  font-style: italic;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.kpi-tile__sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  margin-top: 0.25em;
}

/* ───────── Sub-tabs — matches the agentic marketplace
   `.category-selector` pattern: white border on dark, transparent →
   purple BonzAI tint when active. Fills the full width of the view
   on a single line — every chip gets equal share of horizontal
   space via `flex: 1`. ───────── */
.subtabs {
  display: flex;
  gap: 0.5em;
  margin-bottom: 1em;
  flex-wrap: nowrap;
  width: 100%;
}
.subtab {
  flex: 1 1 0;
  min-width: 0;
  /* Padding + line-height locked to match the agentic-skills
     `.category-selector` chip dimensions exactly. Smaller font is
     centered inside the same height so the row looks consistent
     with the marketplace. */
  padding: 6px 12px;
  line-height: 1.5;
  background: transparent;
  border: 1px solid var(--bz-fg-faint);
  border-radius: 4px;
  color: var(--bz-fg-faint);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4em;
  font-family: "Fira Sans", sans-serif !important;
  font-weight: 600 !important;
  font-size: 12px;
  letter-spacing: 0.02em;
  transition: all 0.2s ease;
  position: relative;
  backdrop-filter: blur(32px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.subtab .material-symbols-outlined {
  font-size: 18px !important;
  margin-right: 0 !important;
}
.subtab:hover {
  background: var(--bz-purple-soft);
  border-color: var(--bz-fg-low);
  color: var(--bz-fg-mid);
}
.subtab.is-active {
  color: rgba(255, 255, 255, 1) !important;
  border: 1px solid rgba(255, 255, 255, 1) !important;
  background: var(--bz-purple-soft) !important;
  backdrop-filter: blur(64px) !important;
}
.subtab__badge {
  background: var(--bz-danger);
  color: var(--bz-fg);
  padding: 0.1em 0.5em;
  border-radius: 12px;
  font-size: 0.7rem;
  font-weight: 700;
  min-width: 20px;
  text-align: center;
  margin-left: 0.4em;
}

/* ───────── Panels ───────── */
.dash-body { padding: 0.5em 0; }
.panel {
  padding: 2em 2.5em !important;
  border: 1px solid var(--bz-border);
  backdrop-filter: blur(32px) !important;
  border-radius: 4px !important;
  background: var(--bz-scrim);
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
  color: var(--bz-emerald-500);
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
  color: var(--bz-info);
}
.muted { color: var(--bz-fg-mid); }

.empty {
  padding: 3em 2em;
  text-align: center;
  color: rgba(255, 255, 255, 0.55);
  font-style: italic;
  font-size: 16px;
}

/* ───────── Org chart cards ───────── */
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
  backdrop-filter: blur(32px);
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  gap: 0.4em;
}
.org-card:hover {
  background: var(--bz-card);
  border-color: var(--bz-border-strong);
  transform: translateY(-1px);
}
.org-card__role {
  font-size: 1.45rem;
  line-height: 1.1;
  letter-spacing: 0.01em;
  /* Brand gradient — same as company name + canonical .has-text-brand */
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
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
  border: 1px solid rgba(255, 224, 138, 0.6);
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
  color: rgb(255, 153, 51);
  margin-right: 0.2em;
}
.org-card__grant-tag {
  font-size: 0.7em;
  padding: 1px 7px;
  border-radius: 3px;
  background: rgba(155, 109, 200, 0.18);
  border: 1px solid rgba(155, 109, 200, 0.38);
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
  border: 1px solid rgba(255, 224, 138, 0.4);
  color: rgba(255, 255, 255, 0.92);
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
}
.org-card__humans-empty {
  font-style: italic;
  color: rgba(255, 224, 138, 0.65);
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
  background: rgba(62, 142, 208, 0.15);
  color: #5fb4ff;
  border: 1px solid rgba(62, 142, 208, 0.3);
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
  color: rgba(255, 255, 255, 0.65);
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
  backdrop-filter: blur(8px);
  color: rgba(255, 255, 255, 0.55);
  font-size: 13px;
  height: 2.25em;
  line-height: 1;
  transition: all 0.15s ease;
}
.org-card__queue-badge.has-work {
  background: var(--bz-emerald-soft);
  border-color: rgba(72, 199, 142, 0.55);
  color: var(--bz-fg);
  box-shadow: 0 0 8px var(--bz-emerald-soft);
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

/* ───────── Tables ───────── */
.dash-table {
  background: transparent !important;
  color: var(--bz-fg) !important;
}
.dash-table th, .dash-table td {
  border-color: var(--bz-card) !important;
  color: inherit !important;
  vertical-align: middle;
}
.dash-table th {
  color: rgba(255, 255, 255, 0.55) !important;
  font-weight: 700 !important;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.dash-table tbody tr:hover {
  background: var(--bz-canvas);
}
.ellipsis {
  max-width: 28rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ───────── Approvals ───────── */
.approval-list { display: flex; flex-direction: column; gap: 1em; }
.approval-card {
  background: var(--bz-canvas);
  padding: 1.25em 1.5em;
  border-radius: 4px;
  border-left: 3px solid var(--bz-warning);
  border-top: 1px solid var(--bz-card);
  border-right: 1px solid var(--bz-card);
  border-bottom: 1px solid var(--bz-card);
  backdrop-filter: blur(32px);
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
  color: rgba(255, 255, 255, 0.65);
  margin: 0.4em 0 0.75em;
}
.approval-card__action {
  background: var(--bz-scrim);
  padding: 0.85em 1em;
  border-radius: 3px;
  font-size: 0.8rem;
  max-height: 240px;
  overflow: auto;
  color: #b8e3ff;
  font-family: "Fira Mono", monospace;
}
.approval-card__actions {
  display: flex;
  align-items: center;
  margin-top: 1em;
}

/* ───────── Treasury manual entry ───────── */
.manual-entry {
  display: grid;
  grid-template-columns: 160px 1fr auto auto;
  gap: 0;
  align-items: center;
}

/* ───────── Settings ───────── */
.setting-actions {
  display: flex;
  flex-wrap: wrap;
  margin: 1em 0;
}
.charter-dump {
  background: var(--bz-scrim);
  padding: 1.25em;
  border-radius: 4px;
  font-size: 0.78rem;
  max-height: 500px;
  overflow: auto;
  color: #b8e3ff;
  font-family: "Fira Mono", monospace;
  border: 1px solid var(--bz-card);
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
  color: rgba(255, 255, 255, 0.55);
  margin-right: 0.25em;
}

.goal-list {
  display: flex;
  flex-direction: column;
  gap: 1em;
}
.goal-card {
  background: rgba(0, 0, 0, 0.32);
  padding: 1.25em 1.5em;
  border-radius: 6px;
  border: 1px solid var(--bz-border-strong);
  backdrop-filter: blur(32px);
  transition: all 0.15s ease;
}
.goal-card:hover { border-color: rgba(255, 255, 255, 0.22); }
.goal-card__head {
  display: flex;
  align-items: center;
  gap: 0.6em;
  flex-wrap: wrap;
  margin-bottom: 0.4em;
}
.goal-card__head .tag .material-symbols-outlined { font-size: 14px; }
.goal-card__time {
  margin-left: auto;
  font-size: 0.75em;
  color: var(--bz-fg-low);
}
.goal-card__title {
  font-size: 1.25rem;
  /* Brand gradient — same as company name + role labels */
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
  margin-bottom: 0.4em;
}
.goal-card__rationale {
  display: flex;
  align-items: flex-start;
  gap: 0.5em;
  color: rgba(255, 255, 255, 0.78);
  font-size: 0.9em;
  font-style: italic;
  margin-bottom: 0.75em;
  line-height: 1.45;
}
.goal-card__rationale .material-symbols-outlined {
  font-size: 18px;
  margin-top: 1px;
  color: rgb(255, 153, 51);
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
  background: var(--bz-card);
  border-radius: 999px;
  overflow: hidden;
}
.goal-progress-bar__fill {
  height: 100%;
  background: linear-gradient(90deg, rgb(155, 109, 200), rgb(255, 153, 51));
  transition: width 0.3s ease;
}
.goal-card__progress-text {
  font-family: "Fira Sans", sans-serif;
  font-weight: 600;
  font-size: 0.78em;
  color: rgba(255, 255, 255, 0.65);
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
  backdrop-filter: blur(32px);
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
  border: 1px solid var(--bz-card);
  backdrop-filter: blur(32px);
  transition: all 0.15s ease;
}
.issue-card:hover {
  background: var(--bz-card);
  border-color: rgba(255, 255, 255, 0.18);
}
.issue-card__head {
  display: flex;
  align-items: center;
  gap: 0.6em;
  flex-wrap: wrap;
  margin-bottom: 0.5em;
}
.issue-card__head .tag {
  text-transform: capitalize;
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
  color: rgba(255, 255, 255, 0.55);
  margin-bottom: 0.5em;
}
.issue-card__attempts .material-symbols-outlined { font-size: 14px; }
.issue-card__link code { font-size: 11px; }
.issue-card__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 0.5em;
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

/* ───────── Pool ───────── */
.dash-kpis--pool {
  margin-bottom: 1em;
}
.pool-err {
  display: flex;
  align-items: center;
  gap: 0.5em;
  padding: 0.85em 1em;
  background: var(--bz-danger-soft);
  border-left: 3px solid var(--bz-danger);
  border-radius: 4px;
  color: var(--bz-fg);
  margin-bottom: 1em;
  font-size: 14px;
}
.pool-err .material-symbols-outlined { color: var(--bz-danger); }
.model-key-sub {
  font-size: 11px;
  color: var(--bz-fg-low);
  font-family: "Fira Mono", monospace;
}
code {
  background: var(--bz-scrim);
  padding: 0.15em 0.4em;
  border-radius: 3px;
  font-family: "Fira Mono", monospace;
  color: #b8e3ff;
  font-size: 0.85em;
}

/* ───────── Role-edit modal ───────── */
.role-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2em;
  animation: fadeIn 0.15s ease;
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
  background: var(--bz-scrim-strong) !important;
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
  /* Brand gradient — same as company name + org-card role labels */
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
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
  color: rgba(255, 255, 255, 0.55) !important;
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
  background: rgba(155, 109, 200, 0.12);
  border: 1px solid rgba(155, 109, 200, 0.4);
  border-radius: 4px;
  margin-bottom: 1em;
}
.settings-row__copy { flex: 1; }
.settings-row__title {
  display: flex;
  align-items: center;
  font-size: 1.05rem;
  margin-bottom: 0.3em;
  -webkit-text-fill-color: transparent;
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51)) text;
}
.settings-row__title .material-symbols-outlined {
  -webkit-text-fill-color: rgb(255, 153, 51) !important;
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
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51));
  -webkit-text-fill-color: #000 !important;
  background-clip: border-box !important;
}
.settings-row__hint {
  color: rgba(255, 255, 255, 0.78);
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
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}
.wiz-toggle input:checked + .wiz-toggle__track {
  background: linear-gradient(135deg, rgb(155, 109, 200), rgb(255, 153, 51));
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
  border: 2px solid rgba(255, 255, 255, 0.18) !important;
  color: var(--bz-fg) !important;
  backdrop-filter: blur(8px);
}
:deep(.input:focus), :deep(.textarea:focus), :deep(.select select:focus) {
  border-color: var(--bz-emerald-500) !important;
  box-shadow: 0 0 0 0.125em var(--bz-emerald-soft) !important;
}
</style>
