export type CpTransaction = {
  id: string
  amount: number
  reason: string
}

export type CpLedger = CpTransaction[]

export function addTransaction(
  ledger: CpLedger,
  transaction: CpTransaction
): CpLedger {
  return [...ledger, transaction]
}

export function computeTotal(ledger: CpLedger): number {
  return ledger.reduce((sum, tx) => sum + tx.amount, 0)
}