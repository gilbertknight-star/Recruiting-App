import { createContext, useContext, useEffect, useRef } from 'react'

// Pages stay mounted while you move between tabs, so this tells a page whether it's the one on screen
export const PageActive = createContext(true)

// Runs fn each time the page comes back on screen (not on first open), e.g. to pick up contacts added elsewhere
export function useWhenShown(fn) {
  const active = useContext(PageActive)
  const wasActive = useRef(active)
  useEffect(() => {
    if (active && !wasActive.current) fn()
    wasActive.current = active
  }, [active])
}
