export function generateSku(params: {
  name: string
  brand?: string | null
  category?: string | null
}): string {
  const clean = (s: string, len: number) =>
    s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, len).padEnd(len, 'X')

  const part1 = clean(params.brand ?? params.name, 3)
  const part2 = clean(params.category ?? params.name.slice(3), 3)
  const rand = Math.floor(1000 + Math.random() * 9000).toString()

  return `${part1}-${part2}-${rand}`
}
