#!/usr/bin/env python3
"""Offline sanity-check of this portable Agent Skill package (no third-party modules)."""
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parent.parent
skill = root / 'SKILL.md'
if not skill.is_file():
    raise SystemExit('Missing SKILL.md')
content = skill.read_text('utf-8')
match = re.match(r'^---\n(.*?)\n---\n', content, re.S)
if not match:
    raise SystemExit('SKILL.md requires YAML frontmatter')
frontmatter = match.group(1)
name = re.search(r'^name:\s*([a-z0-9-]+)$', frontmatter, re.M)
if not name or name.group(1) != root.name or len(name.group(1)) > 64 or '--' in name.group(1):
    raise SystemExit('Skill name invalid or does not match folder')
if not re.search(r'^description:\s*.+', frontmatter, re.M):
    raise SystemExit('Description missing')
all_files = list(root.rglob('*.md'))
for file in all_files:
    raw = file.read_text('utf-8')
    # only verify local Markdown links; URLs are maintained in practical-cases
    for path in re.findall(r'\]\((?!https?://)([^)#]+)(?:#[^)]*)?\)', raw):
        if not (file.parent / path).exists():
            raise SystemExit(f'Broken link {file.relative_to(root)}: {path}')
for ref in re.findall(r'`((?:references|assets)/[^`]+\.md)`', content):
    if not (root / ref).exists():
        raise SystemExit(f'Missing SKILL reference: {ref}')
print(f'OK: {root.name}; {len(all_files)} markdown files; required references present')
