// Single source of truth for the demo-account presentation layer.
// This is cosmetic masking on the response path — real data still crosses the
// wire; it only controls what names render. Fine for live sales demos.

// Accounts that get the demo presentation layer, matched by email
// (compared case-insensitively). Must exactly match the real account email —
// a mismatch means the mask never fires and real data shows unmasked.
export const DEMO_USER_EMAILS: string[] = [
  'user.demo@gmail.com', // ⚠ confirm: "gamil" vs "gmail"
]

export function isDemoUser(email: string | null | undefined): boolean {
  if (!email) return false
  return DEMO_USER_EMAILS.includes(email.trim().toLowerCase())
}

export interface DemoSiteMask {
  siteId: number          // real site id (from ?site= / site_id / Site.id)
  siteName: string        // display name, e.g. "Demo Site 1"
  customerId: number      // synthetic, stable, negative to avoid real-id clashes
  customerName: string    // "Dummy Customer A" / "Dummy Customer B"
}

// Order here drives portfolio group order and site order within a group.
export const DEMO_SITES: DemoSiteMask[] = [
  { siteId: 5,  siteName: 'Demo Site 1', customerId: -1, customerName: 'Dummy Customer A' },
  { siteId: 6, siteName: 'Demo Site 2', customerId: -1, customerName: 'Dummy Customer A' },
  { siteId: 4,  siteName: 'Demo Site 1', customerId: -2, customerName: 'Dummy Customer B' },
]

// Portfolio header scope label (installer name would otherwise show here).
export const DEMO_SCOPE_NAME = 'Demo Portfolio'
