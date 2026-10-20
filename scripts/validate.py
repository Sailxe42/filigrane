"""Validates files with the C2PA reference implementation and prints JSON results."""
import json
import sys

from c2pa import Reader

results = []
for path in sys.argv[1:]:
    mime = "image/png" if path.lower().endswith(".png") else "image/jpeg"
    with open(path, "rb") as f:
        reader = Reader(mime, f)
        store = json.loads(reader.json())
        errors = [
            s["code"]
            for s in store.get("validation_status", [])
            if s["code"] != "signingCredential.untrusted"
        ]
        results.append({"file": path, "state": reader.get_validation_state(), "errors": errors})
print(json.dumps(results))
