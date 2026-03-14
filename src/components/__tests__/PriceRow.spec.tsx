import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import React from 'react'
import { PriceRow } from '../PriceRow'

describe('PriceRow', () => {
  const defaultProps = {
    price: 123.456,
    size: 45.789,
    total: 100.123,
    depthRatio: 0.65,
    side: 'bid' as const,
  }

  it('renders price, size, total with toFixed(2) formatting', () => {
    render(<PriceRow {...defaultProps} />)

    expect(screen.getByText('123.46')).toBeInTheDocument()
    expect(screen.getByText('45.79')).toBeInTheDocument()
    expect(screen.getByText('100.12')).toBeInTheDocument()
  })

  it('applies price--bid class for bid side', () => {
    render(<PriceRow {...defaultProps} side="bid" />)

    const priceEl = screen.getByText('123.46')
    expect(priceEl).toHaveClass('price--bid')
  })

  it('applies price--ask class for ask side', () => {
    render(<PriceRow {...defaultProps} side="ask" />)

    const priceEl = screen.getByText('123.46')
    expect(priceEl).toHaveClass('price--ask')
  })

  it('sets --depth CSS custom property on .price-row element', () => {
    const { container } = render(<PriceRow {...defaultProps} />)

    const row = container.querySelector('.price-row') as HTMLElement
    expect(row).toBeTruthy()
    expect(row.style.getPropertyValue('--depth')).toBe('0.65')
  })

  it('renders depth-bar--bid div for bid side', () => {
    const { container } = render(<PriceRow {...defaultProps} side="bid" />)

    expect(container.querySelector('.depth-bar--bid')).toBeTruthy()
    expect(container.querySelector('.depth-bar--ask')).toBeNull()
  })

  it('renders depth-bar--ask div for ask side', () => {
    const { container } = render(<PriceRow {...defaultProps} side="ask" />)

    expect(container.querySelector('.depth-bar--ask')).toBeTruthy()
    expect(container.querySelector('.depth-bar--bid')).toBeNull()
  })

  it('is wrapped in React.memo', () => {
    // React.memo wraps the component, which changes its type
    expect((PriceRow as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.memo'),
    )
  })
})
