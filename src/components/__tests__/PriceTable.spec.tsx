import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PriceTable } from '../PriceTable'
import type { DisplayLevel } from '../../hooks/useOrderBook'

const levels: DisplayLevel[] = [
  { price: 100.0, size: 10, total: 10, depthRatio: 0.25 },
  { price: 99.5, size: 20, total: 30, depthRatio: 0.75 },
  { price: 99.0, size: 10, total: 40, depthRatio: 1.0 },
]

describe('PriceTable', () => {
  it('renders the correct number of PriceRow children', () => {
    const { container } = render(<PriceTable levels={levels} side="bid" />)

    const rows = container.querySelectorAll('.price-row')
    expect(rows).toHaveLength(3)
  })

  it('applies price-table--bid class for bid side', () => {
    const { container } = render(<PriceTable levels={levels} side="bid" />)

    const table = container.querySelector('.price-table')
    expect(table).toHaveClass('price-table--bid')
  })

  it('applies price-table--ask class for ask side', () => {
    const { container } = render(<PriceTable levels={levels} side="ask" />)

    const table = container.querySelector('.price-table')
    expect(table).toHaveClass('price-table--ask')
  })

  it('renders unique price values from each level', () => {
    render(<PriceTable levels={levels} side="bid" />)

    expect(screen.getByText('100.00')).toBeInTheDocument()
    expect(screen.getByText('99.50')).toBeInTheDocument()
    expect(screen.getByText('99.00')).toBeInTheDocument()
  })

  it('passes side prop through to each PriceRow', () => {
    const { container } = render(<PriceTable levels={levels} side="bid" />)

    const bidPrices = container.querySelectorAll('.price--bid')
    expect(bidPrices).toHaveLength(3)
    expect(container.querySelectorAll('.price--ask')).toHaveLength(0)
  })

  it('renders nothing when levels is empty', () => {
    const { container } = render(<PriceTable levels={[]} side="bid" />)

    const table = container.querySelector('.price-table')
    expect(table).toBeTruthy()
    expect(container.querySelectorAll('.price-row')).toHaveLength(0)
  })
})
