# Teton CPQ — working notes

## UI conventions (always apply)

- **Every expand/collapse animates.** Sections, groups, cards and anything else that opens and closes use the shared `Collapse` component (`components/form/fields.tsx`): a short height + fade transition (300 ms), never an instant `hidden` swap.
- **Every drawer or panel animates in and out.** Slide/fade in on open and back out on close (see `.drawer-in` / `.drawer-out` in `app/globals.css`; keep showing the last content while it leaves).
- **Every toggle animates.** Switches slide their knob (`transition-transform duration-200`); button groups use `SegGroup` (`components/form/SegGroup.tsx`), whose selection pill slides to the chosen option.
- Respect `prefers-reduced-motion` (Tailwind `motion-reduce:` or a media query).
- Mobile matters: check new UI at phone width (no sideways scroll, comfortable tap targets).
