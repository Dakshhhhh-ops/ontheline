import { HashRouter, Route, Routes } from 'react-router-dom'
import { ChainProvider } from '@/context/ChainContext'
import { Layout } from '@/components/Layout'
import Home from '@/pages/Home'
import NewPledge from '@/pages/NewPledge'
import PledgePage from '@/pages/PledgePage'
import Dashboard from '@/pages/Dashboard'

export default function App() {
  return (
    <HashRouter>
      <ChainProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="new" element={<NewPledge />} />
            <Route path="p/:id" element={<PledgePage />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      </ChainProvider>
    </HashRouter>
  )
}
