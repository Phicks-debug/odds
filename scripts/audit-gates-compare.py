"""Compares the hand-read gate facts (audit out/*.json) with what the database holds. Usage: python3 scripts/audit-gates-compare.py <audit dir>"""
import glob, json, sys, collections
root = sys.argv[1]
app = {p['id']: p for p in json.load(open(f'{root}/all.json'))}
hand = {}
for f in sorted(glob.glob(f'{root}/out/*.json')):
    for r in json.load(open(f)):
        hand[r['id']] = r
print('hand-read', len(hand), 'of', len(app))
rank = {'none': 0, 'bachelor': 1, 'master': 2, 'phd': 3}
bad = collections.defaultdict(list)
tot = collections.Counter()
for i, h in hand.items():
    a = app.get(i)
    if not a: continue
    # gate values the app uses
    d = a.get('degree_asked') or 'none'
    tot['degree'] += 1
    if d != h['degree']: bad['degree_' + ('too_strict' if rank[d] > rank[h['degree']] else 'too_lax')].append(i)
    ay = a.get('years_min'); hy = h.get('years')
    tot['years'] += 1
    if ay != hy and not (ay is None and hy is None):
        bad['years_' + ('too_strict' if (ay or 0) > (hy or 0) else 'too_lax')].append(i)
    ad = bool(a.get('dutch_required')) or (a.get('dutch_jev') or 0) >= 0.8
    hd = h['dutch'] == 'required'
    tot['dutch'] += 1
    if ad != hd: bad['dutch_' + ('too_strict' if ad else 'too_lax')].append(i)
    ae = a.get('enrollment') or 'open'
    tot['enrollment'] += 1
    if ae != h['enrollment']:
        order = {'open': 0, 'recent': 1, 'required': 2}
        bad['enrollment_' + ('too_strict' if order[ae] > order[h['enrollment']] else 'too_lax')].append(i)
for k in ('degree', 'years', 'dutch', 'enrollment'):
    s = len(bad[k + '_too_strict']); l = len(bad[k + '_too_lax'])
    print(f'{k:11} checked {tot[k]}  wrong-and-too-strict {s} ({100*s/max(1,tot[k]):.1f}%)  too-lax {l} ({100*l/max(1,tot[k]):.1f}%)')
json.dump(bad, open(f'{root}/disagreements.json', 'w'))
