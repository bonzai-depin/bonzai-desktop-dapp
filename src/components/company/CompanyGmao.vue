<template>
  <section data-i18n-skip class="operations company-screen" :class="{ 'operations--review': reviewQueue }" :aria-label='ui("Opérations maintenance")'>
    <header v-if="!reviewQueue && !integrated" class="ops-heading" :class="{ 'ops-heading--embedded': embedded }">
      <div>
        <p v-if="!embedded" class="ops-overline">{{ ui("ÉQUIPE MAINTENANCE") }}</p>
        <h2 v-if="!embedded" class="fira-sans-condensed-black-italic">{{ ui("Maintenance") }}</h2>
        <p class="ops-subtitle">
          {{ todayLabel }} <span>·</span> {{ clientName || ui("Tous vos clients") }}
        </p>
      </div>
      <button
        class="bz-btn bz-btn--primary"
        :disabled="busy"
        @click="edit('workOrder')"
      >
        <span class="material-symbols-outlined" aria-hidden="true">add</span>{{ ui("Nouvelle intervention") }}</button>
    </header>
    <div v-if="integrated && !reviewQueue && !['clients', 'settings'].includes(view)" class="ops-page-toolbar">
      <label><span class="material-symbols-outlined" aria-hidden="true">domain</span>
        <select v-model="clientId" :aria-label="ui('Filtrer par client')">
          <option value="">{{ ui('Tous les clients') }}</option>
          <option v-for="client in data.clients" :key="client.id" :value="client.id">{{ client.name }}</option>
        </select>
      </label>
      <span v-if="view === 'today'" class="ops-subtitle">{{ todayLabel }}</span>
      <div class="ops-page-toolbar__actions">
        <button v-if="['today', 'planning', 'interventions'].includes(view)" type="button" class="bz-btn bz-btn--primary bz-btn--sm" :disabled="busy" @click="edit('workOrder')"><span class="material-symbols-outlined" aria-hidden="true">add</span>{{ ui('Nouvelle intervention') }}</button>
      </div>
    </div>
    <div v-if="!reviewQueue && !integrated" class="ops-context">
      <label
        ><span class="material-symbols-outlined" aria-hidden="true">domain</span
        ><select v-model="clientId" :aria-label='ui("Filtrer par client")'>
          <option value="">{{ ui("Tous les clients") }}</option>
          <option v-for="c in data.clients" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select></label
      ><span class="ops-local"
        ><span class="material-symbols-outlined" aria-hidden="true">lock</span>{{ ui("Espace local") }}<span class="ops-runtime"
          >{{ ui("· automatisations quand BonzAI est ouvert") }}</span
        ></span
      ><button class="bz-btn bz-btn--ghost" @click="view = 'settings'">
        <span class="material-symbols-outlined" aria-hidden="true">tune</span
        ><span>{{ ui("Réglages") }}</span>
      </button>
    </div>
    <nav v-if="!reviewQueue && !integrated" class="ops-nav" :aria-label='ui("Navigation maintenance")'>
      <button
        v-for="n in navigation"
        :key="n.id"
        :aria-current="view === n.id ? 'page' : undefined"
        @click="
          view = n.id;
          selectedId = null;
        "
      >
        <span class="material-symbols-outlined" aria-hidden="true">{{
          n.icon
        }}</span
        >{{ n.label
        }}<span v-if="n.count" class="ops-count bz-metric">{{ n.count }}</span>
      </button>
    </nav>
    <div v-if="notice" class="ops-notice" :class="{ error }" role="status">
      {{ notice
      }}<button :aria-label='ui("Fermer le message")' @click="notice = ''">×</button>
    </div>
    <div v-if="!gmao" class="ops-empty" role="status">
      <span class="material-symbols-outlined" aria-hidden="true"
        >hourglass_empty</span
      >
      <h3>{{ ui("Chargement des opérations…") }}</h3>
    </div>
    <template v-else-if="!reviewDialogsOnly">
      <template v-if="view === 'today'">
        <div class="ops-metrics">
          <button
            v-for="m in metrics"
            :key="m.label"
            @click="
              view = m.view;
              filter = m.filter || 'all';
            "
          >
            <span>{{ m.label }}</span
            ><strong class="bz-metric" :class="'tone-' + m.tone">{{
              m.value
            }}</strong
            ><small>{{ m.detail }}</small>
          </button>
        </div>
        <div class="ops-cockpit">
          <section>
            <div class="ops-section-head">
              <div>
                <p class="ops-overline">{{ ui("PROCHAINES ACTIONS") }}</p>
                <h3>{{ ui("Actions à traiter") }}</h3>
              </div>
              <button
                class="bz-btn bz-btn--ghost"
                :disabled="busy"
                @click="
                  act(
                    () => store.runGmaoAutomation(),
                    ui('Contrôles terminés ; propositions à vérifier.'),
                  )
                "
              >
                <span class="material-symbols-outlined" aria-hidden="true"
                  >refresh</span
                >{{ ui("Analyser") }}</button>
            </div>
            <div v-if="!attention.length" class="ops-empty">
              <span class="material-symbols-outlined" aria-hidden="true"
                >task_alt</span
              >
              <h3>
                {{
                  orders.length
                    ? ui("Aucun dossier en attente")
                    : ui("Votre première intervention commence ici")
                }}
              </h3>
              <p>
                {{
                  orders.length
                    ? ui("Les interventions clôturées restent disponibles dans l’historique.")
                    : ui("Ajoutez un client et son site, puis planifiez une intervention.")
                }}
              </p>
              <button
                v-if="!data.clients?.length"
                class="bz-btn bz-btn--primary"
                @click="edit('client')"
              >{{ ui("Ajouter un client") }}</button>
            </div>
            <button
              v-for="w in attention.slice(0, 10)"
              :key="w.id"
              class="ops-task"
              @click="open(w)"
            >
              <span
                class="ops-priority"
                :class="'tone-' + (w.priority === 'P0' ? 'danger' : 'muted')"
                >{{ w.priority }}</span
              ><span class="ops-task-main"
                ><small
                  >{{ w.clientOiNumber || w.workOrderNumber }} ·
                  {{ clientFor(w)?.name || siteName(w.siteId) }}</small
                ><strong>{{ w.title }}</strong
                ><span
                  >{{ siteName(w.siteId) }} ·
                  {{ w.assigneeHuman || ui("Intervenant à affecter") }}</span
                ></span
              ><span class="ops-next"
                >{{ nextAction(w, scoped.procurements)
                }}<span class="material-symbols-outlined" aria-hidden="true"
                  >arrow_forward</span
                ></span
              >
            </button>
          </section>
          <aside class="ops-day">
            <div class="ops-section-head">
              <h3>{{ ui("À l’agenda") }}</h3>
              <button
                class="bz-btn bz-btn--ghost"
                @click="view = 'planning'"
                :aria-label='ui("Ouvrir le planning")'
              >
                <span class="material-symbols-outlined" aria-hidden="true"
                  >arrow_forward</span
                >
              </button>
            </div>
            <p class="ops-subtitle">{{ todayLabel }}</p>
            <button
              v-for="w in todayOrders"
              :key="w.id"
              class="ops-agenda-item"
              @click="open(w)"
            >
              <time class="bz-metric">{{ time(w.scheduledAt) }}</time
              ><span
                ><strong>{{ w.title }}</strong
                ><small
                  >{{ w.assigneeHuman || ui("Non affectée") }} ·
                  {{ siteName(w.siteId) }}</small
                ></span
              >
            </button>
            <p v-if="!todayOrders.length" class="ops-empty-text">{{ ui("Aucune intervention planifiée aujourd’hui.") }}</p>
            <div class="ops-section-head ops-divider"><h3>{{ ui(integrated ? "Inbox" : "À valider") }}</h3></div>
            <button v-if="integrated" class="ops-summary" @click="$emit('open-review')"><span>{{ ui('Pending approvals') }}</span><b class="bz-metric">{{ pendingApprovals }}</b></button>
            <button class="ops-summary" @click="view = 'outbox'">
              <span>{{ ui("Messages préparés") }}</span
              ><b class="bz-metric">{{
                scoped.outbox.filter((m) => m.status === "draft").length
              }}</b></button
            ><button class="ops-summary" @click="view = 'documents'">
              <span>{{ ui("Documents entrants") }}</span
              ><b class="bz-metric">{{ intake.length }}</b>
            </button>
            <p class="ops-runtime-note" v-if="data.automationRuns?.length">{{ ui("Dernier contrôle :") }} {{
                date(
                  data.automationRuns[0].completedAt ||
                    data.automationRuns[0].startedAt,
                )
              }}
              ·
              {{
                data.automationRuns[0].status === "completed"
                  ? ui("terminé")
                  : data.automationRuns[0].status === "failed"
                    ? ui("échec à vérifier")
                    : "en cours"
              }}.
              {{
                data.automationRuns[0].status === "failed"
                  ? data.automationRuns[0].error
                  : ""
              }}
            </p>
            <p class="ops-runtime-note">{{ ui("Les équipes préparent. Vous validez les achats, les messages et les preuves de réalisation.") }}</p>
          </aside>
        </div>
      </template>
      <template v-else-if="view === 'interventions'">
        <div class="ops-toolbar">
          <label class="ops-search"
            ><span class="material-symbols-outlined" aria-hidden="true"
              >search</span
            ><input
              v-model="search"
              :placeholder='ui("N° OI, client, site, équipement…")'
              :aria-label='ui("Rechercher une intervention")' /></label
          ><select v-model="filter" :aria-label='ui("État des interventions")'>
            <option value="all">{{ ui("Toutes les interventions") }}</option>
            <option value="open">{{ ui("En cours") }}</option>
            <option value="unplanned">{{ ui("À planifier") }}</option>
            <option value="waiting_parts">{{ ui("Pièces attendues") }}</option>
            <option value="restored">{{ ui("Service fait attendu") }}</option>
            <option value="completed">{{ ui("Terminées") }}</option></select
          ><button
            class="bz-btn bz-btn--ghost"
            :disabled="busy"
            @click="
              act(() => store.exportGmaoWeeklyRegister(), ui('Registre exporté.'))
            "
          >
            <span class="material-symbols-outlined" aria-hidden="true"
              >download</span
            >{{ ui("Registre") }}</button>
        </div>
        <div class="ops-table-wrap">
          <table class="ops-table">
            <thead>
              <tr>
                <th>{{ ui("Intervention") }}</th>
                <th>{{ ui("Client / site") }}</th>
                <th>{{ ui("Créneau / intervenant") }}</th>
                <th>{{ ui("Avancement") }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="w in filteredOrders.slice(0, limit)" :key="w.id" :class="'process-row process-' + processFor(w).code">
                <td>
                  <button class="ops-title-link" @click="open(w)">
                    <small
                      >{{ w.clientOiNumber || w.workOrderNumber }} ·
                      {{ w.priority }}</small
                    ><strong>{{ w.title }}</strong>
                  </button>
                </td>
                <td>
                  {{ clientFor(w)?.name || ui("Client à renseigner")
                  }}<small>{{ siteName(w.siteId) }}</small>
                </td>
                <td>
                  {{ date(w.scheduledAt)
                  }}<small>{{ w.assigneeHuman || ui("Non affectée") }}</small>
                </td>
                <td>
                  <span class="ops-process-state" :class="'process-' + processFor(w).code">{{ ui(processFor(w).label) }}</span>
                </td>
                <td>
                  <button
                    class="bz-btn bz-btn--ghost"
                    :aria-label='ui("Ouvrir le dossier")'
                    @click="open(w)"
                  >
                    <span class="material-symbols-outlined" aria-hidden="true"
                      >arrow_forward</span
                    >
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="!filteredOrders.length" class="ops-empty">
          <span class="material-symbols-outlined" aria-hidden="true"
            >assignment</span
          >
          <h3>{{ ui("Aucune intervention dans cette vue") }}</h3>
          <p>{{ ui("Modifiez le filtre ou créez votre premier dossier.") }}</p>
        </div>
        <button
          v-if="filteredOrders.length > limit"
          class="bz-btn bz-btn--ghost"
          @click="limit += 30"
        >{{ ui("Afficher la suite (") }}{{ filteredOrders.length - limit }})
        </button>
      </template>
      <template v-else-if="view === 'planning'">
        <CompanyRoutePlanner :company-id="store.state.activeId || gmao.companyId" :orders="orders" />
        <div class="ops-toolbar">
          <div class="ops-month">
            <button
              class="bz-btn bz-btn--ghost"
              :aria-label='ui("Période précédente")'
              @click="moveMonth(-1)"
            >
              <span class="material-symbols-outlined" aria-hidden="true"
                >chevron_left</span
              >
            </button>
            <h3>{{ monthLabel }}</h3>
            <button
              class="bz-btn bz-btn--ghost"
              :aria-label='ui("Période suivante")'
              @click="moveMonth(1)"
            >
              <span class="material-symbols-outlined" aria-hidden="true"
                >chevron_right</span
              >
            </button>
          </div>
          <select
            v-model="planningSite"
            :aria-label='ui("Filtrer le site du planning")'
          >
            <option value="">{{ ui("Tous les sites") }}</option>
            <option v-for="s in scoped.sites" :key="s.id" :value="s.id">
              {{ s.name }}
            </option></select
          ><select v-model="technician" :aria-label='ui("Filtrer le technicien")'>
            <option value="">{{ ui("Tous les intervenants") }}</option>
            <option v-for="t in technicians" :key="t">{{ t }}</option></select
          ><select v-model="planMode" :aria-label='ui("Présentation planning")'>
            <option value="month">{{ ui("Mois") }}</option>
            <option value="week">{{ ui("Semaine") }}</option>
            <option value="list">{{ ui("Liste") }}</option></select
          ><button
            class="bz-btn bz-btn--ghost"
            :disabled="busy"
            @click="act(() => store.generateGmaoPreventive(), preventiveNotice)"
          >
            <span class="material-symbols-outlined" aria-hidden="true"
              >event_repeat</span
            >{{ ui("Préparer les 90 prochains jours") }}</button>
        </div>
        <div class="ops-legend">
          <span v-for="s in legend" :key="s.code" :class="'process-' + s.code"
            ><i></i>{{ s.label }}</span
          >
        </div>
        <div
          v-if="planMode !== 'list'"
          class="ops-calendar"
          role="grid"
          :aria-label="monthLabel"
        >
          <div
            v-for="day in [ui(&quot;Lun&quot;), ui(&quot;Mar&quot;), ui(&quot;Mer&quot;), ui(&quot;Jeu&quot;), ui(&quot;Ven&quot;), ui(&quot;Sam&quot;), ui(&quot;Dim&quot;)]"
            :key="day"
            class="ops-weekday"
            role="columnheader"
          >
            {{ day }}
          </div>
          <div
            v-for="day in calendarDays"
            :key="dayKey(day)"
            class="ops-calendar-day"
            :class="{
              outside: day.getMonth() !== month.getMonth(),
              today: dayKey(day) === dayKey(now),
            }"
            role="gridcell"
            :aria-label="date(day.getTime(), false)"
          >
            <span class="ops-day-number bz-metric">{{ day.getDate() }}</span
            ><button
              v-for="w in onDay(day)"
              :key="w.id"
              class="ops-calendar-event"
              :class="'process-' + processFor(w).code"
              @click="open(w)"
            >
              <small
                >{{ w.scheduledAt ? time(w.scheduledAt) : ui("Échéance") }} ·
                {{ w.type === "preventive" ? ui("Préventif") : ui("Correctif") }}</small
              ><strong>{{ w.title }}</strong
              ><span>{{ w.assigneeHuman || ui("À affecter") }}</span>
              <span class="ops-calendar-event__state">{{ ui(processFor(w).label) }}</span>
            </button>
          </div>
        </div>
        <div
          class="ops-calendar-list"
          :class="{ 'ops-calendar-list--mobile': planMode !== 'list' }"
        >
          <button
            v-for="w in planned"
            :key="w.id"
            class="ops-task"
            @click="open(w)"
          >
            <time
              >{{ date(planningDate(w))
              }}{{ w.scheduledAt ? "" : ui("· à programmer") }}</time
            ><span class="ops-task-main"
              ><strong>{{ w.title }}</strong
              ><small
                >{{ siteName(w.siteId) }} ·
                {{ w.assigneeHuman || ui("À affecter") }}</small
              ></span
            ><span class="ops-status" :class="'tone-' + statusTone(w)">{{
              statusLabel(w.status)
            }}</span>
          </button>
          <p v-if="!planned.length" class="ops-empty-text">{{ ui("Aucun créneau sur cette période.") }}</p>
        </div>
        <div class="ops-section-head ops-divider">
          <h3>{{ ui("À planifier") }}<span class="bz-metric">{{ unplanned.length }}</span>
          </h3>
        </div>
        <div class="ops-unscheduled">
          <button
            v-for="w in unplanned"
            :key="w.id"
            class="ops-plan-chip"
            @click="edit('schedule', w)"
          >
            <span class="material-symbols-outlined" aria-hidden="true"
              >add_task</span
            ><span
              >{{ w.title }}<small>{{ siteName(w.siteId) }}</small></span
            >
          </button>
          <p v-if="!unplanned.length" class="ops-empty-text">{{ ui("Tous les dossiers ouverts disposent d’un créneau.") }}</p>
        </div>
      </template>
      <template v-else-if="view === 'clients'">
        <div class="ops-section-head">
          <span class="ops-directory-count"><b class="bz-metric">{{ visibleClients.length }}</b> {{ ui('Clients') }}</span>
          <button class="bz-btn bz-btn--primary" @click="edit('client')">{{ ui("Ajouter un client") }}</button>
        </div>
        <div class="ops-client-grid">
          <article v-for="c in visibleClients" :key="c.id" class="ops-client">
            <div class="ops-client-head">
              <span class="ops-monogram">{{
                c.name.slice(0, 2).toUpperCase()
              }}</span>
              <div>
                <h3>{{ c.name }}</h3>
                <small>{{ c.contactName || ui("Contact à renseigner") }}</small>
              </div>
              <button
                class="bz-btn bz-btn--ghost"
                :aria-label="ui(&quot;Modifier&quot;) + c.name"
                @click="edit('client', c)"
              >
                <span class="material-symbols-outlined" aria-hidden="true"
                  >edit</span
                >
              </button>
            </div>
            <div class="ops-client-contact">
              <span><span class="material-symbols-outlined" aria-hidden="true">mail</span>{{ c.email || ui("Email à renseigner") }}</span>
              <span><span class="material-symbols-outlined" aria-hidden="true">call</span>{{ c.phone || ui("Téléphone à renseigner") }}</span>
            </div>
            <div class="ops-client-stats">
              <span
                ><b class="bz-metric">{{
                  data.sites.filter((s) => s.clientId === c.id).length
                }}</b>{{ ui("sites") }}</span
              ><span
                ><b class="bz-metric">{{
                  clientOrders(c.id).filter((w) => !closed(w)).length
                }}</b>{{ ui("interventions ouvertes") }}</span
              >
            </div>
            <div class="ops-client-actions">
              <button
                class="bz-btn bz-btn--ghost"
                @click="
                  clientId = c.id;
                  view = 'today';
                "
              >{{ ui("Ouvrir le cockpit") }}<span
                  class="material-symbols-outlined"
                  aria-hidden="true"
                  >arrow_forward</span
                ></button
              ><button
                class="bz-btn bz-btn--ghost"
                @click="edit('site', { clientId: c.id })"
              >{{ ui("Ajouter un site") }}</button
              ><button
                class="bz-btn bz-btn--ghost"
                @click="edit('contract', { clientId: c.id })"
              >{{ ui("Ajouter un contrat") }}</button>
            </div>
            <div class="ops-client-sites">
            <div
              v-for="s in data.sites.filter((s) => s.clientId === c.id)"
              :key="s.id"
              class="ops-site"
            >
              <span class="material-symbols-outlined" aria-hidden="true"
                >location_on</span
              >
              <div>
                <strong>{{ s.name }}</strong
                ><small>{{
                  s.address || s.commune || ui("Adresse à renseigner")
                }}</small>
              </div>
              <button
                class="bz-btn bz-btn--ghost"
                :aria-label="ui(&quot;Modifier le site&quot;) + s.name"
                @click="edit('site', s)"
              >
                <span class="material-symbols-outlined" aria-hidden="true"
                  >edit</span
                >
              </button>
            </div>
            </div>
            <button
              v-for="c2 in data.serviceContracts?.filter(
                (x) => x.clientId === c.id,
              )"
              :key="c2.id"
              class="ops-summary"
              @click="edit('contract', c2)"
            >
              <span
                ><span class="material-symbols-outlined" aria-hidden="true"
                  >description</span
                >
                {{ c2.name }}</span
              ><small>{{ c2.reference || ui("Sans référence") }}</small>
            </button>
          </article>
        </div>
        <div v-if="!visibleClients.length" class="ops-empty">
          <span class="material-symbols-outlined" aria-hidden="true"
            >domain_add</span
          >
          <h3>{{ ui("Aucun client") }}</h3>
          <p>{{ ui("Ses contacts, contrats et sites resteront accessibles depuis chaque intervention.") }}</p>
        </div>
        <div v-if="data.sites.some((s) => !s.clientId)" class="ops-divider">
          <h3>{{ ui("Sites à rattacher") }}</h3>
          <button
            v-for="s in data.sites.filter((s) => !s.clientId)"
            :key="s.id"
            class="ops-summary"
            @click="edit('site', s)"
          >
            {{ s.name }}<span>{{ ui("Choisir un client →") }}</span>
          </button>
        </div>
      </template>
      <template v-else-if="view === 'purchasing'">
        <div class="ops-section-head">
          <div>
            <p class="ops-overline">{{ ui("APPROVISIONNEMENT") }}</p>
            <h3>{{ ui("Demandes de pièces") }}</h3>
          </div>
          <button class="bz-btn bz-btn--ghost" @click="edit('supplier')">
            <span class="material-symbols-outlined" aria-hidden="true"
              >add</span
            >{{ ui("Fournisseur") }}</button>
        </div>
        <div class="ops-buy-board">
          <section v-for="lane in purchaseLanes" :key="lane.id">
            <h4>
              {{ lane.label
              }}<span class="bz-metric">{{ purchases(lane).length }}</span>
            </h4>
            <article
              v-for="p in purchases(lane)"
              :key="p.id"
              class="ops-buy-card"
            >
              <small>{{
                woFor(p)?.clientOiNumber || woFor(p)?.workOrderNumber
              }}</small>
              <h3>{{ p.description }}</h3>
              <p>
                {{
                  p.supplierName ||
                  supplierName(p.supplierId) ||
                  ui("Fournisseur à choisir")
                }}
              </p>
              <p v-if="p.amountCents != null" class="bz-metric">
                {{ money(p.amountCents) }}
              </p>
              <span
                class="ops-status"
                :class="
                  'tone-' + (p.status === 'received' ? 'success' : 'warning')
                "
                >{{ statusLabel(p.status) }}</span
              ><small>{{ p.responsible || ui("Responsable à affecter") }}</small>
              <CompanyRecordFlow :company-id="store.state.activeId" kind="partsRequest" :record-id="p.id" :revision="p.updatedAt" @prepare-invoice="$emit('prepare-invoice',$event)" @open-invoice="$emit('open-invoice',$event)" />
              <div class="ops-buy-actions">
                <button class="bz-btn bz-btn--ghost" @click="sharedPurchase=p">{{ $t("teamExchanges.sharePurchase") }}</button>
                <button
                  class="bz-btn bz-btn--primary"
                  v-if="p.status !== 'received'"
                  @click="edit('procurement', p)"
                >{{ ui("Traiter la demande") }}</button
                ><button class="bz-btn bz-btn--ghost" @click="open(woFor(p))">{{ ui("Dossier OI") }}<span
                    class="material-symbols-outlined"
                    aria-hidden="true"
                    >arrow_forward</span
                  >
                </button>
              </div>
            </article>
            <p v-if="!purchases(lane).length" class="ops-empty-text">{{ ui("Aucune demande") }}</p>
          </section>
        </div>

      </template>
      <template v-else-if="view === 'outbox' || reviewQueue">
        <div class="ops-section-head">
          <div>
            <h3>{{ ui(reviewQueue ? "Messages à traiter" : "Messages & reçus") }}</h3>
            <p class="ops-subtitle">{{ ui("Relisez le destinataire, le texte et la pièce jointe avant chaque envoi.") }}</p>
          </div>
          <button
            class="bz-btn bz-btn--ghost"
            @click="$emit('open-connectors')"
          >{{ ui("Configurer les expéditeurs") }}</button>
        </div>
        <label v-if="reviewQueue" class="ops-history-toggle"><input type="checkbox" v-model="showMessageHistory" />{{ ui('Afficher les messages envoyés') }}</label>
        <div v-if="!reviewMessages.length" class="ops-empty-text">
          <span class="material-symbols-outlined" aria-hidden="true"
            >outbox</span
          >
          <h3>{{ ui(reviewQueue ? "Aucun message à traiter" : "Aucun message") }}</h3>
          <p>{{ ui("Ouvrez une intervention pour préparer un email ou un SMS.") }}</p>
          <button
            class="bz-btn bz-btn--primary"
            @click="reviewQueue ? $emit('open-work') : view = 'interventions'"
          >{{ ui("Voir les interventions") }}</button>
        </div>
        <article v-for="m in reviewMessages" :key="m.id" class="ops-message">
          <span class="material-symbols-outlined" aria-hidden="true">{{
            m.channel === "sms" ? "sms" : "mail"
          }}</span>
          <div>
            <small
              >{{ woFor(m)?.workOrderNumber }} · {{ date(m.createdAt) }}</small
            >
            <h3>{{ m.subject }}</h3>
            <p>{{ m.recipient }}</p>
            <span
              class="ops-status"
              :class="
                'tone-' +
                ({ delivered: 'success', failed: 'danger', unknown: 'warning' }[
                  m.status
                ] || 'muted')
              "
              >{{ statusLabel(m.status) }}</span
            ><small v-if="m.providerId">{{ ui("Reçu :") }}{{ m.providerId }}</small>
            <p v-if="m.error" class="tone-danger">{{ m.error }}</p>
          </div>
          <button
            class="bz-btn bz-btn--ghost"
            @click="edit('messageReview', m)"
          >{{ ui("Ouvrir") }}<span class="material-symbols-outlined" aria-hidden="true"
              >arrow_forward</span
            >
          </button>
        </article>
        <div
          v-if="reviewData.notifications.some((n) => n.deliveryStatus === 'ready')"
          class="ops-divider"
        >
          <h3>{{ ui("Notifications à préparer") }}</h3>
          <button
            v-for="n in reviewData.notifications.filter(
              (n) => n.deliveryStatus === 'ready',
            )"
            :key="n.id"
            class="ops-summary"
            @click="edit('message', { ...n, notificationId:n.id, channel: 'email' })"
          >
            <span>{{ n.subject }}</span
            ><span>{{ ui("Préparer →") }}</span>
          </button>
        </div>
      </template>
      <template v-if="view === 'documents' || reviewQueue">
        <div class="ops-section-head">
          <div>
            <h3>{{ ui("Documents à relire") }}</h3>
            <p class="ops-subtitle">{{ ui("Import files to prepare linked records automatically.") }}</p>
          </div>
          <label class="bz-btn bz-btn--primary"
            ><span class="material-symbols-outlined" aria-hidden="true"
              >upload_file</span
            >{{ ui("Importer") }}<input
              class="ops-file"
              type="file"
              accept=".docx,.pdf,.png,.jpg,.jpeg,.txt,.md,.csv,.tsv,.xls,.xlsx,.xlsm"
              :disabled="busy"
              @change="importIntake"
          /></label>
        </div>
        <button
          v-for="d in intake"
          :key="d.id"
          class="ops-task"
          @click="edit('intake', d)"
        >
          <span class="material-symbols-outlined" aria-hidden="true"
            >description</span
          ><span class="ops-task-main"
            ><strong>{{ d.originalName }}</strong
            ><small
              >{{ documentTypes[d.documentType] || ui("À identifier") }} ·
              {{ d.error || ui("Suggestion par règles, à vérifier") }}</small
            ></span
          ><span>{{ ui("Relire →") }}</span>
        </button>
        <p v-if="!intake.length" class="ops-empty-text">{{ ui("Aucun document en attente.") }}</p>
      </template>
      <template v-else-if="view === 'settings'">
      <CompanyTeamRouting :store="store" />
      <CompanyMaintenanceControls :company-id="store.state.activeId" @changed="store.refreshActive()" @open-work-order="id => open(data.workOrders.find(work => work.id === id))" @open-task="$emit('open-task', $event)" />
      <CompanyGmaoSettings
        :gmao="data"
        :store="store"
        initial-view="assets"
      />
      </template>
    </template>

    <GmaoDialog
      v-if="selected"
      :title="selected.title"
      :eyebrow="`${selected.clientOiNumber || selected.workOrderNumber} · ${siteName(selected.siteId)}`"
      :busy="busy"
      @close="selectedId = null"
    >
      <div class="ops-dossier">
        <div class="ops-dossier-summary">
          <span class="ops-status" :class="'tone-' + statusTone(selected)">{{
            statusLabel(selected.status)
          }}</span
          ><span>{{ clientFor(selected)?.name || ui("Client à renseigner") }}</span
          ><span
            >{{ selected.priority }} ·
            {{
              selected.type === "preventive" ? ui("Préventif") : ui("Correctif")
            }}</span
          >
        </div>
        <p>
          {{ selected.description || ui("Aucune description complémentaire.") }}
        </p>
        <CompanyWorkflowProgress :stages="processFor(selected).stages" />
        <span class="ops-process-state" :class="'process-' + processFor(selected).code">{{ ui(processFor(selected).label) }}</span>
        <CompanyMaintenanceControls :company-id="store.state.activeId" :work-order-id="selected.id" embedded @changed="store.refreshActive()" @open-task="$emit('open-task', $event)" />
        <CompanyRecordFlow :company-id="store.state.activeId" kind="workOrder" :record-id="selected.id" :revision="selected.updatedAt" @prepare-invoice="$emit('prepare-invoice',$event)" @open-invoice="$emit('open-invoice',$event)" @open-task="$emit('open-task',$event)" />
        <div class="ops-dossier-next">
          <div>
            <small>{{ ui("PROCHAINE ÉTAPE") }}</small>
            <h3>{{ nextAction(selected, scoped.procurements) }}</h3>
          </div>
          <button
            v-if="
              !closed(selected) || selected.billingStatus === 'ready_to_invoice'
            "
            class="bz-btn bz-btn--primary"
            :disabled="busy"
            @click="advance(selected)"
          >{{ ui("Continuer") }}<span class="material-symbols-outlined" aria-hidden="true"
              >arrow_forward</span
            >
          </button>
        </div>
        <div class="ops-dossier-actions"><button v-if="selected.billingStatus === 'ready_to_invoice'" class="bz-btn bz-btn--ghost" @click="edit('invoice', {workOrderId:selected.id})">{{ ui('Préparer la facture') }}</button>
          <button
            class="bz-btn bz-btn--ghost"
            :disabled="closed(selected)"
            @click="edit('schedule', selected)"
          >
            <span class="material-symbols-outlined" aria-hidden="true"
              >event</span
            >{{ date(selected.scheduledAt) }}</button
          ><button
            class="bz-btn bz-btn--ghost"
            @click="edit('message', { workOrderId: selected.id })"
          >
            <span class="material-symbols-outlined" aria-hidden="true"
              >mail</span
            >{{ ui("Email / SMS") }}</button
          ><button
            class="bz-btn bz-btn--ghost"
            :disabled="busy"
            @click="generate('intervention', selected.id)"
          >
            <span class="material-symbols-outlined" aria-hidden="true"
              >picture_as_pdf</span
            >{{ ui("Bon d’intervention") }}</button
          ><button
            class="bz-btn bz-btn--ghost"
            :disabled="closed(selected)"
            @click="edit('procurement', { workOrderId: selected.id })"
          >
            <span class="material-symbols-outlined" aria-hidden="true"
              >shopping_bag</span
            >{{ ui("Demande achats") }}</button
          ><button
            class="bz-btn bz-btn--ghost"
            @click="edit('quote', { workOrderId: selected.id })"
          >{{ ui("Préparer un devis") }}</button>
        </div>
        <div class="ops-dossier-cols">
          <section>
            <div class="ops-section-head">
              <h3>{{ ui("Documents & finance") }}</h3>
              <label class="bz-btn bz-btn--ghost" :title='ui("Joindre un fichier")'
                ><span class="material-symbols-outlined" aria-hidden="true"
                  >attach_file</span
                ><input
                  class="ops-file"
                  type="file"
                  @change="attachDocument($event, selected.id)"
              /></label>
            </div>
            <button
              v-for="q in related('quotes')"
              :key="q.id"
              class="ops-summary"
              @click="edit('quoteReview', q)"
            >
              <span
                ><strong>{{ q.quoteNumber }}</strong
                ><small>{{ statusLabel(q.status) }}</small></span
              ><span class="bz-metric">{{ money(q.totalCents) }}</span></button
            ><button
              v-for="i in related('invoices')"
              :key="i.id"
              class="ops-summary"
              @click="generate('invoice', selected.id, i.id)"
            >
              <span
                >{{ i.invoiceNumber
                }}<small>{{ statusLabel(i.status) }}</small></span
              ><span class="bz-metric">{{ money(i.totalCents) }}</span></button
            ><button
              v-for="d in related('documents')"
              :key="d.id"
              class="ops-document"
              @click="preview(d)"
            >
              <span class="material-symbols-outlined" aria-hidden="true"
                >description</span
              ><span
                >{{ d.filename }}<small>{{ date(d.createdAt) }}</small></span
              ><span class="material-symbols-outlined" aria-hidden="true"
                >open_in_new</span
              >
            </button>
            <p v-if="!related('documents').length" class="ops-empty-text">{{ ui("Les preuves et les versions PDF apparaîtront ici.") }}</p>
            <h3 class="ops-divider">{{ ui("Achats & transmissions") }}</h3>
            <button
              v-for="p in related('procurements')"
              :key="p.id"
              class="ops-summary"
              :disabled="['received','cancelled'].includes(p.status)"
              @click="edit('procurement', p)"
            >
              <span
                >{{ p.description
                }}<small>{{
                  p.responsible || ui("Équipe Achats · à prendre en charge")
                }}</small></span
              ><span>{{ statusLabel(p.status) }}<small v-if="p.receiptReference">{{p.receiptReference}}</small></span>
            </button>
            <h3 class="ops-divider">{{ ui("Communications") }}</h3>
            <button
              v-for="m in related('outbox')"
              :key="m.id"
              class="ops-summary"
              @click="edit('messageReview', m)"
            >
              <span
                >{{ m.recipient }}<small>{{ m.subject }}</small></span
              ><span>{{ statusLabel(m.status) }}</span>
            </button>
          </section>
          <section>
            <h3>{{ ui("Chronologie factuelle") }}</h3>
            <ol class="ops-timeline">
              <li v-for="e in related('events').slice(0, 40)" :key="e.id">
                <small
                  >{{ date(e.happenedAt) }} ·
                  {{ e.actorName || e.actorRole || "BonzAI" }}</small
                ><strong>{{
                  e.toStatus ? statusLabel(e.toStatus) : eventLabel(e.eventType)
                }}</strong>
                <p>{{ e.note }}</p>
              </li>
            </ol>
          </section>
        </div>
        <button
          v-if="!closed(selected)"
          class="bz-btn bz-btn--ghost tone-danger"
          @click="edit('cancel', selected)"
        >{{ ui("Annuler l’intervention") }}</button>
      </div>
    </GmaoDialog>

    <GmaoDialog
      v-if="editor"
      :title="editorTitle"
      :eyebrow="
        editor.workOrderId ? woFor(editor)?.workOrderNumber : 'ESPACE LOCAL'
      "
      :busy="busy"
      @close="closeEditor"
    >
      <form class="ops-form" @submit.prevent="submitEditor">
        <p v-if="formError" class="ops-notice error" role="alert">
          {{ formError }}
        </p>
        <template v-if="editor.type === 'client'"
          ><label
            >{{ ui("Nom du client") }}<input
              v-model.trim="form.name"
              required
              autofocus /></label
          ><label
            >{{ ui("Contact principal") }}<input v-model.trim="form.contactName" /></label
          ><label>{{ ui("Email") }}<input v-model.trim="form.email" type="email" /></label
          ><label
            >{{ ui("Téléphone") }}<input
              v-model.trim="form.phone"
              placeholder="+33…" /></label
          ><label class="full"
            >{{ ui("Adresse") }}<textarea v-model="form.address" rows="2"></textarea></label
        ></template>
        <template v-if="editor.type === 'supplier'"
          ><label
            >{{ ui("Fournisseur") }}<input
              v-model.trim="form.name"
              required
              autofocus /></label
          ><label>{{ ui("Référence compte") }}<input v-model.trim="form.reference" /></label
          ><label>{{ ui("Email") }}<input v-model.trim="form.email" type="email" /></label
          ><label>{{ ui("Téléphone") }}<input v-model.trim="form.phone" /></label
        ></template>
        <template v-if="editor.type === 'contract'"
          ><label
            >{{ ui("Client") }}<select v-model="form.clientId" required>
              <option v-for="c in data.clients" :key="c.id" :value="c.id">
                {{ c.name }}
              </option>
            </select></label
          ><label
            >{{ ui("Nom du contrat") }}<input v-model.trim="form.name" required /></label
          ><label>{{ ui("Référence") }}<input v-model.trim="form.reference" /></label
          ><label
            >{{ ui("TVA (%)") }}<input
              v-model.number="form.vatRate"
              type="number"
              min="0"
              max="100"
              step="0.1"
              required /></label
          ><label>{{ ui("Début") }}<input v-model="form.startsAt" type="date" /></label
          ><label>{{ ui("Fin") }}<input v-model="form.endsAt" type="date" /></label>
          <CompanyContractPricing class="full" v-model="form.settings.pricingProfile" v-model:confirmed="form.pricingValidated" />
          <fieldset class="full ops-contract-sla"><legend>{{ ui('Franchise gaz du CCTP 25-004') }}</legend>
            <label class="ops-check"><input v-model="form.useGasProfile" type="checkbox" />{{ ui('Utiliser le profil du document joint') }}</label>
            <template v-if="form.useGasProfile"><p>{{ ui('Seuil pièces : 300 € HT par appareil. Au-delà : déduction de 350 € HT, main-d’œuvre dans la limite de 8 h et déplacement. Le document porte ST 04 ; le fichier porte ST3.') }}</p>
            <label>{{ ui('Section technique applicable') }}<select v-model="form.gasSection" required><option value="">{{ ui('À valider') }}</option><option value="ST3">ST3</option><option value="ST4">ST4</option></select></label>
            <label>{{ ui('Responsable de la validation du contrat') }}<input v-model.trim="form.gasValidator" required /></label><label class="ops-check"><input v-model="form.gasValidated" type="checkbox" required />{{ ui('Je valide ces conditions et le rattachement à la section choisie.') }}</label></template>
          </fieldset>
          <fieldset class="full ops-contract-sla">
            <legend>{{ ui("Délais contractuels, depuis la réception de l’OI") }}</legend>
            <p class="ops-subtitle">{{ ui("Laissez vide en l’absence d’engagement. Ces délais s’appliquent aux nouvelles interventions.") }}</p>
            <div
              v-for="priority in ['P0', 'P1', 'P2', 'P3']"
              :key="priority"
              class="ops-sla-row"
            >
              <strong>{{ priority }}</strong
              ><label
                >{{ ui("Intervention (h)") }}<input
                  v-model.number="form.settings.sla[priority].interventionHours"
                  type="number"
                  min="0"
                  step="0.5" /></label
              ><label
                >{{ ui("Rétablissement (h)") }}<input
                  v-model.number="form.settings.sla[priority].restorationHours"
                  type="number"
                  min="0"
                  step="0.5"
              /></label>
              <label>{{ ui('Maximum downtime (h)') }}<input v-model.number="form.settings.sla[priority].maxDowntimeHours" type="number" min="0" step="0.5" /></label>
              <label class="ops-check"><input v-model="form.settings.sla[priority].onCall" type="checkbox" role="switch" />{{ ui('On-call coverage') }}</label>
            </div></fieldset
        ></template>
        <template v-if="editor.type === 'site'"
          ><label
            >{{ ui("Client") }}<select
              v-model="form.clientId"
              required
              @change="form.serviceContractId = ''"
            >
              <option value="">{{ ui("Choisir un client") }}</option>
              <option v-for="c in data.clients" :key="c.id" :value="c.id">
                {{ c.name }}
              </option>
            </select></label
          ><label
            >{{ ui("Contrat") }}<select v-model="form.serviceContractId">
              <option value="">{{ ui("Sans contrat rattaché") }}</option>
              <option
                v-for="c in data.serviceContracts?.filter(
                  (x) => x.clientId === form.clientId,
                )"
                :key="c.id"
                :value="c.id"
              >
                {{ c.name }}
              </option>
            </select></label
          ><label>{{ ui("Nom du site") }}<input v-model.trim="form.name" required /></label
          ><label
            >{{ ui("Code du site") }}<input v-model.trim="form.trigram" required /></label
          ><label>{{ ui("Commune") }}<input v-model.trim="form.commune" /></label
          ><label>{{ ui("Adresse") }}<input v-model.trim="form.address" /></label
        ></template>
        <template v-if="editor.type === 'workOrder'"
          ><label class="full">{{ ui('Call / request received at') }}<input v-model="form.receivedAt" type="datetime-local" required /></label><label class="full"
            >{{ ui("Objet de l’intervention") }}<input
              v-model.trim="form.title"
              required
              autofocus
              :placeholder='ui("Ex. Climatisation à l’arrêt · accueil")' /></label
          ><label
            >{{ ui("Site") }}<select
              v-model="form.siteId"
              required
              @change="form.assetId = ''"
            >
              <option value="">{{ ui("Choisir un site") }}</option>
              <option v-for="s in scoped.sites" :key="s.id" :value="s.id">
                {{ s.name }}
              </option>
            </select></label
          ><label
            >{{ ui("Équipement") }}<select v-model="form.assetId">
              <option value="">{{ ui("Non renseigné") }}</option>
              <option
                v-for="a in data.assets.filter((a) => a.siteId === form.siteId)"
                :key="a.id"
                :value="a.id"
              >
                {{ a.assetCode }} · {{ a.equipmentType }}
              </option>
            </select></label
          ><label
            >{{ ui("Référence OI client") }}<input
              v-model.trim="form.clientOiNumber" /></label
          ><label
            >{{ ui("Priorité") }}<select v-model="form.priority">
              <option>P0</option>
              <option>P1</option>
              <option>P2</option>
              <option>P3</option>
            </select></label
          ><label class="full"
            >{{ ui("Description") }}<textarea
              v-model="form.description"
              rows="4"
              :placeholder='ui("Symptômes, localisation, accès, contact sur place…")'
            ></textarea>
          </label>
          <p v-if="!scoped.sites.length" class="full">{{ ui("Ajoutez d’abord un site depuis Clients.") }}</p></template
        >
        <template v-if="editor.type === 'schedule'"
          ><label
            >{{ ui("Début du créneau") }}<input
              v-model="form.scheduledAt"
              type="datetime-local"
              required /></label
          ><label
            >{{ ui("Durée (minutes)") }}<input
              v-model.number="form.durationMinutes"
              type="number"
              min="15"
              max="1440"
              step="15"
              required /></label
          ><label class="full"
            >{{ ui("Intervenant responsable") }}<input
              v-model.trim="form.assigneeHuman"
              list="ops-technicians"
              required
              :placeholder='ui("Nom du technicien")'
            /><datalist id="ops-technicians">
              <option v-for="t in technicians" :key="t">{{ t }}</option>
            </datalist></label
          ><label class="full"
            >{{ ui("Consignes terrain") }}<textarea v-model="form.note" rows="3"></textarea>
          </label>
          <p class="full ops-subtitle">{{ ui("Les conflits de créneau sont contrôlés avant l’enregistrement.") }}</p></template
        >
        <template v-if="editor.type === 'field'"
          ><label
            >{{ ui("Technicien") }}<input
              v-model.trim="form.technicianName"
              required /></label
          ><label>{{ ui('Heure d’arrivée') }}<input v-model="form.startedAt" type="datetime-local" required /></label><label>{{ ui('Heure de départ') }}<input v-model="form.endedAt" type="datetime-local" required /></label><label
            >{{ ui("Diagnostic") }}<input v-model.trim="form.diagnosis" required /></label
          ><label class="full"
            >{{ ui("Travaux effectivement réalisés") }}<textarea
              v-model="form.workPerformed"
              rows="4"
              required
            ></textarea></label
          ><label
            >{{ ui("Mesures / contrôles") }}<textarea
              v-model="form.measurements"
              rows="3"
              :placeholder='ui("Une mesure par ligne")'
            ></textarea></label
          ><label
            >{{ ui("Pièces utilisées") }}<textarea
              v-model="form.partsUsed"
              rows="3"
              :placeholder='ui("Une pièce par ligne")'
            ></textarea></label
          ><label class="full"
            >{{ ui("Preuves photo") }}<input
              type="file"
              accept="image/*"
              multiple
              @change="savePhotos"
            /><span
              >{{ form.photoRefs?.length || 0 }}{{ ui("photo(s) conservée(s) dans le dossier") }}</span
            ></label
          ><label
            >{{ ui("Résultat") }}<select v-model="form.outcome">
              <option value="resolved">{{ ui("Travaux terminés") }}</option>
              <option value="waiting">{{ ui("En attente, intervention en cours") }}</option>
              <option value="repair">{{ ui("Réparation / pièces nécessaires") }}</option>
            </select></label
          ><label v-if="form.outcome === 'repair'"
            >{{ ui("Circuit réparation") }}<select v-model="form.repairMode">
              <option value="with_quote">{{ ui("Devis client requis") }}</option>
              <option value="without_quote">{{ ui("Selon contrat, sans devis") }}</option>
            </select></label
          ><label v-if="form.outcome === 'repair'" class="full"
            >{{ ui("Besoin à transmettre aux Achats") }}<textarea
              v-model="form.repairDescription"
              rows="2"
              required
            ></textarea>
          </label>
          <p class="full ops-subtitle">{{ ui("L’enregistrement trace ce que le technicien a réalisé ; le service fait client restera à recueillir.") }}</p></template
        >
        <template v-if="editor.type === 'process'">
          <template v-if="editor.step === 'purchase_order_signed'"><label>{{ ui('Signataire du BC') }}<input v-model.trim="form.signer" required /></label><label>{{ ui('Bon de commande à signer ou déjà signé') }}<select v-model="form.documentId" required><option value="">{{ ui('Choisir un document') }}</option><option v-for="doc in documentsFor(editor.workOrderId)" :key="doc.id" :value="doc.id">{{ doc.filename }}</option></select></label><CompanyPdfSignature v-if="form.documentId && documentsFor(editor.workOrderId).find(d => d.id === form.documentId)?.mimeType === 'application/pdf'" :key="form.documentId" class="full" :document="documentsFor(editor.workOrderId).find(d => d.id === form.documentId)" :signer="form.signer || ''" @signed="saveSignedOrder" /><label class="full">{{ ui('Joindre le bon de commande') }}<input type="file" accept=".pdf,image/*" @change="attachDocument($event, editor.workOrderId)" /></label></template>
          <template v-if="['purchase_order_returned','service_acceptance_requested'].includes(editor.step)">
            <p class="full ops-subtitle">{{ ui('Préparez et validez l’email, puis sélectionnez son reçu d’envoi. Un brouillon ne valide pas cette étape.') }}</p>
            <button type="button" class="bz-btn bz-btn--ghost full" @click="prepareProcessEmail">{{ ui('Préparer l’email') }}</button>
            <label class="full">{{ ui('Email transmis au client') }}<select v-model="form.outboxId" required><option value="">{{ ui('Choisir un envoi confirmé') }}</option><option v-for="mail in data.outbox.filter(m => m.workOrderId === editor.workOrderId && ['submitted','delivered'].includes(m.status) && m.channel === 'email')" :key="mail.id" :value="mail.id">{{ mail.subject }} · {{ mail.recipient }} · {{ statusLabel(mail.status) }}</option></select></label>
          </template>
          <p v-if="editor.step === 'billing_requested'" class="full ops-subtitle">{{ ui('Le dossier sera marqué à facturer. La facture reste à établir par le service facturation.') }}</p>
          <template v-if="editor.step === 'close'"><label>{{ ui('Nom du signataire client') }}<input v-model.trim="form.customerSignatory" required /></label><label>{{ ui('Référence de l’accord de clôture') }}<input v-model.trim="form.evidenceReference" required /></label></template>
          <label class="ops-check full"><input v-model="form.confirmed" type="checkbox" required />{{ ui('Je confirme cette validation et les preuves associées.') }}</label>
        </template>
        <template v-if="editor.type === 'acceptance'"
          ><label
            >{{ ui("Référence du service fait") }}<input
              v-model.trim="form.reference"
              required /></label
          ><label
            >{{ ui("Nom du signataire client") }}<input
              v-model.trim="form.customerSignatory"
              required /></label
          ><label class="full"
            >{{ ui("Document signé") }}<select v-model="form.documentId">
              <option value="">{{ ui("Déclaration du responsable, signataire nommé") }}</option>
              <option
                v-for="d in documentsFor(editor.workOrderId)"
                :key="d.id"
                :value="d.id"
              >
                {{ d.filename }}
              </option>
            </select></label
          ><label class="ops-check full"
            ><input v-model="form.confirmed" type="checkbox" required />{{ ui("Je confirme avoir reçu le service fait de ce client.") }}</label
          ></template
        >
        <template v-if="editor.type === 'procurement'"
          ><label class="full"
            >{{ ui("Besoin fournisseur") }}<textarea
              v-model="form.description"
              rows="3"
              required
            ></textarea></label
          ><label
            >{{ ui("Fournisseur") }}<select v-model="form.supplierId">
              <option value="">{{ ui("À choisir") }}</option>
              <option v-for="s in data.suppliers" :key="s.id" :value="s.id">
                {{ s.name }}
              </option>
            </select></label
          ><label
            >{{ ui("Responsable achats") }}<input
              v-model.trim="form.responsible"
              required /></label
          ><label v-if="form.id"
            >{{ ui("Avancement") }}<select v-model="form.status">
              <option v-for="s in procurementStates" :key="s" :value="s">
                {{ statusLabel(s) }}
              </option>
            </select></label
          ><label
            >{{ ui("Montant HT (€)") }}<input
              v-model.number="form.amount"
              type="number"
              min="0"
              step="0.01" /></label
          ><label
            >{{ ui("Référence proforma") }}<input
              v-model.trim="form.proformaReference"
              :required="form.status === 'proforma_received'" /></label
          ><label
            >{{ ui("Pièce proforma") }}<select v-model="form.proformaDocumentId">
              <option value="">{{ ui("Non jointe") }}</option>
              <option
                v-for="d in documentsFor(editor.workOrderId)"
                :key="d.id"
                :value="d.id"
              >
                {{ d.filename }}
              </option>
            </select></label
          ><label
            >{{ ui("Commande fournisseur") }}<input
              v-model.trim="form.orderReference"
              :required="form.status === 'ordered'" /></label
          ><label
            >{{ ui("Bon de livraison") }}<input
              v-model.trim="form.receiptReference"
              :required="
                ['received', 'partially_received'].includes(form.status)
              "
          /></label>
          <div class="full">
            <div class="ops-section-head">
              <h4>{{ ui("Lignes de commande") }}</h4>
              <button
                type="button"
                class="bz-btn bz-btn--ghost"
                @click="
                  form.items.push({ label: '', quantity: 1, received: 0 })
                "
              >{{ ui("Ajouter une ligne") }}</button>
            </div>
            <div v-for="(line, i) in form.items" :key="i" class="ops-line">
              <label>{{ ui("Pièce") }}<input v-model.trim="line.label" required /></label
              ><label
                >{{ ui("Quantité") }}<input
                  v-model.number="line.quantity"
                  type="number"
                  min="1"
                  required /></label
              ><label
                >{{ ui("Reçue") }}<input
                  v-model.number="line.received"
                  type="number"
                  min="0"
                  :max="line.quantity"
                  required
              /></label>
            </div>
          </div>
          <label
            v-if="
              [
                'ordered',
                'received',
                'partially_received',
                'cancelled',
              ].includes(form.status)
            "
            class="ops-check full"
            ><input v-model="form.confirmed" type="checkbox" required />{{ ui("Je confirme cette opération et ses références. Aucun achat n’est passé automatiquement.") }}</label
          ><button
            v-if="form.status === 'proforma_received'"
            type="button"
            class="bz-btn bz-btn--ghost full"
            @click="
              edit('quote', {
                workOrderId: editor.workOrderId,
                procurementId: form.id,
                parts: form.amount || 0,
              })
            "
          >{{ ui("Préparer le devis client à partir de cette proforma") }}</button></template
        >
        <template v-if="['quote', 'invoice'].includes(editor.type)"
          ><label v-if="editor.type === 'quote' && quotePricingProfile && form.quoteType === 'outside_bpu'">{{ ui('Contract equipment category') }}<select v-model="form.pricingCategory" required><option value="">{{ ui('Select a category') }}</option><option v-for="rule in pricingRules" :key="rule.id" :value="rule.id">{{ ui(rule.label) }}</option></select></label><label v-if="editor.type === 'quote'"
            >{{ ui("Méthode") }}<select v-model="form.quoteType">
              <option value="bpu">{{ ui("Pièces + main-d’œuvre") }}</option>
              <option value="outside_bpu">{{ ui("Franchise contractuelle + coefficient") }}</option>
              <option value="improvement">{{ ui("Amélioration + coefficient") }}</option>
            </select></label
          ><label
            >{{ editor.type === "quote" ? ui("Pièces HT (€)") : ui("Montant HT (€)")
            }}<input
              v-model.number="form.parts"
              type="number"
              min="0"
              step="0.01"
              required /></label
          ><template v-if="editor.type === 'quote'"
            ><label
              >{{ ui("Main-d’œuvre HT (€)") }}<input
                v-model.number="form.labor"
                type="number"
                min="0"
                step="0.01" /></label
            ><label
              >{{ ui("Déplacement HT (€)") }}<input
                v-model.number="form.travel"
                type="number"
                min="0"
                step="0.01" /></label
            ><label>{{ ui("Heures de main-d’œuvre") }}<input v-model.number="form.laborHours" type="number" min="0" step="0.25" /></label><label v-if="form.quoteType !== 'bpu'"
              >{{ ui("Coefficient contractuel") }}<input
                v-model.number="form.coefficient"
                type="number"
                min="0"
                step="0.01" /></label
            ><label v-if="form.quoteType === 'outside_bpu'"
              >{{ ui("Franchise (€)") }}<input
                v-model.number="form.franchise"
                type="number"
                min="0"
                step="0.01" /></label></template
          ><label
            >{{ ui("TVA (%)") }}<input
              v-model.number="form.vatRate"
              type="number"
              min="0"
              max="100"
              step="0.1"
          /></label>
          <div class="ops-dossier-next full">
            <span>{{ ui("Total TTC") }}</span
            ><strong class="bz-metric">{{
              quotePreview.error ? ui("À vérifier") : money(quotePreview.totalCents)
            }}</strong>
          </div></template
        >
        <template v-if="editor.type === 'quoteReview'"
          ><div class="ops-dossier-next full">
            <span>{{ form.quoteNumber }} · {{ statusLabel(form.status) }}</span
            ><strong class="bz-metric">{{ money(form.totalCents) }}</strong>
          </div>
          <button
            type="button"
            class="bz-btn bz-btn--ghost full"
            :disabled="busy"
            @click="generate('quote', form.workOrderId, form.id)"
          >{{ ui("Ouvrir le PDF / préparer l’envoi") }}</button
          ><template v-if="['sent', 'accepted'].includes(form.status)"
            ><label
              >{{ ui("Décision client") }}<select v-model="form.nextStatus">
                <option v-if="form.status === 'sent'" value="accepted">{{ ui("Accord reçu") }}</option>
                <option v-if="form.status === 'sent'" value="rejected">{{ ui("Refus reçu") }}</option>
                <option
                  v-if="form.status === 'accepted'"
                  value="purchase_order_received"
                >{{ ui("Bon de commande reçu") }}</option>
              </select></label
            ><label
              >{{ ui("Référence de la preuve") }}<input
                v-model.trim="form.evidenceReference"
                required
                :placeholder='ui("Email du client, document signé…")' /></label
            ><label v-if="form.nextStatus === 'purchase_order_received'"
              >{{ ui("Référence BC client") }}<input
                v-model.trim="form.purchaseOrder"
                required /></label
            ><label class="ops-check full"
              ><input v-model="form.confirmed" type="checkbox" required />{{ ui("Je confirme avoir reçu cette décision client.") }}</label
            ></template
          ></template
        >
        <template v-if="editor.type === 'message'"
          ><label
            >{{ ui("Canal") }}<select v-model="form.channel" @change="changeChannel">
              <option value="email">{{ ui("Email · avec PDF possible") }}</option>
              <option value="sms">{{ ui("SMS · texte") }}</option>
            </select></label
          ><label
            >{{ ui("Destinataire") }}<input
              v-model.trim="form.recipient"
              :type="form.channel === 'email' ? 'email' : 'tel'"
              required
              :placeholder="
                form.channel === 'sms' ? '+33…' : 'client@entreprise.fr'
              " /></label
          ><label class="full"
            >{{ ui("Expéditeur configuré") }}<input
              v-model.trim="form.sender"
              :type="form.channel === 'email' ? 'email' : 'tel'"
              required
              :placeholder='ui("Adresse vérifiée SendGrid ou numéro Twilio")' /></label
          ><label v-if="form.channel === 'email'" class="full"
            >{{ ui("Objet") }}<input v-model.trim="form.subject" required /></label
          ><label class="full"
            >{{ ui("Message") }}<textarea
              v-model="form.message"
              rows="5"
              required
            ></textarea></label
          ><label v-if="form.channel === 'email'" class="full"
            >{{ ui("Pièce jointe · version conservée") }}<select v-model="form.documentId">
              <option value="">{{ ui("Sans pièce jointe") }}</option>
              <option
                v-for="d in documentsFor(editor.workOrderId)"
                :key="d.id"
                :value="d.id"
              >
                {{ d.filename }}
              </option>
            </select></label
          ></template
        >
        <template v-if="editor.type === 'messageReview'"
          ><dl class="ops-review full">
            <div>
              <dt>{{ ui("Destinataire") }}</dt>
              <dd>{{ form.recipient }}</dd>
            </div>
            <div>
              <dt>{{ ui("Expéditeur") }}</dt>
              <dd>{{ form.sender }}</dd>
            </div>
            <div>
              <dt>{{ ui("État") }}</dt>
              <dd>
                {{ statusLabel(form.status) }}{{ ui("· version") }}{{ form.revision }}
              </dd>
            </div>
          </dl>
          <div class="ops-message-preview full">
            <h3>{{ form.subject }}</h3>
            <p>{{ form.message }}</p>
          </div>
          <button
            v-if="form.documentId"
            type="button"
            class="bz-btn bz-btn--ghost full"
            @click="
              preview(data.documents.find((d) => d.id === form.documentId))
            "
          >
            <span class="material-symbols-outlined" aria-hidden="true"
              >attach_file</span
            >{{
              data.documents.find((d) => d.id === form.documentId)?.filename ||
              ui("Pièce indisponible")
            }}</button
          ><label
            v-if="['draft', 'failed'].includes(form.status)"
            class="ops-check full"
            ><input v-model="form.confirmed" type="checkbox" required />{{ ui("J’autorise l’envoi réel de cette version à ce destinataire, pièce jointe incluse.") }}</label
          ><template v-if="form.status === 'unknown'"
            ><p class="full">{{ ui("Le fournisseur a peut-être accepté ce message. Vérifiez son journal avant toute relance.") }}</p>
            <label
              >{{ ui("Résultat vérifié") }}<select v-model="form.resolution">
                <option value="submitted">{{ ui("Accepté par le fournisseur") }}</option>
                <option value="failed">{{ ui("Non envoyé, relance possible") }}</option>
              </select></label
            ><label
              >{{ ui("Reçu fournisseur") }}<input
                v-model="form.providerId"
                :required="form.resolution === 'submitted'" /></label
            ><label class="full"
              >{{ ui("Preuve de la vérification") }}<textarea
                v-model="form.evidence"
                required
              ></textarea></label
          ></template>
          <p
            v-if="['submitted', 'delivered'].includes(form.status)"
            class="full ops-subtitle"
          >
            {{
              form.providerId
                ? ui("Reçu :") + form.providerId
                : ui("Le fournisseur n’a pas fourni d’identifiant consultable.")
            }}
          </p></template
        >
        <template v-if="editor.type === 'intake'">
          <button
            v-if="form.blobId"
            type="button"
            class="bz-btn bz-btn--ghost full"
            @click="
              preview({
                blobId: form.blobId,
                blobExt: form.originalName.split('.').pop().toLowerCase(),
                filename: form.originalName,
                mimeType: form.mimeType,
              })
            "
          >{{ ui("Ouvrir le document original") }}</button>
          <p class="full">
            {{ form.originalName }} ·
            {{
              form.error || ui("Relisez les champs proposés avant rattachement.")
            }}
          </p>
          <label
            >{{ ui("Type de pièce") }}<select v-model="form.documentType">
              <option
                v-for="(label, key) in documentTypes"
                :key="key"
                :value="key"
              >
                {{ label }}
              </option>
            </select></label
          ><label
            >{{ ui("Intervention") }}<select v-model="form.workOrderId">
              <option value="">{{ ui("Créer une OI (si type OI)") }}</option>
              <option v-for="w in orders" :key="w.id" :value="w.id">
                {{ w.workOrderNumber }} · {{ w.title }}
              </option>
            </select></label
          ><template
            v-if="form.documentType === 'work_order' && !form.workOrderId"
            ><label
              >{{ ui("Site") }}<select v-model="form.siteId" required>
                <option v-for="s in scoped.sites" :key="s.id" :value="s.id">
                  {{ s.name }}
                </option>
              </select></label
            ><label>{{ ui("Objet") }}<input v-model="form.title" required /></label
            ><label
              >{{ ui("Priorité confirmée") }}<select v-model="form.priority" required>
                <option>P0</option>
                <option>P1</option>
                <option>P2</option>
                <option>P3</option>
              </select></label
            ></template
          ><label v-for="(label, key) in intakeFields" :key="key"
            >{{ label }}<input v-model="form.extractedData[key]" /></label
          ><label v-if="form.documentType === 'supplier_proforma'" class="full"
            >{{ ui("Demande achats") }}<select v-model="form.procurementId" required>
              <option
                v-for="p in data.procurements.filter(
                  (p) => p.workOrderId === form.workOrderId,
                )"
                :key="p.id"
                :value="p.id"
              >
                {{ p.description }}
              </option>
            </select></label
          >
          <label v-if="form.documentType === 'supplier_proforma'"
            >{{ ui("Montant HT de la proforma (€)") }}<input
              v-model.number="form.intakeAmount"
              type="number"
              min="0"
              step="0.01"
              required
          /></label>
          <label v-if="form.documentType === 'purchase_order'" class="full"
            >{{ ui("Devis concerné") }}<select v-model="form.quoteId" required>
              <option
                v-for="q in data.quotes.filter(
                  (q) => q.workOrderId === form.workOrderId,
                )"
                :key="q.id"
                :value="q.id"
              >
                {{ q.quoteNumber }} · {{ money(q.totalCents) }}
              </option>
            </select></label
          >
          <details class="full">
            <summary>{{ ui("Texte extrait") }}</summary>
            <p class="ops-extracted">
              {{ form.extractedText || ui("Aucun texte disponible.") }}
            </p>
          </details>
          <label class="ops-check full"
            ><input v-model="form.confirmed" type="checkbox" required />{{ ui("J’ai vérifié les champs et le rattachement.") }}</label
          ></template
        >
        <template v-if="editor.type === 'cancel'"
          ><p class="full">{{ ui("L’intervention sera annulée et conservée dans l’historique.") }}</p>
          <label class="full"
            >{{ ui("Motif") }}<textarea v-model="form.note" required></textarea></label
          ><label class="ops-check full"
            ><input v-model="form.confirmed" type="checkbox" required />{{ ui("Confirmer l’annulation de cette intervention.") }}</label
          ></template
        >
        <footer class="full">
          <button
            type="button"
            class="bz-btn bz-btn--ghost"
            :disabled="busy"
            @click="closeEditor"
          >{{ ui("Fermer") }}</button
          ><button
            v-if="submitLabel"
            class="bz-btn bz-btn--primary"
            :disabled="busy"
          >
            {{ busy ? ui("En cours…") : submitLabel }}
          </button>
        </footer>
      </form>
    </GmaoDialog>
    <GmaoDialog
      v-if="previewDoc"
      :title="previewDoc.filename"
      :eyebrow='ui("DOCUMENT LOCAL · VERSION CONSERVÉE")'
      :busy="busy"
      @close="closePreview"
      ><iframe
        v-if="previewUrl && previewDoc.mimeType === 'application/pdf'"
        class="ops-pdf"
        :src="previewUrl"
        :title='ui("Aperçu PDF")'
      ></iframe
      ><img
        v-else-if="previewUrl && previewDoc.mimeType?.startsWith('image/')"
        :src="previewUrl"
        class="ops-photo"
        :alt='ui("Pièce du dossier")'
      />
      <p v-else>{{ ui("Le fichier est disponible au téléchargement.") }}</p>
      <div class="ops-dossier-actions">
        <a
          v-if="previewUrl"
          class="bz-btn bz-btn--ghost"
          :href="previewUrl"
          :download="previewDoc.filename"
          >{{ ui("Télécharger") }}</a
        ><button
          v-if="previewDoc.workOrderId"
          class="bz-btn bz-btn--primary"
          @click="composeDocument"
        >{{ ui("Joindre à un email") }}</button>
      </div></GmaoDialog
    >
    <CompanyTeamExchanges v-if="sharedPurchase" :company-id="store.state.activeId" :teams="store.state.companies" :procurement="sharedPurchase" @close="sharedPurchase=null" />
  </section>
</template>
<script setup>
import "./company-design.css";
import { useCompanyDraft } from "../../services/company/viewDrafts.js";
import CompanyRoutePlanner from "./CompanyRoutePlanner.vue";
import CompanyRecordFlow from "./CompanyRecordFlow.vue";
import { i18n } from "../../i18n/index.js";
import { operationText, operationError } from "../../i18n/operations.js";
const ui = (source,params) => operationText(source, i18n.state.locale, params);
import { computed, reactive, ref, watch, onBeforeUnmount } from "vue";
import CompanyTeamExchanges from "./CompanyTeamExchanges.vue";
import CompanyGmaoSettings from "./CompanyGmaoSettings.vue";
import CompanyContractPricing from './CompanyContractPricing.vue';
import CompanyTeamRouting from './CompanyTeamRouting.vue';
import CompanyMaintenanceControls from './CompanyMaintenanceControls.vue';
import { CCTP_PRICING_RULES, calculateContractQuote } from '../../services/company/contractPricing.js';
import CompanyWorkflowProgress from "./CompanyWorkflowProgress.vue";
import CompanyPdfSignature from "./CompanyPdfSignature.vue";
import { interventionProgress, GAS_CONTRACT_TERMS, calculateGasContractQuote, gasProfileApplies } from "../../services/company/gmaoProcess.js";
import GmaoDialog from "./GmaoDialog.vue";
import {
  statusLabel as rawStatusLabel,
  statusTone,
  nextAction as rawNextAction,
  scopedOperations,
  monthDays,
  dayKey,
} from "../../services/company/gmaoPresentation.js";
const statusLabel = value => ui(rawStatusLabel(value));
const processFor = w => interventionProgress(w, data.value);
const processActionLabel = step => ui(({purchase_order_signed:'Valider le BC signé',purchase_order_returned:'Valider le retour du BC',service_acceptance_requested:'Demander le service fait',billing_requested:'Transmettre à la facturation',close:'Clôturer après accord client',acceptance:'Enregistrer le service fait',quoteReview:'Ouvrir le devis',procurement:'Suivre la proforma'}[step]) || 'Continuer');
const nextAction = (value, purchases) => processFor(value).action !== 'advance' ? processActionLabel(processFor(value).action) : ui(rawNextAction(value,purchases));
import { needsMessageReview } from "../../services/company/workspaceNavigation.js";
import { importIntakeFile } from "../../services/company/intakeFiles.js";
import { calculateQuote } from "../../services/company/gmaoDomain.js";
const props = defineProps({
  gmao: Object,
  store: { type: Object, required: true },
  initialView: { type: String, default: "cockpit" },
  embedded: Boolean,
  integrated: Boolean,
  clientFilter: { type: String, default: "" },
  pendingApprovals: { type: Number, default: 0 },
  reviewQueue: Boolean,
  reviewDialogsOnly: Boolean,
});
const emit = defineEmits(["prepare-invoice", "open-invoice", "open-connectors", "open-review", "open-intake", "open-work", "open-task", "view-change", "update:client-filter"]);
const showMessageHistory = ref(false);
const store = props.store;
const sharedPurchase = ref(null);
const data = computed(() =>
  Object.assign(
    {
      clients: [],
      serviceContracts: [],
      suppliers: [],
      sites: [],
      assets: [],
      plans: [],
      workOrders: [],
      procurements: [],
      quotes: [],
      invoices: [],
      documents: [],
      events: [],
      attachmentSheets: [],
      outbox: [],
      handoffs: [],
      notifications: [],
      documentIntake: [],
    },
    props.gmao || {},
  ),
);
const aliases = {
  cockpit: "today",
  "work-orders": "interventions",
  preventive: "planning",
  finance: "interventions",
  ai: "documents",
  assets: "settings",
  compliance: "settings",
};
const view = ref(aliases[props.initialView] || props.initialView),
  clientId = ref(props.clientFilter),
  search = ref(""),
  filter = ref("all"),
  limit = ref(30),
  busy = ref(false),
  notice = ref(""),
  error = ref(false),
  formError = ref(""),
  selectedId = ref(null),
  editor = ref(null),
  form = reactive({}),
  previewDoc = ref(null),
  previewUrl = ref("");
useCompanyDraft(() => (props.store.state?.activeId || props.gmao?.companyId || props.gmao?.contract?.companyId || '') + ':gmao', {editor, form, selectedId});
const now = ref(Date.now());
const clock = setInterval(() => {
  now.value = Date.now();
}, 60000);
watch(clientId, value => {
  planningSite.value = "";
  if (props.integrated) emit('update:client-filter', value);
});
watch(() => props.clientFilter, value => { if (props.integrated) clientId.value = value; });
const month = ref(new Date()),
  technician = ref(""),
  planningSite = ref(""),
  planMode = ref("month");
watch(
  () => props.initialView,
  (v) => {
    view.value = aliases[v] || v;
    selectedId.value = null;
  },
);
watch(view, value => {
  if (!props.embedded || props.reviewQueue) return;
  if (['outbox', 'documents'].includes(value)) emit('open-review');
  else emit('view-change', value);
});
watch([search, filter, clientId], () => {
  limit.value = 30;
  selectedId.value = null;
});
const scoped = computed(() => scopedOperations(data.value, clientId.value)),
  orders = computed(() => scoped.value.workOrders);
// Inbox spans the team, including drafts whose work-order reference needs
// repair. Hiding these would leave an actionable badge with no visible item.
const reviewData = computed(() => props.reviewQueue ? data.value : scoped.value);
const reviewMessages = computed(() => props.reviewQueue && !showMessageHistory.value
  ? reviewData.value.outbox.filter(needsMessageReview) : reviewData.value.outbox);
const clientName = computed(
  () => data.value.clients.find((c) => c.id === clientId.value)?.name,
);
const selected = computed(() =>
  data.value.workOrders.find((w) => w.id === selectedId.value),
);
const closed = (w) => ["completed", "cancelled"].includes(w.status);
const clientOrders = (id) => {
  const sites = new Set(
    data.value.sites.filter((s) => s.clientId === id).map((s) => s.id),
  );
  return data.value.workOrders.filter((w) => sites.has(w.siteId));
};
const siteName = (id) =>
  data.value.sites.find((s) => s.id === id)?.name || ui("Site à renseigner");
const clientFor = (w) =>
  data.value.clients.find(
    (c) => c.id === data.value.sites.find((s) => s.id === w?.siteId)?.clientId,
  );
const woFor = (r) => data.value.workOrders.find((w) => w.id === r?.workOrderId);
const supplierName = (id) =>
  data.value.suppliers.find((s) => s.id === id)?.name;
const documentsFor = (id) =>
  data.value.documents.filter((d) => d.workOrderId === id);
const related = (key) =>
  (data.value[key] || []).filter((r) => r.workOrderId === selectedId.value);
const visibleClients = computed(() =>
  data.value.clients.filter((c) => props.integrated || !clientId.value || c.id === clientId.value),
);
const intake = computed(() =>
  data.value.documentIntake.filter(
    (d) =>
      d.status === "to_review" &&
      (!clientId.value ||
        !d.matchedWorkOrderId ||
        orders.value.some((w) => w.id === d.matchedWorkOrderId)),
  ),
);
const unplanned = computed(() =>
  orders.value.filter((w) => !closed(w) && !w.scheduledAt),
);
const attention = computed(() =>
  orders.value
    .filter((w) => !closed(w) || w.billingStatus === "ready_to_invoice")
    .sort(
      (a, b) =>
        ({ P0: 0, P1: 1, P2: 2, P3: 3 })[a.priority] -
          { P0: 0, P1: 1, P2: 2, P3: 3 }[b.priority] ||
        (a.scheduledAt || Infinity) - (b.scheduledAt || Infinity),
    ),
);
const todayOrders = computed(() =>
  orders.value
    .filter(
      (w) =>
        !closed(w) &&
        w.scheduledAt &&
        dayKey(w.scheduledAt) === dayKey(now.value),
    )
    .sort((a, b) => a.scheduledAt - b.scheduledAt),
);
const filteredOrders = computed(() =>
  orders.value.filter((w) => {
    const match =
      filter.value === "all" ||
      (filter.value === "open" && !closed(w)) ||
      (filter.value === "unplanned" && !closed(w) && !w.scheduledAt) ||
      filter.value === w.status;
    return (
      match &&
      [
        w.title,
        w.workOrderNumber,
        w.clientOiNumber,
        siteName(w.siteId),
        clientFor(w)?.name,
        data.value.assets.find((a) => a.id === w.assetId)?.assetCode,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.value.toLowerCase())
    );
  }),
);
const metrics = computed(() => [
  {
    get label() { return ui("Interventions ouvertes"); },
    value: orders.value.filter((w) => !closed(w)).length,
    get detail() { return ui("Dossiers actifs"); },
    view: "interventions",
    filter: "open",
    tone: "accent",
  },
  {
    get label() { return ui("À planifier"); },
    value: unplanned.value.length,
    get detail() { return ui("Prochaine étape : un créneau"); },
    view: "interventions",
    filter: "unplanned",
    tone: unplanned.value.length ? "warning" : "muted",
  },
  {
    get label() { return ui("Pièces attendues"); },
    value: orders.value.filter((w) => w.status === "waiting_parts").length,
    get detail() { return ui("Maintenance ↔ achats"); },
    view: "purchasing",
    tone: "warning",
  },
  {
    get label() { return ui("Service fait attendu"); },
    value: orders.value.filter((w) => w.status === "restored").length,
    get detail() { return ui("Preuve client avant facturation"); },
    view: "interventions",
    filter: "restored",
    tone: "info",
  },
]);
const navigation = computed(() => [
  { id: "today", get label() { return ui("Aujourd’hui"); }, icon: "space_dashboard" },
  { id: "interventions", get label() { return ui("Interventions"); }, icon: "assignment" },
  { id: "planning", get label() { return ui("Planning"); }, icon: "calendar_month" },
  { id: "clients", get label() { return ui("Clients"); }, icon: "domain" },
  {
    id: "purchasing",
    get label() { return ui("Demandes de pièces"); },
    icon: "shopping_bag",
    count: scoped.value.procurements.filter(
      (p) => !["received", "cancelled"].includes(p.status),
    ).length,
  },
  {
    id: "outbox",
    get label() { return ui("Messages"); },
    icon: "outbox",
    count: scoped.value.outbox.filter((m) =>
      ["draft", "unknown", "failed"].includes(m.status),
    ).length,
  },
  {
    id: "documents",
    get label() { return ui("À relire"); },
    icon: "description",
    count: intake.value.length,
  },
].filter(item => !props.embedded || !["outbox", "documents"].includes(item.id)));
const legend = computed(() => [
  {label:ui('Prise en compte'),code:'received'}, {label:ui('Intervention en cours'),code:'working'},
  {label:ui('Terminée par le technicien'),code:'finished'}, {label:ui('Devis à préparer'),code:'quote_needed'},
  {label:ui('Devis à transmettre'),code:'quote_ready'}, {label:ui('Accord client attendu'),code:'approval'},
  {label:ui('Service fait demandé'),code:'service'}, {label:ui('À facturer'),code:'billing'}, {label:ui('Clôturée'),code:'closed'},
]);
const technicians = computed(() => [
  ...new Set(
    [
      ...data.value.workOrders.map((w) => w.assigneeHuman),
      ...(
        store.activeCompany?.value?.humanRoster ||
        store.activeCompany?.humanRoster ||
        []
      ).map((h) => h.name || h.displayName),
    ].filter(Boolean),
  ),
]);
const calendarDays = computed(() => {
  if (planMode.value === "week") {
    const d = new Date(month.value);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return Array.from(
      { length: 7 },
      (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + i, 12),
    );
  }
  return monthDays(month.value);
});
const planningDate = (w) => w.scheduledAt || w.preventiveDueAt;
const planned = computed(() =>
  orders.value
    .filter(
      (w) =>
        planningDate(w) &&
        w.status !== "cancelled" &&
        (!planningSite.value || w.siteId === planningSite.value) &&
        (!technician.value || w.assigneeHuman === technician.value) &&
        (planMode.value === "week"
          ? calendarDays.value.some(
              (d) => dayKey(d) === dayKey(planningDate(w)),
            )
          : new Date(planningDate(w)).getMonth() === month.value.getMonth() &&
            new Date(planningDate(w)).getFullYear() ===
              month.value.getFullYear()),
    )
    .sort((a, b) => planningDate(a) - planningDate(b)),
);
const onDay = (d) =>
  orders.value
    .filter(
      (w) =>
        planningDate(w) &&
        w.status !== "cancelled" &&
        dayKey(planningDate(w)) === dayKey(d) &&
        (!planningSite.value || w.siteId === planningSite.value) &&
        (!technician.value || w.assigneeHuman === technician.value),
    )
    .sort((a, b) => planningDate(a) - planningDate(b));
function moveMonth(dir) {
  const d = new Date(month.value);
  if (planMode.value === "week") d.setDate(d.getDate() + dir * 7);
  else {
    d.setDate(1);
    d.setMonth(d.getMonth() + dir);
  }
  month.value = d;
}
const monthLabel = computed(() =>
  planMode.value === "week"
    ? ui("Semaine du") + " " +
      calendarDays.value[0].toLocaleDateString(i18n.state.locale, {
        day: "numeric",
        month: "long",
      })
    : month.value.toLocaleDateString(i18n.state.locale, {
        month: "long",
        year: "numeric",
      }),
);
const preventiveNotice = r => ui("{count} visites préparées.",{count:r.generated})+(r.skipped?.length?' '+ui("{count} gammes sans équipement correspondant.",{count:r.skipped.length}):'');
const todayLabel = computed(() =>
  new Date(now.value).toLocaleDateString(i18n.state.locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }),
);
const purchaseLanes = [
  { id: "requested", get label() { return ui("À prendre en charge"); }, statuses: ["requested"] },
  { id: "quote", get label() { return ui("Devis & commande"); }, statuses: ["proforma_received"] },
  {
    id: "waiting",
    get label() { return ui("En approvisionnement"); },
    statuses: ["ordered", "partially_received"],
  },
  { id: "received", get label() { return ui("Prêtes pour le terrain"); }, statuses: ["received"] },
];
const purchases = (lane) =>
  scoped.value.procurements.filter((p) => lane.statuses.includes(p.status));
const procurementStates = computed(() => {
  const state = editor.value?.status || "requested";
  return [
    state,
    ...({
      requested: ["proforma_received", "ordered", "cancelled"],
      proforma_received: ["ordered", "cancelled"],
      ordered: ["partially_received", "received", "cancelled"],
      partially_received: ["received"],
    }[state] || []),
  ];
});
const money = (v) =>
  new Intl.NumberFormat(i18n.state.locale, { style: "currency", currency: "EUR" }).format(
    Number(v || 0) / 100,
  );
const date = (v, withTime = true) =>
  v
    ? new Date(v).toLocaleString(i18n.state.locale, {
        day: "2-digit",
        month: "short",
        ...(withTime
          ? { hour: "2-digit", minute: "2-digit" }
          : { year: "numeric" }),
      })
    : ui("À planifier");
const time = (v) =>
  new Date(v).toLocaleTimeString(i18n.state.locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
const localInput = (v) =>
  v
    ? `${dayKey(v)}T${new Date(v).getHours().toString().padStart(2, "0")}:${new Date(v).getMinutes().toString().padStart(2, "0")}`
    : "";
const documentTypes = {
  get work_order() { return ui("Ordre d’intervention"); },
  get supplier_proforma() { return ui("Proforma fournisseur"); },
  get quote() { return ui("Devis"); },
  get purchase_order() { return ui("Bon de commande client"); },
  get service_acceptance() { return ui("Service fait"); },
  get invoice() { return ui("Facture"); },
  attachment_sheet: "Compte-rendu terrain",
  get unknown() { return ui("Autre pièce du dossier"); },
};
const intakeFields = {
  get clientOiNumber() { return ui("Référence OI client"); },
  get quoteNumber() { return ui("Référence devis"); },
  get purchaseOrder() { return ui("Référence BC"); },
  get serviceAcceptanceReference() { return ui("Référence service fait"); },
  get proformaReference() { return ui("Référence proforma"); },
};
function eventLabel(type) {
  return (
    {
      get created() { return ui("Dossier créé"); },
      get scheduled() { return ui("Créneau mis à jour"); },
      attachment_recorded: "Compte-rendu terrain",
      get procurement_updated() { return ui("Achats mis à jour"); },
      get purchasing_acknowledged() { return ui("Achats pris en charge"); },
      get message_submitted() { return ui("Message accepté pour envoi"); },
      get delivery_reconciled() { return ui("Envoi rapproché"); },
      get service_acceptance_received() { return ui("Service fait reçu"); },
      get invoice_created() { return ui("Facture préparée"); },
      get quote_updated() { return ui("Décision sur le devis"); },
      get evidence_added() { return ui("Preuve ajoutée"); },
    }[type] || ui("Mise à jour du dossier")
  );
}
function open(w) {
  if (w) selectedId.value = w.id;
}
async function act(fn, success) {
  if (busy.value) return;
  busy.value = true;
  error.value = false;
  try {
    const result = await fn();
    notice.value =
      typeof success === "function"
        ? success(result)
        : success || ui("Enregistré.");
    return result;
  } catch (e) {
    error.value = true;
    notice.value = operationError(e, i18n.state.locale) || ui("L’opération a échoué.");
    formError.value = notice.value;
  } finally {
    busy.value = false;
  }
}
function edit(type, row = {}) {
  formError.value = "";
  editor.value = {
    ...row,
    type,
    workOrderId:
      row.workOrderId ||
      (["schedule", "field", "acceptance", "cancel"].includes(type)
        ? row.id
        : undefined),
  };
  for (const k of Object.keys(form)) delete form[k];
  const wo = woFor(editor.value),
    client = clientFor(wo),
    contract = data.value.serviceContracts.find(
      (c) =>
        c.id ===
        data.value.sites.find((s) => s.id === wo?.siteId)?.serviceContractId,
    );
  Object.assign(form, {
    clientId: clientId.value,
    priority: "P2",
    durationMinutes: 60,
    quoteType: "bpu",
    parts: 0,
    labor: 0,
    travel: 0,
    franchise: 0,
    coefficient: 1,
    vatRate: contract?.vatRate ?? 0,
    items: [],
    status: "requested",
    requestType: "supply",
    resolved: true,
    outcome: "resolved",
    repairMode: "with_quote",
    photoRefs: [],
    ...JSON.parse(JSON.stringify(row)),
    confirmed: false,
  });
  if (type === "workOrder") {
    form.requestKey = crypto.randomUUID();
    form.receivedAt = localInput(Date.now());
    delete form.id;
  }
  if (type === "schedule") form.scheduledAt = localInput(row.scheduledAt);
  if (type === "contract") {
    form.useGasProfile = !!form.settings?.gasFranchise;
    form.gasSection = form.settings?.gasFranchise?.technicalSection || '';
    form.gasValidator = form.settings?.gasFranchise?.validatedBy || '';
    form.gasValidated = false;
    form.pricingValidated = false;
    form.settings ||= {};
    form.settings.sla ||= {};
    for (const p of ["P0", "P1", "P2", "P3"]) form.settings.sla[p] ||= {};
  }
  if (type === "field") {
    delete form.id;
    form.technicianName = wo?.assigneeHuman || "";
    form.startedAt = localInput(wo?.interventionStartedAt);
    form.endedAt = localInput(Date.now());
    form.measurements = "";
    form.partsUsed = "";
  }
  if (type === "contract") {
    form.startsAt = row.startsAt ? dayKey(row.startsAt) : "";
    form.endsAt = row.endsAt ? dayKey(row.endsAt) : "";
  }
  if (type === "procurement") {
    form.amount = Number(row.amountCents || 0) / 100;
    form.items = row.items?.length
      ? JSON.parse(JSON.stringify(row.items))
      : [{ label: row.description || "", quantity: 1, received: 0 }];
  }
  if (type === "invoice") {
    const q = data.value.quotes.find((q) => q.workOrderId === wo?.id);
    form.parts = Number(q?.subtotalCents || 0) / 100;
    form.vatRate = q?.vatRate ?? contract?.vatRate ?? 0;
  }
  if (type === "quoteReview")
    form.nextStatus =
      row.status === "accepted" ? "purchase_order_received" : "accepted";
  if (type === "message") {
    delete form.id;
    form.channel = row.channel || "email";
    form.recipient = row.recipient || client?.email || "";
    form.sender = "";
    form.subject =
      row.subject ||
      ui("Intervention {reference}", {reference:wo?.clientOiNumber || wo?.workOrderNumber || ""});
    form.message =
      row.message ||
      (wo?.scheduledAt
        ? ui("Visite prévue : {reference}, {site}, {date}.", {reference:wo.clientOiNumber||wo.workOrderNumber,site:siteName(wo.siteId),date:date(wo.scheduledAt)})
        : ui("Bonjour, Voici les informations concernant votre intervention. Cordialement."));
    form.requestKey = row.notificationId ? `notification-${row.notificationId}` : crypto.randomUUID();
  }
  if (type === "intake") {
    form.intakeAmount = Number(row.extractedData?.totalHtCents || 0) / 100;
    form.extractedData = { ...row.extractedData };
    form.workOrderId = row.matchedWorkOrderId || "";
  }
  if (type === "messageReview") form.resolution = "submitted";
}
function closeEditor() {
  if (!busy.value) editor.value = null;
}
function changeChannel() {
  const client = clientFor(woFor(editor.value));
  form.recipient =
    form.channel === "sms" ? client?.phone || "" : client?.email || "";
  form.sender = "";
  if (form.channel === "sms") form.documentId = null;
}
const titles = {
  get client() { return ui("Client"); },
  get site() { return ui("Site d’intervention"); },
  get contract() { return ui("Contrat client"); },
  get supplier() { return ui("Fournisseur"); },
  get workOrder() { return ui("Nouvelle intervention"); },
  get schedule() { return ui("Planifier l’intervention"); },
  field: "Compte-rendu terrain",
  get acceptance() { return ui("Recevoir le service fait"); },
  get procurement() { return ui("Demande achats"); },
  get quote() { return ui("Préparer le devis"); },
  get invoice() { return ui("Préparer la facture"); },
  get quoteReview() { return ui("Devis & accord client"); },
  get message() { return ui("Préparer un message"); },
  get messageReview() { return ui("Vérifier la communication"); },
  get intake() { return ui("Relire le document"); },
  get cancel() { return ui("Annuler l’intervention"); },
};
const editorTitle = computed(() => editor.value?.type === "process" ? processActionLabel(editor.value.step) : titles[editor.value?.type] || ui("Dossier"));
const pricingAsset = computed(() => data.value.assets.find(a => a.id === woFor(editor.value || {})?.assetId));
const pricingRules = computed(() => CCTP_PRICING_RULES.filter(rule => rule.section === pricingAsset.value?.technicalSection && (!rule.domain || rule.domain === pricingAsset.value?.domainCode)));
const quotePricingProfile = computed(() => {
  const wo = woFor(editor.value || {}), site = data.value.sites.find(s => s.id === wo?.siteId);
  return data.value.serviceContracts.find(c => c.id === site?.serviceContractId)?.settings?.pricingProfile;
});
const quotePreview = computed(() => {
  const raw = {quoteType:editor.value?.type === 'invoice' ? 'bpu' : form.quoteType, partsCents:Math.round(Number(form.parts||0)*100), laborCents:Math.round(Number(form.labor||0)*100), travelCents:Math.round(Number(form.travel||0)*100), accessCents:Math.round(Number(form.access||0)*100), franchiseCents:Math.round(Number(form.franchise||0)*100), laborHours:form.laborHours, coefficient:form.coefficient, vatRate:form.vatRate};
  const wo = woFor(editor.value || {}), site = data.value.sites.find(s => s.id === wo?.siteId), asset = data.value.assets.find(a => a.id === wo?.assetId);
  const profile = data.value.serviceContracts.find(c => c.id === site?.serviceContractId)?.settings?.gasFranchise;
  raw.pricingCategory = form.pricingCategory;
  try { return gasProfileApplies(profile, asset, raw.quoteType) ? calculateGasContractQuote(raw,profile) : quotePricingProfile.value && raw.quoteType === 'outside_bpu' && asset?.domainCode !== 'REG' ? calculateContractQuote(raw, quotePricingProfile.value, asset) : calculateQuote(raw); }
  catch(error) { return {...raw, error:error.message}; }
});
const submitLabel = computed(() => {
  if (editor.value?.type === "quoteReview")
    return ["sent", "accepted"].includes(form.status)
      ? ui("Enregistrer la décision")
      : null;
  if (editor.value?.type === "messageReview")
    return ["draft", "failed"].includes(form.status)
      ? ui("Valider & envoyer réellement")
      : form.status === "unknown"
        ? ui("Enregistrer le rapprochement")
        : ["submitted", "delivered"].includes(form.status) && form.providerId
          ? ui("Vérifier la livraison")
          : null;
  return (
    {
      get message() { return ui("Conserver le brouillon"); },
      get acceptance() { return ui("Enregistrer le service fait"); },
      get field() { return ui("Enregistrer le compte-rendu"); },
      get cancel() { return ui("Confirmer l’annulation"); },
      get intake() { return ui("Valider le rattachement"); },
    }[editor.value?.type] || ui("Enregistrer")
  );
});
async function submitEditor() {
  if (!editor.value || busy.value) return;
  const e = { ...editor.value },
    f = JSON.parse(JSON.stringify(form));
  delete f.type;
  const result = await act(
    async () => {
      switch (e.type) {
        case "client":
          return store.saveGmaoClient(f);
        case "site":
          return store.saveGmaoSite(f);
        case "supplier":
          return store.saveGmaoSupplier(f);
        case "contract":
          f.settings ||= {};
          if (f.useGasProfile) f.settings.gasFranchise = {...GAS_CONTRACT_TERMS, technicalSection:f.gasSection, validatedBy:f.gasValidator, validatedAt: f.gasValidated ? Date.now() : null};
          else delete f.settings.gasFranchise;
          for (const policy of Object.values(f.settings.sla))
            for (const key of ["interventionHours", "restorationHours", "maxDowntimeHours"])
              if (policy[key] === "") policy[key] = null;
          return store.saveGmaoServiceContract({
            ...f,
            startsAt: f.startsAt ? new Date(f.startsAt).getTime() : null,
            endsAt: f.endsAt ? new Date(f.endsAt).getTime() : null,
          });
        case "workOrder":
          return store.createGmaoWorkOrder({
            ...f,
            receivedAt: new Date(f.receivedAt).getTime(),
            assetId: f.assetId || null,
          });
        case "schedule": {
          const w = woFor(e);
          const payload = {
            scheduledAt: new Date(f.scheduledAt).getTime(),
            durationMinutes: Number(f.durationMinutes),
            assigneeHuman: f.assigneeHuman,
            note: f.note,
          };
          await store.updateGmaoWorkOrder(w.id, payload);
          return ["reported", "triaged", "waiting_parts"].includes(w.status)
            ? store.transitionGmaoWorkOrder(w.id, "assigned", payload)
            : true;
        }
        case "field":
          return store.recordGmaoAttachmentSheet(e.workOrderId, {
            ...f,
            resolved: f.outcome === "resolved", waiting: f.outcome === "waiting",
            startedAt: new Date(f.startedAt).getTime(),
            endedAt: new Date(f.endedAt).getTime(),
            measurements: String(f.measurements || "")
              .split("\n")
              .filter(Boolean),
            partsUsed: String(f.partsUsed || "")
              .split("\n")
              .filter(Boolean),
          });
        case "process":
          return store.validateGmaoProcessStep(e.workOrderId, {...f, step:e.step});
        case "acceptance":
          return store.recordGmaoServiceAcceptance(e.workOrderId, {
            ...f,
            documentId: f.documentId || null,
          });
        case "procurement": {
          const p = await store.saveGmaoProcurement({
            ...f,
            workOrderId: e.workOrderId,
            amountCents: Math.round(Number(f.amount || 0) * 100),
            supplierName: supplierName(f.supplierId),
            supplierId: f.supplierId || null,
            proformaDocumentId: f.proformaDocumentId || null,
          });
          return p;
        }
        case "quote":
          if (quotePreview.value.error) throw new Error(quotePreview.value.error);
          return store.createGmaoQuote(e.workOrderId, {
            ...quotePreview.value,
            laborHours: form.laborHours,
            procurementId: f.procurementId || null,
            useCatalog: false,
          });
        case "invoice":
          return store.saveGmaoInvoice({
            workOrderId: e.workOrderId,
            subtotalCents: Math.round(Number(f.parts || 0) * 100),
            vatRate: Number(f.vatRate || 0),
          });
        case "quoteReview":
          return store.updateGmaoQuote(f.id, {
            status: f.nextStatus,
            purchaseOrder: f.purchaseOrder,
            evidenceReference: f.evidenceReference,
          });
        case "message":
          return store.saveGmaoOutbox({
            ...f,
            workOrderId: e.workOrderId,
            documentId: f.documentId || null,
          });
        case "messageReview":
          if (["draft", "failed"].includes(f.status))
            return store.sendGmaoOutbox(f.id, {
              confirmed: f.confirmed,
              revision: f.revision,
            });
          else if (f.status === "unknown")
            return store.resolveGmaoOutbox(f.id, {
              status: f.resolution,
              evidence: f.evidence,
              providerId: f.providerId,
            });
          else return store.checkGmaoDelivery(f.id);
        case "intake":
          if (f.documentType === "supplier_proforma")
            f.extractedData.totalHtCents = Math.round(
              Number(f.intakeAmount) * 100,
            );
          return store.applyGmaoDocumentIntake(f.id, {
            ...f,
            workOrderId: f.workOrderId || null,
          });
        case "cancel":
          return store.transitionGmaoWorkOrder(e.workOrderId, "cancelled", {
            note: f.note,
          });
      }
    },
    (r) =>
      e.type === "messageReview"
        ? statusLabel(r?.status)
        : ui("Enregistré dans le dossier."),
  );
  if (error.value) return;
  editor.value = null;
  if (e.type === "workOrder") open(result);
  if (e.type === "quote") edit("quoteReview", result);
  if (e.type === "message") edit("messageReview", result);
  if (e.type === "invoice") await generate("invoice", e.workOrderId, result.id);
}
function prepareProcessEmail() {
  const wo = woFor(editor.value), step = editor.value.step, process = processFor(wo);
  edit('message', { workOrderId:wo.id, documentId:step === 'purchase_order_returned' ? process.facts.signed?.evidence?.documentId : null,
    subject:ui(step === 'purchase_order_returned' ? 'Retour du bon de commande signé' : 'Demande de service fait'),
    message: step === 'purchase_order_returned' ? ui('Veuillez trouver le bon de commande signé en pièce jointe.') : ui('Les travaux sont terminés. Merci de nous transmettre le numéro de service fait pour cette intervention.') });
}
async function advance(w) {
  const process = processFor(w);
  if (['purchase_order_signed','purchase_order_returned','service_acceptance_requested','billing_requested','close'].includes(process.action)) return edit('process', {workOrderId:w.id, step:process.action});
  if (process.action === 'quoteReview') return edit('quoteReview', data.value.quotes.find(q => q.workOrderId === w.id));
  if (process.action === 'procurement') { const p = data.value.procurements.find(p => p.workOrderId === w.id); return edit('procurement', p || {workOrderId:w.id,requestType:'proforma'}); }
  if (process.action === 'acceptance') return edit('acceptance', w);
  const action = {
    reported: "triaged",
    assigned: "acknowledged",
    acknowledged: "en_route",
    en_route: "on_site",
  }[w.status];
  if (action)
    return act(
      () =>
        store.transitionGmaoWorkOrder(w.id, action, {
          actorName: w.assigneeHuman,
          get note() { return ui("État confirmé dans le dossier par l’utilisateur."); },
        }),
      ui("État enregistré."),
    );
  if (["triaged", "waiting_parts"].includes(w.status))
    return edit("schedule", w);
  if (w.status === "on_site") return edit("field", w);
  if (w.status === "restored") return edit("acceptance", w);
  if (w.status === "completed") return edit("invoice", { workOrderId: w.id });
}
async function savePhotos(event) {
  for (const file of [...(event.target.files || [])]) {
    const doc = await act(
      () =>
        store.saveGmaoDocumentFile(file, {
          workOrderId: editor.value.workOrderId,
          category: "field_photo",
        }),
      ui("Photo enregistrée."),
    );
    if (doc) form.photoRefs.push(doc.id);
  }
  event.target.value = "";
}
async function saveSignedOrder({file,metadata}) {
  const doc = await act(() => store.saveGmaoDocumentFile(file,{workOrderId:editor.value.workOrderId,category:'purchase_order',metadata}),ui('Copie signée conservée. Vérifiez-la avant validation.'));
  if (doc) { form.documentId=doc.id; await preview(doc); }
}
async function attachDocument(event, id) {
  const file = event.target.files?.[0];
  if (file) {
    const doc = await act(
      () =>
        store.saveGmaoDocumentFile(file, {
          workOrderId: id,
          category: "evidence",
        }),
      ui("Pièce jointe enregistrée."),
    );
    if (doc && editor.value?.step === "purchase_order_signed") form.documentId=doc.id;
  }
  event.target.value = "";
}
// The Inbox reuses these validated forms; selecting a queue item never sends it.
function openReview(kind, id) {
  const collection = { document:'documentIntake', message:'outbox', notification:'notifications' }[kind];
  const row = data.value[collection]?.find(item => item.id === id);
  if (!row) return;
  if (kind === 'notification') edit('message', { ...row, notificationId:row.id, channel:'email' });
  else edit(kind === 'document' ? 'intake' : 'messageReview', row);
}
function openWorkOrder(id) {
  open(data.value.workOrders.find(work => work.id === id));
}
defineExpose({ openReview, importIntake, openWorkOrder });
async function importIntake(event) {
  const file = event.target.files?.[0];
  if (file) {
    const d = await act(
      () => importIntakeFile(store.state.activeId, file),
      ui("Document saved. The team will process it in the background."),
    );
    if (d) emit("open-intake");
  }
  event.target.value = "";
}
async function generate(kind, workOrderId, recordId) {
  const doc = await act(
    () => store.generateGmaoDocument({ kind, workOrderId, recordId }),
    ui("Version PDF conservée dans le dossier."),
  );
  if (doc) await preview(doc);
}
async function preview(doc) {
  if (!doc) return;
  closePreview();
  await act(async () => {
    if (!doc.blobId || !window.electronAPI?.db?.blobs?.read)
      throw new Error(ui("Le fichier local n’est pas disponible."));
    const encoded = await window.electronAPI.db.blobs.read(
      doc.blobId,
      doc.blobExt,
    );
    const bytes =
      typeof encoded === "string"
        ? Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
        : new Uint8Array(encoded);
    previewUrl.value = URL.createObjectURL(
      new Blob([bytes], { type: doc.mimeType || "application/octet-stream" }),
    );
    previewDoc.value = doc;
  }, ui("Document ouvert."));
}
function closePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = "";
  previewDoc.value = null;
}
function composeDocument() {
  const doc = previewDoc.value;
  closePreview();
  edit("message", {
    workOrderId: doc.workOrderId,
    documentId: doc.id,
    subject:
      doc.category === "quote"
        ? ui("Votre devis")
        : ui("Votre document d’intervention"),
    get message() { return ui("Bonjour, Veuillez trouver votre document en pièce jointe. Cordialement."); },
  });
}
onBeforeUnmount(() => {
  clearInterval(clock);
  closePreview();
});
</script>

<style scoped>
.ops-page-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:12px;padding:0 0 20px;margin-bottom:20px;border-bottom:1px solid var(--bz-border)}
.ops-page-toolbar>label{display:flex;align-items:center;gap:8px;min-width:0}.ops-page-toolbar select{max-width:260px}
.ops-page-toolbar__actions{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
@media(max-width:600px){.ops-page-toolbar__actions{width:100%;margin-left:0}.ops-page-toolbar>label{flex:1}.ops-page-toolbar select{width:100%}}

.ops-heading--embedded{padding-block:0 12px !important}.ops-heading--embedded .ops-subtitle{margin:0}.ops-history-toggle{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--bz-fg-mid);margin:0 0 16px}.operations .ops-history-toggle input{accent-color:var(--bz-accent);width:16px;height:16px;min-height:16px;flex:0 0 16px;padding:0;margin:0}.operations--review .ops-section-head:not(:first-child){margin-top:24px;padding-top:20px;border-top:1px solid var(--bz-border)}

.ops-contract-sla {
  border: 1px solid var(--bz-border);
  border-radius: 12px;
  padding: 16px;
}
.ops-contract-sla legend {
  font-size: 13px;
}
.ops-sla-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 0;
  flex-wrap: wrap;
}
.ops-sla-row label {
  flex: 1;
  min-width: 0;
}

.operations {
  --ops-radius: 12px;
  color: var(--bz-fg);
  width: 100%;
  min-width: 0;
  padding: 4px 0 24px;
  font-size: 14px;
  line-height: 1.5;
  font-family: var(--bz-font-body);
}
.operations * {
  box-sizing: border-box;
}
.operations h2,
.operations h3,
.operations h4,
.ops-form h3,
.ops-dossier h3 {
  color: var(--bz-fg);
  margin: 0;
}
.ops-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}
.ops-heading h2 {
  font-size: 32px;
  line-height: 1.15;
  margin: 7px 0 10px;
}
.ops-overline {
  font-size: 11px;
  color: var(--bz-fg-mid);
  margin: 0 0 8px;
}
.ops-subtitle {
  color: var(--bz-fg-mid);
  margin: 4px 0;
  font-size: 13px;
}
.ops-subtitle span {
  margin: 0 8px;
}
.ops-context {
  display: flex;
  gap: 14px;
  align-items: center;
  border-top: 1px solid var(--bz-border);
  padding: 12px 0;
}
.ops-context > label {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ops-context select {
  max-width: 240px;
}
.ops-local {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--bz-fg-mid);
  font-size: 12px;
  flex: 1;
}
.ops-local .material-symbols-outlined {
  font-size: 16px;
}
.ops-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid var(--bz-border);
  overflow-x: auto;
  margin-bottom: 24px;
  scrollbar-width: thin;
}
.ops-nav button {
  display: flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  padding: 13px 12px;
  color: var(--bz-fg-mid);
  font: inherit;
  cursor: pointer;
}
.ops-nav button[aria-current] {
  color: var(--bz-fg);
  border-color: var(--bz-accent);
  background: var(--bz-accent-soft);
}
.ops-nav .material-symbols-outlined {
  font-size: 18px;
}
.ops-count {
  background: var(--bz-raised);
  padding: 0 6px;
  border-radius: 4px;
  color: var(--bz-fg);
}
.ops-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-left: 3px solid var(--bz-accent);
  background: var(--bz-accent-soft);
  color: var(--bz-fg);
  padding: 12px 16px;
  margin-bottom: 16px;
}
.ops-notice.error {
  border-color: var(--bz-danger);
  background: color-mix(in srgb, var(--bz-danger) 8%, var(--bz-card));
}
.ops-notice button {
  background: none;
  border: 0;
  color: inherit;
  font-size: 20px;
  cursor: pointer;
}
.ops-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--bz-border);
  border-radius: var(--ops-radius);
  background: var(--bz-panel);
  margin-bottom: 32px;
  overflow: hidden;
}
.ops-metrics > button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 20px 24px;
  border: 0;
  border-right: 1px solid var(--bz-border);
  background: none;
  text-align: left;
  color: var(--bz-fg);
  cursor: pointer;
}
.ops-metrics > button:last-child {
  border: 0;
}
.ops-metrics > button:hover {
  background: var(--bz-raised);
}
.ops-metrics strong {
  font-size: 40px;
  line-height: 1;
}
.ops-metrics span {
  font-size: 13px;
}
.ops-metrics small {
  font-size: 11px;
  color: var(--bz-fg-mid);
}
.ops-cockpit {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(270px, 1fr);
  gap: 32px;
}
.ops-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.ops-section-head h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 600;
}
.ops-task {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 18px 0;
  background: none;
  border: 0;
  border-bottom: 1px solid var(--bz-border);
  color: var(--bz-fg);
  text-align: left;
  cursor: pointer;
  font: inherit;
}
.ops-task:hover {
  background: var(--bz-panel);
}
.ops-task-main {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}
.ops-task-main small,
.ops-task-main > span {
  font-size: 12px;
  color: var(--bz-fg-mid);
}
.ops-task-main strong {
  font-size: 15px;
  overflow-wrap: anywhere;
}
.ops-priority {
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
  background: color-mix(in srgb, currentColor 5%, transparent);
  border-radius: var(--bz-r-sm);
  flex: 0 0 36px;
  text-align: center;
  padding: 6px 0;
  font-size: 11px;
}
.ops-next {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  max-width: 190px;
  color: var(--bz-fg-mid);
  font-size: 12px;
}
.ops-next .material-symbols-outlined {
  font-size: 18px;
  color: var(--bz-accent);
}
.ops-day {
  background: var(--bz-panel);
  border: 1px solid var(--bz-border);
  padding: 22px;
  border-radius: var(--ops-radius);
}
.ops-agenda-item {
  display: flex;
  gap: 14px;
  width: 100%;
  text-align: left;
  padding: 18px 0;
  background: none;
  border: 0;
  border-bottom: 1px solid var(--bz-border);
  color: var(--bz-fg);
  cursor: pointer;
}
.ops-agenda-item time {
  font-size: 22px;
  min-width: 56px;
  flex-shrink: 0;
  color: var(--bz-accent);
}
.ops-agenda-item small,
.ops-summary small,
.ops-document small {
  display: block;
  color: var(--bz-fg-mid);
  margin-top: 4px;
  font-size: 12px;
}
.ops-empty {
  display: flex;
  align-items: center;
  text-align: center;
  flex-direction: column;
  gap: 10px;
  padding: 48px 20px;
  color: var(--bz-fg-mid);
}
.ops-empty > .material-symbols-outlined {
  font-size: 38px;
  color: var(--bz-accent);
}
.ops-empty h3 {
  font-size: 20px;
  color: var(--bz-fg);
}
.ops-empty p {
  max-width: 420px;
  margin: 0 0 10px;
}
.ops-empty-text {
  font-size: 13px;
  color: var(--bz-fg-mid);
  padding: 18px 0;
}
.ops-summary {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  text-align: left;
  padding: 12px 0;
  background: none;
  border: 0;
  border-bottom: 1px solid var(--bz-border);
  color: var(--bz-fg);
  cursor: pointer;
  font: inherit;
  overflow-wrap: anywhere;
}
.ops-summary .bz-metric {
  font-size: 22px;
}
.ops-day > .ops-summary {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  min-height: 56px;
  padding: var(--bz-space-3) var(--bz-space-4);
  border-radius: var(--bz-r);
}
.ops-day > .ops-summary > span {
  min-width: 0;
  line-height: 1.5;
}
.ops-day > .ops-summary > .bz-metric {
  min-width: 3ch;
  text-align: right;
  line-height: 1.2;
  white-space: nowrap;
}
.ops-runtime-note {
  font-size: 12px;
  color: var(--bz-fg-mid);
  margin-top: 24px;
  line-height: 1.65;
}
.ops-divider {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--bz-border);
}
.ops-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.ops-search {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 220px;
}
.ops-search input {
  width: 100%;
}
.operations input,
.operations select,
.ops-form input:not([type="checkbox"]),
.ops-form select,
.ops-form textarea {
  font: inherit;
  box-sizing: border-box;
  min-width: 0;
  width: 100%;
  border: 1px solid var(--bz-border-strong);
  border-radius: 8px;
  background: var(--bz-panel);
  color: var(--bz-fg);
  padding: 10px 12px;
  min-height: 42px;
}
.operations select {
  width: auto;
  max-width: 100%;
}
.ops-table-wrap {
  overflow: auto;
  border-top: 1px solid var(--bz-border);
}
.ops-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 660px;
}
.ops-table th {
  font-weight: 500;
  font-size: 11px;
  color: var(--bz-fg-mid);
  padding: 12px 16px;
  text-align: left;
}
.ops-table td {
  border-top: 1px solid var(--bz-border);
  padding: 17px 16px;
  vertical-align: middle;
}
.ops-table td small {
  display: block;
  color: var(--bz-fg-mid);
  margin-top: 3px;
}
.ops-title-link {
  font: inherit;
  text-align: left;
  background: none;
  border: 0;
  color: var(--bz-fg);
  cursor: pointer;
  max-width: 350px;
  padding: 0;
}
.ops-title-link strong {
  display: block;
  margin-top: 4px;
}
.ops-status {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  line-height: 1.4;
  padding: 5px 9px;
  border-radius: var(--bz-r-sm);
  border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
  background: color-mix(in srgb, currentColor 7%, transparent);
  white-space: nowrap;
}
.tone-muted {
  color: var(--bz-fg-mid);
}
.tone-accent {
  color: var(--bz-accent);
}
.tone-warning {
  color: var(--bz-warning);
}
.tone-danger {
  color: var(--bz-danger);
}
.tone-info {
  color: var(--bz-info);
}
.tone-success {
  color: var(--bz-success);
}
.ops-month {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: auto;
}
.ops-month h3 {
  font-size: 20px;
  text-transform: capitalize;
  min-width: 150px;
  text-align: center;
}
.ops-legend {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  font-size: 11px;
  margin-bottom: 18px;
}
.ops-legend span {
  display: flex;
  align-items: center;
  gap: 5px;
}
.ops-legend i {
  width: 6px;
  height: 6px;
  background: currentColor;
  border-radius: 50%;
}
.ops-calendar {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  border: 1px solid var(--bz-border);
  border-radius: var(--ops-radius);
  overflow: hidden;
}
.ops-weekday {
  padding: 10px;
  color: var(--bz-fg-mid);
  font-size: 11px;
  background: var(--bz-panel);
  text-align: center;
}
.ops-calendar-day {
  padding: 9px;
  min-height: 130px;
  border-top: 1px solid var(--bz-border);
  border-right: 1px solid var(--bz-border);
  min-width: 0;
}
.ops-calendar-day:nth-child(7n) {
  border-right: 0;
}
.ops-calendar-day.outside {
  background: var(--bz-panel);
}
.ops-calendar-day.outside .ops-day-number {
  color: var(--bz-fg-mid);
}
.ops-day-number {
  display: inline-flex;
  font-size: 18px;
  min-width: 26px;
  justify-content: center;
}
.ops-calendar-day.today .ops-day-number {
  background: var(--bz-control-selected-bg);
  color: var(--bz-on-accent);
  border-radius: var(--bz-r-sm);
}
.ops-calendar-day.today { background: color-mix(in srgb, var(--bz-accent) 4%, var(--bz-card)); }
.ops-calendar-event {
  display: flex;
  flex-direction: column;
  text-align: left;
  width: 100%;
  gap: 3px;
  margin-top: 8px;
  border: 0;
  border-left: 3px solid var(--process-color, var(--bz-border-strong));
  border-radius: 4px;
  background: var(--bz-raised);
  color: var(--bz-fg);
  padding: 7px;
  font: inherit;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.ops-calendar-event strong {
  font-size: 12px;
  color: var(--bz-fg);
  font-weight: 500;
}
.ops-calendar-event small,
.ops-calendar-event > span {
  font-size: 12px;
  color: var(--bz-fg-mid);
}
.ops-calendar-event .ops-calendar-event__state {
  display: flex;
  align-items: center;
  gap: 7px;
  border-top: 1px solid var(--bz-border);
  padding-top: 6px;
  margin-top: 3px;
  color: var(--bz-fg-mid);
  font-size: 11px;
}
.ops-calendar-event__state::before {
  content: "";
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border: 1px solid var(--bz-border-strong);
  border-radius: 2px;
  background: var(--process-color, var(--bz-fg-mid));
}
.ops-calendar-list--mobile {
  display: none;
}
.ops-unscheduled {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.ops-plan-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  padding: 12px 16px;
  border: 1px dashed var(--bz-border-strong);
  border-radius: 8px;
  background: none;
  color: var(--bz-fg);
  font: inherit;
  cursor: pointer;
}
.ops-plan-chip small {
  display: block;
  color: var(--bz-fg-mid);
  font-size: 12px;
}
.ops-client-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr));
  gap: 20px;
}
.ops-client {
  border: 1px solid var(--bz-border);
  border-radius: var(--ops-radius);
  padding: 22px;
  background: var(--bz-panel);
}
.ops-client-head {
  display: flex;
  gap: 12px;
  align-items: center;
}
.ops-client-head > div {
  flex: 1;
  min-width: 0;
}
.ops-client-head h3 {
  font-size: 19px;
  overflow-wrap: anywhere;
}
.ops-client-head small,
.ops-client > p {
  font-size: 13px;
  color: var(--bz-fg-mid);
}
.ops-client-contact {
  display: grid;
  gap: 9px;
  margin: 20px 0;
  color: var(--bz-fg-mid);
  font-size: 13px;
}
.ops-client-contact > span {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  overflow-wrap: anywhere;
}
.ops-client-contact .material-symbols-outlined {
  font-size: 17px;
  flex: 0 0 18px;
  color: var(--bz-fg-mid);
}
.ops-monogram {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--bz-accent-soft);
  color: var(--bz-accent);
  font-size: 16px;
}
.ops-client-stats {
  display: flex;
  gap: 24px;
  border-block: 1px solid var(--bz-border);
  padding: 16px 0;
  margin: 20px 0;
}
.ops-client-stats span {
  display: flex;
  flex-direction: column;
  color: var(--bz-fg-mid);
  font-size: 12px;
  flex: 1;
  gap: 4px;
}
.ops-client-stats b {
  font-size: 28px;
  color: var(--bz-fg);
}
.ops-client-actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  padding-bottom: 16px;
}
.ops-client-actions .bz-btn { min-height: 36px; }
.ops-client-sites {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  column-gap: 24px;
}
.ops-site {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  border-top: 1px solid var(--bz-border);
}
.ops-site > div {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.ops-site strong { font-size: 14px; font-weight: 500; }
.ops-site > .material-symbols-outlined { color: var(--bz-fg-mid); font-size: 19px; }
.ops-site small {
  display: block;
  color: var(--bz-fg-mid);
  font-size: 12px;
}
.ops-buy-board {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}
.ops-buy-board > section {
  min-width: 0;
}
.ops-buy-board h4 {
  font-size: 12px;
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 2px solid var(--bz-border-strong);
}
.ops-buy-board h4 .bz-metric {
  font-size: 17px;
}
.ops-buy-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--bz-panel);
  border: 1px solid var(--bz-border);
  border-radius: var(--ops-radius);
  padding: 16px;
  margin-top: 16px;
}
.ops-buy-card h3 {
  font-size: 15px;
  overflow-wrap: anywhere;
}
.ops-buy-card p {
  margin: 0;
  font-size: 13px;
}
.ops-buy-card small {
  font-size: 11px;
  color: var(--bz-fg-mid);
}
.ops-buy-actions {
  display: flex;
  gap: 8px;
  flex-direction: column;
  padding-top: 8px;
}
.ops-buy-card .ops-status {
  align-self: flex-start;
}
.ops-message {
  display: flex;
  gap: 18px;
  align-items: flex-start;
  padding: 22px 0;
  border-bottom: 1px solid var(--bz-border);
}
.ops-message > div {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.ops-message h3 {
  font-size: 17px;
}
.ops-message p {
  margin: 5px 0;
}
.ops-message small {
  display: block;
  color: var(--bz-fg-mid);
  font-size: 12px;
}
.ops-file {
  position: absolute;
  width: 1px !important;
  height: 1px;
  min-height: 0 !important;
  padding: 0 !important;
  opacity: 0;
  overflow: hidden;
}
.ops-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px 20px;
  color: var(--bz-fg);
  font-size: 14px;
}
.ops-form label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  color: var(--bz-fg-mid);
}
.ops-form .full {
  grid-column: 1/-1;
}
.ops-form footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid var(--bz-border);
  padding-top: 22px;
  margin-top: 8px;
}
.ops-form .ops-check {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 10px;
  color: var(--bz-fg);
  padding: 14px;
  background: var(--bz-panel);
  border-radius: 8px;
  line-height: 1.6;
}
.ops-check input {
  margin-top: 4px;
  accent-color: var(--bz-accent);
}
.ops-line {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(60px, 1fr) minmax(60px, 1fr);
  gap: 10px;
  margin-top: 10px;
}
.ops-dossier {
  font-size: 14px;
  color: var(--bz-fg);
}
.ops-dossier-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 13px;
  color: var(--bz-fg-mid);
}
.ops-dossier-next {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: var(--bz-accent-soft);
  border: 1px solid var(--bz-border-brand);
  border-radius: var(--bz-r);
  margin: 24px 0;
}
.ops-dossier-next small {
  font-size: 12px;
  color: var(--bz-fg-mid);
}
.ops-dossier-next h3 {
  font: 500 18px/1.4 var(--bz-font-body);
  margin: 6px 0 0;
}
.ops-dossier-next .bz-metric {
  font-size: 28px;
}
.ops-dossier-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 18px 0 24px;
}
.ops-dossier-cols {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 28px;
  border-top: 1px solid var(--bz-border);
  padding-top: 22px;
}
.ops-dossier-cols h3 {
  font: italic 900 21px/1.3 var(--bz-font-metric);
  margin-bottom: 18px;
}
.ops-timeline {
  padding: 0 0 0 17px;
  list-style: none;
  border-left: 1px solid var(--bz-border);
}
.ops-timeline li {
  position: relative;
  margin-bottom: 22px;
}
.ops-timeline li:before {
  content: "";
  position: absolute;
  left: -21px;
  top: 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--bz-accent);
}
.ops-timeline small {
  color: var(--bz-fg-mid);
  font-size: 12px;
  display: block;
}
.ops-timeline strong {
  font-size: 14px;
  font-weight: 500;
}
.ops-timeline p {
  font-size: 13px;
  color: var(--bz-fg-mid);
  margin: 4px 0;
  overflow-wrap: anywhere;
}
.ops-document {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  background: none;
  border: 0;
  border-bottom: 1px solid var(--bz-border);
  padding: 12px 0;
  color: var(--bz-fg);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}
.ops-document > span:nth-child(2) {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.ops-document .material-symbols-outlined {
  font-size: 18px;
  color: var(--bz-fg-mid);
}
.ops-review {
  margin: 0;
}
.ops-review > div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--bz-border);
  padding: 8px 0;
}
.ops-review dt {
  color: var(--bz-fg-mid);
}
.ops-review dd {
  margin: 0;
  overflow-wrap: anywhere;
  text-align: right;
}
.ops-message-preview {
  padding: 22px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  background: var(--bz-panel);
}
.ops-message-preview p,
.ops-extracted {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 320px;
  overflow: auto;
  line-height: 1.75;
}
.ops-form :is(input:not([type="checkbox"]), select, textarea) {
  font: 400 14px/1.5 var(--bz-font-body);
  min-height: 44px;
}
.ops-form textarea { resize: vertical; }
.ops-form :is(input, select, textarea):focus-visible { border-color: var(--bz-accent); }
.ops-review > div { padding-block: 12px; }
.ops-contract-sla { padding: 20px; border-radius: var(--bz-r); }
.ops-contract-sla legend { padding-inline: 8px; color: var(--bz-fg); }
.ops-sla-row { gap: 16px; }
.operations :is(.ops-task, .ops-calendar-event, .ops-summary, .ops-agenda-item, .ops-client, .ops-plan-chip) {
  transition: background var(--bz-dur-fast) var(--bz-ease-out), border-color var(--bz-dur-fast) var(--bz-ease-out);
}
.operations :is(.ops-calendar-event, .ops-plan-chip):hover { background: var(--bz-raised); }
.operations :is(.ops-summary, .ops-agenda-item):hover { color: var(--bz-fg); background: color-mix(in srgb, var(--bz-raised) 55%, transparent); }
.ops-task:hover .ops-next { color: var(--bz-fg); }
@media (prefers-reduced-motion: reduce) {
  .operations :is(.ops-task, .ops-calendar-event, .ops-summary, .ops-agenda-item, .ops-client, .ops-plan-chip) { transition: none; }
}
.ops-pdf {
  width: 100%;
  height: 58dvh;
  border: 0;
}
.ops-photo {
  max-width: 100%;
  max-height: 58dvh;
  object-fit: contain;
}
.operations button:focus-visible,
.ops-form button:focus-visible,
.operations input:focus-visible,
.operations select:focus-visible,
.ops-form input:focus-visible,
.ops-form textarea:focus-visible {
  outline: 2px solid var(--bz-accent);
  outline-offset: 3px;
}
@media (min-width: 1600px) {
  .ops-heading h2 {
    font-size: 36px;
  }
  .ops-cockpit {
    grid-template-columns: minmax(0, 2.2fr) minmax(330px, 1fr);
  }
  .ops-calendar-day {
    min-height: 150px;
  }
}
@media (max-width: 1100px) {
  .ops-buy-board {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ops-cockpit {
    grid-template-columns: 1fr;
  }
  .ops-day {
    display: block;
    border: 0;
    border-top: 1px solid var(--bz-border);
    padding: 24px 0 0;
  }
  .ops-runtime {
    display: none;
  }
  .ops-metrics > button {
    padding: 18px 16px;
  }
  .ops-metrics small {
    display: none;
  }
  .ops-metrics span {
    font-size: 12px;
  }
  .ops-calendar-day {
    min-height: 100px;
    padding: 5px;
  }
}
@media (max-width: 700px) {
  .ops-heading {
    align-items: flex-start;
    gap: 16px;
    flex-direction: column;
  }
  .ops-heading h2 {
    font-size: 27px;
  }
  .ops-heading > .bz-btn {
    align-self: flex-start;
  }
  .ops-context {
    flex-wrap: wrap;
  }
  .ops-local {
    font-size: 11px;
    min-width: 70px;
  }
  .ops-context > label {
    flex: 1;
  }
  .ops-context select {
    max-width: 190px;
  }
  .ops-context > .bz-btn > span:last-child {
    display: none;
  }
  .ops-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-bottom: 22px;
  }
  .ops-metrics > button {
    border-bottom: 1px solid var(--bz-border);
  }
  .ops-metrics strong {
    font-size: 32px;
  }
  .ops-nav {
    margin-bottom: 18px;
  }
  .ops-nav button {
    padding: 12px 9px;
    font-size: 12px;
  }
  .ops-task {
    gap: 10px;
    align-items: flex-start;
  }
  .ops-next {
    max-width: 100px;
    font-size: 11px;
  }
  .ops-next > .material-symbols-outlined {
    display: none;
  }
  .ops-client-grid,
  .ops-buy-board,
  .ops-dossier-cols {
    grid-template-columns: 1fr;
  }
  .ops-client {
    padding: 18px;
  }
  .ops-section-head {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .ops-toolbar > select {
    flex: 1 1 160px;
    min-width: min(160px, 100%);
  }
  .ops-toolbar > .bz-btn {
    font-size: 12px;
  }
  .ops-calendar {
    display: none;
  }
  .ops-calendar-list--mobile {
    display: block;
  }
  .ops-calendar-list .ops-task > time {
    font-size: 11px;
    max-width: 65px;
  }
  .ops-calendar-list .ops-status {
    font-size: 10px;
    white-space: normal;
    max-width: 94px;
  }
  .ops-month {
    width: 100%;
    justify-content: space-between;
  }
  .ops-legend {
    gap: 10px;
  }
  .ops-form {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .ops-form footer {
    flex-wrap: wrap;
  }
  .ops-dossier-next {
    flex-wrap: wrap;
  }
  .ops-client-actions > .bz-btn {
    font-size: 12px;
  }
  .ops-message {
    gap: 10px;
    flex-wrap: wrap;
  }
  .ops-message > .bz-btn {
    margin-left: 30px;
  }
  .ops-form .ops-line {
    gap: 6px;
  }
  .ops-line label {
    font-size: 11px;
  }
  .ops-review > div {
    flex-direction: column;
    gap: 4px;
  }
  .ops-review dd {
    text-align: left;
  }
  .ops-runtime-note {
    font-size: 11px;
  }
}
.ops-process-state{display:inline-flex;align-items:center;gap:8px;color:var(--bz-fg);font-size:12px;font-weight:600;line-height:1.4}.ops-process-state::before{content:'';width:10px;height:10px;flex:0 0 auto;border-radius:3px;background:var(--process-color,var(--bz-fg-mid));border:1px solid var(--bz-border-strong)}
.process-received{--process-color:#fff}.process-working{--process-color:#16a34a}.process-finished{--process-color:#cbd5e1}.process-closed{--process-color:#52525b}.process-quote_needed{--process-color:#eab308}.process-quote_ready{--process-color:#ef4444}.process-approval{--process-color:#38bdf8}.process-service{--process-color:#a855f7}.process-billing{--process-color:#a16207}
.ops-legend i{background:var(--process-color);border:1px solid var(--bz-border-strong)}
.process-row>td:first-child{border-left:4px solid var(--process-color,var(--bz-border))}
</style>
