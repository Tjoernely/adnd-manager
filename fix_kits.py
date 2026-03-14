import re

def is_garbled(s):
    """Check if a string looks like OCR garbled text (single chars separated by spaces)"""
    words = [w for w in s.split(' ') if w]
    if len(words) < 3:
        return False
    return sum(1 for w in words if len(w) == 1) / len(words) >= 0.6

def degarble(s):
    """DeGarble OCR text: 'A d v i s e r' -> 'Adviser'"""
    if not s or not is_garbled(s):
        return s
    parts = re.split(r'\s{3,}', s)
    parts = [p.replace(' ', '').strip() for p in parts]
    return ' '.join(p for p in parts if p)

def process_js_strings(text):
    """Process all JS string literals in text, applying degarble to each."""
    result = []
    i = 0
    while i < len(text):
        if text[i] == '"':
            j = i + 1
            while j < len(text):
                if text[j] == '\\':
                    j += 2
                elif text[j] == '"':
                    break
                else:
                    j += 1
            if j >= len(text):
                result.append(text[i:])
                i = len(text)
            else:
                inner = text[i+1:j]
                result.append('"' + degarble(inner) + '"')
                i = j + 1
        else:
            result.append(text[i])
            i += 1
    return ''.join(result)

with open(r'C:\DnD_manager_app\Version_1\src\data\kits.js', 'r', encoding='utf-8') as f:
    raw = f.read()

print('Original size:', len(raw))

# 1. DeGarble druid section
dru_start = raw.index('druid: [')
thi_start = raw.index('thief: [')
raw = raw[:dru_start] + process_js_strings(raw[dru_start:thi_start]) + raw[thi_start:]
print('After druid degarble:', len(raw))

# 2. DeGarble thief section
thi_start2 = raw.index('thief: [')
bar_start = raw.index('bard: [')
raw = raw[:thi_start2] + process_js_strings(raw[thi_start2:bar_start]) + raw[bar_start:]
print('After thief degarble:', len(raw))

# 3. Fix scholar-priest - find by id, then fix its benefits/hindrances
schl_id_marker = 'id: "cle_scholar-priest"'
schl_idx = raw.find(schl_id_marker)
if schl_idx != -1:
    # Find garbled benefits for scholar-priest
    ben_marker = 'benefits:" T h e   S c h o l a r'
    ben_idx = raw.find(ben_marker, schl_idx)
    if ben_idx != -1:
        kit_close = raw.find('    },    {', ben_idx)
        new_text = 'benefits: "The Scholar Priest may spend Weapon Proficiency slots on Nonweapon Proficiencies instead, allowing deep academic expertise.",    hindrances: "Scholars are often egotistical; debates can become heated and personal. Scholar Priests suffer a -1 penalty on initiative rolls in combat."'
        raw = raw[:ben_idx] + new_text + raw[kit_close:]
        print('Fixed scholar priest benefits/hindrances')

# Also fix scholar-priest wpRecommended garbled field
old_wprec = 'wpRecommended: ["\\\"   b e l o w "]'
if old_wprec in raw:
    raw = raw.replace(old_wprec, 'wpRecommended: ["None"]')
    print('Fixed scholar priest wpRecommended')
else:
    # Try alternative
    idx = raw.find('b e l o w', schl_idx if schl_idx != -1 else 0)
    if idx != -1:
        wprec_start = raw.rfind('wpRecommended:', 0, idx)
        wprec_end = raw.find('],', wprec_start)
        if wprec_start != -1 and wprec_end != -1:
            raw = raw[:wprec_start] + 'wpRecommended: ["None"]' + raw[wprec_end+2:]
            print('Fixed scholar priest wpRecommended (alt method)')

# 4. Clean '--' prefix from array items like "--tracking" -> "tracking"
def clean_dash(m):
    return '"' + m.group(1)
raw = re.sub(r'"--+\s*([a-zA-Z(])', clean_dash, raw)
print('Cleaned -- prefixes')

# 5. Fix druid wealth fields - truncate at gp.
# After deGarble, wealth looks like: wealth:"3d6x10 gp. AvengerTheAvenger..."
# Truncate at the period after "gp"
def truncate_wealth(m):
    return m.group(1) + '"'
raw = re.sub(r'(wealth:"[^"]*?gp\.)\s[^"]*', truncate_wealth, raw)
print('Fixed druid wealth fields')

# 6. spk_scout: restore direction sense + weather sense to nwpRecommended
# Find the scout kit and check what it looks like
scout_idx = raw.find('"spk_scout"')
if scout_idx == -1:
    scout_idx = raw.find('id: "spk_scout"')
print('spk_scout at:', scout_idx)
if scout_idx != -1:
    print('Scout context:', raw[scout_idx:scout_idx+300])

# Now do replacements
fixes = [
    # (old_string, new_string, description)
    (
        'nwpRecommended: ["fire-building","hunting"',
        'nwpRecommended: ["direction sense","weather sense","fire-building","hunting"',
        'spk_scout NWPs'
    ),
    (
        'nwpRecommended: ["history","fire-building","animal handling"',
        'nwpRecommended: ["direction sense","history","fire-building","animal handling"',
        'spk_soldier direction sense'
    ),
    (
        'nwpRecommended: ["swimming","rope use","fishing"]',
        'nwpRecommended: ["weather sense","swimming","rope use","fishing"]',
        'spk_mariner weather sense'
    ),
    (
        'id: "mag_militant-wizard", name: "Militant Wizard",',
        'id: "mag_militant-wizard", name: "Militant Wizard",      kitBonusCP: 3,',
        'militant wizard kitBonusCP'
    ),
    (
        'benefits: ") .",      hindrances: "By moving ahead of the party',
        'benefits: "Pathfinders gain +2 bonus to all NWP checks involving tracking, navigation, or direction sense in wilderness settings. They may never become lost outdoors and automatically determine direction without a roll. They also travel 20% faster through wilderness terrain.",      hindrances: "By moving ahead of the party',
        'ran_pathfinder benefits'
    ),
    (
        'benefits: ") .",      hindrances: "Neither lawbreakers nor outlaws',
        'benefits: "Stalkers blend into cities with unnatural ease, gaining +2 to NWP checks for disguise, fast-talking, and information gathering in urban settings. Their alertness reduces enemy surprise chances by 1 in 6.",      hindrances: "Neither lawbreakers nor outlaws',
        'ran_stalker benefits'
    ),
    # Bard kits
    (
        'nwpRecommended: ["es : Singing", "Musical Instrument", "Reading/Writing", "bards not only increase their ability"]',
        'nwpRequired: ["Singing", "Musical Instrument", "Reading/Writing"],      nwpRecommended: ["Ancient History", "Etiquette", "Languages", "Poetry", "Local History", "Heraldry", "Juggling", "Modern Languages"]',
        'bar_true-bard'
    ),
    (
        'nwpRecommended: ["es : Reading/Writing", "Local History", "Blind-fighting", "Juggling. Suggested : Blacksmithing", "Bowyer/Fletcher", "Disguise"]',
        'nwpRequired: ["Reading/Writing"],      nwpRecommended: ["Local History", "Blind-fighting", "Juggling", "Blacksmithing", "Bowyer/Fletcher", "Disguise"]',
        'bar_blade'
    ),
    (
        'nwpRecommended: ["es : Acting", "Disguise", "Forgery", "Gaming. Suggested : Appraising", "Astrology", "Healing"]',
        'nwpRequired: ["Acting"],      nwpRecommended: ["Disguise", "Forgery", "Gaming", "Appraising", "Astrology", "Healing"]',
        'bar_charlatan'
    ),
    (
        'nwpRecommended: ["es : Dancing", "Direction Sense", "Languages", "Musical Instrument (tambourine", "violin", "mandolin) . Suggested : Ancient History"]',
        'nwpRequired: ["Dancing"],      nwpRecommended: ["Direction Sense", "Languages", "Musical Instrument", "Ancient History", "Modern Languages", "Animal Handling", "Riding"]',
        'bar_gypsy-bard'
    ),
    (
        'nwpRecommended: ["es : Dancing", "Etiquette", "Languages", "Poetry. Suggested : Animal Training", "Armorer", "Artistic Ability"]',
        'nwpRequired: ["Dancing"],      nwpRecommended: ["Etiquette", "Languages", "Poetry", "Animal Training", "Armorer", "Artistic Ability"]',
        'bar_gallant'
    ),
    (
        'nwpRecommended: ["es : Etiquette", "Heraldry", "Local History", "Reading/Writing. Suggested : Languages"]',
        'nwpRequired: ["Etiquette", "Heraldry", "Local History", "Reading/Writing"],      nwpRecommended: ["Languages", "Ancient History", "Blind-fighting", "Disguise"]',
        'bar_herald'
    ),
]

for old, new, desc in fixes:
    if old in raw:
        raw = raw.replace(old, new)
        print(f'Fixed {desc}')
    else:
        print(f'WARN not found: {desc} | looking for: {old[:60]}')

print('\nFinal size:', len(raw))

# Verify key changes
checks = [
    ('dru_adviser present', 'dru_adviser' in raw),
    ('dru_adviser name degarbled', 'name:"Adviser"' in raw),
    ('thi_adventurer name degarbled', 'name:"Adventurer"' in raw),
    ('spk_scout direction sense', '"direction sense","weather sense","fire-building"' in raw or '"direction sense","weather sense"' in raw),
    ('militant wizard kitBonusCP', 'kitBonusCP: 3,' in raw),
    ('bar_true-bard nwpRequired', 'nwpRequired: ["Singing"' in raw),
    ('bar_gypsy-bard dancing', 'nwpRequired: ["Dancing"],      nwpRecommended: ["Direction Sense"' in raw),
    ('no garbled Adviser', 'A d v i s e r' not in raw),
    ('no garbled Scholar', 'T h e   S c h o l a r' not in raw),
]
for label, ok in checks:
    print('OK' if ok else 'FAIL', label)

with open(r'C:\DnD_manager_app\Version_1\src\data\kits.js', 'w', encoding='utf-8') as f:
    f.write(raw)
print('\nFile saved.')
