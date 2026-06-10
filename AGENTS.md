# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

Do not assume silently. Do not hide confusion. Surface tradeoffs.

Before implementing:

- State relevant assumptions explicitly.
- If multiple valid interpretations exist, present them briefly.
- If a simpler approach exists, prefer it.
- Push back when the requested change seems too broad or risky.
- If uncertainty blocks correctness, ask.
- If uncertainty is minor, make a small explicit assumption and continue.

## 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No flexibility or configurability that was not requested.
- No error handling for impossible scenarios.
- If 200 lines could reasonably be 50, rewrite it.
- Prefer boring, explicit code over clever code.

Ask yourself: would a senior engineer say this is overcomplicated? If yes, simplify.

## 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Do not improve adjacent code, comments, or formatting.
- Do not refactor things that are not part of the request.
- Match existing style, even if you would do it differently.
- If you notice unrelated dead code, mention it instead of deleting it.

When your changes create orphans:

- Remove imports, variables, functions, or files that your changes made unused.
- Do not remove pre-existing dead code unless asked.

Every changed line should trace directly to the user's request.

## 4. Context Budget

Use repository context deliberately.

- Do not read unrelated files.
- Start with the smallest relevant files.
- Prefer targeted searches by filename, symbol, route, or component name.
- Do not summarize the whole repository.
- Do not inspect frontend and backend together unless the task requires it.
- Stop exploring once the implementation path is clear.
- If more context is needed, explain why before expanding the search.

## 5. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" -> "Write tests for invalid inputs, then make them pass"
- "Fix the bug" -> "Write a test that reproduces it, then make it pass"
- "Refactor X" -> "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]

Strong success criteria let you loop independently. Weak criteria require clarification.

## 6. Python Rules

- Keep functions focused and readable.
- Service functions should orchestrate, not contain all logic inline.
- Prefer pure helper functions for parsing, normalization, scoring, and mapping.
- Do not mix database access, parsing, validation, and response formatting in one function.
- Avoid classes unless they clearly improve state management or dependency injection.
- Avoid generic registries, factories, and strategy patterns for a single implementation.
- Use explicit exceptions and simple error handling.
- Do not swallow exceptions silently.

## 7. React / TypeScript Rules

- Reuse existing components before creating new ones.
- Keep components focused on rendering and user interaction.
- Do not introduce global state unless local state or props are insufficient.
- Avoid mixing API calls, transformation logic, and JSX in the same component.
- Do not add UI libraries without explicit approval.
- Preserve existing design tokens, spacing, and component patterns.
- Avoid broad UI rewrites unless explicitly requested.

## 8. Database Rules

- Do not change the database schema unless explicitly requested.
- If a schema change is necessary, explain why and include the migration impact.
- Avoid full-table scans on growing tables.
- Be careful with N+1 queries.
- Prefer explicit indexed queries over complex dynamic query builders.
- Do not load large reference tables into memory unless cached or explicitly bounded.

## 9. Validation

After changes:

- Run the smallest relevant test command first.
- If no test exists, run linting or type checking if available.
- If validation cannot be run, explain why.
- Do not claim that something is tested unless the command actually ran successfully.

## 10. Final Response

When finishing a task, report only:

- files changed
- what changed
- validation performed
- risks or follow-up items

Keep it concise.
