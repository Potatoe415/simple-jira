# Module: <name>

Purpose: <one sentence>
Public_Entry: src/modules/<name>/<entry file>
Exports: <functions and types other modules may use>
Owns_Data: see DATA.md
Depends_On: <modules, or none>
Used_By: <modules, or none>
Forbidden: <modules or layers this module must never import>
Invariants:
- <rule that must always hold>
Error_Codes: E_<NAME>_* (catalog in docs/DEBUGGING.md)
Test_Command: <command that tests only this module>
Gotchas:
- <non-obvious behaviour>

Keep under 40 lines.
