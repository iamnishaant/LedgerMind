/**
 * Onboarding & help content — the single source of truth.
 *
 * Everything the help system shows (the "?" panel, the product tour, the
 * first-visit hints) is driven by the data in this file. To document a new page
 * or add a tour step, edit here — no component code changes. See
 * docs/HELP_SYSTEM.md for the extension guide.
 */

export interface Shortcut {
  keys: string;
  action: string;
}

export interface Faq {
  q: string;
  a: string;
}

/** Rich contextual help for one page, rendered in the slide-in "?" panel. */
export interface HelpContent {
  /** Emoji shown in the panel header (kept as text so the panel needs no icon imports). */
  emoji: string;
  title: string;
  /** One-line "what is this page". */
  purpose: string;
  /** When this page is the right tool to reach for. */
  whenToUse: string;
  /** The happy-path, in order. */
  workflow: string[];
  bestPractices: string[];
  tips: string[];
  commonMistakes: string[];
  shortcuts?: Shortcut[];
  faqs: Faq[];
}

/** One step of the first-run product tour. */
export interface TourStep {
  /** CSS selector of the element to spotlight (usually a data-tour anchor). Omit for a centered card. */
  target?: string;
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right" | "center";
}

/** A one-time coach-mark shown the first time a user opens a given page. */
export interface ProgressiveHint {
  title: string;
  body: string;
}

// ── Keyboard shortcuts shared across the app ────────────────────────────────
const GLOBAL_SHORTCUTS: Shortcut[] = [
  { keys: "?", action: "Open contextual help for this page" },
  { keys: "Esc", action: "Close the help panel or tour" },
];

// ── Per-route help content ──────────────────────────────────────────────────
// Keyed by pathname. getHelp() resolves by longest matching prefix, so nested
// routes fall back to their section.
export const HELP_CONTENT: Record<string, HelpContent> = {
  "/dashboard": {
    emoji: "📊",
    title: "Dashboard",
    purpose: "Your finances at a glance for the current month — spend, GST recoverable, receipts and anything that needs attention.",
    whenToUse: "Start here each day for a 10-second read on where the month stands before drilling into a specific area.",
    workflow: [
      "Scan the four KPI tiles for the headline numbers (total spend, expenses this month, GST recoverable, items needing review).",
      "Check 'Spend by Category' to see where the money is going this month.",
      "Read 'Agent Activity' to see what the OCR, Accounting and GST agents have done for you.",
      "Use 'Recent Expenses' to jump into anything that looks off, or click 'View all' for the full list.",
    ],
    bestPractices: [
      "Treat 'Needs Review' as your to-do count — clear it to zero for clean books.",
      "If a KPI looks wrong, open the underlying page (Expenses, GST) to see the line items behind it.",
      "Upload receipts regularly so the dashboard reflects reality rather than lagging behind.",
    ],
    tips: [
      "Every figure is computed live from your own data — there are no sample numbers.",
      "The GST tile shows only ITC you can actually recover (eligible), not raw tax paid.",
    ],
    commonMistakes: [
      "Assuming a low total means low spending — it may just mean receipts haven't been uploaded yet.",
      "Ignoring 'Needs Review' items; these are receipts the OCR wasn't confident about and may hold errors.",
    ],
    shortcuts: GLOBAL_SHORTCUTS,
    faqs: [
      { q: "Why is my dashboard empty?", a: "You haven't booked any expenses this month yet. Upload a receipt and the tiles fill in automatically." },
      { q: "Why doesn't the total match my bank?", a: "The dashboard reflects receipts/expenses you've captured, not your bank feed. Capture every receipt for a complete picture." },
    ],
  },

  "/dashboard/receipts": {
    emoji: "🧾",
    title: "Receipt Upload",
    purpose: "Turn a photo or PDF of a receipt into a structured, categorized expense — automatically.",
    whenToUse: "Every time you get a receipt or invoice. This is the main way data enters LedgerMind.",
    workflow: [
      "Drag a file onto the drop zone, or click to browse.",
      "The OCR agent reads the vendor, amount, date and GST from the image.",
      "The Accounting agent categorizes it; the GST agent checks Input Tax Credit eligibility.",
      "Watch the status: Processing → Completed, or 'Needs review' if confidence was low.",
      "Anything marked 'Needs review' can be corrected on the Expenses page — the app learns from your fix.",
    ],
    bestPractices: [
      "Photograph receipts flat, well-lit, and in focus — OCR accuracy depends on image quality.",
      "Upload sooner rather than later; faded thermal receipts get harder to read over time.",
      "Include the whole receipt in frame, especially the total and GST lines.",
    ],
    tips: [
      "Supported files: JPG, PNG and PDF, up to 10 MB each.",
      "You can drop multiple files at once — they process in parallel.",
      "The confidence score reflects how sure the OCR is; below the threshold, it asks for a human check instead of guessing.",
    ],
    commonMistakes: [
      "Uploading blurry or angled photos, which forces manual review.",
      "Cropping out the total or tax lines — the amount/GST then can't be extracted.",
      "Uploading a file over 10 MB (it will be rejected server-side).",
    ],
    faqs: [
      { q: "What file types are supported?", a: "JPG, PNG and PDF, up to 10 MB. Clear, flat, well-lit images work best." },
      { q: "What does 'Needs review' mean?", a: "The OCR wasn't confident enough to book the expense automatically. Open Expenses to confirm or correct the fields." },
      { q: "Can I forward receipts from email instead?", a: "Yes — connect Gmail on the Automations page and matching attachments are ingested for you." },
    ],
  },

  "/dashboard/expenses": {
    emoji: "💳",
    title: "Expenses",
    purpose: "The full ledger of booked expenses, auto-categorized, searchable and correctable.",
    whenToUse: "To review what's been booked, fix a category, or find a specific transaction.",
    workflow: [
      "Use the category chips or the search box to filter the list.",
      "Click any category to correct it — a dropdown lets you reassign it.",
      "Your correction is saved as a learning signal, so future receipts from that vendor categorize correctly.",
      "Watch for the 'dup' and risk badges that flag duplicates and fraud-scored items.",
    ],
    bestPractices: [
      "Correct miscategorized expenses promptly — the categorizer improves per-vendor from every fix.",
      "Review duplicate ('dup') flags before filing GST or budgets, so amounts aren't double-counted.",
      "Keep vendor names consistent; it makes vendor-level analytics far more useful.",
    ],
    tips: [
      "The filtered totals at the top recompute as you filter — handy for ad-hoc questions.",
      "Clicking a category shows a dashed underline — that means it's editable.",
    ],
    commonMistakes: [
      "Forgetting that a correction only takes effect after you pick a new category from the dropdown.",
      "Overlooking the GST column — a blank there usually means no GSTIN was captured.",
    ],
    shortcuts: GLOBAL_SHORTCUTS,
    faqs: [
      { q: "How does the app learn from my corrections?", a: "Each category fix is stored per vendor. A confident vendor→category prior is applied automatically next time; recent corrections also guide the AI categorizer." },
      { q: "Why is an expense marked as a duplicate?", a: "Its amount, vendor and date closely match another expense within a short window — a common sign the same receipt was captured twice." },
    ],
  },

  "/dashboard/gst": {
    emoji: "🧮",
    title: "GST Intelligence",
    purpose: "See how much Input Tax Credit (ITC) you can actually recover this month, what's blocked, and what's missing a GSTIN.",
    whenToUse: "Before filing GST, or whenever you want to know your recoverable tax position.",
    workflow: [
      "Read the three tiles: ITC recoverable, blocked/ineligible, and expenses missing a GSTIN.",
      "Review 'GST by rate slab' to see the breakdown across 5/12/18/28%.",
      "Work the 'Needs a GSTIN' list — those expenses can't be claimed until a valid tax invoice with the supplier's GSTIN is on file.",
    ],
    bestPractices: [
      "Chase missing GSTINs before filing — they're recoverable tax you're currently leaving on the table.",
      "Remember blocked categories (e.g. food & beverages) are ineligible under Sec 17(5) — don't try to claim them.",
      "Reconcile the recoverable figure against your filing software before submitting.",
    ],
    tips: [
      "'Recoverable' already excludes blocked categories and missing-GSTIN items — it's what you can genuinely claim.",
      "This is a simplified model of Sec 17(5); treat it as decision support, not tax advice.",
    ],
    commonMistakes: [
      "Claiming ITC on blocked categories or without a supplier GSTIN.",
      "Treating 'total GST paid' as 'recoverable' — they differ by the blocked and missing-GSTIN amounts.",
    ],
    faqs: [
      { q: "Why is my recoverable ITC lower than the GST I paid?", a: "Blocked-credit categories and expenses missing a supplier GSTIN are excluded — those aren't claimable." },
      { q: "Is this official tax advice?", a: "No. It's a defensible simplification of the ITC rules to guide you; confirm edge cases with your accountant." },
    ],
  },

  "/dashboard/chat": {
    emoji: "💬",
    title: "AI Chat",
    purpose: "Ask questions about your finances in plain English and get answers computed from your real expense data — never guessed.",
    whenToUse: "For quick, ad-hoc questions you don't want to build a report for — 'top vendors?', 'GST this month?', 'how much on software?'.",
    workflow: [
      "Type a question, or tap one of the suggested prompts to start.",
      "The assistant reads a live snapshot of your books and answers, streaming the reply as it writes.",
      "For anything outside this month, just say so ('last month', 'all time') and it queries the right data.",
      "Use Stop to cancel a long answer, or Retry if a response fails.",
    ],
    bestPractices: [
      "Be specific about the time frame and category for the sharpest answers.",
      "Ask one thing at a time; follow-ups keep the conversation context.",
      "Cross-check big decisions against the underlying pages (Expenses, GST) — the assistant shows which tools it used.",
    ],
    tips: [
      "Example questions: 'What did I spend on Software & Subscriptions this month?', 'Who are my top 5 vendors?', 'How much GST can I recover?', 'Summarize my spending.'",
      "Answers are grounded in your data — it won't invent numbers. If there's no data, it says so.",
      "Common questions answer in a single fast pass; the timing readout under a reply shows how quick it was.",
    ],
    commonMistakes: [
      "Asking for tax or legal advice — it reports your numbers, it isn't your accountant.",
      "Expecting it to read attachments here — upload receipts on the Receipts page instead.",
    ],
    shortcuts: [
      { keys: "Enter", action: "Send message" },
      { keys: "Shift + Enter", action: "New line" },
      ...GLOBAL_SHORTCUTS,
    ],
    faqs: [
      { q: "Can I upload files to the chat?", a: "Not here — the chat answers from your booked data. To add data, upload receipts on the Receipts page (JPG/PNG/PDF)." },
      { q: "Does it make up numbers?", a: "No. Every figure comes from a real query over your expenses. If the data isn't there, it tells you rather than guessing." },
      { q: "How do I get better answers?", a: "Name the time frame and category, ask one question at a time, and use follow-ups to refine." },
    ],
  },

  "/dashboard/budgets": {
    emoji: "🎯",
    title: "Budgets",
    purpose: "Set monthly spending limits per category and get run-rate alerts before you overspend.",
    whenToUse: "When you want guardrails on discretionary categories like Marketing or Travel.",
    workflow: [
      "Click 'New budget', name it, pick a category and a monthly limit.",
      "Each card shows live spend vs. limit and a projected month-end figure based on your current run-rate.",
      "Watch the status badge: On track, At risk, or Over.",
      "Delete a budget with the trash icon when it's no longer needed.",
    ],
    bestPractices: [
      "Budget the volatile categories first — that's where alerts add the most value.",
      "Set realistic limits from last month's actuals rather than round numbers.",
      "Check 'At risk' budgets mid-month while you can still change course.",
    ],
    tips: [
      "The projection is a run-rate estimate: (spend so far ÷ days elapsed) × days in month.",
      "'At risk' means you're on pace to exceed the limit, even if you're under it right now.",
    ],
    commonMistakes: [
      "Setting a limit so high it never triggers — then the alert is meaningless.",
      "Budgeting a category you rarely spend in while ignoring your biggest one.",
    ],
    faqs: [
      { q: "How is the projection calculated?", a: "It's a straight-line run-rate: your spend so far this month scaled to the full month by days elapsed." },
      { q: "Do budgets change my expense data?", a: "No — budgets are read-only overlays. They never alter or delete expenses." },
    ],
  },

  "/dashboard/forecasts": {
    emoji: "📈",
    title: "Forecasts",
    purpose: "Project future spend from your history using a deterministic linear trend over complete months.",
    whenToUse: "For cash-flow planning — 'roughly what will next month cost?'.",
    workflow: [
      "Read the tiles: average monthly burn, this month's run-rate, and next month's projection.",
      "The chart plots actuals (solid) and the projection (dashed) with a marker at the boundary.",
      "Use the trend badge (Rising/Falling/Stable) as a quick directional read.",
    ],
    bestPractices: [
      "The more complete months of history you have, the more reliable the projection.",
      "Treat the projection as a planning estimate, not a commitment — one-off large expenses skew it.",
    ],
    tips: [
      "The current (partial) month is excluded from the trend fit so incomplete data doesn't distort it.",
      "The math is deterministic (a linear fit) — no AI, no randomness, fully reproducible.",
    ],
    commonMistakes: [
      "Reading a projection off one or two months of data and treating it as precise.",
      "Forgetting that seasonal or one-time spends aren't modeled by a straight-line trend.",
    ],
    faqs: [
      { q: "Why do I see 'not enough history'?", a: "Forecasting needs at least a couple of complete months of expenses. Keep capturing receipts and it will populate." },
      { q: "Is the forecast AI-generated?", a: "No — it's a deterministic linear trend (numpy polyfit) over your completed months, so it's stable and explainable." },
    ],
  },

  "/dashboard/cfo": {
    emoji: "🧠",
    title: "AI CFO",
    purpose: "A prioritized narrative brief that synthesizes your budgets, forecast and GST into risks, opportunities and recommended actions.",
    whenToUse: "For a weekly or monthly step-back — 'what should I actually pay attention to?'.",
    workflow: [
      "Open the page and the CFO agent reviews your books and writes a brief.",
      "Read the headline, then the Risks and Opportunities columns.",
      "Work through 'Recommended actions' — they're ordered by priority.",
      "Click 'Refresh brief' after making changes to regenerate it.",
    ],
    bestPractices: [
      "Use it as a prompt for decisions, then verify specific figures on the source pages.",
      "Refresh after uploading a batch of receipts or changing budgets, so it reflects the latest state.",
    ],
    tips: [
      "Every figure the CFO cites is precomputed deterministically — the AI prioritizes and explains, it doesn't invent numbers.",
      "The brief is regenerated on demand, not cached forever, so it stays current.",
    ],
    commonMistakes: [
      "Acting on the narrative without checking the underlying line items for context.",
      "Expecting it to know about money you haven't captured as expenses yet.",
    ],
    faqs: [
      { q: "Where do the numbers come from?", a: "From your budgets, forecast and GST summary — all computed deterministically. The LLM only reasons over and prioritizes them." },
      { q: "How often should I refresh it?", a: "Whenever your data changes materially — a batch of uploads, a new budget, or the start of a new month." },
    ],
  },

  "/dashboard/automations": {
    emoji: "⚡",
    title: "Automations",
    purpose: "Connect Gmail so receipt attachments are ingested automatically, without manual uploads.",
    whenToUse: "Once, during setup — then it quietly keeps your books current in the background.",
    workflow: [
      "Click Connect and authorize Gmail (read-only access to your messages).",
      "LedgerMind scans for receipt/invoice attachments and runs them through the same pipeline as manual uploads.",
      "Use 'Sync now' to pull immediately, or let the scheduled sync run periodically.",
      "Disconnect anytime — your already-imported data stays.",
    ],
    bestPractices: [
      "Connect the mailbox where vendor receipts actually land.",
      "Run 'Sync now' after connecting to confirm the flow before relying on the schedule.",
    ],
    tips: [
      "Access is read-only — LedgerMind never sends email or modifies your inbox.",
      "There's a per-run cap so a first connect doesn't flood the pipeline; the rest is picked up by later syncs.",
      "A dedup ledger means the same email is never imported twice, even across reconnects.",
    ],
    commonMistakes: [
      "Connecting a mailbox that doesn't receive receipts and expecting data.",
      "Disconnecting to 'reset' and worrying about data loss — imported expenses are kept.",
    ],
    faqs: [
      { q: "What can LedgerMind see in my Gmail?", a: "Only what read-only access allows — it reads messages to find receipt/invoice attachments. It cannot send or delete email." },
      { q: "Will reconnecting re-import everything?", a: "No. A dedup ledger tracks processed messages, so reconnecting won't re-ingest items you already have." },
    ],
  },

  "/dashboard/audit": {
    emoji: "🗂️",
    title: "Audit Log",
    purpose: "A read-only trail of every agent run — OCR, Accounting, Fraud, Budget Monitor — with its outcome.",
    whenToUse: "When you need to see exactly what an agent did to a receipt, or debug an unexpected result.",
    workflow: [
      "Filter by agent or status, or search by agent/receipt.",
      "Each row shows the time, agent, status and a one-line summary of what happened.",
      "Use the success-rate and failed-run tiles to spot systemic issues.",
    ],
    bestPractices: [
      "Check failed runs periodically — a cluster often points at a bad input or a config issue.",
      "Use it to build trust: every automated decision is logged and inspectable.",
    ],
    tips: [
      "Nothing is written here — this page only surfaces what the agents already recorded.",
      "The receipt column links a run back to the document it processed.",
    ],
    commonMistakes: [
      "Expecting to edit anything here — it's an immutable audit trail by design.",
    ],
    faqs: [
      { q: "Can I change or delete audit entries?", a: "No — the log is read-only. It's meant to be a trustworthy record of what the agents did." },
      { q: "Why did an OCR run fail?", a: "Usually a poor-quality image or an unreadable file. Re-upload a clearer copy from the Receipts page." },
    ],
  },

  "/dashboard/team": {
    emoji: "👥",
    title: "Team",
    purpose: "Manage who can access this business and what they can do.",
    whenToUse: "When adding a colleague, accountant, or changing someone's role.",
    workflow: [
      "As an owner, click 'Invite member' to generate a shareable invite link (valid 7 days).",
      "Share the link; the recipient joins after signing in.",
      "Promote a member to owner, or remove them, from their row.",
    ],
    bestPractices: [
      "Grant 'owner' sparingly — owners can manage the team and approve high-risk expenses.",
      "Remove access promptly when someone leaves.",
      "Invite your accountant as a member for read/day-to-day access without owner powers.",
    ],
    tips: [
      "Two roles: Owner (full control, approvals, team management) and Member (day-to-day access).",
      "The backend enforces roles independently — hidden buttons aren't the only guardrail.",
    ],
    commonMistakes: [
      "Sharing an expired invite link (they last 7 days — generate a fresh one).",
      "Making everyone an owner, which dilutes approval controls.",
    ],
    faqs: [
      { q: "What's the difference between Owner and Member?", a: "Owners manage the team, roles and approvals. Members have day-to-day access but can't manage the team or sign off high-risk expenses." },
      { q: "How do invites work without email?", a: "You generate a link and share it however you like. The recipient redeems it once logged in; it expires after 7 days." },
    ],
  },

  "/dashboard/approvals": {
    emoji: "🛡️",
    title: "Approvals",
    purpose: "Review and sign off expenses the Fraud agent scored as high risk before they're finalized.",
    whenToUse: "Whenever the queue has items — high-risk expenses wait here for an owner's decision.",
    workflow: [
      "Read the flagged expense and the fraud reasons listed beneath it.",
      "As an owner, Approve it, or Reject with an optional reason.",
      "Approved items proceed; rejected items are recorded with your reason.",
    ],
    bestPractices: [
      "Read the fraud reasons before deciding — they explain why it was flagged.",
      "Add a reason when rejecting, so the record is clear for later.",
      "Keep the queue short; a backlog delays clean books.",
    ],
    tips: [
      "Only high-risk items land here — it's an opt-in gate, not a queue for everything.",
      "Members can see the queue but only owners can decide.",
    ],
    commonMistakes: [
      "Approving without reading the flags, defeating the purpose of the gate.",
      "Rejecting without a reason, leaving no audit context.",
    ],
    faqs: [
      { q: "Why did an expense end up here?", a: "The Fraud agent scored it 'high' risk (e.g. an unusual amount or a duplicate pattern). It needs an owner's sign-off before finalizing." },
      { q: "Can members approve?", a: "No — only owners can approve or reject. Members can view the queue." },
    ],
  },

  "/dashboard/api-keys": {
    emoji: "🔑",
    title: "API Keys & Export",
    purpose: "Programmatic access for connecting an external ERP or accounting tool, plus one-click CSV export.",
    whenToUse: "When integrating LedgerMind with another system, or pulling your data out for a spreadsheet.",
    workflow: [
      "Click 'Download CSV' for an instant export of your expenses.",
      "As an owner, click 'New key', name it (e.g. 'Zoho Books sync'), and copy the key immediately.",
      "Revoke a key with the ban icon when it's no longer needed.",
    ],
    bestPractices: [
      "Copy a new key at creation — it's shown only once and can't be retrieved later.",
      "Name keys by their purpose so you can revoke the right one confidently.",
      "Revoke unused keys; every live key is a potential access path.",
    ],
    tips: [
      "Only a hash of each key is stored — LedgerMind can't show you the plaintext again.",
      "The CSV export contains the same data an integration would read.",
    ],
    commonMistakes: [
      "Navigating away before copying a freshly created key.",
      "Leaving keys for decommissioned integrations active.",
    ],
    faqs: [
      { q: "I lost a key — can I see it again?", a: "No. Only a secure hash is stored. Revoke it and create a new one." },
      { q: "Who can create keys?", a: "Only owners. Anyone with access can download the CSV export." },
    ],
  },

  "/dashboard/settings": {
    emoji: "⚙️",
    title: "Settings",
    purpose: "Your account and business details, onboarding controls, and a reference for the system's configuration.",
    whenToUse: "To replay the product tour, reset first-visit hints, or understand how the platform is configured.",
    workflow: [
      "Review your account and business info at the top.",
      "Use 'Replay product tour' to see the guided walkthrough again.",
      "Use 'Reset page hints' to make the first-visit coach-marks reappear.",
      "Read the configuration reference to understand each system setting and its recommended value.",
    ],
    bestPractices: [
      "Replay the tour after onboarding a new team member.",
      "Consult the configuration reference before asking an admin to change a backend setting.",
    ],
    tips: [
      "Onboarding progress is stored on this device — clearing it re-enables the tour and hints here.",
      "System settings (models, sync caps, thresholds) are configured server-side; this page explains them.",
    ],
    commonMistakes: [
      "Expecting to change model/pipeline settings here — those live in server configuration; this is the reference.",
    ],
    shortcuts: GLOBAL_SHORTCUTS,
    faqs: [
      { q: "How do I see the tour again?", a: "Click 'Replay product tour' on this page — it restarts the guided walkthrough immediately." },
      { q: "Why did my first-visit hints stop appearing?", a: "They show once per page. Click 'Reset page hints' here to bring them all back." },
    ],
  },
};

// ── First-run product tour (spotlights stable navigation chrome) ────────────
export const TOUR_STEPS: TourStep[] = [
  {
    placement: "center",
    title: "Welcome to LedgerMind 👋",
    body: "Let's take a 30-second tour of your AI finance workspace. You can skip anytime and replay it later from Settings or the help button.",
  },
  {
    target: '[data-tour="sidebar"]',
    placement: "right",
    title: "Your navigation",
    body: "Everything lives here — receipts, expenses, GST, budgets, forecasts and more. The section you're on is highlighted.",
  },
  {
    target: '[data-tour="nav-receipts"]',
    placement: "right",
    title: "Start with receipts",
    body: "Upload a photo or PDF and the agents extract the vendor, amount, GST and category automatically. This is how data enters LedgerMind.",
  },
  {
    target: '[data-tour="nav-ai-chat"]',
    placement: "right",
    title: "Ask the AI anything",
    body: "Ask about spending, vendors or GST in plain English. Answers are computed from your real data — never guessed.",
  },
  {
    target: '[data-tour="nav-dashboard"]',
    placement: "right",
    title: "Your daily overview",
    body: "The dashboard gives you a live read on the month — spend, GST recoverable, and anything that needs review.",
  },
  {
    target: '[data-tour="help-button"]',
    placement: "left",
    title: "Help is always one click away",
    body: "Open contextual help for any page from here (or press ?). You can replay this tour anytime from Settings.",
  },
  {
    placement: "center",
    title: "You're all set 🎉",
    body: "Upload your first receipt to bring your dashboard to life. Need a hand on any page? Just tap the help button.",
  },
];

// ── One-time coach-marks, shown the first time each page is opened ───────────
export const PROGRESSIVE_HINTS: Record<string, ProgressiveHint> = {
  "/dashboard/receipts": {
    title: "First time uploading?",
    body: "Drop a clear, flat photo or a PDF (max 10 MB). The OCR, Accounting and GST agents handle the rest — watch the status update in real time.",
  },
  "/dashboard/expenses": {
    title: "Tip: corrections teach the app",
    body: "Click any category to fix it. LedgerMind remembers your choice per vendor, so future receipts categorize correctly on their own.",
  },
  "/dashboard/gst": {
    title: "Understanding GST here",
    body: "'Recoverable' is the ITC you can actually claim — it already excludes blocked categories and expenses missing a supplier GSTIN.",
  },
  "/dashboard/chat": {
    title: "Ask in plain English",
    body: "Try 'Who are my top 5 vendors?' or 'How much GST can I recover this month?'. Answers come straight from your data.",
  },
  "/dashboard/budgets": {
    title: "How budgets alert you",
    body: "Set a monthly limit and LedgerMind projects your month-end spend from your run-rate — flagging 'At risk' before you overspend.",
  },
  "/dashboard/forecasts": {
    title: "How forecasting works",
    body: "This is a deterministic linear trend over your complete months — the current partial month is excluded so it isn't skewed.",
  },
  "/dashboard/cfo": {
    title: "Your AI CFO brief",
    body: "The agent turns your budgets, forecast and GST into prioritized risks, opportunities and actions. Refresh it after big changes.",
  },
  "/dashboard/automations": {
    title: "Hands-free receipts",
    body: "Connect Gmail (read-only) and receipt attachments are imported automatically. Nothing is ever sent from your inbox.",
  },
  "/dashboard/audit": {
    title: "Every agent action, logged",
    body: "This read-only trail shows exactly what each agent did to each receipt — filter by agent or status to investigate.",
  },
  "/dashboard/team": {
    title: "Inviting people",
    body: "Generate a share link (valid 7 days). Owners manage the team and approvals; members get day-to-day access.",
  },
  "/dashboard/approvals": {
    title: "Why items land here",
    body: "Only high-risk expenses the Fraud agent flags need sign-off. Read the reasons, then approve or reject as an owner.",
  },
  "/dashboard/api-keys": {
    title: "Copy new keys immediately",
    body: "A new key is shown only once. Name it for its purpose so you can revoke the right one later. CSV export is available to everyone.",
  },
};

const HELP_ROUTES = Object.keys(HELP_CONTENT).sort((a, b) => b.length - a.length);

/** Resolve help content for a pathname by longest matching prefix. */
export function getHelp(pathname: string): HelpContent | null {
  if (HELP_CONTENT[pathname]) return HELP_CONTENT[pathname];
  const match = HELP_ROUTES.find((r) => pathname === r || pathname.startsWith(r + "/"));
  return match ? HELP_CONTENT[match] : null;
}

/** Resolve the one-time hint for a pathname (exact match only). */
export function getHint(pathname: string): ProgressiveHint | null {
  return PROGRESSIVE_HINTS[pathname] ?? null;
}
