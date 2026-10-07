import type { Path } from 'backend/schemas'
import type { LegendaryAppName, NonEmptyString } from './base'

interface LaunchCommand {
  subcommand: 'launch'
  appName: LegendaryAppName
  extraArguments?: string
  /**
   * Passthrough game args. `commandToArgsArray` emits them LAST, after a `--`, so legendary's
   * `parse_known_args()` can never read them as its own options (`--wrapper`, ...). An array,
   * one entry per argument: a space-join re-split by `shlex` turned `arg=foo bar` into two
   * game args and made an unmatched quote throw after the user had confirmed the launch.
   */
  gameArguments?: string[]
  '--offline'?: true
  '--skip-version-check'?: true
  '--override-username'?: NonEmptyString
  '--dry-run'?: true
  '--language'?: NonEmptyString
  '--wrapper'?: NonEmptyString
  '--set-defaults'?: true
  '--reset-defaults'?: true
  '--override-exe'?: Path
  '--origin'?: true
  '--ubisoft'?: true
  '--json'?: true
  '--wine'?: Path
  '--wine-prefix'?: Path
  '--no-wine'?: true
  '--crossover'?: true
  '--crossover-app'?: Path
  '--crossover-bottle'?: NonEmptyString
}

export default LaunchCommand
