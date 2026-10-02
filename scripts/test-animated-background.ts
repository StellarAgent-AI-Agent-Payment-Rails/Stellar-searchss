import assert from 'node:assert/strict'
import { createAnimationLoopController } from '../src/components/layout/AnimatedBackground'

type Listener = () => void
const visibilityListeners = new Set<Listener>()
const motionListeners = new Set<Listener>()
const cancelled: number[] = []
const callbacks = new Map<number, FrameRequestCallback>()
let nextFrame = 1
let visible = true
let reducedMotion = false
let draws = 0

const controller = createAnimationLoopController({
  isVisible: () => visible,
  isReducedMotion: () => reducedMotion,
  requestFrame: callback => {
    const id = nextFrame++
    callbacks.set(id, callback)
    return id
  },
  cancelFrame: id => {
    cancelled.push(id)
    callbacks.delete(id)
  },
  draw: () => { draws++ },
  addVisibilityListener: listener => visibilityListeners.add(listener),
  removeVisibilityListener: listener => visibilityListeners.delete(listener),
  addMotionListener: listener => motionListeners.add(listener),
  removeMotionListener: listener => motionListeners.delete(listener),
})

assert.equal(callbacks.size, 1)
const firstFrame = callbacks.keys().next().value as number
const firstCallback = callbacks.get(firstFrame)
callbacks.delete(firstFrame)
firstCallback?.(0)
assert.equal(draws, 1)
assert.equal(callbacks.size, 1)

visible = false
visibilityListeners.forEach(listener => listener())
assert.deepEqual(cancelled, [2])
assert.equal(callbacks.size, 0)

visible = true
visibilityListeners.forEach(listener => listener())
assert.equal(callbacks.size, 1)
visibilityListeners.forEach(listener => listener())
assert.equal(callbacks.size, 1)

reducedMotion = true
motionListeners.forEach(listener => listener())
assert.equal(callbacks.size, 0)

reducedMotion = false
motionListeners.forEach(listener => listener())
assert.equal(callbacks.size, 1)

controller.cleanup()
assert.equal(callbacks.size, 0)
assert.equal(visibilityListeners.size, 0)
assert.equal(motionListeners.size, 0)
assert.equal(cancelled.length, 3)

console.log('AnimatedBackground animation-loop tests passed')
