import { ImageResponse } from 'next/og'

export async function GET() {
  return new ImageResponse(<div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f2c43d', color: '#252833', fontSize: 310, fontWeight: 800, fontFamily: 'sans-serif' }}>V</div>, { width: 512, height: 512 })
}
