import { parsePsLine, processListing } from '../processListing'

const spawnMock = jest.fn()
const deps = { spawnAsync: spawnMock }

describe('parsePsLine', () => {
  it('parses a pid and a Windows command', () => {
    expect(parsePsLine('  123 C:\\Games\\x.exe')).toEqual({
      pid: '123',
      command: 'C:\\Games\\x.exe'
    })
  })

  it('strips a leading double quote', () => {
    expect(parsePsLine('45 "C:\\Games\\x.exe" -arg')?.command).toBe(
      'C:\\Games\\x.exe" -arg'
    )
  })

  it('returns null when the line has no pid', () => {
    expect(parsePsLine('not a ps line')).toBeNull()
    expect(parsePsLine('')).toBeNull()
  })

  it('keeps a command containing spaces whole', () => {
    expect(parsePsLine('9 C:\\Program Files\\Game\\g.exe --flag a b')).toEqual({
      pid: '9',
      command: 'C:\\Program Files\\Game\\g.exe --flag a b'
    })
  })
})

describe('processListing', () => {
  beforeEach(() => spawnMock.mockReset())

  it('returns ps stdout', async () => {
    spawnMock.mockResolvedValueOnce({ stdout: '1 a' })
    await expect(processListing(deps)).resolves.toBe('1 a')
  })

  it('falls back to pgrep when ps cannot spawn', async () => {
    spawnMock
      .mockRejectedValueOnce(new Error('spawn EPERM'))
      .mockResolvedValueOnce({ stdout: '2 b' })
    await expect(processListing(deps)).resolves.toBe('2 b')
  })

  it('rethrows the ps error when both fail', async () => {
    spawnMock
      .mockRejectedValueOnce(new Error('ps failed'))
      .mockRejectedValueOnce(new Error('pgrep failed'))
    await expect(processListing(deps)).rejects.toThrow('ps failed')
  })
})
