import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The Capacitor bridge is stubbed so native.ts loads in the node test env.
// bridge.native picks the branch under test: the plugin watch or the browser watch.
const bridge = vi.hoisted(() => ({
  native: true,
  geo: { watchPosition: vi.fn(), clearWatch: vi.fn(), getCurrentPosition: vi.fn() },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => bridge.native,
    getPlatform: () => (bridge.native ? 'android' : 'web'),
  },
}))
vi.mock('@capacitor/clipboard', () => ({ Clipboard: {} }))
vi.mock('@capacitor/filesystem', () => ({ Directory: {}, Filesystem: {} }))
vi.mock('@capacitor/share', () => ({ Share: {} }))
vi.mock('@capacitor/geolocation', () => ({ Geolocation: bridge.geo }))

// native.ts reads its platform flag once at load, so each test loads it fresh.
async function loadNativeWatch(native: boolean) {
  bridge.native = native
  vi.resetModules()
  const mod = await import('../src/lib/native')
  return mod.nativeWatch
}

const fakePosition = {
  coords: {
    latitude: 15.5, longitude: 73.8, accuracy: 5,
    altitude: null, altitudeAccuracy: null, heading: null, speed: null,
  },
  timestamp: 1,
}

beforeEach(() => {
  bridge.geo.watchPosition.mockReset()
  bridge.geo.clearWatch.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('native watch: a fix and a refusal', () => {
  it('delivers a fix while the watch runs', async () => {
    const nativeWatch = await loadNativeWatch(true)
    bridge.geo.watchPosition.mockResolvedValue('w0')
    const onFix = vi.fn()
    nativeWatch(onFix, () => {})
    const deliver = bridge.geo.watchPosition.mock.calls[0][1]
    deliver(fakePosition, undefined)
    expect(onFix).toHaveBeenCalledTimes(1)
    expect(onFix.mock.calls[0][0].coords.latitude).toBe(15.5)
  })

  it('reports a native refusal as permission_denied, never as a fix', async () => {
    const nativeWatch = await loadNativeWatch(true)
    bridge.geo.watchPosition.mockResolvedValue('w1')
    const onFix = vi.fn()
    const onError = vi.fn()
    nativeWatch(onFix, onError)
    const deliver = bridge.geo.watchPosition.mock.calls[0][1]
    deliver(null, { code: 'OS-PLUG-GLOC-0003', message: 'Location permission request was denied.' })
    expect(onError).toHaveBeenCalledWith('permission_denied')
    expect(onFix).not.toHaveBeenCalled()
  })

  it('reports a native timeout as timeout, never as a refusal', async () => {
    const nativeWatch = await loadNativeWatch(true)
    bridge.geo.watchPosition.mockResolvedValue('w1b')
    const onError = vi.fn()
    nativeWatch(() => {}, onError)
    const deliver = bridge.geo.watchPosition.mock.calls[0][1]
    deliver(null, { code: 'OS-PLUG-GLOC-0010', message: 'Could not obtain location in time.' })
    expect(onError).toHaveBeenCalledWith('timeout')
    expect(onError).not.toHaveBeenCalledWith('permission_denied')
  })

  it('reports a watch that fails to start through onError', async () => {
    const nativeWatch = await loadNativeWatch(true)
    bridge.geo.watchPosition.mockRejectedValue({ code: 'OS-PLUG-GLOC-0003', message: 'Location permission request was denied.' })
    const onFix = vi.fn()
    const onError = vi.fn()
    nativeWatch(onFix, onError)
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('permission_denied'))
    expect(onFix).not.toHaveBeenCalled()
  })
})

describe('native watch: stop', () => {
  it('clears a native watch whose id arrives after stop', async () => {
    const nativeWatch = await loadNativeWatch(true)
    let resolveId: (id: string) => void = () => {}
    bridge.geo.watchPosition.mockReturnValue(new Promise<string>(resolve => { resolveId = resolve }))
    const handle = nativeWatch(() => {}, () => {})
    handle.stop()
    resolveId('w7')
    await vi.waitFor(() => expect(bridge.geo.clearWatch).toHaveBeenCalledWith({ id: 'w7' }))
  })

  it('clears a native watch once when stop runs after the id arrives', async () => {
    const nativeWatch = await loadNativeWatch(true)
    bridge.geo.watchPosition.mockResolvedValue('w8')
    const handle = nativeWatch(() => {}, () => {})
    await new Promise(resolve => setTimeout(resolve, 0))
    handle.stop()
    handle.stop()
    expect(bridge.geo.clearWatch).toHaveBeenCalledTimes(1)
    expect(bridge.geo.clearWatch).toHaveBeenCalledWith({ id: 'w8' })
  })

  it('drops a native fix that arrives after stop', async () => {
    const nativeWatch = await loadNativeWatch(true)
    bridge.geo.watchPosition.mockResolvedValue('w2')
    const onFix = vi.fn()
    const handle = nativeWatch(onFix, () => {})
    const deliver = bridge.geo.watchPosition.mock.calls[0][1]
    handle.stop()
    deliver(fakePosition, undefined)
    expect(onFix).not.toHaveBeenCalled()
  })
})

describe('web watch: browser errors', () => {
  it('reports a browser timeout as timeout and never as a fix', async () => {
    const watchPosition = vi.fn((_ok: unknown, fail: (e: unknown) => void) => {
      fail({ code: 3, message: 'Timeout expired' })
      return 4
    })
    vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch: vi.fn() } })
    const nativeWatch = await loadNativeWatch(false)
    const onFix = vi.fn()
    const onError = vi.fn()
    nativeWatch(onFix, onError)
    expect(onError).toHaveBeenCalledWith('timeout')
    expect(onFix).not.toHaveBeenCalled()
  })

  it('reports a browser refusal as permission_denied', async () => {
    const watchPosition = vi.fn((_ok: unknown, fail: (e: unknown) => void) => {
      fail({ code: 1, message: 'User denied Geolocation' })
      return 5
    })
    vi.stubGlobal('navigator', { geolocation: { watchPosition, clearWatch: vi.fn() } })
    const nativeWatch = await loadNativeWatch(false)
    const onError = vi.fn()
    nativeWatch(() => {}, onError)
    expect(onError).toHaveBeenCalledWith('permission_denied')
  })
})
