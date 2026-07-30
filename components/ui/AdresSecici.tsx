"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { getIlceler, getIller, getMahalleler } from "@/lib/turkiye-adres"

const selectClass =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-input-bg px-2.5 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"

const ILLER = getIller()

type AdresSeciciProps = {
  prefix?: string
  defaultIl?: string | null
  defaultIlce?: string | null
  defaultMahalle?: string | null
  disabled?: boolean
  className?: string
}

function AdresSecici({
  prefix = "adres",
  defaultIl,
  defaultIlce,
  defaultMahalle,
  disabled,
  className,
}: AdresSeciciProps) {
  const [il, setIl] = React.useState(defaultIl ?? "")
  const [ilce, setIlce] = React.useState(defaultIlce ?? "")
  const [mahalle, setMahalle] = React.useState(defaultMahalle ?? "")

  const ilceler = React.useMemo(() => (il ? getIlceler(il) : []), [il])
  const mahalleler = React.useMemo(
    () => (il && ilce ? getMahalleler(il, ilce) : []),
    [il, ilce]
  )

  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-3", className)}>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}_il`}>İl</Label>
        <select
          id={`${prefix}_il`}
          name={`${prefix}_il`}
          value={il}
          disabled={disabled}
          onChange={(e) => {
            setIl(e.target.value)
            setIlce("")
            setMahalle("")
          }}
          className={selectClass}
        >
          <option value="">Seçiniz</option>
          {ILLER.map((ilAdi) => (
            <option key={ilAdi} value={ilAdi}>
              {ilAdi}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}_ilce`}>İlçe</Label>
        <select
          id={`${prefix}_ilce`}
          name={`${prefix}_ilce`}
          value={ilce}
          disabled={disabled || !il}
          onChange={(e) => {
            setIlce(e.target.value)
            setMahalle("")
          }}
          className={selectClass}
        >
          <option value="">Seçiniz</option>
          {ilceler.map((ilceAdi) => (
            <option key={ilceAdi} value={ilceAdi}>
              {ilceAdi}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}_mahalle`}>Mahalle</Label>
        <select
          id={`${prefix}_mahalle`}
          name={`${prefix}_mahalle`}
          value={mahalle}
          disabled={disabled || !ilce}
          onChange={(e) => setMahalle(e.target.value)}
          className={selectClass}
        >
          <option value="">Seçiniz</option>
          {mahalleler.map((mahalleAdi) => (
            <option key={mahalleAdi} value={mahalleAdi}>
              {mahalleAdi}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

export { AdresSecici }
