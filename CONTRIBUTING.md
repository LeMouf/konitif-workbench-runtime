# Contributing to @konitif/workbench-runtime

Consumer documentation belongs in `README.md`. Machine-readable package
documentation belongs in `reference/`; release policy, qualification evidence
and agent instructions must remain in their dedicated repository files.

Use the committed lockfile and disable lifecycle scripts during installation:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
npm run verify:package
```

Keep canonical Workbench semantics and product policy outside this adapter.
Follow `RELEASE.md` for publication.
