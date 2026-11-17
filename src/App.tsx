import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react'
import Shell from './components/Shell'
import Home from './pages/Home'
import { db, seedIfEmpty } from './lib/db'
import { registerCustom } from './lib/exercises'
import ErrorBoundary from './components/ErrorBoundary'
import LockGate from './components/LockScreen'
import { useSettings } from './lib/store'

const TrainHome = lazy(() => import('./pages/Train').then((m) => ({ default: m.TrainHome })))
const Builder = lazy(() => import('./pages/Train').then((m) => ({ default: m.Builder })))
const Library = lazy(() => import('./pages/Train').then((m) => ({ default: m.Library })))
const Session = lazy(() => import('./pages/Session'))
const Nutrition = lazy(() => import('./pages/Nutrition'))
const Progress = lazy(() => import('./pages/Progress'))
const Settings = lazy(() => import('./pages/Settings'))
const Ai = lazy(() => import('./pages/Ai'))
const Onboarding = lazy(() => import('./pages/Onboarding'))

export default function App() {
  const onboarded = useSettings((s) => s.onboarded)
  const [ready, setReady] = useState(false)
  const [dbError, setDbError] = useState<string | null>(null)
  useEffect(() => {
    // Opening the DB runs migrations. A failure keeps old data and shows a recovery screen.
    db.open()
      .then(async () => { (await db.customExercises.toArray()).forEach(registerCustom); await seedIfEmpty() })
      .catch((e: Error) => setDbError(e.name === 'UpgradeError' || e.name === 'VersionError' ? 'Updating your local data failed. Your existing data was left untouched. Export it now, then reload.' : "Local storage isn't available here (private browsing can cause this). Pulse can't save data in this mode."))
      .finally(() => setReady(true))
  }, [])
  if (!ready) return null
  if (dbError) return <ErrorBoundary message={dbError}><></></ErrorBoundary>
  return (
    <ErrorBoundary>
    <LockGate>
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict={false}>
        <BrowserRouter basename={new URL(import.meta.env.BASE_URL, location.origin).pathname.replace(/\/$/, '')}>
          <Suspense fallback={<div className="min-h-dvh" aria-busy />}>
            <Routes>
              <Route path="/welcome" element={<Onboarding />} />
              <Route element={onboarded ? <Shell /> : <Navigate to="/welcome" replace />}>
                <Route index element={<Home />} />
                <Route path="train" element={<TrainHome />} />
                <Route path="train/build" element={<Builder />} />
                <Route path="train/library" element={<Library />} />
                <Route path="session" element={<Session />} />
                <Route path="nutrition" element={<Nutrition />} />
                <Route path="progress" element={<Progress />} />
                <Route path="settings" element={<Settings />} />
                <Route path="ai" element={<Ai />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </LazyMotion>
    </MotionConfig>
    </LockGate>
    </ErrorBoundary>
  )
}
