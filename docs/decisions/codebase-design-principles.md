---
title: Codebase Design Principles
type: decision
date: 2026-02-27
---

# Codebase Design Principles

Heuristics for evaluating structural quality. Each has a concrete test.

---

## 1. If you define an abstraction, all traffic goes through it

Side-channel exports that bypass a declared interface mean the interface is either incomplete or the wrong shape.

**Test:** Can you add a new feature by only touching the feature module and the registration site? If you also need to add imports and wiring elsewhere for feature-specific functions, the abstraction leaks.

---

## 2. One event source, one handler

When two modules compete for the same input event, behavior on overlap is undefined and invisible. A single dispatcher with explicit priority ordering is both correct and debuggable.

**Test:** grep for `ScreenSpaceEventHandler`. If you find more than one on the same canvas, something's wrong.

---

## 3. A type should have exactly one canonical definition

If the same type is defined in two files, one will drift. Even if they're identical today, they're maintained independently and there's no compiler guarantee they stay in sync.

**Test:** grep for `interface Foo` or `type Foo`. If the same name appears in multiple files, consolidate.

---

## 4. Boundary types should be plain data

When data crosses an architectural boundary (renderer → UI, feature → orchestrator), it should be a plain object — no framework primitives, no runtime handles. The receiving side shouldn't hold references to things it can't construct or reason about.

**Test:** look at types that flow across module boundaries. If a type contains a framework class instance and the consumer doesn't use that field, the type is leaking internals.

---

## 5. Shared parameter bags should not require consumers to ignore most of their fields

When most consumers destructure a shared type and ignore it, the type is doing the wrong job. Either each consumer should declare its own needs, or nothing should be shared.

**Test:** if more than half the consumers of a shared type ignore more than half its fields, the type is too broad.

---

## 6. File location is documentation

A file's directory path should tell readers its role. When it doesn't, readers form wrong expectations that cost time.

**Test:** can a new developer infer a file's role from its directory path alone? If they'd guess wrong, the file is in the wrong place.

---

## 7. The orchestrator orchestrates; the host hosts

The orchestrator (main.ts) decides what exists and wires things together. The host (renderer.ts) owns the Cesium Viewer and runs the scene. When the host also decides which features to register, it's doing two jobs.

**Test:** does renderer.ts import any specific feature module? If yes, it knows too much.

---

## 8. Follow your own decision docs

When code contradicts its own documentation, trust in both erodes. Code that "works" via workarounds that paper over incorrectness is still incorrect.

**Test:** for each rule in a decision doc, grep the codebase to verify compliance.

---

## 9. Dead weight is a signal, not just clutter

Unused dependencies, no-op callbacks, `void` expressions to suppress warnings — each one individually is trivial. Together they indicate the codebase isn't maintained with attention to detail and create an ambient "don't trust what you read" feeling.

**Test:** `npm ls` for phantoms. Grep for `_`-prefixed params, `void` expressions, empty function bodies.

---

## 10. Consistency of pattern matters more than choice of pattern

Whether features load their own data or receive pre-fetched data — either is fine. What's not fine is when some do one and some do the other. The inconsistency forces readers to learn two patterns and wonder why the split exists. Pick one. Apply it everywhere.

**Test:** describe in one sentence how features get their data. If the sentence requires "except for..." or "but..." qualifiers, the pattern is inconsistent.
