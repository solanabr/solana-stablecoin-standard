# Architecture

> Detailed architecture documentation — to be completed in Phase 9.

## Layer Model

```
┌─────────────────────────────────────────┐
│       Layer 3: Standard Presets         │
│   SSS-1 (Minimal)  │  SSS-2 (Compliant)│
│   SSS-3 (Private)                       │
├─────────────────────────────────────────┤
│       Layer 2: Modules                  │
│   Compliance  │  Privacy  │  Oracle     │
├─────────────────────────────────────────┤
│       Layer 1: Base SDK                 │
│   Token-2022 Mint  │  Role Management   │
│   CLI  │  TypeScript SDK                │
└─────────────────────────────────────────┘
```
