import type { Exposure } from '../api'
import { EXPOSURE_HELP, EXPOSURE_SHORT_LABEL, EXPOSURE_SYMBOL } from '../exposure'

/** A status as a word, a symbol and a color: never color alone. */
export function ExposureBadge({ exposure }: { exposure: Exposure }) {
  return (
    <span className={`badge badge-${exposure}`} title={EXPOSURE_HELP[exposure]}>
      <span aria-hidden="true" className="badge-symbol">
        {EXPOSURE_SYMBOL[exposure]}
      </span>
      {EXPOSURE_SHORT_LABEL[exposure]}
    </span>
  )
}
