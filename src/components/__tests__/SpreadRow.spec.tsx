import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi } from 'vitest'
import { SpreadRow } from '../SpreadRow'

vi.mock('../../hooks/useOrderBook', () => ({
  useSpread: vi.fn(),
}))

import { useSpread } from '../../hooks/useOrderBook'

const mockedUseSpread = vi.mocked(useSpread)

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
}

describe('SpreadRow', () => {
  it('renders null when no data', () => {
    mockedUseSpread.mockReturnValue({ data: undefined } as ReturnType<
      typeof useSpread
    >)
    const { container } = renderWithClient(<SpreadRow />)
    expect(container.innerHTML).toBe('')
  })

  it('displays formatted spread values', () => {
    mockedUseSpread.mockReturnValue({
      data: { absolute: 1.5, percentage: 0.1234, bestBid: 110, bestAsk: 111.5 },
    } as ReturnType<typeof useSpread>)

    renderWithClient(<SpreadRow />)

    expect(screen.getByText('Spread')).toBeInTheDocument()
    expect(screen.getByText('1.50')).toBeInTheDocument()
    expect(screen.getByText('0.12%')).toBeInTheDocument()
  })

  it('has spread-row class', () => {
    mockedUseSpread.mockReturnValue({
      data: { absolute: 2, percentage: 1, bestBid: 100, bestAsk: 102 },
    } as ReturnType<typeof useSpread>)

    renderWithClient(<SpreadRow />)

    const row = screen.getByText('Spread').closest('.spread-row')
    expect(row).toBeInTheDocument()
  })

  it('uses toFixed(2) formatting', () => {
    mockedUseSpread.mockReturnValue({
      data: {
        absolute: 3.456,
        percentage: 1.789,
        bestBid: 100,
        bestAsk: 103.456,
      },
    } as ReturnType<typeof useSpread>)

    renderWithClient(<SpreadRow />)

    expect(screen.getByText('3.46')).toBeInTheDocument()
    expect(screen.getByText('1.79%')).toBeInTheDocument()
  })
})
