"""
Shelf-reading analysis engine.

Given a ScanSession with its ScanItems already resolved against ils_records,
produces a list of ScanDiscrepancy objects describing every issue found.

Discrepancy types
-----------------
no_record        Barcode not found in ILS — cannot analyse
deleted_on_shelf lifecycle = 'Deleted' but item was physically present
status_issue     status is not 'Item in place'
fulfillment_note item carries a fulfilment note
out_of_order     call number breaks the non-decreasing shelf sequence
wrong_location   item's location_code differs from the session shelf's code
"""

import bisect
from datetime import datetime, timezone
from typing import Optional

from core.callnumber import normalize_lc, normalize_storage
from db import models


# ── Helpers ───────────────────────────────────────────────────────────────────

def _lis_indices(norms: list[str]) -> set[int]:
    """
    Return the set of indices that form the Longest Non-Decreasing Subsequence
    of *norms* (O(n log n) patience-sort algorithm).

    Items NOT in this set are candidates for an 'out_of_order' discrepancy.
    """
    if not norms:
        return set()

    n = len(norms)
    tails_vals: list[str] = []   # optimal tail value at each length
    tails_idx:  list[int] = []   # original index for that optimal tail
    prev:       list[int] = [-1] * n  # predecessor chain for reconstruction

    for i, val in enumerate(norms):
        # Binary search: find leftmost pos where tails_vals[pos] > val
        # (allows equal → non-decreasing)
        lo, hi = 0, len(tails_vals)
        while lo < hi:
            mid = (lo + hi) // 2
            if tails_vals[mid] <= val:
                lo = mid + 1
            else:
                hi = mid
        pos = lo

        if pos > 0:
            prev[i] = tails_idx[pos - 1]

        if pos < len(tails_vals):
            tails_vals[pos] = val
            tails_idx[pos]  = i
        else:
            tails_vals.append(val)
            tails_idx.append(i)

    # Reconstruct
    result: list[int] = []
    cur = tails_idx[-1]
    while cur != -1:
        result.append(cur)
        cur = prev[cur]

    return set(result)


# ── Public API ────────────────────────────────────────────────────────────────

def analyze_session(
    session: models.ScanSession,
    location_code: Optional[str] = None,
    call_number_type: str = "lc",
) -> list[models.ScanDiscrepancy]:
    """
    Analyse *session.items* and return a list of ScanDiscrepancy objects.
    Objects are not yet flushed to the database.

    Parameters
    ----------
    session          : ScanSession with .items loaded (ordered by position)
    location_code    : expected location code for the shelf being read
                       (used for wrong_location checks; pass None to skip)
    call_number_type : "lc" (default) uses LC normalisation;
                       "storage" uses storage call-number normalisation on
                       item_call_number values.
    """
    discrepancies: list[models.ScanDiscrepancy] = []

    def disc(item: models.ScanItem, dtype: str, severity: str, detail: str,
             expected_position: Optional[int] = None) -> models.ScanDiscrepancy:
        return models.ScanDiscrepancy(
            session_id=session.id,
            scan_item_id=item.id,
            type=dtype,
            severity=severity,
            detail=detail,
            expected_position=expected_position,
        )

    matched_items: list[models.ScanItem] = []

    # ── Pass 1: per-item checks ───────────────────────────────────────────────
    for item in session.items:
        if item.ils_record_id is None:
            discrepancies.append(disc(
                item, "no_record", "error",
                f"Barcode {item.barcode!r} was not found in the ILS record set.",
            ))
            continue  # can't do further checks without a record

        rec = item.ils_record

        # deleted_on_shelf
        if rec.lifecycle and rec.lifecycle.strip().lower() == "deleted":
            discrepancies.append(disc(
                item, "deleted_on_shelf", "error",
                f"Lifecycle is 'Deleted' — this item may have been withdrawn "
                f"but is still physically on the shelf.",
            ))

        # status_issue
        if rec.status and rec.status.strip().lower() != "item in place":
            discrepancies.append(disc(
                item, "status_issue", "warning",
                f"Status is '{rec.status}' (expected 'Item in place').",
            ))

        # fulfillment_note
        if rec.fulfillment_note and rec.fulfillment_note.strip():
            discrepancies.append(disc(
                item, "fulfillment_note", "info",
                f"Fulfillment note: {rec.fulfillment_note.strip()}",
            ))

        # wrong_location
        if location_code and rec.location_code:
            if rec.location_code.strip().lower() != location_code.strip().lower():
                discrepancies.append(disc(
                    item, "wrong_location", "warning",
                    f"Item belongs to location '{rec.location_code}' "
                    f"but was scanned on shelf '{location_code}'.",
                ))

        matched_items.append(item)

    # ── Pass 2: out-of-order detection via LIS ────────────────────────────────
    # Re-normalise on the fly so fixes to the normalization algorithm take
    # effect immediately without requiring a full ILS re-upload.
    normalizer = normalize_storage if call_number_type == "storage" else normalize_lc
    normable: list[models.ScanItem] = []
    fresh_norms: list[str] = []
    for it in matched_items:
        norm = normalizer(it.call_number) if it.call_number else it.call_number_norm
        if norm:
            normable.append(it)
            fresh_norms.append(norm)

    if len(normable) >= 2:
        norms = fresh_norms
        in_order_set = _lis_indices(norms)

        # Build sorted-order reference for expected-position hints
        sorted_pairs = sorted(zip(normable, fresh_norms), key=lambda x: x[1])
        norm_to_expected: dict[int, int] = {
            it.id: (i + 1) for i, (it, _) in enumerate(sorted_pairs)
        }

        for i, item in enumerate(normable):
            if i not in in_order_set:
                exp = norm_to_expected[item.id]
                discrepancies.append(disc(
                    item, "out_of_order", "warning",
                    f"Call number {item.call_number!r} is out of shelf order. "
                    f"Scanned at position {item.position}; "
                    f"expected around sorted position {exp}.",
                    expected_position=exp,
                ))

    return discrepancies
