import app from './index'

// The Express app is assembled as a configured singleton in ./index. The
// parity suite (and any other caller that wants to mount the app on its own
// HTTP server) expects a factory, so expose one that returns that app without
// starting a listener.
export function createApp() {
  return app
}

export default app
