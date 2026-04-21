/**
 * Buyer's guide content for each option in the browse configurator.
 * Keyed by lowercased option label. Used by the Learn More modal.
 */

export interface GuideEntry {
  title: string;
  subtitle?: string;
  /** Long-form prose, supports \n\n paragraph breaks */
  body: string;
  /** Quick bullet specs / benefits */
  specs?: Array<{ label: string; value: string }>;
  /** Pros and cons */
  pros?: string[];
  cons?: string[];
  /** Optional image override (otherwise the card's image is reused) */
  image?: string;
}

export const GUIDE_ENTRIES: Record<string, GuideEntry> = {
  /* ---------------- Enclosures ---------------- */
  'single door': {
    title: 'Single Door',
    subtitle: 'The most popular frameless configuration',
    body: `A single hinged glass door mounted into an existing alcove with tile on three sides. Perfect for standard tub-replacement openings (24"–36" wide) where you want clean, uninterrupted glass and no metal framing in sight.\n\nHinges anchor to the wall with small discrete clips. The door typically swings outward on pivot hinges so it can clear the interior of the shower — no dripping water on the bathroom floor when you step out.`,
    specs: [
      { label: 'Typical width', value: '24"\u201336"' },
      { label: 'Glass thickness', value: '3/8" or 1/2" tempered' },
      { label: 'Hinge type', value: 'Wall-mount pivot' },
      { label: 'Install time', value: '1 day' },
    ],
    pros: ['Minimal hardware', 'Easy to clean — no channels to collect grime', 'Works in 90% of bathrooms'],
    cons: ['Requires tile on all 3 sides of opening', 'Needs clearance for door swing'],
  },
  'door + panel': {
    title: 'Door + Panel',
    subtitle: 'For wider openings',
    body: `A hinged door paired with a fixed glass panel. The fixed panel is secured directly to the wall with clips while the door hangs from pivot hinges anchored to the panel. Ideal for 48"\u201360" openings where a single door would be too heavy or wide.\n\nA subtle sweep seals the vertical seam between door and panel to prevent water from escaping during use.`,
    specs: [
      { label: 'Typical width', value: '48"\u201360"' },
      { label: 'Door width', value: '24"\u201328"' },
      { label: 'Panel width', value: '20"\u201332"' },
    ],
    pros: ['Wider openings without a massive door', 'Can hide plumbing behind the panel'],
    cons: ['More hardware than a single door'],
  },
  'neo-angle': {
    title: 'Neo-Angle',
    subtitle: 'Corner-saving diamond shape',
    body: `Three glass panels forming a diamond / pentagonal footprint in a bathroom corner. Two angled side panels mount into the wall corners; the center door opens outward. Great solution when floor space is tight but you still want a dedicated shower.\n\nBecause it's installed in a corner, the tile work only needs to cover two walls — often a cost savings on remodels.`,
    specs: [
      { label: 'Typical footprint', value: '38" \u00D7 38" corner' },
      { label: 'Glass panels', value: '3 (2 fixed + 1 door)' },
    ],
    pros: ['Maximizes small bathrooms', 'Distinctive, elegant shape', 'Opens toward you for a spacious feel'],
    cons: ['Not suitable for steam', 'Custom-cut for your corner dimensions'],
  },
  '90° corner': {
    title: '90° Corner',
    subtitle: 'Two panels meeting at a right angle',
    body: `Two glass panels meeting at a 90° corner with a clip connecting them at top and bottom. Clean, modern look — no vertical post, just a knife-edge corner where glass meets glass.\n\nCommon in walk-in showers where you want a fully open entry on one side.`,
    specs: [
      { label: 'Panel arrangement', value: '2 glass panels' },
      { label: 'Connection', value: 'Glass-to-glass clips' },
    ],
    pros: ['Minimal visual clutter', 'Great for walk-ins', 'Pairs well with linear drains'],
    cons: ['Not watertight at corners — no door'],
  },
  'frameless slider': {
    title: 'Frameless Slider',
    subtitle: 'Sliding panels, no swing clearance needed',
    body: `Two large panels on a continuous top-mounted track. One panel slides behind the other on silent ball-bearing rollers. Zero swing clearance required — perfect for tight bathrooms, tub-to-shower conversions, or any space where a hinged door would bang into the toilet or vanity.\n\nSubtle bottom guides keep the sliding panel aligned while preserving the frameless look.`,
    specs: [
      { label: 'Typical width', value: '60"\u201372"' },
      { label: 'Track length', value: 'Matches opening' },
      { label: 'Panels', value: '2 (1 fixed + 1 sliding)' },
    ],
    pros: ['No swing clearance needed', 'Huge openings when slid open', 'Quiet, smooth action'],
    cons: ['Heavier hardware', 'Top track is visible (though minimal)'],
  },
  'curved': {
    title: 'Curved',
    subtitle: 'Bent glass for a spa aesthetic',
    body: `A single sheet of glass heat-bent into a smooth radius curve. No seams, no straight edges in the curved section — just flowing glass. Makes a shower feel more like a resort spa.\n\nBecause the glass is custom-formed for your dimensions, lead time is a few weeks longer than straight glass.`,
    specs: [
      { label: 'Glass', value: 'Heat-bent 3/8" tempered' },
      { label: 'Lead time', value: '4\u20136 weeks' },
    ],
    pros: ['Dramatic statement piece', 'Softens the bathroom aesthetic', 'No seams to clean'],
    cons: ['Longer lead time', 'Higher cost than flat panels'],
  },
  'arched': {
    title: 'Arched',
    subtitle: 'Decorative arched top edge',
    body: `Glass panels with a decorative arched / curved top cut-out. The sides stay straight, but the top edge becomes an architectural detail. Common in traditional and Mediterranean-style homes where the arched motif repeats throughout the space.`,
    specs: [
      { label: 'Top edge', value: 'Custom-cut arch' },
      { label: 'Sides', value: 'Straight' },
    ],
    pros: ['Architectural character', 'Works with traditional interiors'],
    cons: ['Custom shape = higher price'],
  },
  'splash panel': {
    title: 'Splash Panel',
    subtitle: 'The minimalist walk-in',
    body: `A single fixed glass panel acting as a water barrier for an open walk-in shower. **NO door, NO hinges, NO moving parts** — just one sheet of glass anchored to the wall at one end. The entry side is completely open.\n\nBuilt around a linear drain and a sloped floor that directs water back toward the shower zone. Gorgeous, modern, and easy to clean.`,
    specs: [
      { label: 'Typical width', value: '24"\u201330"' },
      { label: 'Required', value: 'Linear drain + sloped floor' },
    ],
    pros: ['Maximum open feel', 'Easiest to clean (no door)', 'ADA-friendly'],
    cons: ['Needs a dedicated wet zone', 'Not watertight', 'Some floor splash is normal'],
  },
  'steam shower': {
    title: 'Steam Shower',
    subtitle: 'Fully sealed spa experience',
    body: `A completely sealed floor-to-ceiling enclosure designed to contain steam. Glass panels run from floor to ceiling with a transom panel above the door, plus compression seals around every edge.\n\nRequires a steam generator (typically installed in a nearby closet or vanity). Your daily shower becomes a private spa.`,
    specs: [
      { label: 'Height', value: 'Floor to ceiling' },
      { label: 'Seals', value: 'Compression on all edges' },
      { label: 'Generator', value: 'Remote install' },
    ],
    pros: ['True spa experience', 'Adds resale value', 'Health benefits of steam'],
    cons: ['Higher cost (~$3-5k glass premium)', 'Requires a steam generator', 'More maintenance'],
  },
  'custom': {
    title: 'Custom',
    subtitle: 'Bespoke for unusual spaces',
    body: `Multi-panel configurations designed for irregular layouts — angled walls, unusual footprints, multiple doors, or design features like integrated niches. We site-measure, draft, and engineer the exact configuration.`,
    pros: ['Fits any space', 'One-of-a-kind', 'Full creative freedom'],
    cons: ['Longest lead time', 'Highest price'],
  },

  /* ---------------- Glass ---------------- */
  'clear glass': {
    title: 'Clear Glass',
    subtitle: 'The bestseller',
    body: `Untreated, uncoated tempered glass that is nearly invisible. Shows off every detail of your tile work behind it and lets maximum light through. The most popular choice in modern bathrooms.\n\nWe recommend pairing with a protective glass coating (EnduroShield / Diamon-Fusion) to keep it looking clean with less effort.`,
    specs: [
      { label: 'Clarity', value: 'Crystal clear' },
      { label: 'Light transmission', value: '~90%' },
      { label: 'Privacy', value: 'None' },
    ],
    pros: ['Shows off tile', 'Brightens the bathroom', 'Easiest to price + source'],
    cons: ['Shows every water spot', 'No privacy'],
  },
  'frosted glass': {
    title: 'Frosted Glass',
    subtitle: 'Acid-etched privacy',
    body: `Glass with one surface uniformly acid-etched to a satin finish. Translucent, not transparent — light passes through, but details don't. Elegant, diffused, and hides soap scum better than clear.`,
    specs: [
      { label: 'Privacy level', value: 'High' },
      { label: 'Light transmission', value: '~65%' },
    ],
    pros: ['Privacy without curtains', 'Hides water spots', 'Soft aesthetic'],
    cons: ['Fingerprints show on the etched side', 'Slightly higher cost'],
  },
  'rain glass': {
    title: 'Rain Glass',
    subtitle: 'Textured water-droplet pattern',
    body: `Glass with a vertical water-droplet pattern embossed into one side. Artistic privacy — you see shapes and light but not clear details. Feels like looking through a window during a rainstorm.`,
    specs: [
      { label: 'Privacy level', value: 'Medium-high' },
      { label: 'Pattern', value: 'Vertical drops' },
    ],
    pros: ['Unique aesthetic', 'Natural feeling privacy', 'Great for guest baths'],
    cons: ['Texture is a design choice — either loved or meh', 'Clean with care to avoid streaks'],
  },

  /* ---------------- Hardware ---------------- */
  'polished chrome': {
    title: 'Polished Chrome',
    subtitle: 'Timeless and versatile',
    body: `The classic default — bright, reflective, and pairs with virtually every fixture. Chrome never goes out of style. Shows less buildup than matte finishes.`,
    pros: ['Matches almost any fixture', 'Durable, corrosion-resistant', 'Easy to clean'],
    cons: ['Very common — less distinctive'],
  },
  'brushed nickel': {
    title: 'Brushed Nickel',
    subtitle: 'Warm, soft sophistication',
    body: `Slightly warmer tone than chrome with a satin brushed finish. Great at hiding water spots and fingerprints in a well-used bathroom.`,
    pros: ['Hides water spots', 'Works well with wood + natural textures', 'Timeless'],
    cons: ['Can read "traditional" — less modern feel'],
  },
  'matte black': {
    title: 'Matte Black',
    subtitle: 'Bold, architectural statement',
    body: `Powder-coated matte black hardware for contemporary and industrial interiors. Creates high contrast with light tile. Currently the most-requested finish on new builds in South Florida.`,
    pros: ['Very on-trend', 'Striking against light tile', 'Feels modern & intentional'],
    cons: ['Requires gentle cleaners — no abrasives', 'Can look dated in 5\u201310 years'],
  },
  'polished brass': {
    title: 'Polished Brass',
    subtitle: 'Classic luxury warmth',
    body: `Warm golden finish reminiscent of high-end hotels. Bold and luxurious. Looks especially stunning with marble or white subway tile.`,
    pros: ['Luxury feel', 'Great with marble', 'Timeless in the right setting'],
    cons: ['Polishing required to stay shiny', 'Expensive'],
  },
  'satin brass': {
    title: 'Satin Brass',
    subtitle: 'Soft golden, very on-trend',
    body: `Muted, brushed version of polished brass. Has the warmth of gold without the mirror shine. Currently rivaling matte black as the hottest finish in high-end design.`,
    pros: ['Timeless warmth + modern softness', 'Hides water marks better than polished', 'Versatile'],
    cons: ['Premium pricing'],
  },

  /* ---------------- Handles ---------------- */
  'pull handle': {
    title: 'Pull Handle',
    subtitle: 'The most popular choice',
    body: `A vertical tubular handle mounted through-hole in the glass door. Simple, ergonomic, and pairs with any door style. 6"\u20138" long, matches your hardware finish.`,
    pros: ['Classic, works everywhere', 'Ergonomic grip', 'Budget-friendly'],
    cons: ['Less distinctive than ladder pulls or statement handles'],
  },
  'u-handle': {
    title: 'U-Handle',
    subtitle: 'Surface-mounted, sturdy',
    body: `A U-shaped handle bracket mounted to the outside of the door with two stand-offs. No through-hole drilling required — lower risk during fabrication.`,
    pros: ['No drilling through glass', 'Comfortable grip', 'Clean look'],
    cons: ['Only on door exterior'],
  },
  'ladder pull': {
    title: 'Ladder Pull',
    subtitle: 'A real design statement',
    body: `Multiple horizontal rungs between two vertical bars — like a small ladder mounted vertically on the glass. A favorite for modern design-forward bathrooms. Can also double as a towel bar on wider doors.`,
    pros: ['Stunning focal point', 'Doubles as towel bar', 'Commercial-grade heft'],
    cons: ['Higher cost', 'Needs wider door panel'],
  },
  'knob': {
    title: 'Knob',
    subtitle: 'Minimalist and discreet',
    body: `A small round knob mounted through-hole in the glass. Almost invisible — perfect when you want the glass itself to be the only visual element.`,
    pros: ['Super minimal', 'Low cost', 'Easy to install'],
    cons: ['Less ergonomic for wet hands', 'Feels less premium'],
  },
};

export function getGuideEntry(label: string): GuideEntry | null {
  return GUIDE_ENTRIES[label.toLowerCase().trim()] || null;
}
