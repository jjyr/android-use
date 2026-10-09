# Documentation

Start with [README.md](README.md) and read the design pages relevant to the task. Keep documentation in English and distinguish proposals from implemented and verified behavior.

# Tool interfaces

Changes to model-visible tool names, additions/removals, arguments or behavior require explicit user agreement before implementation. Keep each tool focused on its existing responsibility; do not merge or split tools without that agreement.

# Development

Use this repository's independent mise configuration for pinned tools and tasks when the scaffold is implemented. Do not depend on the Pot checkout or toolchain.

# Machine context

Canonical machine inventory is `~/Workspace/Machines`. Keep host connection, device enrollment and machine-specific setup notes there; never commit pairing codes, ADB keys or credentials.
