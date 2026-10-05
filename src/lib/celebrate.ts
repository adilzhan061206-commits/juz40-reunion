import confetti from 'canvas-confetti'

export function celebrate() {
  const colors = ['#e8a33d', '#14162b', '#2fae7b', '#5b74f0', '#f1eee5']
  confetti({ particleCount: 90, spread: 70, origin: { y: 0.7 }, colors, disableForReducedMotion: true })
}
