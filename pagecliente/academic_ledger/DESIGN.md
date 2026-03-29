# Design System Strategy: The Institutional Editorial

## 1. Overview & Creative North Star
The "Institutional Editorial" is the creative North Star for this design system. We are moving away from the "data-heavy spreadsheet" aesthetic typical of school administration and toward a premium, curated reporting experience. By blending the authority of a corporate financial report with the modern clarity of high-end digital interfaces, we create a system that feels stable, intelligent, and highly legible.

Our approach rejects rigid, boxy grids in favor of **intentional tonal layering**. We use generous white space and sophisticated sans-serif pairings to guide the eye through complex consumption data without overwhelming the user. The goal is to make a school consumption report feel as prestigious as a quarterly shareholder document.

---

## 2. Colors & Surface Logic

The color palette is anchored by a deep professional blue (`primary: #000666`), signaling trust and institutional permanence.

### The "No-Line" Rule
To achieve a high-end feel, **do not use 1px solid borders to section content.** Traditional table borders are forbidden. Instead, use background color shifts to define boundaries. For example, a header section using `primary` sits adjacent to a body section using `surface`, separated only by the clean edge of the color change.

### Surface Hierarchy & Nesting
We treat the UI as a series of physical layers. Hierarchy is established by "stacking" surface tiers:
- **Base Layer:** `surface` (#fbf8ff)
- **Section Containers:** `surface_container_low` (#f5f2fb) or `surface_container` (#efecf5)
- **Primary Data Cards:** `surface_container_lowest` (#ffffff) to provide a "lifted" appearance against the off-white background.

### The Glass & Signature Textures
For floating elements or status modals, use semi-transparent variations of `surface` with a **backdrop-blur** (Glassmorphism). To add visual "soul" to the primary blue, apply a subtle linear gradient transitioning from `primary` (#000666) to `primary_container` (#1a237e) at a 135-degree angle for major hero headers or primary action buttons.

---

## 3. Typography
The system uses a dual-font approach to balance editorial character with functional precision.

*   **Display & Headlines (Manrope):** Chosen for its geometric modernism. High-contrast sizing (e.g., `display-lg` at 3.5rem) should be used for key totals (like "Balance Due") to create a bold, authoritative focal point.
*   **Body & Labels (Inter):** A workhorse for readability. Use `body-md` for standard report line items. 
*   **Hierarchy Tip:** Use `label-md` in all-caps with `0.05rem` letter spacing for table headers to give them a "pro-editorial" feel without needing heavy weight.

---

## 4. Elevation & Depth

We move beyond the "drop shadow" defaults of the early web. Depth in this system is organic.

*   **The Layering Principle:** Depth is primarily achieved through tonal shifts. A `surface_container_lowest` card placed on a `surface_container_low` background creates a natural elevation that feels tactile and sophisticated.
*   **Ambient Shadows:** Where a floating effect is required (e.g., a "Generate Report" FAB), use a large blur (24px-32px) at a very low opacity (6%). The shadow should be tinted with `on_surface` (#1b1b21) to ensure it feels like a natural shadow on paper, not a digital artifact.
*   **The "Ghost Border" Fallback:** If a boundary requires more definition for accessibility, use the `outline_variant` (#c6c5d4) at 20% opacity. 

---

## 5. Components

### Cards & Data Lists
*   **Constraint:** Forbid the use of horizontal dividers. 
*   **Execution:** Use `Spacing 4` (1rem) or `Spacing 6` (1.5rem) to separate rows. Use alternating background tints (`surface` vs `surface_container_low`) for long lists to maintain tracking.
*   **Rounding:** All cards must use `rounded-xl` (0.75rem) to soften the corporate tone.

### Buttons
*   **Primary:** Solid `primary` gradient with `on_primary` text. Use `rounded-full` for a modern, approachable feel.
*   **Secondary:** `surface_container_high` background with `on_surface_variant` text. No border.

### Chips & Status Indicators
*   **Positive (Credit):** `secondary_container` background with `on_secondary_fixed_variant` text.
*   **Negative (Consumption):** `tertiary_fixed` background with `tertiary` text.
*   **Styling:** Chips should be `rounded-md` and use `label-sm` typography.

### Input Fields
*   **Style:** Minimalist "Underline" style or "Ghost Fill." Avoid heavy 4-sided boxes. Use `surface_container_highest` as a subtle background fill for the input area to make it clearly interactable.

---

## 6. Do's and Don'ts

### Do
*   **Do** use asymmetrical layouts. For example, align report metadata to the right while the title sits on the left.
*   **Do** use the Spacing Scale (especially `Spacing 8` and `Spacing 12`) to create "breathing room" around key metrics.
*   **Do** use `headline-sm` for section titles to maintain a clear narrative flow.

### Don't
*   **Don't** use pure black (#000000) for text. Use `on_surface` to keep the contrast high but the "ink" soft.
*   **Don't** use standard "out-of-the-box" Material shadows. Stick to the Ambient Shadow guidelines.
*   **Don't** crowd data. If a report looks like a spreadsheet, increase the vertical padding in the list items until it looks like a magazine layout.
*   **Don't** use 100% opaque borders. They create "visual noise" that fatigues the user during long-form reading.