"""Stamps the version in VERSION into both packs (manifest versions, the
dependency between them, and the pack names). Run by tools/package.sh."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
version = (ROOT / "VERSION").read_text().strip()
vlist = [int(p) for p in version.split(".")]

packs = {"behavior_pack": "Behavior", "resource_pack": "Resources"}
manifests = {k: json.loads((ROOT / k / "manifest.json").read_text()) for k in packs}
uuids = {k: m["header"]["uuid"] for k, m in manifests.items()}

for pack, kind in packs.items():
    m = manifests[pack]
    m["header"]["version"] = vlist
    m["header"]["name"] = f"Agartha v{version} ({kind})"
    for mod in m["modules"]:
        mod["version"] = vlist
    for dep in m.get("dependencies", []):
        if dep.get("uuid") in uuids.values():
            dep["version"] = vlist
    (ROOT / pack / "manifest.json").write_text(json.dumps(m, indent=2) + "\n")
print(f"packs stamped v{version}")
