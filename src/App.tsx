import { useState } from "react"
import ruleset from "./rulesets/skills_powers.ruleset.json"
import { addTransaction, computeTotal } from "./rules-engine/cpLedger"
import type { CpLedger } from "./rules-engine/cpLedger"

export default function App() {
  const [ledger, setLedger] = useState<CpLedger>([
    {
      id: "base_pool",
      amount: ruleset.cp.basePool,
      reason: "Base Character Point Pool"
    }
  ])

  const total = computeTotal(ledger)

  return (
    <div style={{ padding: "40px", fontFamily: "serif" }}>
      <h1>{ruleset.meta.name}</h1>
      <h2>Total CP: {total}</h2>

      <button
        onClick={() =>
          setLedger(
            addTransaction(ledger, {
              id: crypto.randomUUID(),
              amount: -5,
              reason: "Test Cost"
            })
          )
        }
      >
        Spend 5 CP
      </button>

      <ul>
        {ledger.map(tx => (
          <li key={tx.id}>
            {tx.reason}: {tx.amount}
          </li>
        ))}
      </ul>
    </div>
  )
}