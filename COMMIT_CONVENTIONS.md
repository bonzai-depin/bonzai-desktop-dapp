# Commit Conventions

BonzAI uses [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) for every commit on every branch.

## Format

```text
<type>(<optional scope>): <imperative summary>

<optional body>

<optional trailers>
```

Examples:

```text
feat(company): persist team deliverables
fix(game): place dropped objects at the raycast position
docs: explain Robinhood deployment configuration
refactor(inference): share model availability checks
```

## Types

| Type | Use |
| --- | --- |
| `feat` | User-visible capability |
| `fix` | Correctness, reliability, security, or performance defect |
| `docs` | Documentation only |
| `refactor` | Internal restructuring with no intended behavior change |
| `perf` | Measurable performance improvement |
| `test` | Tests or fixtures only |
| `build` | Build system, packaging, or dependency change |
| `ci` | Continuous integration or release automation |
| `chore` | Repository maintenance not covered above |
| `revert` | Reversal of an earlier commit |

Use a short lowercase scope when it improves precision, such as `company`, `companion`, `game`, `inference`, `web3`, `contracts`, `desktop`, or `release`.

## Subject Rules

- Use the imperative mood: `add`, `fix`, `preserve`, not `added`, `fixes`, or `preserving`.
- Describe the behavior, not the editing activity.
- Start lowercase after the colon and omit the final period.
- Keep the complete first line at 72 characters or fewer when practical.
- Do not use vague subjects such as `bump`, `updates`, `refactoring`, `wip`, or version numbers alone.
- Do not put issue IDs or release bookkeeping ahead of the actual change.

## Body and Trailers

Use the body to explain why the change exists, constraints that are not obvious from the diff, and migration consequences. Wrap prose at approximately 100 characters.

Use `BREAKING CHANGE: <description>` when consumers must migrate. A breaking change may also use `!` before the colon:

```text
feat(protocol)!: require staking for collectible publishing

BREAKING CHANGE: token balances no longer grant publishing access.
```

Use standard trailers for issue references and sign-off where required. Commit authorship must represent the human or organization submitting the work. Do not add tool, model, assistant, or generator attribution trailers.

## Releases and Merges

Release commits use:

```text
chore(release): publish 3.4.5
```

Prefer rebase or squash merges so the default branch retains meaningful Conventional Commit subjects. If a merge commit is required, its subject must still describe the integrated outcome.

## Local Identity

Project maintainers use an explicit Git identity:

```bash
git config user.name "Wilhem Pujar"
git config user.email "w@bonzai.sh"
git config user.useConfigOnly true
```

Contributors should configure their own accurate name and email. Do not impersonate another contributor or rewrite authorship in a pull request.
