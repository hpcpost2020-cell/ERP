// Provides audio beep and haptic vibration feedback for scanner workflows.
// On Zebra TC57, vibrate() works natively. AudioContext requires user gesture first.
export function useScanFeedback() {
  const beep = (freq: number, duration: number, type: OscillatorType = 'sine') => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      if (!Ctx) return
      const ctx: AudioContext = new Ctx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = type
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.4, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
      osc.start()
      osc.stop(ctx.currentTime + duration)
    } catch { /* audio not available */ }
  }

  const success = () => {
    navigator.vibrate?.(80)
    beep(880, 0.1)
  }

  const error = () => {
    navigator.vibrate?.([80, 40, 80])
    beep(220, 0.25, 'square')
  }

  return { success, error }
}
