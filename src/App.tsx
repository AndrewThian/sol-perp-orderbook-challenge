import { ConnectionStatus } from '@/components/ConnectionStatus'
import { SpreadRow } from '@/components/SpreadRow'
import './styles/orderbook.css'

function App() {
  return (
    <div className="orderbook-panel">
      <ConnectionStatus />
      <SpreadRow />
    </div>
  )
}

export default App
