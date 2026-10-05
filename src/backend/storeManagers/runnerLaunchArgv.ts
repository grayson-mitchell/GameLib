import shlex from 'shlex'

/**
 * Pure argv composition for the legendary and nile `launch` subcommands, split out of
 * `legendary/games.ts` and `nile/games.ts` so it can be tested without either module's
 * import graph.
 *
 * Passthrough game args (`args`) go after a `--` end-of-options marker. Both runners parse
 * `launch` with argparse `parse_known_args()`, so without it a passthrough `--wrapper ...`
 * or `--override-exe ...` is accepted as the RUNNER's option -- a `gamelib://launch?arg=`
 * deep link could pick the command the runner executes. Measured against legendary 0.21.0
 * (`cli.py`) and nile v1.2.0 (`arguments.py`) under Python 3.10-3.13: both drop the `--`
 * and hand everything after it to the game unparsed. The marker is added only when there
 * are passthrough args, so a launch without any keeps its exact argv.
 *
 * gogdl is NOT handled here: heroic-gogdl v1.3.0 keeps the literal `--` and forwards it to
 * the game's argv, so its builder is unchanged and `protocol.ts` strips `-`-prefixed
 * URL-supplied args for it instead.
 *
 * The user's game-settings launcher args and a launch option's parameters stay where they
 * were (before the runner options / app id), so nothing a user configured changes meaning.
 */

interface LaunchArgvInputs {
  /** Passthrough game args (renderer launch, or a `gamelib://launch?arg=` deep link). */
  args: string[]
  /** The selected launch option's own parameters (`type: 'basic'`). */
  launchArgumentArgs?: string
  /** The user's game-settings launcher args. */
  launcherArgs?: string
}

export function legendaryLaunchArgumentFields({
  args,
  launchArgumentArgs,
  launcherArgs
}: LaunchArgvInputs): { extraArguments: string; gameArguments?: string[] } {
  return {
    extraArguments: [launchArgumentArgs, launcherArgs]
      .filter(Boolean)
      .join(' '),
    // `commandToArgsArray` emits this after every option, behind a `--`, one entry per
    // argument exactly as nile does -- never joined and re-split.
    ...(args.length ? { gameArguments: [...args] } : {})
  }
}

export function nileLaunchCommandParts({
  exeOverrideFlag,
  wineFlag,
  launchArgumentArgs,
  launcherArgs,
  id,
  args
}: LaunchArgvInputs & {
  exeOverrideFlag: string[]
  wineFlag: string[]
  id: string
}): string[] {
  return [
    'launch',
    ...exeOverrideFlag, // Check if this works
    ...wineFlag,
    ...shlex.split(launchArgumentArgs ?? ''),
    ...shlex.split(launcherArgs ?? ''),
    id,
    ...(args.length ? ['--', ...args] : [])
  ]
}
