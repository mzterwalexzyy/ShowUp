# ShowUp visual assets

All artwork was generated with the built-in image generation tool, visually inspected, cropped with Pillow, and exported as WebP. The source PNGs remain in the local Codex generated-images directory. Event records do not yet include a cover field. The attendee and host views therefore use the default covers, with markup ready to switch to a host-provided URL in a later phase.

## showup-event-default.webp

- Purpose: Default attendee event cover when an event has no host-provided cover.
- Prompt: “Modern event-poster illustration combining an abstract crowd, stage architecture, paper ticket shapes, and check-in wristband forms. Bold flat geometric screen-print style with subtle printed-paper grain. Wide landscape with energetic detail around the top and right edges and calm warm off-white space in the center and lower-left. Deep near-black green, acid lime, restrained coral and violet. No gradients, text, letters, numbers, logos, watermarks, identifiable faces, fake UI, or crypto imagery.”
- Dimensions: 1280 × 720
- Format: WebP
- File size: 68,926 bytes
- Alt text: “Abstract event crowd, stage, tickets, and wristbands.” The image establishes the event context.
- Used in: Attendee event detail at `/e/[eventId]`. It is the single preloaded image on that route.

## showup-host-default.webp

- Purpose: Default host campaign-card cover.
- Prompt: “Abstract venue planning scene made from seating blocks, an entry gate, floor-plan forms, paper passes, and orderly check-in lanes. Modern event-poster illustration with bold flat geometry and slight printed-paper grain. Warm off-white, deep near-black green, acid lime, restrained coral and violet. No gradients, text, letters, numbers, logos, watermarks, people, faces, fake UI, or crypto symbols.”
- Dimensions: 1280 × 720
- Format: WebP
- File size: 70,850 bytes
- Alt text: Empty, because campaign title and data communicate the card’s meaning.
- Used in: Host campaign cards at `/host`, lazy-loaded.

## showup-checkin-success.webp

- Purpose: Compact confirmation art after a wallet-signed check-in.
- Prompt: “Paper event ticket and venue wristband forms resolving into a large unmistakable geometric verified check mark. Bold flat screen-print geometry, crisp cut-paper edges, subtle paper grain, simple warm off-white background. Deep near-black green, acid lime, tiny coral accent. No gradients, text, letters, numbers, logos, watermarks, faces, fake UI, or crypto symbols.”
- Dimensions: 640 × 640
- Format: WebP
- File size: 10,236 bytes
- Alt text: “Verified ticket and venue wristband.” The visual reinforces successful check-in.
- Used in: Checked-in reservation pass at `/r/[reservationId]`, lazy-loaded.

## showup-empty-events.webp

- Purpose: Empty host campaign state.
- Prompt: “Quiet folded paper ticket beside a minimal empty venue entry gate and a few unoccupied geometric seat forms. Friendly mature editorial illustration with flat cut-paper shapes and subtle printed-paper grain. Generous warm off-white space, deep near-black green, restrained acid lime, violet and coral. No gradients, text, letters, numbers, logos, watermarks, people, faces, fake UI, or crypto imagery.”
- Dimensions: 960 × 640
- Format: WebP
- File size: 16,422 bytes
- Alt text: “An empty venue entrance with folded event tickets.” The image explains the no-campaign state.
- Used in: Organizer’s empty campaign dashboard at `/host`, lazy-loaded.

## showup-social-card.webp

- Purpose: Social and Open Graph banner with clean space for later title treatment.
- Prompt: “Abstract event system expressed through a stage canopy, entry gate, paper ticket, wristband, check-in mark, and rhythmic crowd-like geometric forms. Premium modern event-poster illustration with bold flat screen-print geometry and subtle printed-paper grain. Concentrate visual energy on the right and edges, leaving the left-center calm. Warm off-white, deep near-black green, acid lime, restrained coral and violet. No gradients, text, letters, numbers, logos, watermarks, identifiable faces, fake UI, or crypto imagery.”
- Dimensions: 1200 × 630
- Format: WebP
- File size: 65,760 bytes
- Alt text: Not applicable. It is referenced by social metadata.
- Used in: Global `og:image` metadata.

## paper-grain.webp

- Purpose: Very subtle seamless texture over the warm paper background.
- Prompt: “Extremely subtle natural uncoated paper fiber texture, evenly distributed and seamless in every direction. Nearly flat, unobtrusive warm off-white with very low-contrast beige and faint green-gray fibers. No gradients, stains, folds, shadows, text, symbols, watermarks, or objects.”
- Dimensions: 256 × 256
- Format: WebP
- File size: 230 bytes
- Alt text: Empty. It is decorative CSS texture.
- Used in: Global page surface with `--paper` as the fallback color. Disabled when reduced-data preference is active.

## Inspection record

The final optimized files were inspected after export. None contains rendered text, pseudo-logos, accidental watermarks, identifiable faces, unwanted crypto symbols, or visible compression artifacts. All normal interface assets are below 250 KB, and the social card is below 500 KB.
