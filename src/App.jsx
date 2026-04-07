import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Ads from './pages/Ads'
import Launcher from './pages/Launcher'
import Influencers from './pages/Influencers'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="ads" element={<Ads />} />
          <Route path="launcher" element={<Launcher />} />
          <Route path="influencers" element={<Influencers />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
