import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-60 min-h-screen">
        <div className="p-6 max-w-screen-2xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
