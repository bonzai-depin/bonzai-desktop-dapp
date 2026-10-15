# BonzAI Interface System

BonzAI is a focused creative and operational workspace. Its interface should feel refined, capable, and calm across Desktop, Web, and BonzAI+.

## Sources of truth

| Path | Purpose |
| --- | --- |
| `src/assets/tokens.css` | Shared spacing, size, radius, color, and elevation tokens |
| `src/assets/themes.css` | Light and dark semantic theme values |
| `src/assets/fonts/fonts.css` | Bundled typefaces and font declarations |
| `src/services/theme.service.js` | Theme selection and persistence |

Use semantic tokens instead of introducing view-specific color systems. A new token must represent a reusable role, not a one-off visual preference.

## Typography

- Use the bundled BonzAI type system consistently.
- Product branding uses the established BonzAI display face and proportions; never stretch the logo or wordmark.
- View titles are concise and sized for product software, not marketing pages.
- Labels, buttons, table headers, and metadata remain compact and scannable.
- Numeric metrics use the BonzAI brand face (`--bz-font-metric`, condensed black italic). Mark new metric values with `bz-metric`; code, addresses and editable inputs keep their own typography.
- Model names use their canonical display casing outside downloads. Downloads display lowercase category labels instead of model names or filenames; case-sensitive remote URLs remain unchanged.
- Use normal letter spacing. Avoid all-caps paragraphs and oversized bold text in chat output.

## Color and contrast

- Build every component from semantic foreground, surface, border, accent, success, warning, and danger roles.
- Body and secondary text must remain readable on both themes. Do not place low-contrast gray text on a dark surface.
- Accent colors indicate selection or action; they are not decoration.
- Reserve warning and danger colors for states with matching meaning.
- Avoid gradients, ornamental glow, and strong shadow unless the product content itself requires emphasis.

## Layout

- Product navigation stays predictable and stable.
- Prefer unframed sections and clear dividers. Cards are for repeated items, framed tools, and modals, not every section.
- Do not nest cards.
- Keep operational views dense enough to scan while preserving clear spacing between groups.
- Use one primary action per context. Secondary actions should be visually quieter.
- Controls must not resize when labels, icons, counters, or loading states change.
- Long text wraps without overlapping adjacent controls.

## Components

- Use familiar icons for icon actions and provide tooltips when meaning is not obvious.
- Use segmented controls or tabs for modes, switches for binary settings, and inputs or steppers for numeric values.
- Buttons use semantic variants consistently. Avoid arbitrary colors and oversized calls to action.
- Empty states explain what is missing and provide the next valid action.
- Download requirements use the shared `DownloadRequirement.vue` component wherever a missing model blocks a workflow. Keep them visually prominent with the shared accent edge, tinted surface, and download icon. Use the BonzAI brand font for headings and percentages. Show lowercase download categories with crate icons, sizes, progress, actions, and errors; never model names or filenames; omit model descriptions and performance prose. Active downloads offer cancellation and omit the redundant per-row “downloading” status. In agent creation, the panel spans the workspace above the form and preview card.
- Modals focus on a single decision and retain the visual language of the surrounding view.

## Conversation

Companion and company chat share the same visual foundation:

- round avatars where available;
- readable message width and compact Markdown typography;
- durable links to work products and artifacts;
- bidirectional scrolling with an explicit jump-to-latest control;
- initial scroll to the latest message;
- automatic scrolling only while the user remains near the latest message;
- restrained directional entrance motion for new messages;
- visible team or role context where multiple agents participate.

Chat is an operating surface, not decoration. Results, decisions, evidence, and deliverables must remain inspectable after the conversation advances.

## Motion and accessibility

- Motion communicates state, continuity, or spatial change. Avoid ornamental animation.
- Respect reduced-motion preferences.
- Preserve keyboard navigation and visible focus states.
- Icon-only controls require accessible labels.
- Do not rely on color alone to communicate status.
- Use sufficient hit areas for pointer and touch interaction.

## Review checklist

Before merging interface changes, verify:

1. Light and dark themes use the same semantic hierarchy.
2. Text contrast, focus states, and keyboard flow are usable.
3. Loading, empty, disabled, error, and long-content states are intentional.
4. The view works at common desktop widths and constrained layouts.
5. No logo, image, button, tab, or text label is distorted, clipped, or overlapping.
6. The implementation reuses the shared tokens and existing components where appropriate.
