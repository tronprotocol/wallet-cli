# Comment rules (`ts/`)

Code is the source of truth. Write a comment only when the code cannot say it, and say it in the fewest words
that help a human review the code. Applies to every code file under `ts/`, including tests.

## When to write a comment

- A non-obvious constraint whose removal would invite a "simplification" that breaks behaviour: money,
  security, signing, atomicity or lock scope, ordering, protocol or node quirks.
- A unit or encoding the type does not show (SUN vs TRX, raw vs decimal, hex vs base58).
- An exported API whose name and types are not enough.
- In a test, only when the intent is not clear from the test name and assertions.

Otherwise, make the code clearer instead: a better name, a smaller function, a named constant.

## What to write

- What the code does now, and for a constraint, what breaks if it is removed.
- One line where possible.

## What not to write

- History or decisions: "previously", "used to", "we chose", "fixed", incident stories, commit hashes, PR or
  issue numbers, dates, measurements, audit references. Record a decision that must survive in
  `ts/docs/dev/rules/`.
- What the code, the name, or the types already say.
- Commented-out code.
- Long rationale, or details of another file's internals that can drift.
- Intended behaviour the code does not have. If the code is wrong, fix the code.

## Keep comments true

When you change code, update or delete the comments it makes wrong in the same change. When a comment and the
code disagree, fix the comment; if the code is the one that is wrong, fix it in a separate, tested change.

## Directives

Tool directives (`eslint-disable*`, `@ts-expect-error`, `@ts-ignore`, `prettier-ignore`, coverage ignores),
triple-slash directives, shebangs, `/*#__PURE__*/`, `@deprecated`, and license headers are not prose. Add,
change, or remove one only together with the code change that needs it. Keep license headers.

## Style

English. `//` by default; `/** */` for exported API docs.
