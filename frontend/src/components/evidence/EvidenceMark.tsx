import { CircleHelp, Database, FileCheck2, PencilLine } from 'lucide-react'
import type { Evidence } from '../../data/distributorDemo'
import { formatDateTime } from '../../lib/istTime'

export function EvidenceMark({ evidence }: { evidence: Evidence | null }) {
  if (!evidence) return <span className="evidence-mark evidence-unknown"><CircleHelp aria-hidden="true" size={12} /> Unknown</span>
  if (evidence.kind === 'document') {
    return <span className="evidence-mark evidence-document" title={`${evidence.source} · ${formatDateTime(evidence.recordedAt)}`}><FileCheck2 aria-hidden="true" size={12} /> Verified by document</span>
  }
  if (evidence.kind === 'manual') {
    return <span className="evidence-mark evidence-manual" title={`Typed in ${formatDateTime(evidence.recordedAt)}`}><PencilLine aria-hidden="true" size={12} /> Unverified · entered manually</span>
  }
  return <span className="evidence-mark evidence-sample"><Database aria-hidden="true" size={12} /> Sample data</span>
}
