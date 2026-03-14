import { render, screen } from '@testing-library/react'
import { useQueryClient, QueryClientProvider, QueryClient } from '@tanstack/react-query'

function QueryClientSpy() {
  const queryClient = useQueryClient()
  return <span data-testid="qc-status">{queryClient ? 'connected' : 'missing'}</span>
}

describe('main app setup', () => {
  it('provides a QueryClient to child components', () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <QueryClientSpy />
      </QueryClientProvider>,
    )

    expect(screen.getByTestId('qc-status')).toHaveTextContent('connected')
  })

  it('throws when useQueryClient is used outside of a provider', () => {
    expect(() => render(<QueryClientSpy />)).toThrow()
  })
})
