import { useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { ConfirmDialog } from '../components/ui'
import { OverviewTab } from '../finance/OverviewTab'
import { InvestmentsTab } from '../finance/InvestmentsTab'
import { BudgetTab } from '../finance/BudgetTab'
import { BillsTab } from '../finance/BillsTab'
import { VendorsSheet } from '../finance/VendorsSheet'
import { TransactionEditor } from '../finance/TransactionEditor'
import { BalanceAdjustModal } from '../finance/BalanceAdjustModal'
import { computeBalance } from '../finance/balance'
import { OPENING_BALANCE } from '../mockData'
import { parseCsv } from '../finance/csvImport'
import type { Domain, Transaction } from '../types'
import { Wallet, Upload, Sparkles, Settings2 } from 'lucide-react'

type Tab = 'overzicht' | 'beleggingen' | 'budget' | 'tebetalen'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overzicht', label: 'Overzicht' },
  { id: 'beleggingen', label: 'Beleggingen' },
  { id: 'budget', label: 'Budget' },
  { id: 'tebetalen', label: 'Te betalen' },
]

export default function Money() {
  const {
    transactions,
    goals,
    payments,
    subscriptions,
    holdings,
    balanceCheckpoints,
    vendorTags,
    stockQuotes,
    fx,
    loadingQuotes,
    financeCoach,
    financeCoachLoading,
    importTransactions,
    markPaymentPaid,
    addPayment,
    deletePayment,
    deleteTransaction,
    updateTransaction,
    autoTagTransactions,
    setVendorTag,
    deleteVendorTag,
    addSubscription,
    toggleSubscription,
    deleteSubscription,
    addHolding,
    deleteHolding,
    refreshStockQuotes,
    addBalanceCheckpoint,
    refreshFinanceCoach,
    addGoal,
    updateGoal,
    deleteGoal,
  } = useStore()

  const fileRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>('overzicht')
  const [filter, setFilter] = useState<Domain | 'all'>('all')
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [tagging, setTagging] = useState(false)
  const [confirmDeleteTx, setConfirmDeleteTx] = useState(false)
  const [showVendors, setShowVendors] = useState(false)
  const [showBalanceAdjust, setShowBalanceAdjust] = useState(false)

  const untagged = useMemo(
    () => transactions.filter((t) => /^(other|uncategorized|uncategorised|onbekend|)$/i.test(t.category.trim())).length,
    [transactions],
  )
  const openCount = useMemo(() => payments.filter((p) => p.status === 'open').length, [payments])
  const { balance } = useMemo(
    () => computeBalance(transactions, balanceCheckpoints, OPENING_BALANCE),
    [transactions, balanceCheckpoints],
  )

  const runAutoTag = async () => {
    setTagging(true)
    try {
      await autoTagTransactions()
    } finally {
      setTagging(false)
    }
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    f.text().then(async (txt) => {
      const txns = parseCsv(txt)
      if (!txns.length) {
        alert('Geen herkenbare transacties gevonden in dit bestand.')
        return
      }
      const { inserted, duplicates } = await importTransactions(txns)
      alert(`${inserted} transactie(s) geïmporteerd` + (duplicates ? `, ${duplicates} al bekend (overgeslagen).` : '.'))
    })
    e.target.value = ''
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Wallet className="h-5 w-5 text-buurtkaart" /> Geld
        </h1>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setShowVendors(true)} title="Vendor-geheugen beheren">
            <Settings2 className="h-4 w-4" /> Beheer
          </button>
          <button
            className="btn-ghost"
            onClick={runAutoTag}
            disabled={tagging}
            title="Laat HEYRA (Haiku) onbekende winkeliers opzoeken en categoriseren"
          >
            <Sparkles className={`h-4 w-4 ${tagging ? 'animate-pulse' : ''}`} />
            {tagging ? 'Bezig…' : `Auto-tag${untagged ? ` (${untagged})` : ''}`}
          </button>
          <button className="btn-primary" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4" /> Importeer CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt,.tab" hidden onChange={onFile} />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
              {t.id === 'tebetalen' && openCount > 0 && <span className="ml-1.5 text-xs text-faint">{openCount}</span>}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overzicht" className="mt-6">
          <OverviewTab
            transactions={transactions}
            payments={payments}
            balanceCheckpoints={balanceCheckpoints}
            filter={filter}
            onFilterChange={setFilter}
            onEditTransaction={setEditing}
            onAdjustBalance={() => setShowBalanceAdjust(true)}
          />
        </TabsContent>

        <TabsContent value="beleggingen" className="mt-6">
          <InvestmentsTab
            holdings={holdings}
            quotes={stockQuotes}
            fx={fx}
            loading={loadingQuotes}
            onAdd={addHolding}
            onDelete={deleteHolding}
            onRefresh={refreshStockQuotes}
          />
        </TabsContent>

        <TabsContent value="budget" className="mt-6">
          <BudgetTab
            goals={goals}
            onAddGoal={addGoal}
            onUpdateGoal={updateGoal}
            onDeleteGoal={deleteGoal}
            coach={financeCoach}
            coachLoading={financeCoachLoading}
            onRefreshCoach={refreshFinanceCoach}
          />
        </TabsContent>

        <TabsContent value="tebetalen" className="mt-6">
          <BillsTab
            payments={payments}
            subscriptions={subscriptions}
            onAddPayment={addPayment}
            onMarkPaid={markPaymentPaid}
            onDeletePayment={deletePayment}
            onAddSubscription={addSubscription}
            onToggleSubscription={toggleSubscription}
            onDeleteSubscription={deleteSubscription}
          />
        </TabsContent>
      </Tabs>

      {editing && (
        <TransactionEditor
          tx={editing}
          onClose={() => { setEditing(null); setConfirmDeleteTx(false) }}
          onSave={(patch, learnVendor) => {
            updateTransaction(editing.id, patch, { learnVendor })
            setEditing(null)
          }}
          onDelete={() => setConfirmDeleteTx(true)}
        />
      )}

      {editing && confirmDeleteTx && (
        <ConfirmDialog
          title={`Transactie "${editing.merchant}" verwijderen?`}
          onCancel={() => setConfirmDeleteTx(false)}
          onConfirm={() => {
            deleteTransaction(editing.id)
            setConfirmDeleteTx(false)
            setEditing(null)
          }}
        />
      )}

      {showVendors && (
        <VendorsSheet
          vendorTags={vendorTags}
          untagged={untagged}
          tagging={tagging}
          onAutoTag={runAutoTag}
          onSave={(key, patch) => setVendorTag(key, patch, { reapply: true })}
          onDelete={deleteVendorTag}
          onClose={() => setShowVendors(false)}
        />
      )}

      {showBalanceAdjust && (
        <BalanceAdjustModal
          currentBalance={balance}
          onClose={() => setShowBalanceAdjust(false)}
          onSave={(amount, asOf, note) => {
            addBalanceCheckpoint(amount, asOf, note)
            setShowBalanceAdjust(false)
          }}
        />
      )}
    </div>
  )
}
