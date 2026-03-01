#!/bin/bash
# 01-positive-tests.sh
# Positive format tests: verify each format works in isolation and combined.
# Uses check.py with explicit format arguments so assertions are enforced.

API_URL="${FC_API_URL:-https://fc-dev.danand.de}"
API_KEY="${FC_API_KEY:-1}"
TEST_DIR="$(dirname "$0")"
HELPERS="$TEST_DIR/check.py"

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

pass() { PASSED_TESTS=$((PASSED_TESTS + 1)); }
fail() { FAILED_TESTS=$((FAILED_TESTS + 1)); echo "❌ FAILED: $1"; }

CLASSIC="https://www.heise.de/newsticker/classic/"
SIMPLE="https://example.com"

echo "=== Positive Tests (P-01 to P-12) ==="

# ── P-01: markdown only (simple page) ────────────────────────────────────────
TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo ""
echo "P-01: markdown only — simple page (example.com)"
curl -s -X POST "$API_URL/v1/scrape" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{\"url\": \"$SIMPLE\", \"formats\": [\"markdown\"]}" \
  | python3 "$HELPERS" markdown \
  && pass "P-01" || fail "P-01"

# ── P-02: rawHtml only ────────────────────────────────────────────────────────
TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo ""
echo "P-02: rawHtml only (heise.de/newsticker/classic/)"
curl -s -X POST "$API_URL/v1/scrape" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{\"url\": \"$CLASSIC\", \"formats\": [\"rawHtml\"]}" \
  | python3 "$HELPERS" rawHtml \
  && pass "P-02" || fail "P-02"

# ── P-03: html only ───────────────────────────────────────────────────────────
TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo ""
echo "P-03: html only (heise.de/newsticker/classic/)"
curl -s -X POST "$API_URL/v1/scrape" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{\"url\": \"$CLASSIC\", \"formats\": [\"html\"]}" \
  | python3 "$HELPERS" html \
  && pass "P-03" || fail "P-03"

# ── P-04: links only ──────────────────────────────────────────────────────────
TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo ""
echo "P-04: links only (heise.de/newsticker/classic/)"
curl -s -X POST "$API_URL/v1/scrape" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{\"url\": \"$CLASSIC\", \"formats\": [\"links\"]}" \
  | python3 "$HELPERS" links \
  && pass "P-04" || fail "P-04"

# ── P-05: markdown + rawHtml ──────────────────────────────────────────────────
TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo ""
echo "P-05: markdown + rawHtml (heise.de/newsticker/classic/)"
curl -s -X POST "$API_URL/v1/scrape" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{\"url\": \"$CLASSIC\", \"formats\": [\"markdown\", \"rawHtml\"]}" \
  | python3 "$HELPERS" markdown rawHtml \
  && pass "P-05" || fail "P-05"

# ── P-06: markdown + html ─────────────────────────────────────────────────────
TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo ""
echo "P-06: markdown + html (heise.de/newsticker/classic/)"
curl -s -X POST "$API_URL/v1/scrape" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{\"url\": \"$CLASSIC\", \"formats\": [\"markdown\", \"html\"]}" \
  | python3 "$HELPERS" markdown html \
  && pass "P-06" || fail "P-06"

# ── P-07: html + rawHtml — verify html is cleaned subset of rawHtml ───────────
TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo ""
echo "P-07: html + rawHtml — html must be smaller and script/style-free (heise.de/newsticker/classic/)"
curl -s -X POST "$API_URL/v1/scrape" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{\"url\": \"$CLASSIC\", \"formats\": [\"html\", \"rawHtml\"]}" \
  | python3 "$HELPERS" html rawHtml \
  && pass "P-07" || fail "P-07"

# ── P-08: markdown + html + rawHtml ──────────────────────────────────────────
TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo ""
echo "P-08: markdown + html + rawHtml (heise.de/newsticker/classic/)"
curl -s -X POST "$API_URL/v1/scrape" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{\"url\": \"$CLASSIC\", \"formats\": [\"markdown\", \"html\", \"rawHtml\"]}" \
  | python3 "$HELPERS" markdown html rawHtml \
  && pass "P-08" || fail "P-08"

# ── P-09: markdown + links ────────────────────────────────────────────────────
TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo ""
echo "P-09: markdown + links (heise.de/newsticker/classic/)"
curl -s -X POST "$API_URL/v1/scrape" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{\"url\": \"$CLASSIC\", \"formats\": [\"markdown\", \"links\"]}" \
  | python3 "$HELPERS" markdown links \
  && pass "P-09" || fail "P-09"

# ── P-10: markdown only — links key must be ABSENT (not even empty []) ────────
TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo ""
echo "P-10: markdown only — links key must be absent in response (example.com)"
RESULT=$(curl -s -X POST "$API_URL/v1/scrape" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{\"url\": \"$SIMPLE\", \"formats\": [\"markdown\"]}")
echo "$RESULT" | python3 "$HELPERS" markdown
if echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if 'links' not in (d.get('data') or {}) else 1)" 2>/dev/null; then
  echo "PASS (links key absent as expected)"
  pass "P-10"
else
  echo "FAIL (links key is present but should be absent)"
  fail "P-10"
fi

# ── P-11: all text formats ────────────────────────────────────────────────────
TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo ""
echo "P-11: markdown + html + rawHtml + links (heise.de/newsticker/classic/)"
curl -s -X POST "$API_URL/v1/scrape" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{\"url\": \"$CLASSIC\", \"formats\": [\"markdown\", \"html\", \"rawHtml\", \"links\"]}" \
  | python3 "$HELPERS" markdown html rawHtml links \
  && pass "P-11" || fail "P-11"

# ── P-12: default (no formats) — only markdown, no html/rawHtml/links ─────────
TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo ""
echo "P-12: default — no formats specified, only markdown should be returned (example.com)"
RESULT=$(curl -s -X POST "$API_URL/v1/scrape" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{\"url\": \"$SIMPLE\"}")
echo "$RESULT" | python3 "$HELPERS" markdown
if echo "$RESULT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
data = d.get('data') or {}
bad = [k for k in ('html','rawHtml','links') if k in data and data[k] is not None]
if bad:
    print(f'FAIL: unexpected keys in default response: {bad}')
    sys.exit(1)
print('PASS (no html/rawHtml/links in default response)')
" 2>/dev/null; then
  pass "P-12"
else
  fail "P-12"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "=== Positive Tests Summary ==="
echo "Total:  $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"
echo "Success rate: $(( (PASSED_TESTS * 100) / TOTAL_TESTS ))%"

if [ "$FAILED_TESTS" -eq 0 ]; then
  echo ""
  echo "✅ ALL POSITIVE TESTS PASSED"
  exit 0
else
  echo ""
  echo "❌ $FAILED_TESTS TEST(S) FAILED"
  exit 1
fi
