#!/usr/bin/env python3
"""Inventory the pinned w2c-to-consolem boundary; emit data, not translation tables."""
import csv
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--course", required=True)
parser.add_argument("--consolem", required=True)
parser.add_argument("--out", required=True)
args = parser.parse_args()
COURSE = args.course
FORK = args.consolem
COURSE_PIN = "6dccdcc8612a761fbf5c4fdc60de1504acc68c3c"
API_PIN = "0fbdd125dcc976e871f7eea17f6b9538a81e7019"
OUT = Path(args.out)
OUT.mkdir(parents=True, exist_ok=True)


def git_bytes(repo, pin, name):
    return subprocess.check_output(["git", "-C", repo, "show", pin + ":" + name])


inputs = {}


def source(repo, pin, name):
    b = git_bytes(repo, pin, name)
    inputs[name] = {"commit": pin, "sha256": hashlib.sha256(b).hexdigest()}
    return b


api = json.loads(source(FORK, API_PIN, "api/openapi.json"))
assert git_bytes(COURSE, COURSE_PIN, "VMS/11-backend/consolem.openapi.json") == git_bytes(FORK, API_PIN, "api/openapi.json")
kind_data = json.loads(source(COURSE, COURSE_PIN, "VMS/11-backend/data/kinds.json"))
catalog = json.loads(source(COURSE, COURSE_PIN, "VMS/11-backend/data/rule-catalog.json"))
profile_raw = source(COURSE, COURSE_PIN, "VMS/11-backend/data/profile.tsv").decode()
refusals_raw = source(COURSE, COURSE_PIN, "VMS/11-backend/data/refusal-words.tsv").decode()
mapping_raw = source(COURSE, COURSE_PIN, "VMS/11-backend/data/mapping.tsv").decode()
schemas = api["components"]["schemas"]
methods = {"get", "put", "post", "patch", "delete", "head", "options"}


def table(text):
    return list(csv.DictReader(io.StringIO("\n".join(l for l in text.splitlines() if l and not l.startswith("#"))), delimiter="\t"))


profile_rows = table(profile_raw)
profile = {(r["method"].lower(), r["path"]): r["profile"] for r in profile_rows}


def refs(value):
    if isinstance(value, dict):
        result = {value["$ref"].split("/")[-1]} if value.get("$ref", "").startswith("#/components/schemas/") else set()
        for v in value.values():
            result |= refs(v)
        return result
    if isinstance(value, list):
        result = set()
        for v in value:
            result |= refs(v)
        return result
    return set()


def closure(roots):
    seen, todo = set(), list(roots)
    while todo:
        name = todo.pop()
        if name in seen:
            continue
        assert name in schemas, name
        seen.add(name)
        todo += list(refs(schemas[name]) - seen)
    return seen


active_roots = {"StreamMessage", "AssistEvent"}
all_roots = set()
operations = []
inline_responses = []
for route, item in api["paths"].items():
    for method, op in item.items():
        if method not in methods:
            continue
        response_roots = refs(op.get("responses", {}))
        all_roots |= response_roots
        state = profile.get((method, route), "not-in-w2c-profile")
        if state == "in":
            active_roots |= response_roots
        operations.append({"method": method.upper(), "path": route, "operationId": op.get("operationId", ""), "w2c": state, "responseSchemas": sorted(response_roots)})
        for status, response in op.get("responses", {}).items():
            for media, content in response.get("content", {}).items():
                if isinstance(content.get("schema"), dict):
                    inline_responses.append((method.upper() + " " + route + " response " + status + " " + media,
                                             content["schema"], "w2c-response" if state == "in" else "other-response"))
active = closure(active_roots)
all_response = closure(all_roots)


def direction(name):
    return "w2c-response" if name in active else "other-response" if name in all_response else "request-or-description"


def clean(value):
    if not isinstance(value, str):
        value = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return value.replace("\r", "\\r").replace("\n", "\\n").replace("\t", "\\t")


def write_tsv(name, rows, columns):
    with (OUT / name).open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter="\t", lineterminator="\n", quoting=csv.QUOTE_ALL)
        w.writerow(columns)
        for row in rows:
            w.writerow([clean(row.get(k, "")) for k in columns])


def walk_data(value, prefix=""):
    yield prefix or "$", value
    if isinstance(value, dict):
        for key, val in value.items():
            if key not in {"$comment", "_note"}:
                yield from walk_data(val, prefix + ("." if prefix else "") + key)
    elif isinstance(value, list):
        for i, val in enumerate(value):
            yield from walk_data(val, prefix + "[" + str(i) + "]")


def schema_nodes(node, prefix="$"):
    if not isinstance(node, dict):
        return
    yield prefix, node
    for key, value in node.get("properties", {}).items():
        yield from schema_nodes(value, prefix + "." + key)
    if isinstance(node.get("items"), dict):
        yield from schema_nodes(node["items"], prefix + "[]")
    if isinstance(node.get("additionalProperties"), dict):
        yield from schema_nodes(node["additionalProperties"], prefix + ".*")
    for group in ["oneOf", "anyOf", "allOf"]:
        for i, value in enumerate(node.get(group, [])):
            yield from schema_nodes(value, prefix + "<" + group + str(i) + ">")
    for group in ["if", "then", "else", "not"]:
        if isinstance(node.get(group), dict):
            yield from schema_nodes(node[group], prefix + "<" + group + ">")


kinds, profiles, texts, properties, actions, enums, descriptor_codes = [], [], [], [], [], [], []
text_keys = {}
for kind, record in kind_data["kinds"].items():
    d = record["description"]
    kinds.append({"kind": kind, "labelKey": d.get("label", {}).get("key", ""), "currentText": d.get("label", {}).get("text", ""), "currentLang": d.get("label", {}).get("lang", ""), "profiles": d.get("implements", []), "source": record.get("from", ""), "write": record.get("write", ""), "capabilities": d.get("capabilities", [])})
    for family in ["actions", "events"]:
        for obj in d.get(family, []):
            label = obj.get("label", {})
            actions.append({"kind": kind, "family": family, "id": obj["id"], "labelKey": label.get("key", ""), "currentText": label.get("text", ""), "currentLang": label.get("lang", ""), "executionOrSeverity": obj.get("execution", obj.get("severity", "")), "parameterFields": sorted(obj.get("params", {}).get("properties", {})), "resultFields": sorted(obj.get("result", {}).get("properties", {}))})
    for place, obj in walk_data(d):
        if isinstance(obj, dict) and isinstance(obj.get("text"), str) and set(obj) <= {"key", "text", "lang"}:
            row = {"owner": kind, "path": place, "form": "Text", "key": obj.get("key", ""), "currentText": obj["text"], "currentLang": obj.get("lang", "")}
            texts.append(row)
            if row["key"]:
                text_keys.setdefault(row["key"], set()).add((row["currentText"], row["currentLang"]))
        if isinstance(obj, str) and place.split(".")[-1] in {"description", "title", "help", "tooltip", "x-ui-unit", "x-ui-group", "x-ui-tab"}:
            texts.append({"owner": kind, "path": place, "form": "plain-caption", "key": "", "currentText": obj, "currentLang": ""})
        if isinstance(obj, str) and (re.match(r"^(kind|origin\.|parents\[|children\[|createParents\[|implements\[|capabilities\[|x-ui-category\[)", place)
                or re.search(r"(?:^access|\.right)(?:\..*)?\.(?:class|level|levels\[\d+\])$", place)):
            descriptor_codes.append({"kind": kind, "path": place, "code": obj})
    for place, obj in walk_data(d):
        if not isinstance(obj, dict) or "properties" not in obj or not isinstance(obj.get("properties"), dict):
            continue
        for prop, field in obj["properties"].items():
            if not isinstance(field, dict):
                continue
            label = field.get("x-label", {})
            properties.append({"kind": kind, "path": place + ".properties." + prop, "type": field.get("type", ""), "labelKey": label.get("key", "") if isinstance(label, dict) else "", "readOnly": field.get("readOnly", False), "writeOnly": field.get("writeOnly", False), "enum": field.get("enum", []), "format": field.get("format", "")})
    for place, obj in walk_data(d):
        if isinstance(obj, dict) and isinstance(obj.get("enum"), list):
            for value in obj["enum"]:
                enums.append({"origin": "kind", "owner": kind, "path": place, "direction": "w2c-response-description", "value": value})

for p in kind_data["profiles"]:
    label = p.get("label", {})
    profiles.append({"profile": p["id"], "labelKey": label.get("key", ""), "currentText": label.get("text", ""), "currentLang": label.get("lang", ""), "properties": p.get("properties", []), "status": p.get("status", []), "apis": p.get("apis", [])})
    texts.append({"owner": p["id"], "path": "profile.label", "form": "Text", "key": label.get("key", ""), "currentText": label.get("text", ""), "currentLang": label.get("lang", "")})
    if label.get("key"):
        text_keys.setdefault(label["key"], set()).add((label.get("text", ""), label.get("lang", "")))


def classification(schema, at, node):
    key = at.rsplit(".", 1)[-1].replace("[]", "").split("<")[0]
    if "enum" in node:
        return "code-to-caption"
    if schema == "Text":
        return "localization-key/text/lang"
    if schema.startswith("Assist") and key in {"text", "summary", "why", "message"}:
        return "assistant-generated-or-template"
    if schema == "JournalEvent" and key == "text":
        return "journal-generated-or-user-text"
    if key in {"message", "reason", "refusal", "faultText", "errorText", "detail"}:
        return "server-prose-needs-explicit-policy"
    if key in {"label", "labelPlural", "labelCount", "title", "description", "help"}:
        return "caption-or-user-title-needs-context"
    if key in {"code", "kind", "type", "state", "status", "action", "severity", "category", "source", "mode", "outcome", "keyword", "function", "features", "capabilities", "operations", "implements", "serviceTypes", "supportLevels", "titleFields", "privacyModes", "destinations", "condition"}:
        return "open-code-to-caption"
    if key in {"text", "name", "comment", "note", "email", "user", "login", "by", "firstName", "lastName"}:
        return "user-or-entity-data"
    return "raw-identifier/value-or-context-review"


string_fields, text_slots, open_payloads = [], [], []
for name, definition, scope in [(name, definition, direction(name)) for name, definition in schemas.items()] + inline_responses:
    for at, node in schema_nodes(definition):
        ref = node.get("$ref", "")
        if ref == "#/components/schemas/Text":
            text_slots.append({"schema": name, "path": at, "direction": scope})
        typ = node.get("type", "")
        if typ == "string" or isinstance(typ, list) and "string" in typ:
            string_fields.append({"schema": name, "path": at, "direction": "writeOnly-input-not-returned" if node.get("writeOnly") else scope, "class": classification(name, at, node), "format": node.get("format", ""), "enum": node.get("enum", []), "description": node.get("description", "")})
        if isinstance(node.get("enum"), list):
            for value in node["enum"]:
                enums.append({"origin": "contract", "owner": name, "path": at, "direction": scope, "value": value})
        if typ == "object" and (node.get("additionalProperties") is True or not node.get("properties")):
            open_payloads.append({"schema": name, "path": at, "direction": scope, "description": node.get("description", "")})

reference = []
for place, value in walk_data(catalog):
    if isinstance(value, str):
        reference.append({"source": "rule-catalog", "path": place, "code": value})

refusals = table(refusals_raw)
collisions = [{"key": key, "currentVariants": sorted(values)} for key, values in sorted(text_keys.items()) if len(values) > 1]
issue_codes = sorted(set(re.findall(r"\b(?:rule\.startNotDeclared|(?:trigger|cond|action|control|target)\.(?:notDeclared|fieldNotDeclared))\b", json.dumps(api, ensure_ascii=False))))

write_tsv("kinds.tsv", kinds, ["kind", "labelKey", "currentText", "currentLang", "profiles", "source", "write", "capabilities"])
write_tsv("profiles.tsv", profiles, ["profile", "labelKey", "currentText", "currentLang", "properties", "status", "apis"])
write_tsv("descriptor-texts.tsv", texts, ["owner", "path", "form", "key", "currentText", "currentLang"])
write_tsv("kind-properties.tsv", properties, ["kind", "path", "type", "labelKey", "readOnly", "writeOnly", "enum", "format"])
write_tsv("actions-events.tsv", actions, ["kind", "family", "id", "labelKey", "currentText", "currentLang", "executionOrSeverity", "parameterFields", "resultFields"])
write_tsv("descriptor-code-values.tsv", descriptor_codes, ["kind", "path", "code"])
write_tsv("enums.tsv", enums, ["origin", "owner", "path", "direction", "value"])
write_tsv("schema-string-fields.tsv", string_fields, ["schema", "path", "direction", "class", "format", "enum", "description"])
write_tsv("text-slots.tsv", text_slots, ["schema", "path", "direction"])
write_tsv("open-payloads.tsv", open_payloads, ["schema", "path", "direction", "description"])
write_tsv("reference-codes.tsv", reference, ["source", "path", "code"])
write_tsv("operations.tsv", operations, ["method", "path", "operationId", "w2c", "responseSchemas"])
write_tsv("refusal-codes.tsv", refusals, list(refusals[0]))
write_tsv("caption-key-collisions.tsv", collisions, ["key", "currentVariants"])
write_tsv("documented-rule-issue-codes.tsv", [{"code": x} for x in issue_codes], ["code"])
write_tsv("problem-codes.tsv", [{"code": x, "inW2cRefusalTable": x in {r["error"] for r in refusals}} for x in schemas["ProblemCode"]["enum"]], ["code", "inW2cRefusalTable"])
mapped_fields = [{"kindOrSchema": r["kind"], "field": r["field"], "way": r["way"], "direction": "readable" if r["way"] in {"read", "both", "const"} else "input-only" if r["way"] == "write" else "not-supported"} for r in table(mapping_raw)]
write_tsv("mapped-fields.tsv", mapped_fields, ["kindOrSchema", "field", "way", "direction"])

summary = {
    "coursePin": COURSE_PIN, "contractPin": API_PIN, "contractVersion": api["info"]["version"], "inputs": inputs,
    "completeForPinnedSnapshotNotAllFuturePlugins": True,
    "currentCaptionsAreSnapshotValuesNotNewEnglishTranslations": True,
    "kinds": len(kinds), "profiles": len(profiles), "descriptorTextOccurrences": len(texts), "stableTextKeys": len(text_keys),
    "textKeyCollisions": len(collisions), "kindPropertiesIncludingNestedAndCommandSchemas": len(properties),
    "actionDescriptors": sum(x["family"] == "actions" for x in actions), "eventDescriptors": sum(x["family"] == "events" for x in actions),
    "descriptorCodeOccurrences": len(descriptor_codes), "mappedFieldRows": len(mapped_fields),
    "contractSchemas": len(schemas), "inlineResponseSchemas": len(inline_responses), "schemasReachableFromW2cResponses": sorted(active), "otherResponseSchemas": sorted(all_response - active),
    "requestOrDescriptionOnlySchemas": sorted(set(schemas) - all_response), "textSlotLocations": len(text_slots),
    "enumOccurrences": len(enums), "enumValuesDistinct": len(set(str(x["value"]) for x in enums)),
    "contractStringFieldLocations": len(string_fields), "openPayloadLocations": len(open_payloads),
    "referenceCodeOccurrences": len(reference), "refusalRows": len(refusals), "refusalCodes": sorted(set(r["error"] for r in refusals)),
    "problemCodeEnum": schemas["ProblemCode"]["enum"], "documentedRuleIssueCodes": issue_codes,
    "operations": len(operations), "w2cDeclaredOperations": sum(x["w2c"] == "in" for x in operations),
    "outputs": {},
}
for p in sorted(OUT.glob("*.tsv")):
    summary["outputs"][p.name] = {"sha256": hashlib.sha256(p.read_bytes()).hexdigest(), "rows": len(p.read_text().splitlines()) - 1}
(OUT / "inventory.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({k: v for k, v in summary.items() if k not in {"inputs", "outputs", "schemasReachableFromW2cResponses", "otherResponseSchemas", "requestOrDescriptionOnlySchemas", "problemCodeEnum", "documentedRuleIssueCodes", "refusalCodes"}}, ensure_ascii=False, indent=2))
