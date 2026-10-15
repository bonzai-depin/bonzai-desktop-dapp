<template>
  <fieldset class="contract-pricing company-screen" data-i18n-skip>
    <legend>{{ ui("Contract pricing") }}</legend>
    <label class="pricing-toggle"
      ><input
        type="checkbox"
        role="switch"
        :checked="!!modelValue"
        @change="toggle($event.target.checked)"
      />{{ ui("Use the ST1 / ST2 / ESP franchise rules") }}</label
    >
    <template v-if="modelValue">
      <div class="pricing-rules">
        <div v-for="rule in rules" :key="rule.id">
          <span>{{ ui(rule.label) }}</span
          ><b class="bz-metric">{{ money(rule.thresholdCents) }}</b>
        </div>
      </div>
      <div class="pricing-fields">
        <label
          >{{ ui("Contract reference")
          }}<input
            :value="modelValue.reference"
            required
            @input="set('reference', $event.target.value)"
        /></label>
        <label
          >{{ ui("Validated by")
          }}<input
            :value="modelValue.validatedBy"
            required
            @input="set('validatedBy', $event.target.value)"
        /></label>
        <label
          >{{ ui("Parts coefficient K")
          }}<input
            :value="modelValue.coefficient"
            type="number"
            min="0.001"
            max="100"
            step="0.001"
            required
            @input="set('coefficient', Number($event.target.value))"
        /></label>
        <label
          >{{ ui("Lifting above the franchise")
          }}<select
            :value="modelValue.accessAboveThreshold"
            required
            @change="set('accessAboveThreshold', $event.target.value)"
          >
            <option value="">{{ ui("Select the validated treatment") }}</option>
            <option value="included">{{ ui("Included") }}</option>
            <option value="billable">{{ ui("Billable") }}</option>
          </select></label
        >
        <label class="pricing-wide"
          >{{ ui("ST2 clarification reference")
          }}<input
            :value="modelValue.ventilationResolution"
            @input="set('ventilationResolution', $event.target.value)"
          /><small>{{
            ui(
              "Other ventilation equipment remains blocked until the conflicting €100 clauses are clarified.",
            )
          }}</small></label
        >
      </div>
      <p>
        {{
          ui(
            "Above the threshold: deduct up to 8 hours of labour and travel. These rules apply only to this contract.",
          )
        }}
      </p>
      <label class="pricing-toggle"
        ><input
          type="checkbox"
          role="switch"
          :checked="confirmed"
          required
          @change="$emit('update:confirmed', $event.target.checked)"
        />{{ ui("I confirm these terms against the contract.") }}</label
      >
    </template>
  </fieldset>
</template>
<script setup>
import "./company-design.css";
import { CCTP_PRICING_RULES } from "../../services/company/contractPricing.js";
import { operationText } from "../../i18n/operations.js";
import { i18n } from "../../i18n/index.js";
const props = defineProps({
  modelValue: { type: Object, default: null },
  confirmed: Boolean,
});
const emit = defineEmits(["update:modelValue", "update:confirmed"]);
const rules = CCTP_PRICING_RULES;
const ui = (value) => operationText(value, i18n.state.locale);
const money = (value) =>
  new Intl.NumberFormat(i18n.state.locale, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value / 100);
function set(key, value) {
  emit("update:modelValue", { ...props.modelValue, [key]: value });
  emit("update:confirmed", false);
}
function toggle(enabled) {
  emit(
    "update:modelValue",
    enabled
      ? {
          id: "cctp_25_004",
          reference: "",
          validatedBy: "",
          coefficient: 1,
          accessAboveThreshold: "",
          ventilationResolution: "",
        }
      : null,
  );
  emit("update:confirmed", false);
}
</script>
<style scoped>
.contract-pricing {
  border: 1px solid var(--bz-border);
  border-radius: var(--bz-r);
  padding: 20px;
  display: grid;
  gap: 20px;
  color: var(--bz-fg);
  min-width: 0;
}
.contract-pricing legend {
  padding: 0 8px;
  font-weight: 600;
}
.pricing-rules {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 24px;
}
.pricing-rules > div {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid var(--bz-border);
}
.pricing-rules b {
  white-space: nowrap;
  font-size: 20px;
}
.pricing-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}
.pricing-fields label {
  display: grid;
  gap: 8px;
  font-size: 13px;
  color: var(--bz-fg-mid);
  min-width: 0;
}
.pricing-wide {
  grid-column: 1 / -1;
}
.pricing-fields input,
.pricing-fields select {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 10px 12px;
  min-height: 42px;
  color: var(--bz-fg);
  background: var(--bz-panel);
  border: 1px solid var(--bz-border-strong);
  border-radius: var(--bz-r-sm);
  font: inherit;
}
.pricing-fields select {
  padding-right: 42px;
}
.pricing-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  cursor: pointer;
}
.pricing-toggle input {
  appearance: none;
  width: 36px;
  height: 22px;
  border: 1px solid var(--bz-border-strong);
  background: var(--bz-panel);
  border-radius: 999px;
  position: relative;
  flex: none;
  margin: 0;
}
.pricing-toggle input:before {
  content: "";
  position: absolute;
  width: 14px;
  height: 14px;
  top: 3px;
  left: 3px;
  border-radius: 50%;
  background: var(--bz-fg-mid);
  transition: transform 0.15s;
}
.pricing-toggle input:checked {
  background: var(--bz-accent);
}
.pricing-toggle input:checked:before {
  transform: translateX(14px);
  background: var(--bz-on-accent, #fff);
}
.contract-pricing :is(input, select):focus-visible {
  outline: 2px solid var(--bz-accent);
  outline-offset: 3px;
}
.contract-pricing p,
.contract-pricing small {
  margin: 0;
  color: var(--bz-fg-mid);
  font-size: 13px;
  line-height: 1.6;
}
@media (max-width: 640px) {
  .pricing-rules,
  .pricing-fields {
    grid-template-columns: 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  .pricing-toggle input:before {
    transition: none;
  }
}
</style>
