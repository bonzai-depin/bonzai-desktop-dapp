<template>
  <section class="billing company-screen" data-i18n-skip>
    <div class="billing-toolbar">
      <div class="billing-modes">
        <button
          v-for="item in modes"
          :key="item[0]"
          :aria-pressed="mode === item[0]"
          @click="
            mode = item[0];
            selectedId = null;
          "
        >
          <span class="material-symbols-outlined" aria-hidden="true">{{
            item[2]
          }}</span
          >{{ ui(item[1]) }}
        </button>
      </div>
      <button class="bz-btn bz-btn--primary" :disabled="busy" @click="create">
        <span class="material-symbols-outlined" aria-hidden="true">add</span
        >{{
          ui(
            mode === "customers"
              ? "Nouveau client"
              : mode === "profiles"
                ? "Nouveau profil"
                : mode === "subcontractors"
                  ? "Nouveau dossier"
                  : "Nouvelle facture",
          )
        }}
      </button>
    </div>
    <p v-if="error" role="alert" class="billing-error">{{ ui(error) }}</p>
    <p v-if="notice" role="status" class="billing-notice">{{ notice }}</p>
    <div v-if="loading" class="billing-empty" role="status">
      {{ ui("Chargement…") }}
    </div>
    <template v-else>
      <CompanyMetricStrip v-if="mode === 'invoices'" :items="billingMetrics" @select="item => filter = filter === item.id ? '' : item.id" />
      <div class="billing-layout">
        <aside class="billing-list">
          <label class="billing-search"
            ><span class="material-symbols-outlined" aria-hidden="true"
              >search</span
            ><input
              v-model="search"
              :placeholder="ui('Rechercher…')"
              :aria-label="ui('Rechercher…')"
          /></label>
          <select
            v-if="mode === 'invoices'"
            v-model="filter"
            :aria-label="ui('État de facturation')"
          >
            <option value="">{{ ui("Tous les états") }}</option>
            <option value="outstanding">{{ ui("En attente de règlement") }}</option>
            <option value="overdue">{{ ui("Échues") }}</option>
            <option v-for="s in states" :key="s" :value="s">
              {{ label(s) }}
            </option>
          </select>
          <div class="billing-records">
            <button
              v-for="row in rows"
              :key="row.id"
              class="billing-record"
              :aria-pressed="selectedId === row.id"
              @click="selectedId = row.id"
            >
              <span class="billing-record__main"
                ><strong>{{
                  row.number ||
                  row.name ||
                  row.operationReference ||
                  ui("Brouillon")
                }}</strong
                ><small>{{
                  mode === "invoices"
                    ? client(row.clientId)
                    : mode === "profiles"
                      ? row.marketReference
                      : mode === "customers"
                        ? row.email
                        : row.registration
                }}</small></span
              ><span class="billing-record__end"
                ><strong v-if="mode === 'invoices'" class="bz-metric">{{
                  money(row.totalCents)
                }}</strong
                ><small
                  v-if="mode !== 'customers'"
                  :class="['billing-state', row.status]"
                  >{{
                    mode === "profiles"
                      ? ui(row.validatedBy ? "Profil validé" : "À compléter")
                      : label(row.status)
                  }}</small
                ></span
              >
            </button>
          </div>
          <div v-if="!rows.length" class="billing-empty">
            <span class="material-symbols-outlined" aria-hidden="true"
              >receipt_long</span
            >
            <p>{{ ui("Aucun dossier dans cette liste.") }}</p>
          </div>
          <details
            v-if="mode === 'invoices' && data.legacy.length"
            class="billing-legacy"
          >
            <summary>
              {{ ui("Factures des interventions") }}
              <b class="bz-metric">{{ data.legacy.length }}</b>
            </summary>
            <button
              v-for="old in data.legacy"
              :key="old.id"
              :disabled="busy"
              @click="importLegacy(old)"
            >
              <span
                >{{ old.invoice_number
                }}<small>{{
                  ui(
                    old.status === "sent"
                      ? "Email envoyé · dépôt non confirmé"
                      : "Brouillon",
                  )
                }}</small></span
              ><span class="material-symbols-outlined" aria-hidden="true"
                >arrow_forward</span
              >
            </button>
          </details>
        </aside>
        <article v-if="selected" class="billing-detail">
          <header class="billing-detail__head">
            <div>
              <small>{{
                mode === "invoices"
                  ? client(selected.clientId)
                  : ui(
                      mode === "customers"
                        ? "Client"
                        : mode === "profiles"
                          ? "Conditions de facturation"
                          : "Dossier SUBCLIC",
                    )
              }}</small>
              <h3>
                {{
                  selected.number ||
                  selected.name ||
                  selected.operationReference ||
                  ui("Brouillon")
                }}
              </h3>
              <p v-if="selected.legacyNumber">
                {{ ui("Référence précédente") }} · {{ selected.legacyNumber }}
              </p>
            </div>
            <span
              v-if="!['profiles', 'customers'].includes(mode)"
              :class="['billing-state', selected.status]"
              >{{ label(selected.status) }}</span
            >
          </header>
          <template v-if="mode === 'invoices'">
            <CompanyRecordFlow :company-id="companyId" kind="customerInvoice" :record-id="selected.id" :revision="selected.revision" @open-invoice="openInvoice" @prepare-invoice="createFromParts" @open-task="emit('open-task',$event)" />
            <ol
              class="billing-progress"
              :aria-label="ui('Progression de la facture')"
            >
              <li
                v-for="s in progressStates"
                :key="s"
                :class="{
                  done:
                    progressStates.indexOf(s) <
                    progressStates.indexOf(selected.status),
                  active: selected.status === s,
                }"
              >
                <span class="material-symbols-outlined" aria-hidden="true">{{
                  progressStates.indexOf(s) <
                  progressStates.indexOf(selected.status)
                    ? "check"
                    : "circle"
                }}</span
                >{{ label(s) }}
              </li>
            </ol>
            <p v-if="selected.status === 'rejected'" class="billing-error">
              {{ selected.rejectedReceipt?.reason }}
            </p>
            <div class="billing-facts">
              <div>
                <small>{{ ui("Émission") }}</small
                ><span>{{ date(selected.issuedAt) }}</span>
              </div>
              <div>
                <small>{{ ui("Échéance") }}</small
                ><span>{{ date(selected.dueAt) }}</span>
              </div>
              <div>
                <small>{{ ui("Engagement juridique") }}</small
                ><span>{{
                  selected.legalCommitment ||
                  profileFor(selected)?.legalCommitment ||
                  "—"
                }}</span>
              </div>
              <div>
                <small>{{ ui("Type") }}</small
                ><span>{{
                  ui(
                    selected.kind === "standalone"
                      ? "Vente / prestation"
                      : selected.kind === "forfait"
                        ? "Forfait"
                        : "Interventions",
                  )
                }}</span>
              </div>
            </div>
            <section
              v-if="linkedWorkOrders.length"
              class="billing-linked-orders"
            >
              <h4 class="billing-section-title">
                {{ ui("Interventions liées") }}
              </h4>
              <div class="billing-evidence-list">
                <button
                  v-for="order in linkedWorkOrders"
                  :key="order.id"
                  type="button"
                  class="bz-btn bz-btn--ghost"
                  @click="emit('open-work-order', order.id)"
                >
                  <span class="material-symbols-outlined" aria-hidden="true"
                    >assignment</span
                  >
                  {{ order.reference || order.number || order.id
                  }}<span v-if="order.title"> · {{ order.title }}</span>
                  <span class="material-symbols-outlined" aria-hidden="true"
                    >arrow_forward</span
                  >
                </button>
              </div>
            </section>
            <div
              v-if="selected.issues.length && selected.status === 'draft'"
              class="billing-checks"
            >
              <h4>{{ ui("Avant validation") }}</h4>
              <ul>
                <li v-for="issue in selected.issues" :key="issue">
                  {{ ui(issue) }}
                </li>
              </ul>
            </div>
            <div class="billing-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{{ ui("Prestations") }}</th>
                    <th>{{ ui("Qté") }}</th>
                    <th>{{ ui("HT") }}</th>
                    <th>{{ ui("TVA") }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(line, n) in selected.lines" :key="n">
                    <td>
                      {{ line.description
                      }}<small v-if="line.deductionCents"
                        >{{ ui("Réfaction") }} ·
                        {{ money(line.deductionCents) }} ·
                        {{ line.deductionReference }}</small
                      >
                    </td>
                    <td class="bz-metric">{{ line.quantity }}</td>
                    <td class="bz-metric">{{ money(line.subtotalCents) }}</td>
                    <td class="bz-metric">{{ line.vatRate }} %</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="billing-total">
              <div>
                <small>{{ ui("Total TTC") }}</small
                ><strong class="bz-metric">{{
                  money(selected.totalCents)
                }}</strong>
              </div>
              <div>
                <small>{{ ui("Solde à recevoir") }}</small
                ><strong class="bz-metric">{{
                  money(balance(selected))
                }}</strong>
              </div>
            </div>
            <div class="billing-actions">
              <button
                v-if="selected.status === 'draft'"
                class="bz-btn bz-btn--primary"
                @click="editInvoice(selected)"
              >
                {{ ui("Modifier le brouillon") }}</button
              ><button
                v-if="selected.status === 'draft'"
                class="bz-btn bz-btn--ghost"
                :disabled="selected.issues.length > 0"
                @click="openTransition('validated')"
              >
                {{ ui("Valider") }}</button
              ><button
                v-if="selected.status === 'validated'"
                class="bz-btn bz-btn--primary"
                @click="openTransition('submitted')"
              >
                {{ ui("Enregistrer le dépôt") }}</button
              ><button
                v-if="selected.status === 'submitted'"
                class="bz-btn bz-btn--primary"
                @click="openTransition('accepted')"
              >
                {{ ui("Enregistrer l’acceptation") }}</button
              ><button
                v-if="selected.status === 'submitted'"
                class="bz-btn bz-btn--ghost"
                @click="openTransition('rejected')"
              >
                {{ ui("Enregistrer un rejet") }}</button
              ><button
                v-if="selected.status === 'accepted'"
                class="bz-btn bz-btn--primary"
                @click="openTransition('payment')"
              >
                {{ ui("Enregistrer un règlement") }}</button
              ><button
                v-if="['validated', 'rejected'].includes(selected.status)"
                class="bz-btn bz-btn--ghost"
                @click="openTransition('draft')"
              >
                {{ ui("Reprendre le brouillon") }}</button
              ><button
                class="bz-btn bz-btn--ghost"
                :disabled="busy"
                @click="pdf"
              >
                {{ ui("Ouvrir le PDF") }}</button
              ><button
                class="bz-btn bz-btn--ghost"
                :disabled="busy"
                @click="downloadDossier"
              >
                {{ ui("Exporter le dossier") }}
              </button>
            </div>
            <section
              v-if="profileFor(selected)?.channel === 'chorus'"
              class="billing-chorus"
            >
              <h4 class="billing-section-title">
                Chorus Pro
                <span class="billing-state">{{
                  ui(
                    profileFor(selected)?.chorus?.environment === "production"
                      ? "Production"
                      : "Qualification",
                  )
                }}</span>
              </h4>
              <p class="billing-help" v-if="selected.chorus?.externalStatus">
                {{ ui("État reçu") }} · {{ selected.chorus.externalStatus }}
              </p>
              <p
                class="billing-error"
                v-if="
                  ['pending', 'unknown'].includes(
                    selected.chorus?.attempt?.status,
                  )
                "
              >
                {{
                  ui(
                    "Résultat incertain. Vérifiez Chorus avant de recommencer.",
                  )
                }}
              </p>
              <div class="billing-actions">
                <button
                  v-if="
                    selected.status === 'validated' &&
                    !selected.chorus?.pieceJointeId
                  "
                  class="bz-btn bz-btn--ghost"
                  :disabled="!selected.document || busy"
                  @click="openChorus('upload')"
                >
                  {{ ui("Transmettre le PDF") }}</button
                ><button
                  v-if="
                    selected.status === 'validated' &&
                    selected.chorus?.pieceJointeId
                  "
                  class="bz-btn bz-btn--primary"
                  :disabled="busy"
                  @click="openChorus('submit')"
                >
                  {{ ui("Soumettre à Chorus") }}</button
                ><button
                  v-if="selected.chorus?.invoiceId"
                  class="bz-btn bz-btn--ghost"
                  :disabled="busy"
                  @click="openChorus('status')"
                >
                  {{ ui("Actualiser l’état Chorus") }}</button
                ><button
                  v-if="
                    ['pending', 'unknown'].includes(
                      selected.chorus?.attempt?.status,
                    )
                  "
                  class="bz-btn bz-btn--ghost"
                  @click="openTransition('reconcile')"
                >
                  {{ ui("Résoudre avec un justificatif") }}
                </button>
              </div>
            </section>
            <p
              v-if="profileFor(selected)?.channel === 'chorus'"
              class="billing-help"
            >
              {{
                ui(
                  "Déposez le dossier sur Chorus Pro, puis enregistrez le reçu et sa référence.",
                )
              }}
              <a
                href="https://portail.chorus-pro.gouv.fr/"
                target="_blank"
                rel="noopener noreferrer"
                >Chorus Pro ↗</a
              >
            </p>
            <h4 class="billing-section-title">
              {{ ui("Historique et preuves") }}
            </h4>
            <ol class="billing-timeline">
              <li v-for="event in selectedEvents" :key="event.id">
                <span class="material-symbols-outlined" aria-hidden="true"
                  >history</span
                >
                <div>
                  <strong>{{ eventLabel(event.eventType) }}</strong
                  ><small
                    >{{ dateTime(event.createdAt)
                    }}<template v-if="event.evidence.recordedBy">
                      · {{ event.evidence.recordedBy }}</template
                    ></small
                  >
                  <p v-if="event.evidence.reference">
                    {{ event.evidence.reference }} ·
                    {{ event.evidence.evidenceReference }}
                  </p>
                </div>
              </li>
            </ol>
          </template>
          <template v-else-if="mode === 'customers'"
            ><div class="billing-facts">
              <div>
                <small>{{ ui("Contact") }}</small
                ><span>{{ selected.contactName || "—" }}</span>
              </div>
              <div>
                <small>{{ ui("Email") }}</small
                ><span>{{ selected.email || "—" }}</span>
              </div>
              <div>
                <small>{{ ui("Téléphone") }}</small
                ><span>{{ selected.phone || "—" }}</span>
              </div>
              <div>
                <small>{{ ui("Adresse") }}</small
                ><span>{{ selected.address || "—" }}</span>
              </div>
            </div>
            <button
              class="bz-btn bz-btn--primary"
              @click="editCustomer(selected)"
            >
              {{ ui("Modifier le client") }}
            </button></template
          ><template v-else-if="mode === 'profiles'"
            ><div class="billing-facts">
              <div>
                <small>{{ ui("Émetteur") }}</small
                ><span>{{ selected.issuer?.name }}</span
                ><small>{{ selected.issuer?.registration }}</small>
              </div>
              <div>
                <small>{{ ui("Destinataire") }}</small
                ><span>{{ selected.recipient?.name }}</span
                ><small>{{ selected.recipient?.registration }}</small>
              </div>
              <div>
                <small>{{ ui("Marché") }}</small
                ><span>{{ selected.marketReference || "—" }}</span>
              </div>
              <div>
                <small>{{ ui("Engagement juridique") }}</small
                ><span>{{ selected.legalCommitment || "—" }}</span>
              </div>
              <div>
                <small>{{ ui("Périodicité") }}</small
                ><span>{{
                  ui(cadences[selected.cadence] || "À renseigner")
                }}</span>
              </div>
              <div>
                <small>{{ ui("Validé par") }}</small
                ><span>{{ selected.validatedBy || "—" }}</span>
              </div>
            </div>
            <p class="billing-help">{{ selected.evidenceReference }}</p>
            <button
              class="bz-btn bz-btn--primary"
              @click="editProfile(selected)"
            >
              {{ ui("Modifier le profil") }}
            </button></template
          >
          <template v-else
            ><div class="billing-facts">
              <div>
                <small>{{ ui("Déclaration") }}</small
                ><span>{{ selected.declarationType }}</span>
              </div>
              <div>
                <small>{{ ui("Signataire") }}</small
                ><span>{{ selected.signatory }}</span>
              </div>
              <div>
                <small>{{ ui("SIRET") }}</small
                ><span>{{ selected.registration }}</span>
              </div>
              <div>
                <small>{{ ui("Annexes") }}</small
                ><span>{{ selected.annexReferences || "—" }}</span>
              </div>
            </div>
            <p class="billing-help">
              {{
                ui(
                  "Les signatures et décisions sont effectuées dans SUBCLIC. Enregistrez ici leurs justificatifs.",
                )
              }}
              <a
                href="https://www.subclic.com/"
                target="_blank"
                rel="noopener noreferrer"
                >SUBCLIC ↗</a
              >
            </p>
            <div class="billing-actions">
              <button
                v-if="
                  ['draft', 'rejected', 'conditional'].includes(selected.status)
                "
                class="bz-btn bz-btn--primary"
                @click="editSubcontractor(selected)"
              >
                {{ ui("Compléter le dossier") }}</button
              ><button
                v-for="s in subNext[selected.status] || []"
                :key="s"
                class="bz-btn bz-btn--ghost"
                @click="openTransition(s)"
              >
                {{ label(s) }}</button
              ><button class="bz-btn bz-btn--ghost" @click="downloadDossier">
                {{ ui("Exporter le dossier") }}
              </button>
            </div>
            <ol class="billing-timeline">
              <li v-for="(event, n) in selected.history" :key="n">
                <span class="material-symbols-outlined">history</span>
                <div>
                  <strong>{{ label(event.status) }}</strong
                  ><small
                    >{{ dateTime(event.at) }} · {{ event.recordedBy }}</small
                  >
                  <p>{{ event.reference }} {{ event.reason }}</p>
                </div>
              </li>
            </ol></template
          >
          <section
            v-if="['invoices', 'subcontractors'].includes(mode)"
            class="billing-evidence"
          >
            <h4 class="billing-section-title">{{ ui("Pièces du dossier") }}</h4>
            <div class="billing-evidence-list">
              <button
                v-for="a in selected.attachments || []"
                :key="a.id"
                class="bz-btn bz-btn--ghost"
                @click="openEvidence(a)"
              >
                <span class="material-symbols-outlined" aria-hidden="true"
                  >attach_file</span
                >{{ a.filename }}
              </button>
            </div>
            <div class="billing-file-picker">
              <input
                ref="evidencePicker"
                class="billing-file-input"
                type="file"
                hidden
                accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.json,.xml"
                :disabled="busy"
                @change="uploadEvidence"
              />
              <button
                type="button"
                class="bz-btn bz-btn--ghost"
                :disabled="busy"
                @click="evidencePicker?.click()"
              >
                <span class="material-symbols-outlined" aria-hidden="true"
                  >upload_file</span
                >
                {{ ui("Joindre un justificatif") }}
              </button>
              <span
                v-if="evidenceFilename"
                class="billing-file-status"
                role="status"
              >
                <span :title="evidenceFilename">{{ evidenceFilename }}</span>
                <small>{{ evidenceUploadLabel }}</small>
              </span>
              <small v-else class="billing-help">{{
                ui("20 Mo maximum")
              }}</small>
            </div>
          </section>
        </article>
        <div v-else class="billing-empty billing-detail">
          <span class="material-symbols-outlined" aria-hidden="true"
            >receipt_long</span
          >
          <h3>{{ ui("Sélectionnez un dossier") }}</h3>
          <p>
            {{
              ui(
                "Les montants, prochaines étapes et justificatifs apparaissent ici.",
              )
            }}
          </p>
        </div>
      </div>
    </template>
    <GmaoDialog
      v-if="editor"
      :title="
        ui(
          editor === 'customer'
            ? 'Client'
            : editor === 'invoice'
              ? 'Facture'
              : editor === 'profile'
                ? 'Profil de facturation'
                : editor === 'subcontractor'
                  ? 'Dossier de sous-traitance'
                  : 'Enregistrer une étape',
        )
      "
      :busy="busy"
      @close="editor = null"
    >
      <form class="billing-form" @submit.prevent="save">
        <p v-if="formError" role="alert" class="billing-error">
          {{ ui(formError) }}
        </p>
        <template v-if="editor === 'customer'"
          ><div class="billing-fields">
            <label class="wide"
              >{{ ui("Nom du client")
              }}<input v-model.trim="form.name" required /></label
            ><label
              >{{ ui("Contact")
              }}<input v-model.trim="form.contactName" /></label
            ><label
              >{{ ui("Email")
              }}<input type="email" v-model.trim="form.email" /></label
            ><label
              >{{ ui("Téléphone")
              }}<input type="tel" v-model.trim="form.phone" /></label
            ><label class="wide"
              >{{ ui("Adresse")
              }}<textarea v-model.trim="form.address" rows="3" />
            </label></div></template
        ><template v-else-if="editor === 'invoice'">
          <div class="billing-fields">
            <label
              >{{ ui("Client")
              }}<select v-model="form.clientId" required>
                <option value="">{{ ui("Choisir") }}</option>
                <option v-for="c in data.clients" :key="c.id" :value="c.id">
                  {{ c.name }}
                </option>
              </select></label
            ><label
              >{{ ui("Profil de facturation")
              }}<select v-model="form.profileId">
                <option value="">
                  {{ ui("Sans profil · saisie directe") }}
                </option>
                <option v-for="p in data.profiles" :key="p.id" :value="p.id">
                  {{ p.name }}
                </option>
              </select></label
            ><label
              >{{ ui("Type")
              }}<select v-model="form.kind">
                <option value="standalone">
                  {{ ui("Vente / prestation") }}
                </option>
                <option value="unit">{{ ui("Interventions") }}</option>
                <option value="forfait">{{ ui("Forfait") }}</option>
              </select></label
            ><label v-if="form.kind !== 'standalone' || form.profileId"
              >{{ ui("Engagement juridique")
              }}<input v-model.trim="form.legalCommitment" /></label
            ><label
              >{{ ui("Émission")
              }}<input type="date" v-model="form.issueDate" required /></label
            ><label
              >{{ ui("Échéance")
              }}<input type="date" v-model="form.dueDate" required /></label
            ><template v-if="form.kind === 'forfait'"
              ><label
                >{{ ui("Début de période")
                }}<input type="date" v-model="form.startDate" required /></label
              ><label
                >{{ ui("Fin de période")
                }}<input type="date" v-model="form.endDate" required /></label
              ><label class="wide"
                >{{ ui("Référence d’admission")
                }}<input
                  v-model.trim="form.admissionReference"
                  required /></label
            ></template>
          </div>
          <fieldset v-if="!form.profileId">
            <legend>{{ ui("Coordonnées de facturation") }}</legend>
            <div class="billing-fields">
              <label
                >{{ ui("Émetteur")
                }}<input
                  v-model.trim="form.parties.issuer.name"
                  required /></label
              ><label
                >{{ ui("SIREN / SIRET émetteur")
                }}<input
                  v-model.trim="form.parties.issuer.registration"
                  required /></label
              ><label
                >{{ ui("Adresse émetteur")
                }}<textarea v-model.trim="form.parties.issuer.address" /></label
              ><label
                >{{ ui("Destinataire")
                }}<input
                  v-model.trim="form.parties.recipient.name"
                  required /></label
              ><label
                >{{ ui("Adresse destinataire")
                }}<textarea
                  v-model.trim="form.parties.recipient.address"
                /></label
              ><label
                >{{ ui("SIRET destinataire")
                }}<input v-model.trim="form.parties.recipient.registration"
              /></label>
            </div>
          </fieldset>
          <fieldset v-if="form.kind === 'unit'">
            <legend>{{ ui("Interventions facturées") }}</legend>
            <label
              v-for="w in data.workOrders.filter(
                (w) => w.clientId === form.clientId,
              )"
              :key="w.id"
              class="billing-check"
              ><input
                type="checkbox"
                role="switch"
                :value="w.id"
                v-model="form.workOrderIds"
              /><span
                >{{ w.workOrderNumber }} · {{ w.title
                }}<small>{{
                  w.serviceAcceptanceReference || ui("Service fait manquant")
                }}</small></span
              ></label
            >
          </fieldset>
          <fieldset v-if="availableParts.length">
            <legend>{{ i18n.state.locale.startsWith('fr') ? 'Pièces des interventions' : 'Work-order parts' }}</legend>
            <button v-for="p in availableParts.filter(p=>!p.disposition?.included&&p.status!=='cancelled'&&p.billedQuantity < p.quantity&&!form.lines.some(l=>l.procurementId===p.procurementId&&l.partKey===p.partKey))" :key="p.procurementId+p.partKey" type="button" class="bz-btn bz-btn--ghost" @click="addPart(p)">+ {{ p.description }} · {{ p.quantity-p.billedQuantity }}</button>
          </fieldset>
          <fieldset>
            <legend>{{ ui("Prestations") }}</legend>
            <div
              v-for="(line, n) in form.lines"
              :key="n"
              class="billing-line-editor"
            >
              <label class="wide"
                >{{ ui("Désignation")
                }}<input v-model="line.description" required /></label
              ><label
                >{{ ui("Qté")
                }}<input
                  type="number"
                  min="0.001"
                  step="0.001"
                  v-model.number="line.quantity"
                  required /></label
              ><label
                >{{ ui("Prix unitaire HT")
                }}<input
                  type="number"
                  min="0"
                  step="0.01"
                  v-model.number="line.unitAmount"
                  required /></label
              ><label
                >{{ ui("TVA %")
                }}<input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  v-model.number="line.vatRate"
                  required /></label
              ><label
                >{{ ui("Réfaction HT")
                }}<input
                  type="number"
                  min="0"
                  step="0.01"
                  v-model.number="line.deductionAmount" /></label
              ><label v-if="line.deductionAmount" class="wide"
                >{{ ui("Justificatif de réfaction")
                }}<input
                  v-model.trim="line.deductionReference"
                  required /></label
              ><button
                type="button"
                class="bz-btn bz-btn--ghost"
                :disabled="form.lines.length === 1"
                @click="form.lines.splice(n, 1)"
              >
                {{ ui("Retirer la ligne") }}
              </button>
            </div>
            <button
              type="button"
              class="bz-btn bz-btn--ghost"
              @click="form.lines.push(newLine())"
            >
              {{ ui("Ajouter une ligne") }}
            </button>
          </fieldset>
          <details>
            <summary>
              {{ ui("Révision de prix, avances et bénéficiaires") }}
            </summary>
            <label class="billing-check"
              ><input
                type="checkbox"
                role="switch"
                v-model="form.priceRevision.enabled"
              />{{ ui("Appliquer une révision notifiée") }}</label
            >
            <div v-if="form.priceRevision.enabled" class="billing-fields">
              <label
                >{{ ui("Indice")
                }}<input
                  v-model="form.priceRevision.indexName"
                  required /></label
              ><label
                >{{ ui("Notification")
                }}<input
                  type="date"
                  v-model="form.revisionDate"
                  required /></label
              ><label
                >{{ ui("Date du BC / période révisée")
                }}<input
                  type="date"
                  v-model="form.priceBasisDate"
                  required /></label
              ><label
                >I0<input
                  type="number"
                  min="0.00001"
                  step="any"
                  v-model.number="form.priceRevision.baseIndex"
                  required /></label
              ><label
                >I1<input
                  type="number"
                  min="0.00001"
                  step="any"
                  v-model.number="form.priceRevision.currentIndex"
                  required /></label
              ><label class="wide"
                >{{ ui("Justificatif")
                }}<input
                  v-model.trim="form.priceRevision.evidenceReference"
                  required
              /></label>
            </div>
            <div class="billing-fields">
              <label
                >{{ ui("Avance déjà réglée TTC")
                }}<input
                  type="number"
                  min="0"
                  step="0.01"
                  v-model.number="form.advanceAmount" /></label
              ><label
                >{{ ui("Référence de l’avance")
                }}<input
                  v-model.trim="form.advanceReference"
                  :required="form.advanceAmount > 0"
              /></label>
            </div>
            <div
              v-for="(a, n) in form.allocations"
              :key="n"
              class="billing-fields billing-allocation"
            >
              <label
                >{{ ui("Bénéficiaire")
                }}<input v-model="a.name" required /></label
              ><label
                >SIREN / SIRET<input v-model="a.registration" required /></label
              ><label class="wide"
                >{{ ui("Prestations")
                }}<input v-model="a.nature" required /></label
              ><label
                >{{ ui("Montant HT")
                }}<input
                  type="number"
                  min="0"
                  step="0.01"
                  v-model.number="a.subtotalAmount"
                  required /></label
              ><label
                >{{ ui("Montant TVA")
                }}<input
                  type="number"
                  min="0"
                  step="0.01"
                  v-model.number="a.vatAmount"
                  required /></label
              ><button
                type="button"
                class="bz-btn bz-btn--ghost"
                @click="form.allocations.splice(n, 1)"
              >
                {{ ui("Retirer") }}
              </button>
            </div>
            <button
              type="button"
              class="bz-btn bz-btn--ghost"
              @click="
                form.allocations.push({
                  name: '',
                  registration: '',
                  nature: '',
                  subtotalAmount: 0,
                  vatAmount: 0,
                })
              "
            >
              {{ ui("Ajouter un bénéficiaire") }}
            </button>
          </details>
          <label
            v-if="form.kind !== 'standalone' || form.profileId"
            class="billing-check"
            ><input
              type="checkbox"
              role="switch"
              v-model="form.confirmAdmission"
            />{{
              ui("Les montants HT correspondent aux prestations admises.")
            }}</label
          ><label
            >{{ ui("Notes") }}<textarea v-model="form.notes" rows="3" />
          </label>
          <div class="billing-total">
            <small>{{ ui("Total TTC") }}</small
            ><strong class="bz-metric">{{
              previewTotal.error ? "—" : money(previewTotal.totalCents)
            }}</strong>
          </div>
        </template>
        <template v-else-if="editor === 'profile'"
          ><div class="billing-fields">
            <label class="wide"
              >{{ ui("Nom du profil")
              }}<input v-model.trim="form.name" required /></label
            ><label
              >{{ ui("Contrat")
              }}<select v-model="form.serviceContractId">
                <option value="">{{ ui("Choisir") }}</option>
                <option v-for="c in data.contracts" :key="c.id" :value="c.id">
                  {{ c.name }}
                </option>
              </select></label
            ><label
              >{{ ui("Marché") }}<input v-model="form.marketReference" /></label
            ><label
              >{{ ui("Engagement juridique")
              }}<input v-model.trim="form.legalCommitment" /></label
            ><label
              >{{ ui("Dépôt")
              }}<select v-model="form.channel">
                <option value="chorus">Chorus Pro</option>
                <option value="email">Email</option>
                <option value="portal">{{ ui("Autre portail") }}</option>
              </select></label
            ><label
              >{{ ui("Périodicité")
              }}<select v-model="form.cadence">
                <option v-for="(name, key) in cadences" :key="key" :value="key">
                  {{ ui(name) }}
                </option>
              </select></label
            ><label
              >{{ ui("Coefficient K fixe")
              }}<input
                type="number"
                min="0"
                step="0.001"
                v-model.number="form.kCoefficient"
            /></label>
          </div>
          <fieldset v-for="party in ['issuer', 'recipient']" :key="party">
            <legend>
              {{ ui(party === "issuer" ? "Émetteur" : "Destinataire") }}
            </legend>
            <div class="billing-fields">
              <label
                >{{ ui("Raison sociale")
                }}<input v-model="form[party].name" required /></label
              ><label
                >SIREN / SIRET<input
                  v-model.trim="form[party].registration" /></label
              ><label class="wide"
                >{{ ui("Adresse")
                }}<input v-model="form[party].address" /></label
              ><label v-if="party === 'recipient'"
                >{{ ui("Code service")
                }}<input v-model.trim="form.recipient.serviceCode"
              /></label>
            </div>
          </fieldset>
          <div class="billing-fields">
            <label
              >{{ ui("Validé par")
              }}<input v-model.trim="form.validatedBy" /></label
            ><label
              >{{ ui("Source des conditions")
              }}<input
                v-model.trim="form.evidenceReference"
                :required="!!form.validatedBy"
            /></label>
          </div>
          <fieldset v-if="form.channel === 'chorus'">
            <legend>{{ ui("Connexion Chorus Pro") }}</legend>
            <div class="billing-fields">
              <label
                >{{ ui("Identifiant du connecteur")
                }}<select v-model="form.chorus.connectorId">
                  <option value="">{{ ui("Choisir") }}</option>
                  <option
                    v-for="c in data.chorusConnections || []"
                    :key="c.id"
                    :value="c.id"
                  >
                    {{ c.label }} ·
                    {{
                      ui(
                        c.environment === "production"
                          ? "Production"
                          : "Qualification",
                      )
                    }}
                  </option>
                </select></label
              ><label
                >{{ ui("Environnement")
                }}<select v-model="form.chorus.environment">
                  <option value="sandbox">{{ ui("Qualification") }}</option>
                  <option value="production">{{ ui("Production") }}</option>
                </select></label
              ><label
                >{{ ui("Identifiant fournisseur Chorus")
                }}<input
                  type="number"
                  min="1"
                  step="1"
                  v-model.number="form.chorus.supplierId" /></label
              ><label
                >{{ ui("Identifiant utilisateur Chorus")
                }}<input
                  type="number"
                  min="1"
                  step="1"
                  v-model.number="form.chorus.userId" /></label
              ><label
                >{{ ui("Identifiant service fournisseur")
                }}<input
                  type="number"
                  min="1"
                  step="1"
                  v-model.number="form.chorus.supplierServiceId" /></label
              ><label
                >{{ ui("Identifiant bancaire Chorus")
                }}<input
                  type="number"
                  min="1"
                  step="1"
                  v-model.number="form.chorus.bankDetailsId" /></label
              ><label
                >{{ ui("Cadre de facturation")
                }}<select v-model="form.chorus.billingFrame">
                  <option value="A1_FACTURE_FOURNISSEUR">
                    A1 · {{ ui("Fournisseur") }}
                  </option>
                  <option value="A9_FACTURE_SOUSTRAITANT">
                    A9 · {{ ui("Sous-traitant") }}
                  </option>
                  <option value="A12_FACTURE_COTRAITANT">
                    A12 · {{ ui("Cotraitant") }}
                  </option>
                </select></label
              ><label
                >{{ ui("Régime TVA")
                }}<select v-model="form.chorus.vatType">
                  <option value="">{{ ui("Choisir") }}</option>
                  <option value="TVA_SUR_DEBIT">
                    {{ ui("TVA sur débit") }}
                  </option>
                  <option value="TVA_SUR_ENCAISSEMENT">
                    {{ ui("TVA sur encaissement") }}
                  </option>
                  <option value="EXONERATION">{{ ui("Exonération") }}</option>
                  <option value="SANS_TVA">{{ ui("Sans TVA") }}</option>
                </select></label
              ><label v-if="form.chorus.vatType === 'EXONERATION'"
                >{{ ui("Code exonération Chorus")
                }}<input v-model.trim="form.chorus.exemptionCode" /></label
              ><template
                v-if="form.chorus.billingFrame !== 'A1_FACTURE_FOURNISSEUR'"
                ><label
                  >{{ ui("Structure valideur")
                  }}<input
                    v-model.trim="form.chorus.validatorStructure" /></label
                ><label
                  >{{ ui("Service valideur")
                  }}<input v-model.trim="form.chorus.validatorService" /></label
              ></template>
            </div>
            <p class="billing-help">
              {{ ui("Les identifiants secrets se configurent dans Outils.") }}
            </p>
          </fieldset></template
        >
        <template v-else-if="editor === 'subcontractor'"
          ><div class="billing-fields">
            <label
              >{{ ui("Sous-traitant")
              }}<select v-model="form.subcontractorId" required>
                <option value="">{{ ui("Choisir") }}</option>
                <option
                  v-for="s in data.subcontractors"
                  :key="s.id"
                  :value="s.id"
                >
                  {{ s.name }}
                </option>
              </select></label
            ><label
              >{{ ui("Profil de facturation")
              }}<select v-model="form.profileId">
                <option value="">{{ ui("Choisir") }}</option>
                <option v-for="p in data.profiles" :key="p.id" :value="p.id">
                  {{ p.name }}
                </option>
              </select></label
            ><label
              >{{ ui("Opération")
              }}<input v-model="form.operationReference" required /></label
            ><label>SIRET<input v-model.trim="form.registration" /></label
            ><label
              >{{ ui("Déclaration")
              }}<select v-model="form.declarationType">
                <option>DC4</option>
                <option>DA</option>
              </select></label
            ><label
              >{{ ui("Signataire") }}<input v-model="form.signatory" /></label
            ><label class="wide"
              >{{ ui("Références des annexes")
              }}<textarea v-model="form.annexReferences" rows="3" />
            </label></div
        ></template>
        <template v-else-if="editor === 'chorus'"
          ><p class="billing-help">
            {{
              ui(
                "Cette action contacte Chorus Pro avec la version validée de la facture.",
              )
            }}
          </p>
          <div class="billing-facts">
            <div>
              <small>{{ ui("Environnement") }}</small
              ><strong>{{
                ui(
                  profileFor(selected)?.chorus?.environment === "production"
                    ? "Production"
                    : "Qualification",
                )
              }}</strong>
            </div>
            <div>
              <small>{{ ui("Action") }}</small
              ><strong>{{
                ui(
                  {
                    upload: "Transmettre le PDF",
                    submit: "Soumettre à Chorus",
                    status: "Actualiser l’état Chorus",
                  }[form.operation],
                )
              }}</strong>
            </div>
          </div>
          <label
            >{{ ui("Responsable de la vérification")
            }}<input v-model.trim="form.recordedBy" required /></label
          ><label class="billing-check"
            ><input
              type="checkbox"
              role="switch"
              v-model="form.confirmed"
              required
            />{{
              ui("Je confirme l’action externe et son destinataire.")
            }}</label
          ></template
        ><template v-else
          ><p class="billing-help">
            {{
              ui(
                form.status === "payment"
                  ? "Enregistrez uniquement un règlement vérifié. Cette action ne déplace pas d’argent."
                  : "Cette action enregistre une vérification. Elle ne réalise aucun dépôt externe.",
              )
            }}
          </p>
          <div class="billing-fields">
            <label
              >{{ ui("Responsable de la vérification")
              }}<input v-model.trim="form.recordedBy" required /></label
            ><template
              v-if="!['draft', 'validated', 'ready'].includes(form.status)"
              ><label
                >{{ ui("Référence externe")
                }}<input v-model.trim="form.reference" required /></label
              ><label class="wide"
                >{{ ui("Justificatif / référence de document")
                }}<input
                  v-model.trim="form.evidenceReference"
                  required /></label
              ><label class="wide"
                >{{ ui("Justificatif conservé")
                }}<select v-model="form.attachmentId" required>
                  <option value="">{{ ui("Choisir") }}</option>
                  <option
                    v-for="a in selected.attachments || []"
                    :key="a.id"
                    :value="a.id"
                  >
                    {{ a.filename }}
                  </option>
                </select></label
              >
              <div class="billing-file-picker wide">
                <input
                  ref="transitionEvidencePicker"
                  class="billing-file-input"
                  type="file"
                  hidden
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.json,.xml"
                  :disabled="busy"
                  @change="uploadEvidence"
                />
                <button
                  type="button"
                  class="bz-btn bz-btn--ghost"
                  :disabled="busy"
                  @click="transitionEvidencePicker?.click()"
                >
                  <span class="material-symbols-outlined" aria-hidden="true"
                    >upload_file</span
                  >
                  {{ ui("Joindre un justificatif") }}
                </button>
                <span
                  v-if="evidenceFilename"
                  class="billing-file-status"
                  role="status"
                >
                  <span :title="evidenceFilename">{{ evidenceFilename }}</span>
                  <small>{{ evidenceUploadLabel }}</small>
                </span>
                <small v-else class="billing-help">{{
                  ui("20 Mo maximum")
                }}</small>
              </div></template
            ><template v-if="form.status === 'reconcile'"
              ><label
                >{{ ui("Résultat vérifié")
                }}<select v-model="form.resolution" required>
                  <option value="">{{ ui("Choisir") }}</option>
                  <option value="not_submitted">
                    {{ ui("Aucun dépôt effectué") }}
                  </option>
                  <option value="submitted">{{ ui("Facture déposée") }}</option>
                </select></label
              ><label v-if="form.resolution === 'submitted'"
                >{{ ui("Identifiant facture Chorus")
                }}<input
                  type="number"
                  min="1"
                  step="1"
                  v-model.number="form.invoiceId"
                  required /></label></template
            ><label v-if="form.status === 'payment'"
              >{{ ui("Montant réglé")
              }}<input
                type="number"
                step="0.01"
                v-model.number="form.amount"
                :min="balance(selected) === 0 ? 0 : 0.01"
                required /></label
            ><label
              v-if="['rejected', 'conditional', 'draft'].includes(form.status)"
              class="wide"
              >{{ ui("Motif")
              }}<textarea v-model.trim="form.reason" rows="3" required /></label
            ><template v-if="form.status === 'signed'"
              ><label
                >{{ ui("Signature titulaire")
                }}<input v-model="form.contractorSignature" required /></label
              ><label
                >{{ ui("Signature sous-traitant")
                }}<input
                  v-model="form.subcontractorSignature"
                  required /></label
            ></template>
          </div>
          <label class="billing-check"
            ><input
              type="checkbox"
              role="switch"
              v-model="form.confirmed"
              required
            />{{
              ui("Je confirme cette version et les justificatifs renseignés.")
            }}</label
          ></template
        >
        <footer class="billing-form__footer">
          <button
            type="button"
            class="bz-btn bz-btn--ghost"
            :disabled="busy"
            @click="editor = null"
          >
            {{ ui("Annuler") }}</button
          ><button class="bz-btn bz-btn--primary" :disabled="busy">
            {{ ui(busy ? "Enregistrement…" : "Enregistrer") }}
          </button>
        </footer>
      </form>
    </GmaoDialog>
  </section>
</template>
<script setup>
import "./company-design.css";
import CompanyMetricStrip from "./CompanyMetricStrip.vue";
import { useCompanyDraft } from "../../services/company/viewDrafts.js";
import CompanyRecordFlow from "./CompanyRecordFlow.vue";
import { computed, ref, watch } from "vue";
import GmaoDialog from "./GmaoDialog.vue";
import * as api from "../../services/company/billing.js";
import {
  calculateInvoice,
  INVOICE_STATES,
} from "../../services/company/billingDomain.js";
import { billingText } from "../../services/company/billingText.js";
import { i18n } from "../../i18n/index.js";
const props = defineProps({
  companyId: { type: String, required: true },
  gmaoData: { type: Object, default: () => ({}) },
});
const emit = defineEmits(["open-work-order", "open-task"]);
const evidencePicker = ref(null),
  transitionEvidencePicker = ref(null),
  evidenceFilename = ref(""),
  evidenceUploadState = ref("");
const ui = (s) => billingText(s, i18n.state.locale);
const empty = () => ({
  invoices: [],
  profiles: [],
  chorusConnections: [],
  legacy: [],
  workOrders: [],
  clients: [],
  contracts: [],
  subcontractors: [],
  dossiers: [],
  events: [],
});
const data = ref(empty()),
  loading = ref(false),
  busy = ref(false),
  error = ref(""),
  notice = ref(""),
  mode = ref("invoices"),
  filter = ref(""),
  search = ref(""),
  selectedId = ref(null),
  editor = ref(null),
  form = ref({}),
  formError = ref("");
const modes = [
  ["invoices", "Factures clients", "receipt_long"],
  ["profiles", "Contrats de facturation", "description"],
  ["subcontractors", "Sous-traitance", "handshake"],
  ["customers", "Clients", "group"],
];
const states = INVOICE_STATES,
  progressStates = ["draft", "validated", "submitted", "accepted", "paid"],
  cadences = {
    monthly: "Mensuelle",
    semiannual: "Semestrielle",
    custom: "Selon le contrat",
  };
const labels = {
  draft: "Brouillon",
  validated: "Validée",
  submitted: "Déposée",
  accepted: "Acceptée",
  rejected: "Rejetée",
  paid: "Réglée",
  ready: "Prêt à transmettre",
  signed: "Signatures reçues",
  conditional: "Acceptée sous conditions",
};
const subNext = {
  draft: ["ready"],
  ready: ["submitted"],
  submitted: ["signed", "rejected"],
  signed: ["accepted", "conditional", "rejected"],
  conditional: ["draft"],
  rejected: ["draft"],
};
const label = (s) => ui(labels[s] || s),
  client = (id) => data.value.clients.find((c) => c.id === id)?.name || "—";
const date = (n) =>
    n
      ? new Date(n).toLocaleDateString(
          i18n.state.locale === "fr" ? "fr-FR" : "en-GB",
        )
      : "—",
  dateTime = (n) =>
    n
      ? new Date(n).toLocaleString(
          i18n.state.locale === "fr" ? "fr-FR" : "en-GB",
        )
      : "—";
const money = (n) =>
  new Intl.NumberFormat(i18n.state.locale === "fr" ? "fr-FR" : "en-GB", {
    style: "currency",
    currency: "EUR",
  }).format((n || 0) / 100);
const balance = (i) =>
  Math.max(
    0,
    i.amountDueCents -
      (i.payments || []).reduce((s, p) => s + p.amountCents, 0),
  );
const outstanding = computed(() =>
  data.value.invoices
    .filter((i) => ["submitted", "accepted"].includes(i.status))
    .reduce((s, i) => s + balance(i), 0),
);
const overdue = computed(
  () =>
    data.value.invoices.filter(
      (i) =>
        ["submitted", "accepted"].includes(i.status) &&
        i.dueAt && i.dueAt < Date.now() &&
        balance(i) > 0,
    ).length,
);
const billingMetrics = computed(() => [
  {id:'draft',label:ui('À préparer'),value:data.value.invoices.filter(i=>i.status==='draft').length,icon:'edit_document',action:true,selected:filter.value==='draft'},
  {id:'validated',label:ui('À déposer'),value:data.value.invoices.filter(i=>i.status==='validated').length,icon:'outbox',action:true,selected:filter.value==='validated'},
  {id:'outstanding',label:ui('En attente de règlement'),value:money(outstanding.value),icon:'account_balance_wallet',action:true,selected:filter.value==='outstanding'},
  {id:'overdue',label:ui('Échues'),value:overdue.value,icon:'event_busy',tone:overdue.value?'warning':null,action:true,selected:filter.value==='overdue'},
]);
const source = computed(() =>
  mode.value === "invoices"
    ? data.value.invoices
    : mode.value === "profiles"
      ? data.value.profiles
      : mode.value === "customers"
        ? data.value.clients
        : data.value.dossiers,
);
const rows = computed(() =>
  source.value.filter(
    (r) =>
      (mode.value !== "invoices" ||
        !filter.value ||
        (filter.value === 'outstanding' ? ['submitted','accepted'].includes(r.status) && balance(r) > 0
          : filter.value === 'overdue' ? ['submitted','accepted'].includes(r.status) && r.dueAt && r.dueAt < Date.now() && balance(r) > 0
          : r.status === filter.value)) &&
      [
        r.number,
        r.name,
        r.operationReference,
        client(r.clientId),
        r.marketReference,
        r.registration,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.value.toLowerCase()),
  ),
);
const selected = computed(() =>
  source.value.find((r) => r.id === selectedId.value),
);
const selectedEvents = computed(() =>
  data.value.events.filter((e) => e.invoiceId === selectedId.value),
);
const profileFor = (i) =>
  i.profileSnapshot ||
  data.value.profiles.find((p) => p.id === i.profileId) ||
  i.parties;
const eventLabel = (s) =>
  ui(
    {
      draft_created: "Brouillon créé",
      draft_updated: "Brouillon modifié",
      legacy_imported: "Facture reprise du dossier OI",
      document_generated: "PDF conservé",
      payment_recorded: "Règlement enregistré",
    }[s] ||
      labels[s] ||
      s,
  );
const linkedWorkOrders = computed(() => {
  if (mode.value !== "invoices") return [];
  const orders = [
    ...(props.gmaoData.workOrders || []),
    ...data.value.workOrders,
  ];
  return (selected.value?.workOrderIds || []).map(
    (id) => orders.find((order) => order.id === id) || { id },
  );
});
const evidenceUploadLabel = computed(() =>
  ui(
    {
      uploading: "Ajout en cours…",
      stored: "Fichier conservé",
      failed: "Échec de l’ajout",
    }[evidenceUploadState.value] || "",
  ),
);
watch([selectedId, mode, () => props.companyId], () => {
  evidenceFilename.value = "";
  evidenceUploadState.value = "";
});
let loadId = 0;
async function load() {
  const token = ++loadId,
    id = props.companyId;
  loading.value = true;
  error.value = "";
  try {
    const result = await api.snapshot(id);
    if (token === loadId) data.value = result;
  } catch (e) {
    if (token === loadId) error.value = e.message;
  } finally {
    if (token === loadId) loading.value = false;
  }
}
watch(
  () => props.companyId,
  () => {
    data.value = empty();
    selectedId.value = null;
    editor.value = null;
    load();
  },
  { immediate: true },
);
async function openInvoice(id, revision = null) {
  mode.value = "invoices";
  search.value = "";
  filter.value = "";
  selectedId.value = null;
  notice.value = "";
  await load();
  if (error.value) return;
  const invoice = data.value.invoices.find((row) => row.id === id);
  if (!invoice) {
    error.value = ui("La facture demandée est introuvable dans cette équipe.");
    return;
  }
  selectedId.value = invoice.id;
  if (revision != null && Number(revision) !== Number(invoice.revision)) {
    notice.value = ui(
      "Cette facture a changé depuis la demande de validation. Vérifiez la version actuelle ; la demande précédente doit être renouvelée.",
    );
  }
}
defineExpose({ openInvoice, createFromParts });
const day = (n) => (n ? new Date(n).toISOString().slice(0, 10) : ""),
  time = (d) => (d ? Date.parse(d + "T12:00:00Z") : null);
const newLine = () => ({
  description: "",
  quantity: 1,
  unitAmount: 0,
  vatRate: 20,
  deductionAmount: 0,
});
function editInvoice(row = {}) {
  formError.value = "";
  form.value = {
    ...JSON.parse(JSON.stringify(row)),
    clientId: row.clientId || "",
    profileId: row.profileId || "",
    kind: row.kind || "standalone",
    parties: row.parties || { issuer: {}, recipient: {} },
    issueDate: day(row.issuedAt || Date.now()),
    dueDate: day(row.dueAt || Date.now() + 30 * 86400000),
    startDate: day(row.periodStart),
    endDate: day(row.periodEnd),
    priceBasisDate: day(row.priceBasisAt),
    revisionDate: day(row.priceRevision?.notifiedAt),
    workOrderIds: row.workOrderIds || [],
    lines: row.lines?.map((l) => ({
      ...l,
      unitAmount: l.unitCents / 100,
      deductionAmount: (l.deductionCents || 0) / 100,
    })) || [newLine()],
    allocations: (row.allocations || []).map((a) => ({
      ...a,
      subtotalAmount: a.subtotalCents / 100,
      vatAmount: a.vatCents / 100,
    })),
    priceRevision: row.priceRevision || { enabled: false },
    advanceAmount: (row.advanceAppliedCents || 0) / 100,
    confirmAdmission:
      row.lines?.every((l) => l.admittedCents === l.subtotalCents) || false,
  };
  editor.value = "invoice";
}
async function createFromParts(parts) {
  await load();
  const ids=[...new Set(parts.map(p=>p.workOrderId))];
  const work=data.value.workOrders.filter(w=>ids.includes(w.id));
  if(work.length!==ids.length||new Set(work.map(w=>w.clientId)).size!==1){error.value=ui("Les interventions doivent appartenir au client et au contrat facturés.");return;}
  mode.value='invoices';
  editInvoice({clientId:work[0].clientId,kind:'unit',workOrderIds:ids,lines:parts.map(partLine)});
}
function partLine(p) {
  return {description:p.description,quantity:p.quantity-p.billedQuantity,unitCents:p.supplierInvoices.find(i=>i.costUnitCents!=null)?.costUnitCents||0,vatRate:20,procurementId:p.procurementId,partKey:p.partKey};
}
useCompanyDraft(() => props.companyId + ':billing', {mode, selectedId, editor, form});
const availableParts=ref([]);
let partLoad=0;
watch(()=>JSON.stringify(form.value.workOrderIds||[]),async()=>{
  const token=++partLoad;availableParts.value=[];
  if(editor.value!=='invoice'||!form.value.workOrderIds?.length)return;
  try{const parts=await window.electronAPI?.db?.recordOperations?.partsForOrders(props.companyId,form.value.workOrderIds);if(token===partLoad)availableParts.value=parts||[];}catch(e){formError.value=e.message;}
});
function addPart(p){
 const line=partLine(p);
 if(form.value.lines.length===1&&!form.value.lines[0].description&&!(form.value.lines[0].unitAmount>0))form.value.lines=[];
 form.value.lines.push({...line,unitAmount:line.unitCents/100,deductionAmount:0});
}
function editProfile(row = {}) {
  formError.value = "";
  form.value = {
    ...JSON.parse(JSON.stringify(row)),
    name: row.name || "",
    serviceContractId: row.serviceContractId || "",
    channel: row.channel || "email",
    chorus: row.chorus || {
      environment: "sandbox",
      billingFrame: "A1_FACTURE_FOURNISSEUR",
      vatType: "",
    },
    cadence: row.cadence || "monthly",
    kCoefficient: row.kCoefficient ?? 1,
    issuer: row.issuer || {},
    recipient: row.recipient || {},
  };
  editor.value = "profile";
}
function editSubcontractor(row = {}) {
  formError.value = "";
  form.value = {
    ...JSON.parse(JSON.stringify(row)),
    subcontractorId: row.subcontractorId || "",
    declarationType: row.declarationType || "DC4",
  };
  editor.value = "subcontractor";
}
function editCustomer(row = {}) {
  formError.value = "";
  form.value = JSON.parse(JSON.stringify(row));
  editor.value = "customer";
}
function create() {
  mode.value === "customers"
    ? editCustomer()
    : mode.value === "invoices"
      ? editInvoice()
      : mode.value === "profiles"
        ? editProfile()
        : editSubcontractor();
}
function invoiceInput() {
  const f = form.value;
  const row = {
    ...f,
    issuedAt: time(f.issueDate),
    dueAt: time(f.dueDate),
    periodStart: time(f.startDate),
    periodEnd: time(f.endDate),
    priceBasisAt: time(f.priceBasisDate),
    priceRevision: { ...f.priceRevision, notifiedAt: time(f.revisionDate) },
    lines: f.lines.map((l) => ({
      ...l,
      unitCents: Math.round(Number(l.unitAmount) * 100),
      deductionCents: Math.round(Number(l.deductionAmount || 0) * 100),
    })),
    advanceAppliedCents: Math.round(Number(f.advanceAmount || 0) * 100),
    allocations: f.allocations.map((a) => ({
      ...a,
      subtotalCents: Math.round(Number(a.subtotalAmount) * 100),
      vatCents: Math.round(Number(a.vatAmount || 0) * 100),
    })),
  };
  const calculated = calculateInvoice(row);
  row.lines = calculated.lines.map((l) => ({
    ...l,
    admittedCents: f.confirmAdmission ? l.subtotalCents : null,
  }));
  return row;
}
const previewTotal = computed(() => {
  if (editor.value !== "invoice") return {};
  try {
    return calculateInvoice(invoiceInput());
  } catch (e) {
    return { error: e.message };
  }
});
function openChorus(operation) {
  formError.value = "";
  form.value = {
    operation,
    revision: selected.value.revision,
    confirmed: false,
  };
  editor.value = "chorus";
}
function openTransition(status) {
  formError.value = "";
  form.value = {
    status,
    revision: selected.value.revision,
    amount: balance(selected.value) / 100,
    confirmed: false,
  };
  editor.value = "transition";
}
async function save() {
  if (busy.value) return;
  busy.value = true;
  formError.value = "";
  const company = props.companyId;
  try {
    let result;
    if (editor.value === "customer")
      result = await api.saveCustomer(company, form.value);
    else if (editor.value === "invoice")
      result = await api.saveInvoice(company, invoiceInput());
    else if (editor.value === "chorus")
      result = await api.chorusAction(company, selected.value.id, form.value);
    else if (editor.value === "profile")
      result = await api.saveContractProfile(company, form.value);
    else if (editor.value === "subcontractor")
      result = await api.saveSubcontractorDossier(company, form.value);
    else {
      const method =
        mode.value === "subcontractors"
          ? "transitionSubcontractorDossier"
          : form.value.status === "reconcile"
            ? "reconcileChorusAction"
            : form.value.status === "payment"
              ? "recordPayment"
              : "transitionInvoice";
      result = await api[method](company, selected.value.id, {
        ...form.value,
        amountCents: Math.round(Number(form.value.amount || 0) * 100),
      });
    }
    if (props.companyId === company) {
      selectedId.value = result.id;
      editor.value = null;
      notice.value = ui("Enregistré dans le dossier.");
      await load();
    }
  } catch (e) {
    formError.value = e.message;
  } finally {
    busy.value = false;
  }
}
async function action(fn) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    await fn();
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
function importLegacy(row) {
  return action(async () => {
    const r = await api.importLegacyInvoice(props.companyId, row.id);
    selectedId.value = r.id;
  });
}
async function pdf() {
  return action(async () => {
    const result = await api.generateDocument(
      props.companyId,
      selected.value.id,
    );
    const doc = result.document || result;
    if (!doc.blobId) throw new Error(ui("PDF indisponible."));
    const encoded = await window.electronAPI.db.blobs.read(
      doc.blobId,
      doc.blobExt || "pdf",
    );
    const raw = typeof encoded === "string" ? encoded : encoded.base64;
    if (!raw) throw new Error(ui("PDF indisponible."));
    const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(
      new Blob([bytes], { type: "application/pdf" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.filename || "facture.pdf";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
async function uploadEvidence(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file || busy.value) return;
  evidenceFilename.value = file.name;
  evidenceUploadState.value = "uploading";
  if (file.size > 20 * 1024 * 1024) {
    const message = ui("Justificatif supérieur à 20 Mo.");
    editor.value ? (formError.value = message) : (error.value = message);
    evidenceUploadState.value = "failed";
    return;
  }
  busy.value = true;
  formError.value = "";
  error.value = "";
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let n = 0; n < bytes.length; n += 8192)
      binary += String.fromCharCode(...bytes.subarray(n, n + 8192));
    const row = await api.attachEvidence(
      props.companyId,
      mode.value === "subcontractors" ? "subcontractor" : "invoice",
      selected.value.id,
      {
        revision: selected.value.revision,
        filename: file.name,
        base64: btoa(binary),
      },
    );
    if (editor.value === "transition") {
      form.value.revision = row.revision;
      form.value.attachmentId = row.attachments.at(-1).id;
      form.value.evidenceReference = form.value.evidenceReference || file.name;
    }
    evidenceUploadState.value = "stored";
    await load();
  } catch (e) {
    evidenceUploadState.value = "failed";
    editor.value ? (formError.value = e.message) : (error.value = e.message);
  } finally {
    busy.value = false;
  }
}
async function openEvidence(doc) {
  try {
    const raw = await window.electronAPI.db.blobs.read(doc.blobId, doc.blobExt);
    const base64 = typeof raw === "string" ? raw : raw.base64;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes]));
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    error.value = e.message;
  }
}
async function downloadDossier() {
  return action(async () => {
    const result = await api[
      mode.value === "subcontractors"
        ? "exportSubcontractorDossier"
        : "exportDossier"
    ](props.companyId, selected.value.id);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `dossier-${selected.value.number || selected.value.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}
</script>
<style scoped>
.billing {
  color: var(--bz-fg);
  font: 400 14px/1.55 var(--bz-font-body);
  min-width: 0;
}
.billing-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--bz-border);
}
.billing-modes {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.billing-modes button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid transparent;
  border-radius: var(--bz-r-sm);
  background: transparent;
  color: var(--bz-fg-mid);
  font: inherit;
  cursor: pointer;
}
.billing-modes button[aria-pressed="true"] {
  color: var(--bz-fg);
  background: var(--bz-accent-soft);
  border-color: var(--bz-accent);
}
.billing :is(button, input, select, textarea, a, summary):focus-visible {
  outline: 2px solid var(--bz-accent);
  outline-offset: 3px;
}
.billing-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 28px 0;
  gap: 24px;
}
.billing-metrics > div + div {
  border-left: 1px solid var(--bz-border);
  padding-left: 24px;
}
.billing-metrics small {
  display: block;
  color: var(--bz-fg-mid);
  font-size: 13px;
}
.billing-metrics strong {
  display: block;
  font-size: 29px;
  line-height: 1.3;
  margin-top: 8px;
}
.billing-layout {
  display: grid;
  grid-template-columns: minmax(330px, 0.9fr) minmax(0, 1.65fr);
  border-top: 1px solid var(--bz-border);
  min-height: 510px;
}
.billing-list {
  padding: 24px 24px 24px 0;
  border-right: 1px solid var(--bz-border);
}
.billing-search {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--bz-border-strong);
  background: var(--bz-panel);
  border-radius: var(--bz-r-sm);
  padding: 0 12px;
}
.billing-search input {
  border: 0 !important;
  background: transparent !important;
  padding-left: 0 !important;
}
.billing input,
.billing select,
.billing-form input,
.billing-form select,
.billing-form textarea {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  min-height: 44px;
  padding: 10px 12px;
  color: var(--bz-fg);
  background: var(--bz-panel);
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r-sm);
  font: 400 14px/1.5 var(--bz-font-body);
}
.billing-list > select {
  margin-top: 12px;
}
.billing-records {
  display: grid;
  margin-top: 18px;
  gap: 6px;
}
.billing-record {
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
  gap: 16px;
  padding: 16px;
  border: 1px solid transparent;
  border-radius: var(--bz-r-md);
  background: transparent;
  color: var(--bz-fg);
  font: inherit;
  cursor: pointer;
  min-width: 0;
}
.billing-record:hover {
  background: var(--bz-panel);
}
.billing-record[aria-pressed="true"] {
  background: var(--bz-accent-soft);
  border-color: var(--bz-accent);
}
.billing-record__main,
.billing-record__end {
  display: grid;
  gap: 7px;
  min-width: 0;
}
.billing-record__main strong {
  font-size: 15px;
  overflow-wrap: anywhere;
}
.billing-record__end {
  text-align: right;
  flex-shrink: 0;
}
.billing-record small {
  color: var(--bz-fg-mid);
  font-size: 12px;
}
.billing-record__end > .bz-metric {
  font-size: 20px;
}
.billing-detail {
  padding: 28px 0 36px 32px;
  min-width: 0;
}
.billing-detail__head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin-bottom: 28px;
}
.billing-detail__head small {
  color: var(--bz-fg-mid);
}
.billing-detail h3 {
  font: italic 900 27px/1.25 var(--bz-font-metric);
  margin: 8px 0;
}
.billing-detail__head p {
  margin: 5px 0;
  color: var(--bz-fg-mid);
  font-size: 12px;
}
.billing-state {
  display: inline-flex;
  width: max-content;
  max-width: 100%;
  padding: 4px 9px;
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r-pill);
  background: var(--bz-panel);
  font-size: 12px !important;
  color: var(--bz-fg) !important;
}
.billing-state.accepted,
.billing-state.paid {
  background: var(--bz-success-soft);
  border-color: var(--bz-success);
}
.billing-state.rejected {
  background: var(--bz-danger-soft);
  border-color: var(--bz-danger);
}
.billing-progress {
  display: flex;
  list-style: none;
  padding: 0;
  margin: 0 0 30px;
  gap: 0;
  overflow-x: auto;
}
.billing-progress li {
  flex: 1;
  min-width: 80px;
  border-top: 2px solid var(--bz-border);
  padding: 10px 5px 0;
  color: var(--bz-fg-mid);
  font-size: 12px;
}
.billing-progress li.active {
  border-color: var(--bz-accent);
  color: var(--bz-fg);
  font-weight: 600;
}
.billing-progress li.done {
  border-color: var(--bz-success);
}
.billing-progress .material-symbols-outlined {
  font-size: 14px;
  vertical-align: -2px;
  margin-right: 4px;
}
.billing-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px 26px;
  margin: 0 0 26px;
}
.billing-facts > div {
  display: grid;
  gap: 5px;
  overflow-wrap: anywhere;
}
.billing-facts small {
  color: var(--bz-fg-mid);
  font-size: 12px;
}
.billing-checks {
  border-left: 3px solid var(--bz-warning);
  background: var(--bz-warning-soft);
  padding: 16px 20px;
  margin-bottom: 24px;
}
.billing-checks h4 {
  margin: 0 0 8px;
  font-size: 14px;
}
.billing-checks ul {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
}
.billing-checks li + li {
  margin-top: 6px;
}
.billing-table-wrap {
  overflow-x: auto;
}
.billing table {
  border-collapse: collapse;
  width: 100%;
  text-align: left;
}
.billing th {
  font-size: 12px;
  font-weight: 500;
  color: var(--bz-fg-mid);
  padding: 10px 8px;
  border-bottom: 1px solid var(--bz-border);
}
.billing td {
  padding: 17px 8px;
  border-bottom: 1px solid var(--bz-border);
  vertical-align: top;
}
.billing td:not(:first-child),
.billing th:not(:first-child) {
  text-align: right;
  white-space: nowrap;
}
.billing td small {
  display: block;
  color: var(--bz-fg-mid);
  font-size: 12px;
  margin-top: 5px;
}
.billing-total {
  display: flex;
  justify-content: flex-end;
  gap: 36px;
  align-items: center;
  margin: 24px 0;
}
.billing-total > div {
  display: grid;
  gap: 6px;
  text-align: right;
}
.billing-total small {
  color: var(--bz-fg-mid);
}
.billing-total strong {
  font-size: 27px;
}
.billing-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin: 26px 0;
}
.billing-help {
  color: var(--bz-fg-mid);
  font-size: 13px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.billing a {
  color: var(--bz-accent);
  text-underline-offset: 3px;
}
.billing-section-title {
  font-size: 15px;
  font-weight: 500;
  margin: 28px 0 20px;
  padding-top: 22px;
  border-top: 1px solid var(--bz-border);
}
.billing-timeline {
  list-style: none;
  padding: 0;
  margin: 0;
}
.billing-timeline li {
  display: flex;
  gap: 14px;
  padding-bottom: 20px;
}
.billing-timeline .material-symbols-outlined {
  font-size: 20px;
  color: var(--bz-fg-mid);
}
.billing-timeline strong {
  font-size: 13px;
  font-weight: 500;
}
.billing-timeline small {
  display: block;
  color: var(--bz-fg-mid);
  font-size: 12px;
  margin-top: 4px;
}
.billing-timeline p {
  font-size: 13px;
  margin: 6px 0;
  overflow-wrap: anywhere;
}
.billing-empty {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 40px 22px;
  color: var(--bz-fg-mid);
}
.billing-empty > .material-symbols-outlined {
  font-size: 34px;
  margin-bottom: 12px;
}
.billing-empty p {
  max-width: 330px;
  font-size: 13px;
}
.billing-error {
  border: 1px solid var(--bz-danger);
  background: var(--bz-danger-soft);
  color: var(--bz-fg);
  padding: 14px 16px;
  border-radius: var(--bz-r-sm);
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.billing-notice {
  color: var(--bz-fg-mid);
  padding: 10px 0;
}
.billing-legacy {
  border-top: 1px solid var(--bz-border);
  padding-top: 20px;
  margin-top: 22px;
}
.billing-legacy summary {
  cursor: pointer;
  color: var(--bz-fg-mid);
}
.billing-legacy button {
  display: flex;
  justify-content: space-between;
  text-align: left;
  width: 100%;
  padding: 14px 0;
  border: 0;
  border-bottom: 1px solid var(--bz-border);
  background: transparent;
  color: var(--bz-fg);
  font: inherit;
}
.billing-legacy small {
  display: block;
  font-size: 12px;
  color: var(--bz-fg-mid);
  margin-top: 5px;
}
.billing-form {
  color: var(--bz-fg);
  display: grid;
  gap: 24px;
}
.billing-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px 18px;
}
.billing-form label {
  display: grid;
  gap: 8px;
  font-size: 13px;
  color: var(--bz-fg-mid);
  min-width: 0;
}
.billing-form .wide {
  grid-column: 1/-1;
}
.billing-form fieldset {
  border: 0;
  border-top: 1px solid var(--bz-border);
  padding: 20px 0 0;
  margin: 0;
  min-width: 0;
}
.billing-form legend {
  font-size: 15px;
  padding: 0 12px 0 0;
}
.billing-form .billing-check {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  color: var(--bz-fg);
  margin: 8px 0;
}
.billing-check input {
  appearance: none;
  width: 34px;
  min-width: 34px;
  height: 20px;
  min-height: 20px;
  flex-shrink: 0;
  border: 1px solid var(--bz-border-strong);
  background: var(--bz-canvas);
  border-radius: 20px;
  margin: 0;
  padding: 0;
  position: relative;
  cursor: pointer;
}
.billing-check input::before {
  content: "";
  position: absolute;
  width: 12px;
  height: 12px;
  top: 3px;
  left: 3px;
  border-radius: 50%;
  background: var(--bz-fg-mid);
  transition: transform var(--bz-dur-fast);
}
.billing-check input:checked {
  background: var(--bz-accent);
  border-color: var(--bz-accent);
}
.billing-check input:checked::before {
  background: var(--bz-accent-contrast, #fff);
  transform: translateX(14px);
}
.billing-check input:focus-visible {
  outline: 2px solid var(--bz-focus-ring, var(--bz-accent));
  outline-offset: 3px;
}
.billing-check small {
  display: block;
  color: var(--bz-fg-mid);
  font-size: 12px;
}
.billing-line-editor {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  padding: 0 0 22px;
  margin-bottom: 22px;
  border-bottom: 1px solid var(--bz-border);
}
.billing-line-editor button {
  justify-self: start;
  grid-column: 1/-1;
}
.billing-form details > summary {
  cursor: pointer;
  font-size: 14px;
  margin-bottom: 20px;
}
.billing-form details > .billing-fields {
  margin: 20px 0;
}
.billing-allocation {
  border-top: 1px solid var(--bz-border);
  padding-top: 20px;
}
.billing-form__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid var(--bz-border);
}
.billing-form :is(input, select, textarea, button):focus-visible {
  outline: 2px solid var(--bz-accent);
  outline-offset: 3px;
}
@media (max-width: 1100px) {
  .billing-layout {
    grid-template-columns: minmax(290px, 0.9fr) minmax(0, 1.2fr);
  }
  .billing-detail {
    padding-left: 24px;
  }
  .billing-toolbar {
    align-items: flex-start;
  }
  .billing-modes button {
    padding: 9px;
  }
  .billing-metrics {
    gap: 16px;
  }
  .billing-metrics > div + div {
    padding-left: 16px;
  }
}
@media (max-width: 760px) {
  .billing-layout {
    grid-template-columns: 1fr;
  }
  .billing-list {
    border-right: 0;
    border-bottom: 1px solid var(--bz-border);
    padding: 20px 0;
  }
  .billing-records {
    max-height: 320px;
    overflow: auto;
  }
  .billing-detail {
    padding: 26px 0;
  }
  .billing-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;
  }
  .billing-metrics > div:nth-child(3) {
    padding-left: 0;
    border: 0;
  }
  .billing-toolbar {
    flex-direction: column;
  }
  .billing-toolbar > .bz-btn {
    width: 100%;
  }
  .billing-line-editor {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 430px) {
  .billing-progress li {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding-inline: 2px;
    text-align: center;
    overflow-wrap: anywhere;
    font-size: 11px;
  }
  .billing-progress .material-symbols-outlined {
    margin-right: 0;
  }
  .billing-fields {
    grid-template-columns: minmax(0, 1fr);
  }
  .billing-modes {
    gap: 4px;
  }
  .billing-modes button {
    font-size: 12px;
    gap: 5px;
  }
  .billing-modes .material-symbols-outlined {
    font-size: 18px;
  }
  .billing-actions > .bz-btn {
    flex: 1 1 100%;
    white-space: normal;
  }
  .billing-total {
    gap: 24px;
  }
  .billing-total strong {
    font-size: 23px;
  }
  .billing-form__footer .bz-btn {
    flex: 1;
  }
}
.billing-evidence-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.billing-evidence-list button {
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
}
.billing-file-input {
  display: none !important;
}
.billing-file-picker {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  min-width: 0;
}
.billing-file-picker > .bz-btn {
  max-width: 100%;
  white-space: normal;
}
.billing-file-picker .material-symbols-outlined {
  font-size: 18px;
}
.billing-file-status {
  display: grid;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  color: var(--bz-fg);
  font-size: 13px;
  overflow-wrap: anywhere;
}
.billing-file-status small {
  color: var(--bz-fg-muted);
  font-size: 12px;
}
.billing-linked-orders {
  margin: 24px 0;
}
.billing-linked-orders .billing-evidence-list {
  margin-bottom: 0;
}
</style>
