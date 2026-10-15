<template>
  <section class="buy-workspace company-screen" data-i18n-skip>
    <div v-if="error" class="buy-notice is-error" role="alert">
      {{ error
      }}<button class="bz-btn bz-btn--ghost" @click="load">
        {{ ui("Retry", "Réessayer") }}
      </button>
    </div>
    <p v-if="notice" class="buy-notice" role="status">{{ notice }}</p>
    <CompanyMetricStrip :items="purchaseMetrics" @select="item => { view = item.target; query=''; requestFilter=item.id==='approval'?'awaiting_approval':item.id==='requests'?'open':item.id==='stock'?'low':''; }" />
    <div class="buy-toolbar">
      <nav :aria-label="ui('Purchasing sections', 'Rubriques achats')">
        <button
          v-for="s in sections"
          :key="s.id"
          :aria-current="view === s.id ? 'page' : undefined"
          @click="view = s.id; requestFilter=''"
        >
          <span aria-hidden="true" class="material-symbols-outlined">{{
            s.icon
          }}</span
          >{{ s.label }}
        </button>
      </nav>
      <label class="buy-search"
        ><span aria-hidden="true" class="material-symbols-outlined">search</span
        ><input
          v-model="query"
          :placeholder="ui('Search records…', 'Rechercher…')"
          :aria-label="ui('Search purchasing', 'Rechercher dans les achats')"
      /></label>
    </div>
    <header class="buy-head">
      <div>
        <p class="buy-kicker">{{ ui("Purchasing & logistics", "Achats et logistique") }}</p>
        <h2>{{ sectionTitle }}</h2>
      </div>
      <div class="buy-actions">
        <button class="bz-btn bz-btn--ghost" @click="view = 'reviews'">
          {{ ui("Reviews", "Revues") }}
          <span class="bz-metric">{{
            data.reviews.filter((r) => r.status === "open").length
          }}</span></button
        ><button
          class="bz-iconbtn"
          :aria-label="ui('Purchasing settings', 'Paramètres achats')"
          @click="open('settings')"
        >
          <span aria-hidden="true" class="material-symbols-outlined"
            >tune</span
          ></button
        ><button class="bz-btn bz-btn--primary" @click="open(primaryMode)">
          <span aria-hidden="true" class="material-symbols-outlined">add</span
          >{{ primaryLabel }}
        </button>
      </div>
    </header>
    <div v-if="loading" class="buy-empty" role="status">
      {{ ui("Loading purchasing…", "Chargement des achats…") }}
    </div>
    <CompanyLogistics v-else-if="view === 'logistics'" :company-id="companyId" :data="data" @saved="load" />
    <template v-else-if="view === 'requests'">
      <div v-if="!data.requests.length" class="buy-empty">
        <span aria-hidden="true" class="material-symbols-outlined"
          >shopping_bag</span
        >
        <h3>{{ ui("No purchase requests", "Aucune demande d’achat") }}</h3>
        <p>
          {{
            ui(
              "Create an internal request, or share a parts request from a maintenance work order.",
              "Créez une demande interne ou transmettez une demande de pièces depuis une intervention.",
            )
          }}
        </p>
      </div>
      <div v-else class="buy-split">
        <div v-if="requestFilter" class="company-filter-notice"><span>{{ requestFilter==='open' ? ui('Open requests','Demandes ouvertes') : stateLabel(requestFilter) }}</span><button class="bz-btn bz-btn--ghost bz-btn--sm" @click="requestFilter=''">{{ ui('Clear filters','Effacer les filtres') }}</button></div>
        <aside
          class="buy-records"
          :aria-label="ui('Purchase requests', 'Demandes d’achat')"
        >
          <button
            v-for="r in filtered(data.requests).filter(r=>!requestFilter || (requestFilter==='open'?!['received','cancelled'].includes(r.status):r.status===requestFilter))"
            :key="r.id"
            :class="{ selected: selectedId === r.id }"
            @click="selectedId = r.id"
          >
            <span class="buy-record-top"
              ><span>{{ typeLabel(r.type) }}</span
              ><time>{{ date(r.createdAt) }}</time></span
            ><strong>{{ r.title }}</strong
            ><small>{{
              r.context?.workOrderNumber ||
              r.technician ||
              ui("Internal request", "Demande interne")
            }}</small
            ><span class="buy-state">{{ stateLabel(r.status, r) }}</span>
          </button>
          <p v-if="!filtered(data.requests).filter(r=>!requestFilter || (requestFilter==='open'?!['received','cancelled'].includes(r.status):r.status===requestFilter)).length" class="buy-empty">
            {{ ui("No matching records", "Aucun résultat") }}
          </p>
        </aside>
        <article
          v-if="selected"
          :id="`buy-request-${selected.id}`"
          tabindex="-1"
          class="buy-detail"
        >
          <header class="buy-detail-head">
            <div>
              <span class="buy-kicker">{{ typeLabel(selected.type) }}</span>
              <h3>{{ selected.title }}</h3>
              <p v-if="selected.context">
                {{ selected.context.workOrderNumber }} ·
                {{ selected.context.title }}
              </p>
            </div>
            <span class="buy-state">{{
              stateLabel(selected.status, selected)
            }}</span>
          </header>
          <button
            v-if="
              !selected.sourceCompanyId &&
              ['requested', 'awaiting_approval'].includes(selected.status)
            "
            class="bz-btn bz-btn--ghost"
            @click="open('request', selected)"
          >
            {{ ui("Edit request", "Modifier la demande") }}
          </button>
          <button
            v-if="selected.issueId"
            class="bz-btn bz-btn--ghost"
            @click="emit('open-task', selected.issueId)"
          >
            {{ ui("Open team task", "Ouvrir la tâche de l’équipe") }}
          </button>
          <ol
            class="buy-progress"
            :aria-label="ui('Purchase progress', 'Avancement de l’achat')"
          >
            <li
              v-for="(s, i) in steps"
              :key="s"
              :class="{ done: i < stepIndex, current: i === stepIndex }"
            >
              <span class="bz-metric">{{ i + 1 }}</span
              >{{ s }}
            </li>
          </ol>
          <p v-if="selected.description" class="buy-description">
            {{ selected.description }}
          </p>
          <section class="buy-block">
            <div class="buy-section-head">
              <h4>
                {{ ui("Part specification", "Identification des pièces") }}
              </h4>
              <button
                v-if="
                  !selected.technicalConfirmed &&
                  selected.status === 'requested'
                "
                class="bz-btn bz-btn--ghost"
                @click="open('technical', selected)"
              >
                {{
                  ui("Confirm specification", "Confirmer les références")
                }}</button
              ><span
                v-else-if="selected.technicalConfirmed"
                class="buy-state"
                >{{ ui("Checked", "Vérifié") }}</span
              >
            </div>
            <div v-for="line in selected.items" :key="line.id" class="buy-line">
              <div>
                <strong>{{ line.label }}</strong
                ><small>{{
                  [
                    line.brand,
                    line.manufacturerReference,
                    line.technicalReference,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                }}</small>
              </div>
              <span class="bz-metric">× {{ line.quantity }}</span>
            </div>
            <div v-if="selected.context?.asset" class="buy-context">
              <span>{{ ui("Equipment", "Équipement") }}</span
              ><strong>{{
                [
                  selected.context.asset.brand,
                  selected.context.asset.modelReference,
                  selected.context.asset.serialNumber,
                ]
                  .filter(Boolean)
                  .join(" · ")
              }}</strong>
            </div>
            <p v-if="selected.context?.diagnosis" class="buy-description">
              {{ selected.context.diagnosis }}
            </p>
            <div
              v-if="selected.context?.documents?.length"
              class="buy-evidence"
            >
              <button
                v-for="d in selected.context.documents"
                :key="d.id"
                class="bz-btn bz-btn--ghost"
                @click="
                  showEvidence({
                    blobId: d.blob_id,
                    blobExt: d.blob_ext,
                    filename: d.filename,
                    mimeType: d.mime_type,
                  })
                "
              >
                <span aria-hidden="true" class="material-symbols-outlined"
                  >description</span
                >{{ d.filename }}
              </button>
            </div>
            <p
              v-if="selected.context?.photoRefs?.length"
              class="buy-description"
            >
              {{ ui("Photo references", "Références photos") }}:
              {{ selected.context.photoRefs.join(", ") }}
            </p>
          </section>
          <section class="buy-block">
            <div class="buy-section-head">
              <h4>{{ ui("Supplier quotations", "Offres fournisseurs") }}</h4>
              <div class="buy-actions">
                <button
                  class="bz-btn bz-btn--ghost"
                  :disabled="!selected.technicalConfirmed"
                  @click="open('rfq', selected)"
                >
                  {{ ui("Request a quote", "Demander un devis") }}</button
                ><button
                  class="bz-btn bz-btn--ghost"
                  :disabled="
                    !['requested', 'awaiting_approval'].includes(
                      selected.status,
                    )
                  "
                  @click="open('quote', selected)"
                >
                  {{ ui("Add quotation", "Ajouter une offre") }}
                </button>
              </div>
            </div>
            <article v-for="p in (data.proformas || []).filter(p=>p.requestId===selected.id && !selectedQuotes.some(q=>q.reference===p.reference))" :key="p.id" class="buy-description">
              <strong>{{ ui('Imported proforma', 'Proforma importée') }} · {{ p.reference }}</strong>
              <p>{{ ui('Parts are prepared. Complete the missing freight, tax or delivery information before comparing quotations.', 'Les pièces sont préparées. Complétez le transport, la TVA ou le délai manquants avant de comparer les offres.') }}</p>
              <ul><li v-for="(line,i) in p.lines" :key="i">{{ line.name }} · {{ line.quantity }} × {{ money(line.unitPriceCents) }}</li></ul>
            </article>
            <div class="buy-quotes">
              <article
                v-for="q in selectedQuotes"
                :key="q.id"
                :class="{ chosen: q.id === selected.selectedQuoteId }"
              >
                <div>
                  <small>{{ regionLabel(q.region) }}</small>
                  <h5>{{ q.supplierName }}</h5>
                  <span class="buy-quote-price bz-metric">{{
                    money(q.totalCents)
                  }}</span
                  ><span
                    >{{ q.leadDays }} {{ ui("days", "jours") }} ·
                    {{ q.reference }}</span
                  >
                </div>
                <dl>
                  <dt>{{ ui("Compatibility", "Compatibilité") }}</dt>
                  <dd>
                    {{
                      q.compatible
                        ? ui("Checked", "Vérifiée")
                        : ui("To check", "À vérifier")
                    }}
                  </dd>
                  <dt>{{ ui("Transport", "Transport") }}</dt>
                  <dd>
                    {{ q.transport }} ·
                    {{
                      q.transportConfirmed
                        ? ui("Checked", "Vérifié")
                        : ui("To check", "À vérifier")
                    }}
                  </dd>
                </dl>
                <button
                  v-if="
                    ['requested', 'awaiting_approval'].includes(selected.status)
                  "
                  class="bz-btn"
                  :class="
                    q.id === selected.selectedQuoteId
                      ? 'bz-btn--ghost'
                      : 'bz-btn--primary'
                  "
                  @click="open('selectQuote', q)"
                >
                  {{
                    q.id === selected.selectedQuoteId
                      ? ui("Selected", "Retenue")
                      : ui("Select quotation", "Retenir cette offre")
                  }}
                </button>
              </article>
            </div>
            <p v-if="!selectedQuotes.length" class="buy-muted">
              {{
                ui(
                  "Add the supplier’s quotation, delivery time and compatibility evidence.",
                  "Ajoutez l’offre fournisseur, son délai et les éléments de compatibilité.",
                )
              }}
            </p>
          </section>
          <section
            v-if="selected.status === 'awaiting_approval'"
            class="buy-block"
          >
            <div class="buy-section-head">
              <h4>{{ ui("Approval", "Validation") }}</h4>
              <button
                class="bz-btn bz-btn--ghost"
                @click="open('approval', selected)"
              >
                {{ ui("Record a decision", "Enregistrer une décision") }}
              </button>
            </div>
            <p
              v-if="data.settings.directionThresholdCents == null"
              class="buy-notice"
            >
              {{
                ui(
                  "The direction threshold still needs validation in Purchasing settings.",
                  "Le seuil de validation de la direction reste à confirmer dans les paramètres achats.",
                )
              }}
            </p>
            <div v-for="a in currentApprovals" :key="a.id" class="buy-line">
              <span>{{ a.approverName }} · {{ a.evidenceReference }}</span
              ><span class="buy-state">{{ stateLabel(a.decision) }}</span>
            </div>
            <button
              class="bz-btn bz-btn--primary"
              @click="open('order', selected)"
            >
              {{ ui("Issue purchase order", "Émettre le bon de commande") }}
            </button>
          </section>
          <section v-if="selectedOrder" class="buy-block">
            <div class="buy-section-head">
              <div>
                <h4>{{ selectedOrder.number }}</h4>
                <p class="buy-muted">
                  {{ selectedOrder.supplier.name }} ·
                  {{ money(selectedOrder.totalCents) }}
                </p>
              </div>
              <button
                class="bz-btn bz-btn--ghost"
                :disabled="busy"
                @click="generateOrder(selectedOrder)"
              >
                <span aria-hidden="true" class="material-symbols-outlined"
                  >picture_as_pdf</span
                >PDF
              </button>
            </div>
            <div class="buy-actions">
              <button
                v-if="selected.status !== 'received'"
                class="bz-btn bz-btn--primary"
                @click="open('receipt', selectedOrder)"
              >
                {{ ui("Record delivery", "Réceptionner") }}</button
              ><button
                class="bz-btn bz-btn--ghost"
                @click="open('invoice', selectedOrder)"
              >
                {{ ui("Supplier invoice", "Facture fournisseur") }}
              </button>
            </div>
            <div
              v-for="r in data.receipts.filter(
                (r) => r.orderId === selectedOrder.id,
              )"
              :key="r.id"
              class="buy-line"
            >
              <span>{{ r.reference }} · {{ r.receivedBy }}</span
              ><time>{{ date(r.receivedAt) }}</time>
            </div>
            <div
              v-for="i in data.invoices.filter(
                (i) => i.orderId === selectedOrder.id,
              )"
              :key="i.id"
              class="buy-invoice"
              :data-invoice-id="i.id"
            >
              <div>
                <strong
                  >{{ i.reference }}
                  <span class="bz-metric">{{
                    money(i.totalCents)
                  }}</span></strong
                ><small>{{ stateLabel(i.status) }} · {{ date(i.dueAt) }}</small>
                <p v-for="e in i.exceptions" :key="e" class="buy-muted">
                  {{ translateError(e) }}
                </p>
              </div>
              <div class="buy-actions">
                <button
                  v-if="i.status !== 'paid'"
                  class="bz-btn bz-btn--primary"
                  :disabled="i.status !== 'matched'"
                  @click="open('preparePayment', i)"
                >
                  {{ ui("Prepare payment", "Préparer le règlement") }}
                </button>
                <button
                  v-if="i.status !== 'paid'"
                  class="bz-btn bz-btn--ghost"
                  @click="open('payment', i)"
                >
                  {{ ui("Record settlement", "Rapprocher le règlement") }}
                </button>
              </div>
              <CompanyRecordFlow :company-id="companyId" kind="supplierInvoice" :record-id="i.id" :revision="i.revision" @open-task="emit('open-task',$event)" />
              <div
                v-for="d in data.paymentDossiers.filter(
                  (d) => d.invoiceId === i.id,
                )"
                :key="d.id"
                class="buy-payment-dossier"
              >
                <strong
                  >{{ d.supplierName }} ·
                  <span class="bz-metric">{{
                    money(d.amountCents)
                  }}</span></strong
                >
                <p class="buy-muted">
                  {{ d.invoiceReference }} · {{ d.orderNumber }} ·
                  {{ date(d.dueAt) }}
                </p>
                <p v-if="d.missing.length" class="buy-muted">
                  {{
                    ui(
                      "Verified supplier bank details are required.",
                      "Les coordonnées bancaires vérifiées du fournisseur sont requises.",
                    )
                  }}
                </p>
                <button
                  class="bz-btn bz-btn--ghost"
                  @click="emit('open-task', d.issueId)"
                >
                  {{ ui("Open finance task", "Ouvrir la tâche finance") }} ·
                  {{ d.financeRole }}
                </button>
              </div>
            </div>
          </section>
          <section v-if="selectedRfqs.length" class="buy-block">
            <h4>{{ ui("Supplier conversations", "Échanges fournisseurs") }}</h4>
            <article
              v-for="r in selectedRfqs"
              :key="r.id"
              :id="`buy-rfq-${r.id}`"
              :data-revision="r.revision"
              tabindex="-1"
              class="buy-rfq"
            >
              <div class="buy-section-head">
                <strong>{{ r.subject }}</strong
                ><span class="buy-state">{{ stateLabel(r.status, r) }}</span>
              </div>
              <p class="buy-description">{{ r.message }}</p>
              <small>{{ r.contacts.map((c) => c.address).join(" · ") }}</small>
              <div class="buy-actions">
                <button
                  v-if="['draft', 'delivery_failed'].includes(r.status)"
                  class="bz-btn bz-btn--primary"
                  @click="open('send', r)"
                >
                  {{ ui("Review and send", "Vérifier et envoyer") }}
                </button>
                <button
                  v-for="d in (r.dispatches || []).filter((d) =>
                    ['unknown', 'submitting'].includes(d.status),
                  )"
                  :key="d.index"
                  class="bz-btn bz-btn--ghost"
                  @click="
                    open('resolveDelivery', { ...r, dispatchIndex: d.index })
                  "
                >
                  {{ ui("Verify sending outcome", "Vérifier l’envoi") }} ·
                  {{ d.recipient }}
                </button>
                <button
                  v-if="r.status === 'draft'"
                  class="bz-btn bz-btn--ghost"
                  @click="open('dispatch', r)"
                >
                  {{
                    ui("Record sending receipt", "Enregistrer le reçu d’envoi")
                  }}</button
                ><button class="bz-btn bz-btn--ghost" @click="open('reply', r)">
                  {{
                    ui(
                      "Record supplier reply",
                      "Ajouter la réponse fournisseur",
                    )
                  }}
                </button>
              </div>
              <p v-if="r.nextFollowupAt" class="buy-muted">
                {{ ui("Follow-up due", "Relance prévue") }}
                {{ date(r.nextFollowupAt) }}
              </p>
              <blockquote
                v-for="reply in data.replies.filter((x) => x.rfqId === r.id)"
                :key="reply.id"
              >
                {{ reply.body }}<small>{{ reply.externalReference }}</small>
              </blockquote>
            </article>
          </section>
        </article>
      </div>
    </template>
    <template v-else-if="view === 'stock'"
      ><div class="buy-section-head">
        <p class="buy-muted">
          {{
            ui(
              "Available stock excludes reservations. Historical imports never change live quantities.",
              "Le stock disponible exclut les réservations. Les archives ne modifient jamais les quantités réelles.",
            )
          }}
        </p>
        <div class="buy-actions">
          <button class="bz-btn bz-btn--ghost" @click="open('preference')">
            {{ ui("Technician preference", "Préférence technicien") }}</button
          ><button class="bz-btn bz-btn--ghost" @click="open('history')">
            {{ ui("Import history", "Importer les archives") }}
          </button>
        </div>
      </div>
      <div class="buy-actions"><button class="bz-btn bz-btn--ghost" @click="open('warranty')">{{ ui('New warranty claim', 'Nouveau dossier de garantie') }}</button><button v-for="claim in data.warranties || []" :key="claim.id" class="bz-btn bz-btn--ghost" @click="open('warranty',claim)">{{ claim.title }}</button></div>
      <div class="buy-table-wrap">
        <div v-if="requestFilter==='low'" class="company-filter-notice"><span>{{ ui('Below minimum','Sous le minimum') }}</span><button class="bz-btn bz-btn--ghost bz-btn--sm" @click="requestFilter=''">{{ ui('Clear filters','Effacer les filtres') }}</button></div>
        <table>
          <thead>
            <tr>
              <th>{{ ui("Item", "Article") }}</th>
              <th>{{ ui("On hand", "En stock") }}</th>
              <th>{{ ui("Reserved", "Réservé") }}</th>
              <th>{{ ui("Available / minimum", "Disponible / minimum") }}</th>
              <th>{{ ui("Actions", "Actions") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="i in filtered(data.items).filter(i=>requestFilter!=='low' || i.available<Math.max(i.minimum,i.contractMinimum||0))" :key="i.id">
              <td>
                <strong>{{ i.name }}</strong
                ><small>{{ i.sku }} · {{ i.brand }}</small>
                <small v-for="location in i.locations" :key="location.locationId">{{ location.locationId }} · {{ location.available }} {{ ui('available', 'disponibles') }} / {{ location.reserved }} {{ ui('reserved', 'réservés') }}</small>
              </td>
              <td class="bz-metric">{{ i.onHand }}</td>
              <td class="bz-metric">{{ i.reserved }}</td>
              <td>
                <span
                  class="bz-metric"
                  :class="{
                    'buy-warning':
                      i.available < Math.max(i.minimum, i.contractMinimum || 0),
                  }"
                  >{{ i.available }} /
                  {{ Math.max(i.minimum, i.contractMinimum || 0) }}</span
                >
              </td>
              <td>
                <button
                  class="bz-btn bz-btn--ghost"
                  @click="open('movement', i)"
                >
                  {{ ui("Movement", "Mouvement") }}</button
                ><button
                  class="bz-iconbtn"
                  :aria-label="ui('Edit item', 'Modifier l’article')"
                  @click="open('item', i)"
                >
                  <span aria-hidden="true" class="material-symbols-outlined"
                    >edit</span
                  >
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!data.items.length" class="buy-empty">
        {{
          ui(
            "Add your first catalogue item, then record its opening stock.",
            "Ajoutez votre premier article, puis enregistrez son stock initial.",
          )
        }}
      </p>
      <section v-if="data.preferences.length" class="buy-block">
        <h4>
          {{ ui("Technician preferences", "Préférences des techniciens") }}
        </h4>
        <div v-for="p in data.preferences" :key="p.id" class="buy-line">
          <strong>{{ p.technician }} · {{ p.family }}</strong
          ><span>{{ p.brand }} · {{ p.reason }}</span>
        </div>
      </section>
      <section v-if="data.history.length" class="buy-block">
        <h4>{{ ui("Historical references", "Références historiques") }}</h4>
        <div
          v-for="h in data.history.slice(0, 50)"
          :key="h.id"
          class="buy-line"
        >
          <div>
            <strong>{{ h.description }}</strong
            ><small>{{ h.source }} · {{ h.supplierName }}</small>
          </div>
          <button
            v-if="h.status === 'unmatched'"
            class="bz-btn bz-btn--ghost"
            @click="open('match', h)"
          >
            {{ ui("Match item", "Rapprocher l’article") }}</button
          ><span v-else class="buy-state">{{
            ui("Matched", "Rapproché")
          }}</span>
        </div>
      </section></template
    >
    <template v-else-if="view === 'equipment'"
      ><div class="buy-grid">
        <article
          v-for="e in filtered(data.equipment)"
          :key="e.id"
          class="buy-equipment"
        >
          <div class="buy-section-head">
            <span aria-hidden="true" class="material-symbols-outlined">{{
              e.type === "personal" ? "engineering" : "construction"
            }}</span
            ><span class="buy-state">{{ stateLabel(e.status) }}</span>
          </div>
          <h3>{{ e.name }}</h3>
          <p>
            {{ e.reference }} ·
            {{ e.assignedTo || ui("Shared equipment", "Matériel collectif") }}
          </p>
          <dl>
            <dt>{{ ui("Held by", "Détenteur") }}</dt>
            <dd>{{ e.borrower || e.assignedTo || "—" }}</dd>
            <dt>{{ ui("Expiry", "Échéance") }}</dt>
            <dd>{{ date(e.expiresAt) }}</dd>
          </dl>
          <div class="buy-actions">
            <button
              v-if="e.type === 'shared' && e.status === 'available'"
              class="bz-btn bz-btn--primary"
              @click="open('checkout', e)"
            >
              {{ ui("Check out", "Emprunter") }}</button
            ><button
              v-if="e.status === 'checked_out'"
              class="bz-btn bz-btn--primary"
              @click="open('return', e)"
            >
              {{ ui("Return clean", "Restituer propre") }}</button
            ><button class="bz-btn bz-btn--ghost" @click="open('defect', e)">
              {{ ui("Report defect", "Signaler un défaut") }}
            </button>
          </div>
        </article>
      </div>
      <p v-if="!data.equipment.length" class="buy-empty">
        {{
          ui(
            "Register shared tools and personal protective equipment.",
            "Enregistrez les outils collectifs et les équipements individuels.",
          )
        }}
      </p></template
    >
    <template v-else-if="view === 'suppliers'"
      ><div class="buy-grid">
        <article
          v-for="s in filtered(data.suppliers)"
          :key="s.id"
          class="buy-supplier"
        >
          <header class="buy-section-head">
            <span class="buy-monogram">{{
              s.name.slice(0, 2).toUpperCase()
            }}</span
            ><button
              class="bz-iconbtn"
              :aria-label="ui('Edit supplier', 'Modifier le fournisseur')"
              @click="open('supplier', s)"
            >
              <span aria-hidden="true" class="material-symbols-outlined"
                >edit</span
              >
            </button>
          </header>
          <h3>{{ s.name }}</h3>
          <p>
            {{ regionLabel(s.region)
            }}<span v-if="s.authorized">
              · {{ ui("Distribution verified", "Carte vérifiée") }}</span
            >
          </p>
          <div class="buy-tags">
            <span v-for="b in [...s.brands, ...s.families]" :key="b">{{
              b
            }}</span>
          </div>
          <div
            v-for="c in s.contacts"
            :key="c.channel + c.address"
            class="buy-contact"
          >
            <span aria-hidden="true" class="material-symbols-outlined">{{
              c.channel === "email" ? "mail" : "call"
            }}</span
            ><span
              >{{ c.name }}<strong>{{ c.address }}</strong></span
            >
          </div>
        </article>
      </div>
      <p v-if="!data.suppliers.length" class="buy-empty">
        {{
          ui(
            "Add verified suppliers, their brands and their contacts.",
            "Ajoutez les fournisseurs vérifiés, leurs cartes et leurs contacts.",
          )
        }}
      </p></template
    >
    <template v-else-if="view === 'reviews'"
      ><div class="buy-section-head">
        <p class="buy-muted">
          {{
            ui(
              "Stock, supplier replies, equipment safety and quarterly review.",
              "Stocks, réponses fournisseurs, sécurité du matériel et revue trimestrielle.",
            )
          }}
        </p>
        <div class="buy-actions">
          <button class="bz-btn bz-btn--ghost" @click="open('dpgf')">
            {{ ui("Check DPGF", "Contrôler la DPGF") }}</button
          ><button
            class="bz-btn bz-btn--primary"
            :disabled="busy"
            @click="run('runReview').catch(() => {})"
          >
            {{ ui("Review now", "Contrôler maintenant") }}
          </button>
        </div>
      </div>
      <div v-for="r in data.reviews" :key="r.id" class="buy-review">
        <div>
          <strong>{{ r.title }}</strong>
          <p>{{ r.body }}</p>
          <small>{{ stateLabel(r.status, r) }} · {{ date(r.dueAt) }}</small>
        </div>
        <button
          v-if="r.status === 'open'"
          class="bz-btn bz-btn--ghost"
          @click="open('review', r)"
        >
          {{ ui("Record outcome", "Consigner le résultat") }}
        </button>
      </div>
      <section v-if="data.dpgf.length" class="buy-block">
        <h4>DPGF</h4>
        <article v-for="d in data.dpgf" :key="d.id" class="buy-line">
          <div>
            <strong>{{ d.title }}</strong
            ><small>{{ d.sourceReference }}</small>
            <p>
              {{
                d.missing.length
                  ? ui("Missing lines: ", "Lignes manquantes : ") +
                    d.missing.join(", ")
                  : ui(
                      "All required line references present. Direction review remains required.",
                      "Toutes les références sont présentes. La validation de la direction reste nécessaire.",
                    )
              }}
            </p>
          </div>
          <span class="bz-metric"
            >{{ d.offeredLines.length }} / {{ d.expectedLines.length }}</span
          >
        </article>
      </section>
      <section v-if="data.forecast.length" class="buy-block">
        <h4>{{ ui("Consumption baseline", "Base de consommation") }}</h4>
        <p class="buy-muted">
          {{
            ui(
              "Next quarter: recorded consumption over the past year divided by four. Review seasonality before purchasing.",
              "Trimestre suivant : consommation enregistrée sur un an, divisée par quatre. Vérifiez la saisonnalité avant tout achat.",
            )
          }}
        </p>
        <div v-for="f in data.forecast" :key="f.itemId" class="buy-line">
          <strong>{{ f.name }}</strong
          ><span class="bz-metric">{{ f.nextQuarterBaseline }}</span>
        </div>
      </section></template
    >
    <GmaoDialog
      v-if="editor"
      :title="editorTitle"
      :busy="busy"
      @close="editor = null"
      ><form class="buy-form" @submit.prevent="save">
        <p v-if="formError" class="buy-notice is-error" role="alert">
          {{ formError }}
        </p>
        <section
          v-if="editor.mode === 'preparePayment'"
          class="buy-send-preview"
        >
          <h4>
            {{ editor.record.reference }} ·
            <span class="bz-metric">{{ money(editor.record.totalCents) }}</span>
          </h4>
          <p>
            {{ selectedOrder?.supplier.name }} · {{ selectedOrder?.number }} ·
            {{ date(editor.record.dueAt) }}
          </p>
          <p class="buy-muted">
            {{
              ui(
                "Prepare a finance task with the purchase order, receipts and invoice. The owner executes payment through their bank; BonzAI records settlement only from an actual receipt.",
                "Prépare une tâche finance avec le bon de commande, les réceptions et la facture. Le responsable effectue le paiement dans sa banque ; BonzAI rapproche le règlement à partir d’un reçu réel.",
              )
            }}
          </p>
        </section>
        <section v-if="editor.mode === 'send'" class="buy-send-preview">
          <h4>{{ editor.record.subject }}</h4>
          <p class="buy-description">{{ editor.record.message }}</p>
          <div
            v-for="c in editor.record.contacts"
            :key="c.channel + c.address"
            class="buy-line"
          >
            <span>{{ c.channel }}</span
            ><strong>{{ c.address }}</strong>
          </div>
          <p class="buy-muted">
            {{
              ui(
                "Confirming sends this message to these supplier contacts.",
                "La confirmation envoie ce message à ces contacts fournisseurs.",
              )
            }}
          </p>
        </section>
        <div class="buy-fields">
          <template v-for="f in fields" :key="f.key"
            ><label v-if="f.type === 'check'" class="buy-check"
              ><input v-model="form[f.key]" type="checkbox" /><span>{{
                f.label
              }}</span></label
            ><label v-else :class="{ wide: f.wide }"
              ><span>{{ f.label }}</span
              ><select
                v-if="f.type === 'select'"
                v-model="form[f.key]"
                :required="f.required !== false"
              >
                <option value="">{{ ui("Choose…", "Choisir…") }}</option>
                <option v-for="o in f.options" :key="o.value" :value="o.value">
                  {{ o.label }}
                </option></select
              ><textarea
                v-else-if="f.type === 'textarea'"
                v-model="form[f.key]"
                :required="f.required !== false"
                rows="3"
              ></textarea
              ><input
                v-else
                v-model="form[f.key]"
                :type="f.type || 'text'"
                :required="f.required !== false"
                :min="f.type === 'number' ? 0 : undefined"
                :step="f.type === 'number' ? 'any' : undefined" /></label
          ></template>
        </div>
        <template v-if="editor.mode === 'request'"
          ><div class="buy-section-head">
            <h4>{{ ui("Requested items", "Articles demandés") }}</h4>
            <button
              type="button"
              class="bz-btn bz-btn--ghost"
              @click="
                form.items.push({
                  label: '',
                  quantity: 1,
                  brand: '',
                  manufacturerReference: '',
                })
              "
            >
              {{ ui("Add item", "Ajouter un article") }}
            </button>
          </div>
          <div
            v-for="(line, index) in form.items"
            :key="index"
            class="buy-edit-line"
          >
            <label
              >{{ ui("Description", "Désignation")
              }}<input v-model="line.label" required /></label
            ><label
              >{{ ui("Quantity", "Quantité")
              }}<input
                v-model.number="line.quantity"
                type="number"
                min="0.01"
                step="any"
                required /></label
            ><label
              >{{ ui("Brand", "Marque") }}<input v-model="line.brand" /></label
            ><label
              >{{ ui("Manufacturer reference", "Référence constructeur")
              }}<input v-model="line.manufacturerReference" /></label
            ><label
              >{{
                ui(
                  "Catalogue item (optional)",
                  "Article du catalogue (facultatif)",
                )
              }}<select v-model="line.itemId">
                <option value="">—</option>
                <option
                  v-for="item in data.items"
                  :key="item.id"
                  :value="item.id"
                >
                  {{ item.name }}
                </option>
              </select></label
            >
          </div></template
        >
        <template v-if="editor.mode === 'quote' || editor.mode === 'receipt'"
          ><div
            v-for="line in form.items"
            :key="line.requestLineId"
            class="buy-edit-line"
          >
            <strong
              >{{ line.label }}
              <span class="bz-metric"
                >× {{ line.orderedQuantity || line.quantity }}</span
              ></strong
            ><label
              >{{
                editor.mode === "quote"
                  ? ui("Unit price, excl. VAT (€)", "Prix unitaire HT (€)")
                  : ui("Received now", "Quantité reçue maintenant")
              }}<input
                v-if="editor.mode === 'quote'"
                v-model.number="line.price"
                type="number"
                min="0"
                step="0.01"
                required /><input
                v-else
                v-model.number="line.quantity"
                type="number"
                min="0"
                :max="line.orderedQuantity"
                step="any"
                required
            /></label></div
        ></template>
        <template v-if="editor.mode === 'supplier'"
          ><div class="buy-section-head">
            <h4>{{ ui("Contacts", "Contacts") }}</h4>
            <button
              class="bz-btn bz-btn--ghost"
              type="button"
              @click="
                form.contacts.push({ name: '', channel: 'email', address: '' })
              "
            >
              {{ ui("Add contact", "Ajouter un contact") }}
            </button>
          </div>
          <div
            v-for="(c, index) in form.contacts"
            :key="index"
            class="buy-edit-line"
          >
            <label>{{ ui("Name", "Nom") }}<input v-model="c.name" /></label
            ><label
              >{{ ui("Channel", "Canal")
              }}<select v-model="c.channel">
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="phone">{{ ui("Phone", "Téléphone") }}</option>
              </select></label
            ><label
              >{{
                ui(
                  "Address or international number",
                  "Adresse ou numéro international",
                )
              }}<input v-model="c.address" required /></label
            ><button
              type="button"
              class="bz-btn bz-btn--ghost"
              @click="form.contacts.splice(index, 1)"
            >
              {{ ui("Remove", "Retirer") }}
            </button>
          </div></template
        >
        <template v-if="editor.mode === 'settings'"
          ><p class="buy-muted">
            {{
              ui(
                "Leave an undecided threshold or reminder delay empty. Ordering remains blocked until the approval policy is validated.",
                "Laissez vide un seuil ou un délai non décidé. La commande reste bloquée tant que la politique n’est pas validée.",
              )
            }}
          </p>
          <div class="buy-section-head">
            <h4>{{ ui("Authorized approvers", "Responsables habilités") }}</h4>
            <button
              type="button"
              class="bz-btn bz-btn--ghost"
              @click="
                form.approvers.push({
                  id: crypto.randomUUID(),
                  name: '',
                  direction: false,
                  deputyFor: '',
                })
              "
            >
              {{ ui("Add approver", "Ajouter un responsable") }}
            </button>
          </div>
          <div
            v-for="(a, index) in form.approvers"
            :key="a.id"
            class="buy-edit-line"
          >
            <label
              >{{ ui("Name", "Nom") }}<input v-model="a.name" required /></label
            ><label class="buy-check"
              ><input v-model="a.direction" type="checkbox" />{{
                ui("Direction", "Direction")
              }}</label
            ><label
              >{{ ui("Deputy for", "Suppléant de")
              }}<select v-model="a.deputyFor">
                <option value="">—</option>
                <option
                  v-for="other in form.approvers.filter((x) => x.id !== a.id)"
                  :value="other.id"
                  :key="other.id"
                >
                  {{ other.name }}
                </option>
              </select></label
            ><button
              type="button"
              class="bz-btn bz-btn--ghost"
              @click="form.approvers.splice(index, 1)"
            >
              {{ ui("Remove", "Retirer") }}
            </button>
          </div></template
        >
        <template v-if="editor.mode === 'history'"
          ><p class="buy-muted">
            {{
              ui(
                "Excel or CSV columns: description, quantity, unitPrice, supplier, date. Prices remain historical; matching never overwrites the live catalogue.",
                "Colonnes Excel ou CSV : description, quantité, prix unitaire, fournisseur, date. Les prix restent historiques ; le rapprochement ne modifie jamais le catalogue.",
              )
            }}
          </p>
          <label class="buy-upload"
            >{{ ui("Choose archive", "Choisir une archive")
            }}<input type="file" accept=".xlsx,.xls,.csv" @change="readHistory"
          /></label>
          <p v-if="form.rows?.length">
            {{ form.rows.length }}
            {{ ui("rows to import", "lignes à importer") }}
          </p>
          <div
            v-for="(r, index) in (form.rows || []).slice(0, 5)"
            :key="index"
            class="buy-line"
          >
            <span>{{ r.description }}</span
            ><span>{{ r.quantity ?? "—" }}</span>
          </div></template
        >
        <label v-if="evidenceField" class="buy-upload"
          ><span aria-hidden="true" class="material-symbols-outlined"
            >attach_file</span
          >{{ ui("Attach local evidence", "Joindre un justificatif local")
          }}<input type="file" @change="uploadEvidence"
        /></label>
        <p v-if="form.attachmentName" class="buy-muted">
          {{ form.attachmentName }}
        </p>
        <label class="buy-check buy-confirm"
          ><input v-model="form.confirmed" type="checkbox" required /><span>{{
            ui(
              "I reviewed these records and confirm this operation.",
              "J’ai vérifié les éléments et je confirme cette opération.",
            )
          }}</span></label
        >
        <footer class="buy-form-footer">
          <button
            class="bz-btn bz-btn--ghost"
            type="button"
            :disabled="busy"
            @click="editor = null"
          >
            {{ ui("Cancel", "Annuler") }}</button
          ><button
            class="bz-btn bz-btn--primary"
            type="submit"
            :disabled="busy"
          >
            {{
              busy
                ? ui("Saving…", "Enregistrement…")
                : ui("Save", "Enregistrer")
            }}
          </button>
        </footer>
      </form></GmaoDialog
    >
    <GmaoDialog
      v-if="document"
      :title="document.filename"
      @close="document = null"
      ><iframe
        v-if="document.url"
        class="buy-pdf"
        :src="document.url"
        :title="document.filename"
      ></iframe
      ><a
        v-if="document.url"
        class="bz-btn bz-btn--primary"
        :href="document.url"
        :download="document.filename"
        >{{ ui("Download", "Télécharger") }}</a
      ></GmaoDialog
    >
  </section>
</template>
<script setup>
import "./company-design.css";
import CompanyMetricStrip from "./CompanyMetricStrip.vue";
import { useCompanyDraft } from "../../services/company/viewDrafts.js";
import CompanyLogistics from "./CompanyLogistics.vue";
import CompanyRecordFlow from "./CompanyRecordFlow.vue";
import { ref, reactive, computed, watch, onBeforeUnmount, nextTick } from "vue";
import { i18n } from "../../i18n/index.js";
import {
  purchasing as api,
  onPurchasingChanged,
  saveEvidence,
} from "../../services/company/purchasing.js";
import GmaoDialog from "./GmaoDialog.vue";
const props = defineProps({
  companyId: { type: String, required: true },
  initialView: { type: String, default: "requests" },
});
const emit = defineEmits(["changed", "open-chat", "open-task"]);
const crypto = globalThis.crypto;
const ui = (en, fr) => (i18n.state.locale === "fr" ? fr || en : en);
const blank = () => ({
  settings: {},
  logistics: [],
  requests: [],
  suppliers: [],
  items: [],
  quotes: [],
  orders: [],
  receipts: [],
  invoices: [],
  payments: [],
  paymentDossiers: [],
  equipment: [],
  preferences: [],
  rfqs: [],
  replies: [],
  approvals: [],
  reviews: [],
  history: [],
  dpgf: [],
  forecast: [],
  evidence: [],
});
const data = ref(blank()),
  view = ref(props.initialView),
  query = ref(""),
  selectedId = ref(null),
  loading = ref(false),
  busy = ref(false),
  error = ref(""),
  notice = ref(""),
  editor = ref(null),
  form = reactive({}),
  formError = ref(""),
  document = ref(null);
useCompanyDraft(() => props.companyId + ":purchasing", {view, selectedId, editor, form});
const requestFilter = ref('');
const purchaseMetrics = computed(() => [
  {id:'requests',label:ui('Open requests','Demandes ouvertes'),value:data.value.requests.filter(r=>!['received','cancelled'].includes(r.status)).length,icon:'shopping_bag',action:true,target:'requests'},
  {id:'approval',label:ui('Awaiting approval','À valider'),value:data.value.requests.filter(r=>r.status==='awaiting_approval').length,icon:'approval',action:true,target:'requests',tone:data.value.requests.some(r=>r.status==='awaiting_approval')?'warning':null,selected:view.value==='requests' && requestFilter.value==='awaiting_approval'},
  {id:'stock',label:ui('Below minimum','Sous le minimum'),value:data.value.items.filter(i=>i.available<Math.max(i.minimum,i.contractMinimum||0)).length,icon:'inventory_2',action:true,target:'stock'},
  {id:'invoices',label:ui('Unsettled supplier invoices','Factures fournisseurs à régler'),value:data.value.invoices.filter(i=>i.status!=='paid').length,icon:'receipt_long'},
]);
const sections = computed(() => [
  { id: "logistics", label: ui("Logistics & margin", "Logistique et marge"), icon: "local_shipping" },
  { id: "requests", label: ui("Requests", "Demandes"), icon: "shopping_bag" },
  { id: "stock", label: ui("Stock", "Stock"), icon: "inventory_2" },
  { id: "equipment", label: ui("Equipment", "Matériel"), icon: "construction" },
  {
    id: "suppliers",
    label: ui("Suppliers", "Fournisseurs"),
    icon: "storefront",
  },
]);
const sectionTitle = computed(() =>
  view.value === "reviews"
    ? ui("Operational review", "Revue des achats")
    : sections.value.find((s) => s.id === view.value)?.label ||
      ui("Purchasing & logistics", "Achats et logistique"),
);
const primaryMode = computed(
  () =>
    ({
      stock: "item",
      equipment: "equipment",
      suppliers: "supplier",
      reviews: "request",
    })[view.value] || "request",
);
const primaryLabel = computed(
  () =>
    ({
      stock: ui("New item", "Nouvel article"),
      equipment: ui("New equipment", "Nouveau matériel"),
      suppliers: ui("New supplier", "Nouveau fournisseur"),
    })[view.value] || ui("New request", "Nouvelle demande"),
);
const selected = computed(
    () => data.value.requests.find((r) => r.id === selectedId.value) || null,
  ),
  selectedQuotes = computed(() =>
    data.value.quotes
      .filter((q) => q.requestId === selected.value?.id)
      .sort((a, b) => a.totalCents - b.totalCents),
  ),
  selectedOrder = computed(() =>
    data.value.orders.find((o) => o.requestId === selected.value?.id),
  ),
  selectedRfqs = computed(() =>
    data.value.rfqs.filter((r) => r.requestId === selected.value?.id),
  ),
  currentApprovals = computed(() =>
    data.value.approvals.filter(
      (a) =>
        a.requestId === selected.value?.id &&
        a.requestRevision === selected.value?.revision,
    ),
  );
const steps = computed(() => [
  ui("Identify", "Identifier"),
  ui("Compare", "Comparer"),
  ui("Approve", "Valider"),
  ui("Order", "Commander"),
  ui("Receive", "Réceptionner"),
]);
const stepIndex = computed(
  () =>
    ({
      requested: selected.value?.technicalConfirmed ? 1 : 0,
      awaiting_approval: 2,
      ordered: 3,
      partially_received: 4,
      received: 5,
    })[selected.value?.status] ?? 0,
);
const filtered = (rows) =>
  rows.filter((r) =>
    JSON.stringify(r).toLowerCase().includes(query.value.toLowerCase()),
  );
const money = (n) =>
  new Intl.NumberFormat(i18n.state.locale, {
    style: "currency",
    currency: "EUR",
  }).format((n || 0) / 100);
const date = (n) =>
  n ? new Date(n).toLocaleDateString(i18n.state.locale) : "—";
const dateInput = (n) => (n ? new Date(n).toISOString().slice(0, 10) : "");
const typeLabel = (t) =>
  ({
    intervention: ui("Work order", "Intervention"),
    internal_equipment: ui("Internal equipment", "Matériel interne"),
    replenishment: ui("Replenishment", "Réassort"),
    tender: ui("Tender", "Appel d’offres"),
    contract: ui("Contract", "Marché"),
  })[t] || t;
const regionLabel = (r) =>
  ({
    local: ui("Local", "Local"),
    france: "France",
    international: ui("International", "International"),
    used: ui("Used / peer", "Occasion / confrère"),
    online: ui("Online marketplace", "Place de marché"),
  })[r] || r;
const stateLabel = (s, record) =>
  ({
    requested: record?.technicalConfirmed
      ? ui("Sourcing", "Recherche fournisseur")
      : ui("To identify", "À identifier"),
    awaiting_approval: ui("Awaiting approval", "À valider"),
    ordered: ui("Ordered", "Commandé"),
    partially_received: ui("Partial delivery", "Réception partielle"),
    received: ui("Received", "Réceptionné"),
    available: ui("Available", "Disponible"),
    checked_out: ui("Checked out", "Emprunté"),
    defective: ui("Defective", "Défectueux"),
    draft: ui("Draft", "Brouillon"),
    awaiting_reply: ui("Awaiting reply", "Réponse attendue"),
    sending: ui("Sending", "Envoi en cours"),
    delivery_failed: ui("Sending rejected", "Envoi refusé"),
    delivery_unknown: ui(
      "Sending outcome to verify",
      "Résultat de l’envoi à vérifier",
    ),
    answered: ui("Answered", "Répondu"),
    approved: ui("Approved", "Validé"),
    rejected: ui("Rejected", "Refusé"),
    matched: ui("Matched", "Rapproché"),
    disputed: ui("Difference to review", "Écart à vérifier"),
    paid: ui("Settlement recorded", "Règlement rapproché"),
    open: ui("Open", "Ouvert"),
    completed: ui("Completed", "Terminé"),
  })[s] || s;
const translateError = (e) =>
  ({
    "Invoice total differs from the order.": ui(
      e,
      "Le montant diffère du bon de commande.",
    ),
    "The order has not been fully received.": ui(
      e,
      "La réception n’est pas complète.",
    ),
  })[e] || e;
async function load() {
  loading.value = true;
  error.value = "";
  const id = props.companyId;
  try {
    const snapshot = await api.snapshot(id);
    if (id !== props.companyId) return;
    data.value = { ...blank(), ...snapshot };
    if (!data.value.requests.some((r) => r.id === selectedId.value))
      selectedId.value = data.value.requests[0]?.id || null;
  } catch (e) {
    error.value = translateError(e.message);
  } finally {
    loading.value = false;
  }
}
async function openRfq(id, revision) {
  await load();
  const rfq = data.value.rfqs.find((r) => r.id === id);
  if (!rfq) {
    error.value = ui(
      "This supplier draft is unavailable in this team.",
      "Ce brouillon fournisseur est indisponible dans cette équipe.",
    );
    return false;
  }
  if (revision != null && Number(revision) !== rfq.revision) {
    error.value = ui(
      "This supplier draft changed after the approval request. Review a new approval for its current version.",
      "Ce brouillon fournisseur a changé après la demande de validation. Vérifiez une nouvelle demande correspondant à sa version actuelle.",
    );
    return false;
  }
  view.value = "requests";
  query.value = "";
  selectedId.value = rfq.requestId;
  await nextTick();
  const element = window.document.getElementById(`buy-rfq-${rfq.id}`);
  element?.scrollIntoView({ block: "center", behavior: "instant" });
  element?.focus({ preventScroll: true });
  return !!element;
}
async function openRequest(id, revision) {
  await load();
  const request = data.value.requests.find((r) => r.id === id);
  if (!request || (revision != null && Number(revision) !== request.revision)) {
    error.value = !request
      ? ui(
          "This purchasing request is unavailable in this team.",
          "Cette demande d’achat est indisponible dans cette équipe.",
        )
      : ui(
          "This purchasing request changed after the approval request. Review a new approval for its current version.",
          "Cette demande d’achat a changé après la demande de validation. Vérifiez une nouvelle validation correspondant à sa version actuelle.",
        );
    return false;
  }
  view.value = "requests";
  query.value = "";
  selectedId.value = request.id;
  await nextTick();
  const element = window.document.getElementById(`buy-request-${request.id}`);
  element?.scrollIntoView({ block: "start", behavior: "instant" });
  element?.focus({ preventScroll: true });
  return !!element;
}
async function openOrder(id) { await load(); const order=data.value.orders.find(o=>o.id===id); if(order)return openRequest(order.requestId);error.value=ui('Purchase order not found.','Commande introuvable.');return false; }
async function openSupplierInvoice(id) {
  await load();
  const invoice=data.value.invoices.find(i=>i.id===id),order=data.value.orders.find(o=>o.id===invoice?.orderId);
  if(!order){error.value=ui('Supplier invoice not found.','Facture fournisseur introuvable.');return false;}
  await openRequest(order.requestId);
  await nextTick();
  [...window.document.querySelectorAll('[data-invoice-id]')].find(e=>e.dataset.invoiceId===id)?.scrollIntoView({block:'center',behavior:'smooth'});
  return true;
}
function openSection(section) { if(sections.value.some(item=>item.id===section))view.value=section; }
defineExpose({ openOrder, openRfq, openRequest, openSupplierInvoice, openSection });
watch(
  () => props.companyId,
  () => {
    selectedId.value = null;
    document.value = null;
    load();
  },
  { immediate: true },
);
watch(
  () => props.initialView,
  (v) => {
    if (v) view.value = v;
  },
);
const unsubscribe = onPurchasingChanged((payload) => {
  if (!payload?.companyId || payload.companyId === props.companyId) load();
});
onBeforeUnmount(unsubscribe);
async function run(method, ...args) {
  busy.value = true;
  error.value = "";
  try {
    const result = await api[method](props.companyId, ...args);
    await load();
    emit("changed");
    return result;
  } catch (e) {
    error.value = translateError(e.message);
    throw e;
  } finally {
    busy.value = false;
  }
}
const modes = {
  request: ["New purchase request", "Nouvelle demande d’achat"],
  supplier: ["Supplier", "Fournisseur"],
  quote: ["Supplier quotation", "Offre fournisseur"],
  technical: ["Technical review", "Vérification technique"],
  selectQuote: ["Select quotation", "Retenir une offre"],
  approval: ["Approval decision", "Décision de validation"],
  order: ["Purchase order", "Bon de commande"],
  receipt: ["Delivery receipt", "Réception"],
  invoice: ["Supplier invoice", "Facture fournisseur"],
  payment: ["Record verified settlement", "Rapprocher un règlement vérifié"],
  preparePayment: [
    "Prepare supplier payment",
    "Préparer le règlement fournisseur",
  ],
  item: ["Catalogue item", "Article du catalogue"],
  movement: ["Stock movement", "Mouvement de stock"],
  warranty: ["Warranty claim", "Dossier de garantie"],
  equipment: ["Equipment", "Matériel"],
  checkout: ["Equipment checkout", "Emprunt de matériel"],
  return: ["Equipment return", "Retour de matériel"],
  defect: ["Equipment defect", "Défaut de matériel"],
  preference: ["Technician preference", "Préférence technicien"],
  rfq: ["Supplier request draft", "Brouillon fournisseur"],
  dispatch: ["Supplier sending receipt", "Reçu d’envoi fournisseur"],
  send: [
    "Review supplier recipients and send",
    "Vérifier les destinataires et envoyer",
  ],
  resolveDelivery: [
    "Verify sending outcome",
    "Vérifier le résultat de l’envoi",
  ],
  reply: ["Supplier response", "Réponse fournisseur"],
  settings: ["Purchasing settings", "Paramètres achats"],
  history: ["Historical purchases", "Archives des achats"],
  match: ["Match historical item", "Rapprocher un article historique"],
  dpgf: ["DPGF line check", "Contrôle des lignes DPGF"],
  review: ["Review outcome", "Résultat de la revue"],
};
const editorTitle = computed(() =>
  ui(...(modes[editor.value?.mode] || ["Purchasing", "Achats"])),
);
function open(mode, record = {}) {
  editor.value = { mode, record };
  formError.value = "";
  for (const key of Object.keys(form)) delete form[key];
  Object.assign(form, JSON.parse(JSON.stringify(record)), { confirmed: false });
  if (mode === "approval") form.quoteRevision = record.selectedQuoteRevision;
  if (mode === "request" && !record.id)
    Object.assign(form, {
      title: "",
      type: "internal_equipment",
      items: [{ label: "", quantity: 1 }],
      technicalConfirmed: false,
    });
  if (mode === "request" && record.neededAt)
    form.neededAt = new Date(record.neededAt).toISOString().slice(0, 10);
  if (mode === "supplier")
    Object.assign(form, {
      ...record,
      region: record.region || "local",
      brands: (record.brands || []).join(", "),
      families: (record.families || []).join(", "),
      bankBeneficiary: record.bankDetails?.beneficiary || "",
      bankIban: record.bankDetails?.iban || "",
      bankBic: record.bankDetails?.bic || "",
      bankVerifiedBy: record.bankDetails?.verifiedBy || "",
      bankEvidenceReference: record.bankDetails?.evidenceReference || "",
      contacts: record.contacts?.length
        ? JSON.parse(JSON.stringify(record.contacts))
        : [{ name: "", channel: "email", address: "" }],
    });
  if (mode === "quote")
    Object.assign(form, {
      supplierId: "",
      reference: "",
      leadDays: "",
      shipping: 0,
      vatRate: "",
      transport: "local",
      items: record.items.map((l) => ({
        requestLineId: l.id,
        label: l.label,
        quantity: l.quantity,
        price: "",
      })),
    });
  if (mode === "receipt") {
    const totals = {};
    for (const r of data.value.receipts.filter((r) => r.orderId === record.id))
      for (const l of r.items)
        totals[l.requestLineId] = (totals[l.requestLineId] || 0) + l.quantity;
    form.items = record.items
      .map((l) => ({
        requestLineId: l.requestLineId,
        label: l.label,
        orderedQuantity: l.quantity - (totals[l.requestLineId] || 0),
        quantity: 0,
      }))
      .filter((l) => l.orderedQuantity > 0);
  }
  if (mode === "settings")
    Object.assign(form, {
      ...JSON.parse(JSON.stringify(data.value.settings)),
      threshold:
        data.value.settings.directionThresholdCents == null
          ? ""
          : data.value.settings.directionThresholdCents / 100,
      approvers: JSON.parse(
        JSON.stringify(data.value.settings.approvers || []),
      ),
      approvalCount: data.value.settings.approvalCount || 1,
      followupHours: data.value.settings.followupHours ?? "",
      confirmed: false,
    });
  if (mode === "equipment")
    Object.assign(form, {
      ...record,
      type: record.type || "shared",
      expiresAt: dateInput(record.expiresAt),
    });
  if (mode === "invoice")
    Object.assign(form, { total: record.totalCents / 100, dueAt: "" });
  if (mode === "payment")
    Object.assign(form, {
      amount: record.totalCents / 100,
      settledAt: dateInput(Date.now()),
      method: "bank",
    });
  if (mode === "item")
    Object.assign(form, {
      ...record,
      minimum: record.minimum || 0,
      contractMinimum: record.contractMinimum || 0,
    });
  if (mode === "return")
    Object.assign(form, { safe: true, clean: false, cleaningMinutes: 0 });
  if (mode === "dispatch") form.sentAt = dateInput(Date.now());
  if (mode === "approval") form.decision = "approved";
  if (mode === "warranty") Object.assign(form, {status:record?.status || "open",nextAt:dateInput(record?.nextAt || Date.now()+7*86400000)});
  if (mode === "movement")
    Object.assign(form, { itemId: record.id, type: "receive", quantity: 1, locationId: "depot", requestId: "" });
  if (mode === "rfq")
    Object.assign(form, {
      subject: record.title,
      message: record.items
        .map(
          (l) =>
            `${l.quantity} × ${l.label} ${l.brand || ""} ${l.manufacturerReference || ""}`,
        )
        .join("\n"),
    });
}
const field = (key, en, fr, type = "text", extra = {}) => ({
  key,
  label: ui(en, fr),
  type,
  ...extra,
});
const options = (rows, label = "name") =>
  rows.map((r) => ({ value: r.id, label: r[label] }));
const fields = computed(() => {
  const f = field,
    select = (key, en, fr, values) =>
      f(key, en, fr, "select", { options: values }),
    sups = options(data.value.suppliers);
  switch (editor.value?.mode) {
    case "request":
      return [
        f("title", "Request title", "Objet de la demande", "text", {
          wide: true,
        }),
        select(
          "type",
          "Type",
          "Type",
          [
            "internal_equipment",
            "replenishment",
            "intervention",
            "tender",
            "contract",
          ].map((v) => ({ value: v, label: typeLabel(v) })),
        ),
        f("technician", "Technician", "Technicien", "text", {
          required: false,
        }),
        f("description", "Context", "Contexte", "textarea", {
          required: false,
          wide: true,
        }),
        f("neededAt", "Needed by", "Date souhaitée", "date", {
          required: false,
        }),
        ...(form.type === "tender"
          ? [
              {
                ...select(
                  "dpgfId",
                  "DPGF line review",
                  "Contrôle DPGF",
                  options(data.value.dpgf, "title"),
                ),
                required: false,
              },
            ]
          : []),
      ];
    case "supplier":
      return [
        f("name", "Supplier name", "Nom du fournisseur"),
        select(
          "region",
          "Region",
          "Zone",
          ["local", "france", "international", "used", "online"].map((v) => ({
            value: v,
            label: regionLabel(v),
          })),
        ),
        f(
          "brands",
          "Brands (comma separated)",
          "Marques (séparées par des virgules)",
          "text",
          { required: false },
        ),
        f("families", "Purchase families", "Familles d’achats", "text", {
          required: false,
        }),
        f(
          "authorized",
          "Distribution authorization checked",
          "Carte de distribution vérifiée",
          "check",
        ),
        f(
          "evidenceReference",
          "Distribution evidence",
          "Justificatif de la carte",
          "text",
          { required: false },
        ),
        f(
          "bankBeneficiary",
          "Bank beneficiary (optional)",
          "Bénéficiaire bancaire (facultatif)",
          "text",
          { required: false },
        ),
        f("bankIban", "Supplier IBAN", "IBAN fournisseur", "text", {
          required: !!form.bankBeneficiary,
        }),
        f("bankBic", "Supplier BIC", "BIC fournisseur", "text", {
          required: false,
        }),
        f(
          "bankVerifiedBy",
          "Bank details checked by",
          "Coordonnées bancaires vérifiées par",
          "text",
          { required: !!form.bankIban },
        ),
        f(
          "bankEvidenceReference",
          "Verified bank details evidence",
          "Justificatif des coordonnées bancaires",
          "text",
          { required: !!form.bankIban },
        ),
        f("notes", "Notes", "Notes", "textarea", {
          required: false,
          wide: true,
        }),
      ];
    case "quote":
      return [
        select("supplierId", "Supplier", "Fournisseur", sups),
        f("reference", "Quote reference", "Référence du devis"),
        f(
          "leadDays",
          "Delivery lead time (days)",
          "Délai de livraison (jours)",
          "number",
        ),
        f("shipping", "Shipping, excl. VAT (€)", "Transport HT (€)", "number"),
        f("vatRate", "VAT (%)", "TVA (%)", "number"),
        f("validUntil", "Valid until", "Validité", "date", { required: false }),
        f("evidenceReference", "Quote evidence", "Justificatif du devis"),
        f(
          "compatible",
          "Compatibility checked",
          "Compatibilité vérifiée",
          "check",
        ),
        f(
          "compatibilityEvidence",
          "Compatibility evidence",
          "Éléments de compatibilité",
        ),
        select("transport", "Transport", "Transport", [
          { value: "local", label: ui("Local delivery", "Livraison locale") },
          { value: "air", label: ui("Air", "Aérien") },
          { value: "sea", label: ui("Sea", "Maritime") },
          { value: "parcel", label: ui("Parcel", "Colis") },
          {
            value: "collection",
            label: ui("Supplier collection", "Retrait fournisseur"),
          },
        ]),
        f(
          "transportConfirmed",
          "Transport / compliance checked",
          "Transport et conformité vérifiés",
          "check",
        ),
        f(
          "transportEvidence",
          "Transport evidence or authorized exception",
          "Justificatif transport ou dérogation autorisée",
        ),
      ];
    case "technical":
      return [
        f("reviewer", "Reviewer", "Vérificateur"),
        f(
          "evidenceReference",
          "Technical reference / evidence",
          "Référence technique / justificatif",
        ),
      ];
    case "selectQuote":
      return [
        f(
          "localSearchEvidence",
          "Local sourcing outcome (required for other regions)",
          "Résultat de la recherche locale (requis hors local)",
          "textarea",
          { required: false, wide: true },
        ),
      ];
    case "approval":
      return [
        select(
          "approverId",
          "Approver",
          "Responsable",
          (data.value.settings.approvers || []).map((a) => ({
            value: a.id,
            label: a.name,
          })),
        ),
        select("decision", "Decision", "Décision", [
          { value: "approved", label: ui("Approved", "Validé") },
          { value: "rejected", label: ui("Rejected", "Refusé") },
        ]),
        f(
          "evidenceReference",
          "Approval evidence",
          "Justificatif de validation",
        ),
        f("recordedBy", "Recorded by", "Enregistré par"),
      ];
    case "order":
      return [
        f(
          "deliveryAddress",
          "Delivery address",
          "Adresse de livraison",
          "textarea",
          { wide: true },
        ),
        f("terms", "Agreed terms", "Conditions convenues", "textarea", {
          wide: true,
        }),
      ];
    case "receipt":
      return [
        f(
          "reference",
          "Delivery note reference",
          "Référence du bon de livraison",
        ),
        f("receivedBy", "Received by", "Réceptionné par"),
        f(
          "evidenceReference",
          "Delivery evidence",
          "Justificatif de réception",
        ),
      ];
    case "invoice":
      return [
        f(
          "reference",
          "Supplier invoice number",
          "Numéro de facture fournisseur",
        ),
        f("total", "Invoice total, incl. VAT (€)", "Total TTC (€)", "number"),
        f("dueAt", "Due date", "Échéance", "date"),
        f("evidenceReference", "Invoice evidence", "Justificatif de facture"),
      ];
    case "payment":
      return [
        f("amount", "Settled amount (€)", "Montant réglé (€)", "number"),
        f("method", "Payment method", "Mode de paiement"),
        f(
          "providerReference",
          "Bank or payment reference",
          "Référence bancaire",
        ),
        f(
          "receiptReference",
          "Verified settlement receipt",
          "Justificatif du règlement vérifié",
        ),
        f("verifiedBy", "Verified by", "Vérifié par"),
        f("settledAt", "Settlement date", "Date du règlement", "date"),
      ];
    case "item":
      return [
        f("name", "Item", "Article"),
        f("sku", "Internal reference", "Référence interne"),
        f(
          "manufacturerReference",
          "Manufacturer reference",
          "Référence constructeur",
          "text",
          { required: false },
        ),
        f("brand", "Brand", "Marque", "text", { required: false }),
        f("family", "Family", "Famille", "text", { required: false }),
        f("minimum", "Minimum quantity", "Quantité minimale", "number"),
        f(
          "contractMinimum",
          "Contractual minimum",
          "Minimum contractuel",
          "number",
        ),
      ];
    case "warranty":
      return [f("title", "Claim", "Réclamation"),select("itemId","Item","Article",options(data.value.items)),select("invoiceId","Supplier invoice","Facture fournisseur",options(data.value.invoices,"reference")),select("status","Status","État",[["open","Open","Ouvert"],["submitted","Submitted","Transmis"],["replacement","Replacement agreed","Remplacement accepté"],["credit","Credit agreed","Avoir accepté"],["rejected","Rejected","Refusé"],["closed","Closed","Clôturé"]].map(([value,en,fr])=>({value,label:ui(en,fr)}))),f("evidenceReference","Evidence reference","Référence du justificatif"),f("nextAt","Follow-up date","Date de suivi","date")];
    case "movement":
      return [
        select(
          "type",
          "Movement",
          "Mouvement",
          [
            ["receive", "Receive", "Entrée"],
            ["consume", "Consume", "Consommation"],
            ["reserve", "Reserve", "Réservation"],
            ["release", "Release reservation", "Libérer une réservation"],
            ["return", "Return", "Retour"],
            ["transfer", "Transfer", "Transfert"],
            ["fulfill", "Use reserved parts", "Utiliser les pièces réservées"],
            ["supplier_return", "Return to supplier", "Retour fournisseur"],
          ].map(([value, en, fr]) => ({ value, label: ui(en, fr) })),
        ),
        f("locationId", "Depot / vehicle", "Dépôt / véhicule"),
        ...(form.type === "transfer" ? [f("destinationId", "Destination depot / vehicle", "Dépôt / véhicule destinataire")] : []),
        { ...select("requestId", "Parts request", "Demande de pièces", [{value:"",label:ui("Unassigned", "Sans affectation")}, ...data.value.requests.filter(r => r.items?.some(i => i.itemId === form.itemId)).map(r => ({value:r.id,label:r.title}))]), required:false },
        f("quantity", "Quantity", "Quantité", "number"),
        f("reference", "Reason / reference", "Motif / référence"),
      ];
    case "equipment":
      return [
        f("name", "Equipment", "Matériel"),
        f("reference", "Reference", "Référence"),
        select("type", "Assignment", "Affectation", [
          { value: "shared", label: ui("Shared", "Collectif") },
          { value: "personal", label: ui("Personal", "Individuel") },
        ]),
        f(
          "assignedTo",
          "Technician (personal equipment)",
          "Technicien (matériel individuel)",
          "text",
          { required: form.type === "personal" },
        ),
        f(
          "expiresAt",
          "Expiry / inspection due",
          "Échéance / contrôle",
          "date",
          { required: false },
        ),
      ];
    case "checkout":
      return [
        f("borrower", "Technician", "Technicien"),
        f("condition", "Condition at checkout", "État au départ"),
      ];
    case "return":
      return [
        f("clean", "Equipment is clean", "Le matériel est propre", "check"),
        f(
          "safe",
          "Equipment is safe to use",
          "Le matériel peut être utilisé en sécurité",
          "check",
        ),
        f(
          "cleaningMinutes",
          "Cleaning time (minutes)",
          "Temps de nettoyage (minutes)",
          "number",
        ),
        f("condition", "Condition on return", "État au retour"),
      ];
    case "defect":
      return [
        f("description", "Defect and risk", "Défaut et risque", "textarea", {
          wide: true,
        }),
        f("evidenceReference", "Photo evidence", "Justificatif photo"),
      ];
    case "preference":
      return [
        f("technician", "Technician", "Technicien"),
        f("family", "Part family", "Type de pièce"),
        f("brand", "Preferred brand", "Marque préférée"),
        f("reason", "Reason", "Motif", "textarea", { wide: true }),
      ];
    case "rfq":
      return [
        select("supplierId", "Supplier", "Fournisseur", sups),
        f("subject", "Subject", "Objet"),
        f("message", "Supplier message", "Message fournisseur", "textarea", {
          wide: true,
        }),
      ];
    case "dispatch":
      return [
        f(
          "providerReference",
          "Send receipt / provider ID",
          "Reçu d’envoi / identifiant fournisseur",
        ),
        f("sentAt", "Sent on", "Envoyé le", "date"),
      ];
    case "send":
      return [
        f(
          "emailSender",
          "Sender email (email recipients)",
          "Email expéditeur (destinataires email)",
          "email",
          {
            required: editor.value.record.contacts.some(
              (c) => c.channel === "email",
            ),
          },
        ),
        f(
          "whatsappSender",
          "WhatsApp sender (+country code)",
          "Expéditeur WhatsApp (+indicatif)",
          "text",
          {
            required: editor.value.record.contacts.some(
              (c) => c.channel === "whatsapp",
            ),
          },
        ),
      ];
    case "resolveDelivery":
      return [
        f(
          "sent",
          "Provider confirms the message was submitted",
          "Le fournisseur confirme la prise en charge",
          "check",
        ),
        f(
          "providerReference",
          "Provider reference",
          "Référence du fournisseur",
          "text",
          { required: false },
        ),
        f(
          "evidenceReference",
          "Provider verification evidence",
          "Justificatif de vérification",
        ),
        f("verifiedBy", "Verified by", "Vérifié par"),
      ];
    case "reply":
      return [
        f("body", "Supplier reply", "Réponse fournisseur", "textarea", {
          wide: true,
        }),
        f(
          "externalReference",
          "Source message reference",
          "Référence du message source",
        ),
        f(
          "resolved",
          "Reply resolves this question",
          "Cette réponse résout la demande",
          "check",
        ),
      ];
    case "settings":
      return [
        f(
          "threshold",
          "Direction threshold (€), pending validation",
          "Seuil direction (€), à valider",
          "number",
          { required: false },
        ),
        select("approvalCount", "Required approvals", "Validations requises", [
          { value: 1, label: "1" },
          { value: 2, label: "2" },
        ]),
        f(
          "followupHours",
          "Supplier follow-up (hours), pending validation",
          "Relance fournisseur (heures), à valider",
          "number",
          { required: false },
        ),
        f("validatedBy", "Policy validated by", "Règles validées par"),
      ];
    case "match":
      return [
        select(
          "itemId",
          "Catalogue item",
          "Article du catalogue",
          options(data.value.items),
        ),
        f("reviewer", "Reviewer", "Vérificateur"),
      ];
    case "dpgf":
      return [
        f("title", "Tender", "Appel d’offres"),
        f("sourceReference", "Source document", "Document source"),
        f(
          "expected",
          "Required line references, one per line",
          "Références attendues, une par ligne",
          "textarea",
          { wide: true },
        ),
        f(
          "offered",
          "Offered line references, one per line",
          "Références proposées, une par ligne",
          "textarea",
          { wide: true },
        ),
      ];
    case "review":
      return [
        f(
          "outcome",
          "Outcome and remaining questions",
          "Résultat et questions ouvertes",
          "textarea",
          { wide: true },
        ),
        f("reviewedBy", "Reviewed by", "Responsable de la revue"),
      ];
    default:
      return [];
  }
});
const evidenceField = computed(
  () =>
    ({
      quote: "evidenceReference",
      supplier: form.bankIban ? "bankEvidenceReference" : "evidenceReference",
      technical: "evidenceReference",
      approval: "evidenceReference",
      receipt: "evidenceReference",
      invoice: "evidenceReference",
      payment: "receiptReference",
      defect: "evidenceReference",
      reply: "externalReference",
      dpgf: "sourceReference",
    })[editor.value?.mode],
);
async function uploadEvidence(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  busy.value = true;
  try {
    const saved = await saveEvidence(props.companyId, file);
    form[evidenceField.value] = saved.id;
    form.attachmentName = saved.filename;
  } catch (e) {
    formError.value = e.message;
  } finally {
    busy.value = false;
    event.target.value = "";
  }
}
async function readHistory(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const XLSX = await import("xlsx");
    const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const normalize = (s) =>
      String(s)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "");
    const rows = [];
    for (const name of book.SheetNames)
      for (const [index, row] of XLSX.utils
        .sheet_to_json(book.Sheets[name])
        .entries()) {
        const fields = Object.fromEntries(
          Object.entries(row).map(([k, v]) => [normalize(k), v]),
        );
        const description =
          fields.description || fields.designation || fields.article;
        if (!description) continue;
        const value = fields.unitprice ?? fields.prixunitaire;
        rows.push({
          source: `${file.name} · ${name} · ${index + 2}`,
          description: String(description),
          quantity: fields.quantity ?? fields.quantite ?? null,
          unitPriceCents:
            value == null
              ? null
              : Math.round(Number(String(value).replace(",", ".")) * 100),
          supplierName: fields.supplier || fields.fournisseur || "",
          date: fields.date || null,
        });
      }
    if (!rows.length)
      throw new Error(
        ui("No description column found.", "Colonne description introuvable."),
      );
    form.rows = rows;
  } catch (e) {
    formError.value = e.message;
  }
}
async function save() {
  if (busy.value) return;
  busy.value = true;
  formError.value = "";
  const f = JSON.parse(JSON.stringify(form)),
    r = editor.value.record,
    mode = editor.value.mode,
    id = props.companyId;
  const cash = (v) => Math.round(Number(v) * 100),
    when = (v) => (v ? new Date(v).getTime() : null);
  let method, args;
  switch (mode) {
    case "request":
      method = "saveRequest";
      args = [{ ...f, neededAt: when(f.neededAt) }];
      break;
    case "supplier":
      method = "saveSupplier";
      args = [
        {
          ...f,
          bankDetails: {
            beneficiary: f.bankBeneficiary,
            iban: f.bankIban,
            bic: f.bankBic,
            verifiedBy: f.bankVerifiedBy,
            evidenceReference: f.bankEvidenceReference,
          },
        },
      ];
      break;
    case "quote":
      method = "addQuote";
      args = [
        {
          ...f,
          id: undefined,
          requestId: r.id,
          items: f.items.map((l) => ({ ...l, unitPriceCents: cash(l.price) })),
          shippingCents: cash(f.shipping),
          vatRate: Number(f.vatRate),
          leadDays: Number(f.leadDays),
          validUntil: when(f.validUntil),
        },
      ];
      break;
    case "technical":
      method = "confirmTechnical";
      args = [r.id, f];
      break;
    case "selectQuote":
      method = "selectQuote";
      args = [selected.value.id, { ...f, quoteId: r.id }];
      break;
    case "approval":
      method = "approveRequest";
      args = [r.id, f];
      break;
    case "order":
      method = "issueOrder";
      args = [r.id, f];
      break;
    case "receipt":
      method = "recordReceipt";
      args = [r.id, { ...f, items: f.items.filter((l) => l.quantity > 0) }];
      break;
    case "invoice":
      method = "saveSupplierInvoice";
      args = [
        {
          ...f,
          orderId: r.id,
          totalCents: cash(f.total),
          dueAt: when(f.dueAt),
        },
      ];
      break;
    case "preparePayment":
      method = "preparePayment";
      args = [r.id, f];
      break;
    case "payment":
      method = "recordPayment";
      args = [
        r.id,
        { ...f, amountCents: cash(f.amount), settledAt: when(f.settledAt) },
      ];
      break;
    case "item":
      method = "saveItem";
      args = [
        {
          ...f,
          minimum: Number(f.minimum),
          contractMinimum: Number(f.contractMinimum),
        },
      ];
      break;
    case "warranty":
      method = "saveWarranty";
      args = [{...f,nextAt:when(f.nextAt)}];
      break;
    case "movement":
      method = "stockMove";
      args = [{ ...f, quantity: Number(f.quantity) }];
      break;
    case "equipment":
      method = "saveEquipment";
      args = [{ ...f, expiresAt: when(f.expiresAt) }];
      break;
    case "checkout":
      method = "checkoutEquipment";
      args = [r.id, f];
      break;
    case "return":
      method = "returnEquipment";
      args = [r.id, { ...f, cleaningMinutes: Number(f.cleaningMinutes) }];
      break;
    case "defect":
      method = "reportDefect";
      args = [r.id, { ...f, photoRefs: [f.evidenceReference] }];
      break;
    case "preference":
      method = "savePreference";
      args = [f];
      break;
    case "rfq":
      method = "saveRfq";
      args = [{ ...f, requestId: r.id, contacts: undefined }];
      break;
    case "dispatch":
      method = "recordRfqDispatch";
      args = [r.id, { ...f, sentAt: when(f.sentAt) }];
      break;
    case "send":
      method = "sendRfq";
      args = [r.id, { ...f, revision: r.revision }];
      break;
    case "resolveDelivery":
      method = "resolveRfqDelivery";
      args = [r.id, { ...f, index: r.dispatchIndex }];
      break;
    case "reply":
      method = "recordSupplierReply";
      args = [r.id, f];
      break;
    case "settings":
      method = "saveSettings";
      args = [
        {
          ...f,
          approvalCount: Number(f.approvalCount),
          directionThresholdCents:
            f.threshold === "" ? null : cash(f.threshold),
          followupHours:
            f.followupHours === "" ? null : Number(f.followupHours),
        },
      ];
      break;
    case "history":
      method = "importHistory";
      args = [f.rows || []];
      break;
    case "match":
      method = "confirmHistoryMatch";
      args = [r.id, f];
      break;
    case "dpgf":
      method = "reviewDpgf";
      args = [
        {
          ...f,
          expectedLines: f.expected.split("\n"),
          offeredLines: f.offered.split("\n"),
        },
      ];
      break;
    case "review":
      method = "completeReview";
      args = [r.id, f];
      break;
  }
  try {
    const result = await api[method](id, ...args);
    editor.value = null;
    await load();
    if (mode === "request") selectedId.value = result.id;
    notice.value = ui("Saved locally.", "Enregistré localement.");
    emit("changed");
  } catch (e) {
    formError.value = translateError(e.message);
  } finally {
    busy.value = false;
  }
}
async function showEvidence(d) {
  if (!d.blobId || !d.blobExt) {
    error.value = ui(
      "This file is not available locally.",
      "Ce fichier n’est pas disponible localement.",
    );
    return;
  }
  try {
    const url = await window.electronAPI.db.blobs.url(
      d.blobId,
      d.blobExt,
      d.mimeType || "application/pdf",
    );
    document.value = { ...d, url };
  } catch (e) {
    error.value = e.message;
  }
}
async function generateOrder(order) {
  try {
    busy.value = true;
    const result = await api.generateDocument(props.companyId, order.id);
    await load();
    const doc = result.document || result;
    await showEvidence(doc);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>
<style scoped>
.buy-workspace {
  color: var(--bz-fg);
  font: 400 14px/1.55 var(--bz-font-body);
  min-width: 0;
  padding: 0;
}
.buy-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 28px;
}
.buy-head h2 {
  font: italic 900 32px/1.2 var(--bz-font-metric);
  margin: 4px 0 0;
}
.buy-kicker {
  font-size: 12px;
  color: var(--bz-fg-mid);
  margin: 0;
}
.buy-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.buy-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-block: 1px solid var(--bz-border);
  padding: 22px 0;
  margin-bottom: 22px;
  gap: 24px;
}
.buy-metrics > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.buy-metrics span {
  color: var(--bz-fg-mid);
  font-size: 12px;
}
.buy-metrics strong {
  font-size: 28px;
  line-height: 1.3;
}
.buy-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: center;
  margin: 0 0 22px;
}
.buy-toolbar nav {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.buy-toolbar nav button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  color: var(--bz-fg-mid);
  border: 1px solid transparent;
  border-radius: var(--bz-r-md);
  background: transparent;
  font: inherit;
  cursor: pointer;
  min-height: 42px;
}
.buy-toolbar nav button[aria-current] {
  color: var(--bz-accent-fg, var(--bz-fg));
  background: var(--bz-accent-soft);
  border-color: var(--bz-accent);
}
.buy-toolbar nav button:hover {
  background: var(--bz-hover);
}
.buy-search {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-md);
  padding: 8px 12px;
  background: var(--bz-input, var(--bz-card));
  min-width: 160px;
}
.buy-search input {
  border: 0;
  background: transparent;
  color: var(--bz-fg);
  font: inherit;
  min-width: 0;
  width: 100%;
  outline: none;
}
.buy-search:focus-within {
  border-color: var(--bz-accent);
  outline: 2px solid var(--bz-focus-ring, var(--bz-accent));
  outline-offset: 2px;
}
.buy-split {
  display: grid;
  grid-template-columns: minmax(260px, 0.8fr) minmax(0, 1.8fr);
  gap: 28px;
  align-items: start;
}
.buy-records {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 780px;
  overflow: auto;
  padding: 3px;
}
.buy-records button {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 7px;
  color: var(--bz-fg);
  padding: 17px 18px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
  background: var(--bz-card);
  font: inherit;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
}
.buy-records button:hover {
  background: var(--bz-hover);
}
.buy-records button.selected {
  border-color: var(--bz-accent);
  background: var(--bz-accent-soft);
}
.buy-records strong {
  font-size: 15px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.buy-record-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  color: var(--bz-fg-mid);
  font-size: 11px;
}
.buy-records small {
  color: var(--bz-fg-mid);
  font-size: 12px;
}
.buy-state {
  font-size: 11px;
  line-height: 1.4;
  padding: 4px 8px;
  border: 1px solid var(--bz-border);
  border-radius: 6px;
  color: var(--bz-fg-mid);
  width: fit-content;
  background: var(--bz-card);
}
.buy-detail {
  min-width: 0;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
  padding: 28px;
  background: var(--bz-card);
}
.buy-detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}
.buy-detail h3 {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.3;
  margin: 5px 0 8px;
  overflow-wrap: anywhere;
}
.buy-detail-head p {
  margin: 0;
  color: var(--bz-fg-mid);
  font-size: 12px;
}
.buy-progress {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  list-style: none;
  margin: 24px 0;
  padding: 0;
  gap: 5px;
}
.buy-progress li {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  border-top: 3px solid var(--bz-border);
  padding-top: 10px;
  color: var(--bz-fg-mid);
  font-size: 11px;
}
.buy-progress li span {
  font-size: 17px;
}
.buy-progress li.done,
.buy-progress li.current {
  border-color: var(--bz-accent);
}
.buy-progress li.current {
  color: var(--bz-fg);
  font-weight: 600;
}
.buy-description {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 13px;
  line-height: 1.7;
  margin: 12px 0;
}
.buy-block {
  border-top: 1px solid var(--bz-border);
  padding-top: 22px;
  margin-top: 24px;
}
.buy-section-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.buy-block h4,
.buy-section-head h4 {
  font-size: 14px;
  font-weight: 600;
  margin: 0;
}
.buy-line {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: center;
  padding: 14px 0;
  border-bottom: 1px solid var(--bz-border);
  min-width: 0;
  overflow-wrap: anywhere;
}
.buy-line strong,
.buy-line small {
  display: block;
}
.buy-line strong {
  font-size: 13px;
  font-weight: 500;
}
.buy-line small {
  color: var(--bz-fg-mid);
  font-size: 12px;
}
.buy-context {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 10px;
  margin-top: 16px;
  font-size: 12px;
}
.buy-context span {
  color: var(--bz-fg-mid);
}
.buy-context strong {
  font-weight: 500;
}
.buy-quotes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 12px;
}
.buy-quotes article {
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-md);
  padding: 17px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--bz-bg);
}
.buy-quotes article.chosen {
  border-color: var(--bz-accent);
}
.buy-quotes h5 {
  font-size: 14px;
  margin: 4px 0 8px;
}
.buy-quotes small,
.buy-quotes article > div > span:last-child {
  font-size: 11px;
  color: var(--bz-fg-mid);
  display: block;
}
.buy-quote-price {
  font-size: 25px;
  display: block;
  line-height: 1.3;
  margin-bottom: 6px;
}
.buy-quotes dl,
.buy-equipment dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
  font-size: 12px;
  margin: 0;
}
.buy-quotes dt,
.buy-equipment dt {
  color: var(--bz-fg-mid);
}
.buy-quotes dd,
.buy-equipment dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.buy-muted {
  color: var(--bz-fg-mid);
  font-size: 12px;
  line-height: 1.7;
}
.buy-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px;
}
.buy-equipment,
.buy-supplier {
  padding: 23px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
  background: var(--bz-card);
  min-width: 0;
}
.buy-equipment h3,
.buy-supplier h3 {
  font-size: 18px;
  margin: 4px 0 8px;
  overflow-wrap: anywhere;
}
.buy-equipment p,
.buy-supplier p {
  color: var(--bz-fg-mid);
  font-size: 12px;
  margin-bottom: 20px;
}
.buy-equipment .buy-actions {
  margin-top: 20px;
}
.buy-monogram {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  background: var(--bz-accent-soft);
  border-radius: 12px;
  font-weight: 600;
}
.buy-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 0 16px;
}
.buy-tags span {
  font-size: 11px;
  background: var(--bz-hover);
  border: 1px solid var(--bz-border);
  border-radius: 6px;
  padding: 3px 7px;
}
.buy-contact {
  display: flex;
  gap: 10px;
  padding: 9px 0;
  font-size: 12px;
}
.buy-contact strong {
  display: block;
  font-weight: 400;
  overflow-wrap: anywhere;
}
.buy-table-wrap {
  overflow: auto;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-lg);
}
table {
  width: 100%;
  border-collapse: collapse;
  min-width: 580px;
}
th {
  text-align: left;
  padding: 13px 18px;
  font-size: 11px;
  color: var(--bz-fg-mid);
  font-weight: 500;
  background: var(--bz-card);
  border-bottom: 1px solid var(--bz-border);
}
td {
  padding: 15px 18px;
  border-bottom: 1px solid var(--bz-border);
  font-size: 13px;
}
td strong,
td small {
  display: block;
}
td small {
  font-size: 11px;
  color: var(--bz-fg-mid);
  margin-top: 3px;
}
.buy-warning {
  color: var(--bz-warning-fg, var(--bz-warning));
}
.buy-review,
.buy-invoice {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 20px;
  align-items: center;
  padding: 19px 0;
  border-bottom: 1px solid var(--bz-border);
}
.buy-review p {
  font-size: 13px;
  max-width: 72ch;
  color: var(--bz-fg-mid);
}
.buy-invoice strong,
.buy-invoice small {
  display: block;
}
.buy-invoice small {
  color: var(--bz-fg-mid);
  font-size: 12px;
  margin-top: 5px;
}
.buy-rfq {
  padding: 18px 0;
  border-bottom: 1px solid var(--bz-border);
}
.buy-rfq small {
  color: var(--bz-fg-mid);
  overflow-wrap: anywhere;
}
.buy-rfq .buy-actions {
  margin-top: 14px;
}
.buy-rfq blockquote {
  margin: 16px 0 0;
  padding: 8px 14px;
  border-left: 2px solid var(--bz-accent);
  white-space: pre-wrap;
  font-size: 13px;
}
.buy-rfq blockquote small {
  display: block;
  margin-top: 5px;
}
.buy-empty {
  text-align: center;
  padding: 48px 24px;
  max-width: 650px;
  margin: auto;
  color: var(--bz-fg-mid);
}
.buy-empty > .material-symbols-outlined {
  font-size: 35px;
  color: var(--bz-accent);
  margin-bottom: 10px;
}
.buy-empty h3 {
  color: var(--bz-fg);
  font-size: 20px;
}
.buy-empty p {
  line-height: 1.7;
  font-size: 13px;
}
.buy-empty button {
  margin-top: 14px;
}
.buy-notice {
  padding: 12px 16px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-md);
  background: var(--bz-accent-soft);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.buy-notice.is-error {
  border-color: var(--bz-danger);
  background: var(--bz-danger-soft, var(--bz-card));
  color: var(--bz-fg);
}
.buy-payment-dossier {
  flex-basis: 100%;
  border-top: 1px solid var(--bz-border);
  margin-top: 8px;
  padding-top: 12px;
}
.buy-form {
  font: 400 13px/1.5 var(--bz-font-body);
}
.buy-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 18px;
  margin-bottom: 20px;
}
.buy-fields > label,
.buy-edit-line > label {
  display: flex;
  flex-direction: column;
  gap: 7px;
  color: var(--bz-fg-mid);
  min-width: 0;
  font-size: 12px;
}
.buy-fields > .wide {
  grid-column: 1/-1;
}
.buy-form input:not([type="checkbox"]):not([type="file"]),
.buy-form select,
.buy-form textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  font: 400 14px/1.5 var(--bz-font-body);
  color: var(--bz-fg);
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r-md);
  padding: 10px 12px;
  background-color: var(--bz-input, var(--bz-bg));
  min-height: 43px;
}
.buy-form select {
  padding-right: 36px;
}
.buy-form input:focus-visible,
.buy-form select:focus-visible,
.buy-form textarea:focus-visible,
.buy-workspace button:focus-visible {
  outline: 2px solid var(--bz-focus-ring, var(--bz-accent));
  outline-offset: 3px;
}
.buy-check {
  display: flex !important;
  flex-direction: row !important;
  align-items: center;
  gap: 10px !important;
  min-height: 40px;
  font-size: 13px !important;
  color: var(--bz-fg) !important;
}
.buy-check input {
  appearance: none;
  width: 34px;
  height: 20px;
  min-width: 34px;
  border: 1px solid var(--bz-border-strong);
  background: var(--bz-bg);
  border-radius: 20px;
  margin: 0;
  position: relative;
  cursor: pointer;
}
.buy-check input:before {
  content: "";
  position: absolute;
  width: 12px;
  height: 12px;
  top: 3px;
  left: 3px;
  border-radius: 50%;
  background: var(--bz-fg-mid);
  transition: transform 0.15s;
}
.buy-check input:checked {
  background: var(--bz-accent);
  border-color: var(--bz-accent);
}
.buy-check input:checked:before {
  background: var(--bz-accent-contrast, #fff);
  transform: translateX(14px);
}
.buy-edit-line {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  padding: 18px 0;
  border-bottom: 1px solid var(--bz-border);
  align-items: end;
}
.buy-upload {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 18px 0;
  padding: 14px;
  border: 1px dashed var(--bz-border-strong);
  border-radius: var(--bz-r-md);
  font-size: 12px;
  color: var(--bz-fg-mid);
}
.buy-upload input {
  max-width: 100%;
  font: inherit;
}
.buy-confirm {
  margin-top: 24px;
  border-top: 1px solid var(--bz-border);
  padding-top: 16px;
}
.buy-form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}
.buy-pdf {
  width: 100%;
  height: 60vh;
  border: 0;
  background: var(--bz-bg);
  margin-bottom: 18px;
}
.buy-evidence {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 15px 0;
}
.buy-workspace .material-symbols-outlined {
  font-size: 19px;
}
.buy-workspace button:disabled {
  cursor: not-allowed;
}
.buy-workspace button {
  max-width: 100%;
}
.buy-workspace :where(h2, h3, h4, h5, p) {
  overflow-wrap: anywhere;
}
@media (max-width: 1150px) {
  .buy-split {
    grid-template-columns: minmax(230px, 0.8fr) minmax(0, 1.4fr);
    gap: 18px;
  }
  .buy-detail {
    padding: 21px;
  }
  .buy-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .buy-search {
    max-width: 100%;
  }
}
@media (max-width: 720px) {
  .buy-head {
    align-items: flex-start;
    flex-direction: row;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }
  .buy-head h2 {
    font-size: 27px;
  }
  .buy-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
    padding: 18px 0;
  }
  .buy-split {
    grid-template-columns: minmax(0, 1fr);
  }
  .buy-records {
    max-height: 280px;
  }
  .buy-detail {
    padding: 17px;
  }
  .buy-detail h3 {
    font-size: 20px;
  }
  .buy-detail-head {
    flex-wrap: wrap;
  }
  .buy-progress {
    gap: 4px;
  }
  .buy-progress li {
    font-size: 10px;
  }
  .buy-quotes {
    grid-template-columns: minmax(0, 1fr);
  }
  .buy-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .buy-fields,
  .buy-edit-line {
    grid-template-columns: minmax(0, 1fr);
  }
  .buy-review,
  .buy-invoice {
    align-items: flex-start;
    flex-direction: column;
  }
  .buy-toolbar nav button {
    padding: 8px;
  }
  .buy-toolbar nav button .material-symbols-outlined {
    display: none;
  }
  .buy-line {
    flex-wrap: wrap;
  }
  .buy-record-top {
    flex-wrap: wrap;
  }
  .buy-search {
    min-width: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .buy-workspace * {
    transition: none !important;
    animation: none !important;
  }
}
</style>
