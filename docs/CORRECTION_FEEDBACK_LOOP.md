# Correction-Feedback Loop — Implementation Plan

**Status:** Planned (not yet built)
**Phase:** 2 follow-up (AI Bookkeeper) — the "categorization learns from corrections" gap noted in `AUDIT_REPORT.md`
**Author's note:** This is the deliberately-chosen alternative to fine-tuning (see the model-strategy discussion). It adapts categorization **per business, live, with no training pipeline** — a "poor man's fine-tuning" that is strictly better here because it is per-tenant and instantly reversible.

---

## 1. The problem it solves

Today `accounting_agent._classify_expense()` classifies every expense with a **static** prompt: the 11 categories plus the receipt fields, no examples, no memory. If a business consistently books "AWS India" as **Software & Subscriptions** but the model keeps guessing **Utilities**, the user corrects it every single time and the system never learns.

There isn't even a capture path yet: `expenses.py` has no update endpoint, and the receipt-approval flow (`receipts.py`) accepts a `corrected_category` field but never applies or records it. So corrections are currently **lost**.

**Goal:** every time a human fixes a category, that decision becomes a durable signal that improves future classification for *that business only*.

---

## 2. Design — two tiers

The key insight: most corrections are **vendor-specific and unambiguous** ("this business always books Vendor X as Category Y"). Those don't need an LLM at all. Only genuinely novel/ambiguous expenses should reach the model — and when they do, the model should see how this business categorizes.

### Tier 1 — deterministic vendor→category memory (no LLM)
Before calling the LLM, check whether this business has a **confident prior** for the expense's vendor. If it has corrected this exact vendor to a single category (and no conflicting later correction), apply that category directly:
- Zero LLM latency/cost
- 100% consistent with the user's own past decision
- Explainable ("categorized as *Software* because you set that for *AWS India* before")
- Tagged `learned_from_correction` in `agent_tags`

### Tier 2 — few-shot injection for unmapped vendors (LLM, nudged)
For vendors with no direct mapping, fetch the business's recent corrections and inject them into the classification prompt as examples:
```
This business categorizes like this:
- "Zoho Books" -> Software & Subscriptions
- "Uber" -> Travel & Transport
- "WeWork" -> Rent & Facilities
Now classify: {vendor} / {amount} / {raw_text_excerpt}
```
This steers the model toward the business's conventions without a direct rule.

### Cold start
No corrections yet → Tier 1 finds nothing, Tier 2 injects nothing, behavior is **identical to today**. Fully graceful; ship-safe from day one.

---

## 3. Schema

New migration `supabase/migrations/0007_expense_corrections.sql` (and the matching block in `schema.sql`):

```sql
create table public.expense_corrections (
  id                 uuid primary key default uuid_generate_v4(),
  business_id        uuid not null references public.businesses(id) on delete cascade,
  expense_id         uuid references public.expenses(id) on delete set null,
  vendor_name        text,
  raw_text_excerpt   text,               -- optional context for few-shot
  original_category  text,
  corrected_category text not null,
  corrected_by       uuid references public.profiles(id),
  created_at         timestamptz not null default now()
);

create index on public.expense_corrections(business_id, vendor_name);
create index on public.expense_corrections(business_id, created_at desc);

alter table public.expense_corrections enable row level security;

-- Same tenancy model as the rest of the app: members can read; the backend
-- (service-role key) writes. is_business_member() already exists (Phase 10).
create policy "Corrections visible to members" on public.expense_corrections
  for select using (is_business_member(business_id));
```

Apply live against the dev project via psycopg (same one-transaction pattern used for migrations 0004–0006), then verify.

---

## 4. Backend changes

### 4.1 Capture corrections — `PATCH /api/v1/expenses/{id}`
New endpoint in `expenses.py`:
- Auth: `ensure_owns_business` on the expense's business (any member can correct).
- Body: `{ category?: str, vendor_name?: str, ... }`.
- When `category` changes from its stored value, **write an `expense_corrections` row** (`original_category`, `corrected_category`, `vendor_name`, `raw_text_excerpt` from the linked receipt, `corrected_by`).
- Update the expense's `category` and append `user_corrected` to `agent_tags`.

Also wire the **existing** receipt-approval path: when `ApprovalPayload.corrected_category` is set in `receipts.py`, apply it and record a correction (closing the current dead-end where it's ignored).

### 4.2 Resolution helper — `app/agents/vendor_memory.py`
```python
def learned_category(business_id: str, vendor_name: str) -> str | None:
    """Tier 1: a confident prior category for this vendor, or None.
    Returns the most recent corrected_category if the last N corrections
    for this vendor agree; None if there is conflict or no history."""

def recent_correction_examples(business_id: str, limit: int = 8) -> list[tuple[str, str]]:
    """Tier 2: recent (vendor -> corrected_category) pairs for few-shot."""
```
Both are pure Supabase reads, RLS-safe by business_id (backend uses service-role, so scoping is explicit — same discipline as `auth.py`).

### 4.3 Wire into `accounting_agent._classify_expense()`
```
vendor = ocr_result.get("vendor_name")
# Tier 1: deterministic memory
learned = learned_category(business_id, vendor)
if learned:
    return {"category": learned, "description": ..., "is_business_expense": True,
            "_source": "learned_from_correction"}
# Tier 2: few-shot-nudged LLM
examples = recent_correction_examples(business_id)
# ... inject `examples` into the prompt, then call the LLM as today
```
Note: `_classify_expense` currently takes only `ocr_result`; it will need `business_id` threaded through (`run_accounting_agent` already has it).

---

## 5. Frontend changes

- **Expenses page**: make the category cell editable — click → dropdown of the 11 categories → `PATCH /expenses/{id}`. Optimistic update; on save show a subtle "learned" hint.
- **Receipt review**: the correction UI already collects `corrected_category`; ensure it's sent and reflected.
- Optional: a small "✨ learned from your past edits" badge on expenses categorized via Tier 1, so the learning is visible.

---

## 6. Testing (DB-backed, matches the existing suite style)

`backend/tests/test_correction_feedback.py`:
- **Capture:** PATCH changing category writes exactly one `expense_corrections` row with correct before/after; PATCH with no category change writes none; non-member is 403.
- **Tier 1:** after a correction for Vendor X, a *new* expense from Vendor X is categorized via `learned_category()` **without** an LLM call (assert the deterministic path + `learned_from_correction` tag).
- **Tier 1 conflict:** two different corrections for the same vendor → `learned_category()` returns `None` (falls back to LLM).
- **Tier 2:** `recent_correction_examples()` returns the business's pairs and they appear in the built prompt; **tenancy** — Business A's corrections never leak into Business B's examples.
- **Cold start:** zero corrections → classification behaves exactly as before.

Target: keep the suite green (currently 108 backend + 9 frontend).

---

## 7. Phased rollout

| Phase | Deliverable | Risk |
| --- | --- | --- |
| **A** | Migration + `PATCH /expenses/{id}` + record corrections + editable category UI | Low — additive, no behavior change to classification yet |
| **B** | Tier 1 deterministic vendor→category memory in accounting agent | Low — only fires on confident, unambiguous priors |
| **C** | Tier 2 few-shot injection for unmapped vendors | Low — bounded prompt growth |
| **D** | (Optional) "learned" UI badges + a correction-rate metric on the Audit/Dashboard | Cosmetic |

Each phase is independently shippable and independently verifiable — the same discipline used for Phases 9 and 10.

---

## 8. Risks & mitigations

- **Conflicting corrections** (same vendor, different categories over time) → Tier 1 requires agreement across the last N; on conflict, defer to Tier 2/LLM. Never guess between them silently.
- **Prompt bloat / latency** → cap few-shot examples (≈8), prefer vendor-specific ones; Tier 1 hits skip the LLM entirely, so the *common* case gets *faster*, not slower.
- **Cross-tenant leakage** → every query is `business_id`-scoped; a dedicated tenancy test guards it. This is non-negotiable for financial data.
- **Bad/accidental correction poisoning memory** → corrections are per-vendor and recency-weighted; a later correction overrides an earlier one, so a mistake self-heals on the next real edit.

---

## 9. Why this over fine-tuning (recap)

| | Fine-tuning | This feedback loop |
| --- | --- | --- |
| Per-business adaptation | No (one model for all tenants) | **Yes, natively** |
| Live (reflects today's edits) | No (frozen at train time) | **Yes, instant** |
| Infra / MLOps | Training pipeline, eval, versioning | **None — it's SQL + prompt** |
| Explainable | No | **Yes ("you set this before")** |
| Reversible | Retrain | **Delete a row** |
| Handles live per-business data | No — still needs tools/RAG | **Complements the existing tools** |

The model stays a swappable commodity; the intelligence about *this* business lives in your data and orchestration — exactly where the product's value is.
