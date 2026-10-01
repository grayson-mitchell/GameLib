# Quick 261001-ci6: close the CI-runner todo

`ci` (the Test workflow) concluded success on the PR run for `9109d01da`; lint and codecheck passed too. Skip counts were not read
from the runner (logs need a login); the local run measured 13. `cargo-test` macOS/Windows fail on `main` as well and are unrelated.
Todo moved to `completed/`. Not pushed.
