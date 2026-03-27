import { useFinanceStore, selectExpenseAutopsy, CATEGORY_TYPE } from '../store/financeStore'

// ─── Context serializer ───────────────────────────────────────────────────────

export function buildFinancialContext() {
  const { transactions, goals, savingsBalance } = useFinanceStore.getState()

  const currentMonth = new Date().toISOString().slice(0, 7)
  const autopsy = selectExpenseAutopsy(transactions, currentMonth)

  // Income this month
  const income = transactions
    .filter(t => t.type === 'income' && t.date.startsWith(currentMonth))
    .reduce((s, t) => s + (t.usdAmount ?? t.amount), 0)

  // Last 3 months of optional spending per category (for trend context)
  const d = new Date()
  const months = [
    new Date(d.getFullYear(), d.getMonth() - 2, 1).toISOString().slice(0, 7),
    new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 7),
    currentMonth
  ]

  const optionalTrend = autopsy.categories
    .filter(c => c.type === 'optional')
    .map(c => {
      const history = months.map(m => ({
        month: m,
        amount: transactions
          .filter(t => t.category === c.category && t.date.startsWith(m) && t.type === 'expense')
          .reduce((s, t) => s + (t.usdAmount ?? t.amount), 0),
      }))
      return { category: c.category, history }
    })

  // Active goals summary
  const goalsSummary = goals.map(g => ({
    name: g.title,
    target: g.targetAmount,
    saved: g.currentAmount,
    monthlyContribution: g.monthlyContribution,
    deadline: g.deadline,
    pctComplete: Math.round((g.currentAmount / g.targetAmount) * 100),
    type: g.type || 'savings',
    isShared: !!g.isShared,
    members: g.members || [],
  }))

  return {
    currentMonth,
    income,
    totalExpenses: autopsy.totalExpenses,
    netSavings: income - autopsy.totalExpenses,
    savingsRate: income > 0
      ? Math.round(((income - autopsy.totalExpenses) / income) * 100)
      : 0,
    savingsBalance,
    essential: autopsy.essentialTotal,
    optional: autopsy.optionalTotal,
    categories: autopsy.categories,
    optionalTrend,
    goals: goalsSummary,
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

export function buildSystemPrompt(ctx: ReturnType<typeof buildFinancialContext>) {
  return `You are a direct, numbers-first financial coach embedded in FinTrack.
Your job is to help the user cut unnecessary spending and redirect savings toward their goals.

RULES:
- Always cite exact dollar amounts and percentages from the data below.
- Rank recommendations by impact (largest saving first).
- Be specific: say "cut dining from $710 to $400" not "spend less on dining".
- When you suggest a cut, also say what goal it would accelerate and by how much.
- Do not suggest cutting essential categories (Rent, Utilities, Healthcare, Transport, Groceries).
- Never give generic advice. Every sentence must reference the user's actual numbers.
- If the user asks you to apply a change, respond with a JSON action block (see format below).
- When asked to create a SHARED goal or budget, include the "members" array (emails) and set "isShared": true.
- If the user specifies a spending limit rather than a saving target, set "type": "budget".

JSON ACTION FORMAT (use when user confirms a change):
\`\`\`json
{ 
  "action": "createGoal", 
  "goal": {
    "title": "...",
    "targetAmount": 1000,
    "deadline": "YYYY-MM-DD",
    "type": "savings",
    "isShared": true,
    "members": [{ "email": "friend@email.com", "status": "invited" }]
  }
}
\`\`\`
or
\`\`\`json
{ "action": "updateGoalContribution", "goalId": "abc123", "newMonthlyAmount": 150 }
\`\`\`

─── USER'S FINANCIAL SNAPSHOT (${ctx.currentMonth}) ───
Monthly income:    $${ctx.income.toLocaleString()}
Total expenses:    $${ctx.totalExpenses.toLocaleString()}
Net savings:       $${ctx.netSavings.toLocaleString()}
Savings rate:      ${ctx.savingsRate}%
Savings balance:   $${ctx.savingsBalance.toLocaleString()}

ESSENTIAL spending: $${ctx.essential.toLocaleString()}
OPTIONAL spending:  $${ctx.optional.toLocaleString()}

CATEGORY BREAKDOWN (optional only, sorted by amount):
${ctx.categories
  .filter(c => c.type === 'optional')
  .map(c => `  ${c.category.padEnd(16)} $${c.amount.toLocaleString().padStart(6)}  ${
    c.momDelta !== null
      ? (c.momDelta > 0 ? `▲ +${c.momDelta.toFixed(0)}%` : `▼ ${c.momDelta.toFixed(0)}%`)
      : 'no prior data'
  }`)
  .join('\n')}

3-MONTH OPTIONAL TREND:
${ctx.optionalTrend
  .map(c => `  ${c.category}: ${c.history.map(h => `$${h.amount}`).join(' → ')}`)
  .join('\n')}

ACTIVE GOALS:
${ctx.goals
  .map(g => `  "${g.name}" — $${g.saved}/$${g.target} (${g.pctComplete}%), needs $${g.monthlyContribution}/mo, deadline ${g.deadline}`)
  .join('\n')}
───────────────────────────────────────────────`
}
