import Image from 'next/image'
import Link from 'next/link'

export function AuthBrandLink({ label }: { label: string }) {
  return (
    <Link href="/" aria-label={label} className="inline-flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
      <Image
        src="/brand/venus-app-icon.png"
        alt=""
        width={44}
        height={44}
        priority
        className="size-11 rounded-xl border object-cover"
      />
      <span className="flex flex-col">
        <strong className="text-sm tracking-wide text-foreground">Venus</strong>
        <span className="text-sm text-muted-foreground">{label}</span>
      </span>
    </Link>
  )
}
