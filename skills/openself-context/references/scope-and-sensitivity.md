# Scope, sensitivity, trust, and time

## Scope

Scopes are `/`-separated, case-sensitive hierarchies. `project/atlas` includes
`project/atlas/billing` but not `project/atlasx`. Pick the narrowest scope that
the memory belongs to:

| Memory | Suggested scope |
|---|---|
| Framework decision for a repo | `project/<name>` |
| Editor or workflow preference | `personal/work` |
| How to address a person | `relationship/<name>` |
| Household info | `personal/home` |
| Reusable technical knowledge | `knowledge/<topic>` |

A memory in the wrong scope is effectively invisible to agents that only have
that scope root — and overexposed if the scope is too broad.

## Sensitivity

`public < personal < private < restricted`. Agents receive at most their
policy ceiling (usually `private`). Ask yourself: "would the owner be OK with
every agent that can read `personal` seeing this?" If not, go one level up.
`restricted` requires an explicit owner grant — do not store restricted content
expecting agents to retrieve it.

## Source trust

`untrusted < external < trusted < verified < owner`. Agent writes are clamped
to the owner's `maxSourceTrust` ceiling (`external` by default). Imported or
unverified content stays marked as unverified in rendered context — quote it as
a claim with its source, not as established fact.

## Time fields

- `occurredAt` — when an event happened (meetings, messages).
- `validFrom` / `validTo` — the interval in which a fact is current. A billing
  contact "until March" should carry `validTo`; retrieval at a later `asOf`
  excludes it automatically.
- When a stored fact is superseded, store the new value and ask the owner to
  expire or forget the old one — never silently overwrite.

## Provenance checklist

Every durable memory should answer: where did this come from? Use
`sourceKind` (`meeting`, `document`, `chat`, `agent`, `manual`, …) plus a
locator (`notes/architecture.md`) and a human title. Provenance is what makes
the difference between "the model said so" and "the user decided on Aug 13".
