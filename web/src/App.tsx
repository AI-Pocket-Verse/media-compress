import { Route, Routes } from 'react-router-dom'

import { DialogProvider } from './components/Dialog'
import { Nav } from './components/Nav'
import { FilesPage } from './pages/FilesPage'
import { HomePage } from './pages/HomePage'
import { SettingsPage } from './pages/SettingsPage'

export function App() {
  return (
    <DialogProvider>
      <Nav />
      <div className="px-6 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>
    </DialogProvider>
  )
}
