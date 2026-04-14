import { useFinanceStore, selectExpenseAutopsy, selectBudgetStatuses, CATEGORY_TYPE } from '../store/financeStore'
import type { UserKnowledgeBase } from './userKnowledgeBase'
import FINANCIAL_EXPERT_SKILL from '../../.agents/skills/financial-operations-expert/SKILL.md?raw'

// ─── Local date helpers (system timezone, not UTC) ────────────────────────────
const _localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const _localMonth = (d = new Date()) => _localDate(d).slice(0, 7)

// ─── Context serializer ───────────────────────────────────────────────────────

export function buildFinancialContext() {
  const { transactions, goals, savingsBalance, budgets } = useFinanceStore.getState()

  // Use the most recent month with actual data, not the real calendar month.
  // This prevents empty snapshots when the user hasn't added transactions yet
  // for the current calendar month (e.g. April 2026 with no April data).
  const allMonthsWithData = Array.from(
    new Set(transactions.map(t => t.date.slice(0, 7)))
  ).sort().reverse()
  const currentMonth = allMonthsWithData[0] || _localMonth()

  const autopsy = selectExpenseAutopsy(transactions, currentMonth)

  // Income this month
  const income = transactions
    .filter(t => t.type === 'income' && t.date.startsWith(currentMonth))
    .reduce((s, t) => s + (t.usdAmount ?? t.amount), 0)

  // Last 3 months of optional spending per category (for trend context)
  // Anchor to the most recent data month, not the calendar month.
  const [year, month] = currentMonth.split('-').map(Number)
  const months = [
    _localMonth(new Date(year, month - 3, 1)),
    _localMonth(new Date(year, month - 2, 1)),
    currentMonth,
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

  // Budget statuses for current month (income adjusted for savings-goal contributions)
  const totalGoalSavings = goals.reduce((s, g) => s + g.monthlyContribution, 0);
  const adjustedIncome = Math.max(income - totalGoalSavings, 0);
  const currentMonthBudgets = budgets.filter(b => b.month === currentMonth);
  const budgetStatuses = selectBudgetStatuses(currentMonthBudgets, transactions, adjustedIncome, currentMonth)
  const budgetsSummary = budgetStatuses.map(bs => ({
    category: bs.category,
    limitAmount: bs.limitAmount,
    spent: bs.spent,
    remaining: bs.remaining,
    percentageUsed: Math.round(bs.percentageUsed),
    status: bs.status,
    dailyAllowance: Math.round(bs.dailyAllowance),
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
    budgets: budgetsSummary,
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildKnowledgeBaseSection(kb: UserKnowledgeBase): string {
  const lines: string[] = ['─── USER KNOWLEDGE BASE ───'];

  const pf = kb.personalFacts;
  const pfParts: string[] = [];
  if (pf.city)                pfParts.push(`City: ${pf.city}`);
  if (pf.age)                 pfParts.push(`Age: ${pf.age}`);
  if (pf.employmentType)      pfParts.push(`Employment: ${pf.employmentType}`);
  if (pf.dependents !== undefined) pfParts.push(`Dependents: ${pf.dependents}`);
  if (pf.riskTolerance)       pfParts.push(`Risk Tolerance: ${pf.riskTolerance}`);
  if (pf.hasEmergencyFund !== undefined) pfParts.push(`Emergency Fund: ${pf.hasEmergencyFund ? 'Yes' : 'No'}`);
  if (pf.hasInvestments !== undefined)   pfParts.push(`Has Investments: ${pf.hasInvestments ? 'Yes' : 'No'}`);
  if (pf.primaryFinancialGoal) pfParts.push(`Primary Goal: ${pf.primaryFinancialGoal}`);
  if (pfParts.length > 0) lines.push('Personal: ' + pfParts.join(' | '));

  const sp = kb.spendingPersonality;
  if (sp.labels.length > 0) lines.push(`Spending Labels: ${sp.labels.join(', ')}`);
  if (sp.topCategories.length > 0) lines.push(`Top Categories: ${sp.topCategories.join(', ')}`);
  if (sp.averageMonthlyExpenses > 0)
    lines.push(`Avg Monthly: income $${sp.averageMonthlyIncome.toLocaleString()} / expenses $${sp.averageMonthlyExpenses.toLocaleString()} / savings ${sp.savingsConsistency}`);

  const prefs = kb.preferences;
  lines.push(`Preferences: response=${prefs.responseStyle}, focus=${prefs.focusArea}`);

  const activeGoals = kb.statedGoals.filter(g => g.status !== 'dismissed');
  if (activeGoals.length > 0) {
    lines.push('Mentioned Goals: ' + activeGoals.map(g => `"${g.description}" [${g.status}]`).join(', '));
  }

  const recentNotes = kb.aiNotes.slice(-5);
  if (recentNotes.length > 0) {
    lines.push('AI Notes:');
    recentNotes.forEach(n => lines.push(`  [${n.category}] ${n.note}`));
  }

  lines.push('──────────────────────────────────────────────');
  return lines.join('\n');
}

export function buildSystemPrompt(ctx: ReturnType<typeof buildFinancialContext>, kb?: UserKnowledgeBase | null) {
  const kbSection = kb ? buildKnowledgeBaseSection(kb) : '';
  // Strip YAML frontmatter from the skill file before injecting
  const skillInstructions = FINANCIAL_EXPERT_SKILL.replace(/^---[\s\S]*?---\n/, '').trim();
  return `${skillInstructions}

---

You are a direct, numbers-first financial coach embedded in FinTrack.
Your job is to help the user cut unnecessary spending and redirect savings toward their goals.

RULES:
- Always cite exact dollar amounts and percentages from the data below.
- Rank recommendations by impact (largest saving first).
- Be specific: say "cut dining from $710 to $400" not "spend less on dining".
- When you suggest a cut, also say what goal it would accelerate and by how much.
- Do not suggest cutting essential categories (Rent, Utilities, Healthcare, Transport, Groceries).
- Never give generic advice. Every sentence must reference the user's actual numbers.
- NEVER introduce yourself mid-conversation or add disclaimers like "Just a quick note" or "I'm FinTrack AI". Get straight to the point.
- NEVER add legal/financial disclaimers. You are a personal finance tool, not a regulated advisor.
- If the user asks you to apply a change, respond with a JSON action block (see format below).
- When asked to create a SHARED goal or budget, include the "members" array (emails) and set "isShared": true.
- If the user specifies a spending limit rather than a saving target, set "type": "budget".

REPORT & ANALYSIS FORMAT (MANDATORY when user asks for analysis, report, summary, or breakdown):
When the user asks for any analysis, report, summary, or expense breakdown, follow this structure:

1. Lead with a 1-2 sentence key insight (most important finding).
2. Use a Markdown table for multi-row data:
   | Category | Amount | % of Total | vs Last Month |
   |---|---|---|---|
   | Food | $450 | 18% | ▲ +12% |
3. Add an ASCII bar chart using █ (filled) and ░ (empty), 16 chars wide, scaled to largest value, sorted descending:
   \`\`\`
   Food          ████████░░░░░░░░  $450
   Rent          ████████████████  $1,800
   \`\`\`
4. Append a \`\`\`csv block with the same table data for Excel export.
5. End with 2-3 specific, dollar-amount actionable takeaways as bullet points.
For simple questions, skip tables and answer conversationally.

KNOWLEDGE BASE UPDATE (SILENT — only when you learn something new about the user):
When the user shares a personal fact (city, age, employment, dependents, risk tolerance, etc.), a preference (brief/detailed, focus area), a concern, or an insight, append a silent JSON block at the VERY END with:
{ "kb_update": { "personalFacts": {}, "preferences": {}, "aiNotes": [], "statedGoals": [], "adviceHistory": [] } }
Only include the fields that changed. Never mention this block.

GOAL CREATION WORKFLOW (MANDATORY — follow all steps in order):

STEP 1 — Detect goal intent: When the user expresses intent to save for something (car, trip, house, emergency fund, gadget, debt payoff, investment, etc.), identify the goal type and ask targeted questions. Do NOT create the goal yet.

STEP 2 — Ask the RIGHT questions for the goal type (all in one message):
- Vehicle: price, cash vs loan (downpayment?), deadline, monthly savings capacity
- Travel: destination, duration, estimated budget (flights/hotel/activities), travel date, monthly savings
- House/Property: target property value, downpayment % goal, timeline
- Emergency Fund: how many months to cover, confirm estimated monthly expenses (~$X/mo from snapshot)
- Gadget/Purchase: item + cost, target date, monthly savings capacity
- Debt Payoff: total debt, interest rate, current minimum payment, target payoff speed
- Investments: target amount, time horizon, risk appetite, monthly contribution
- Other: target amount, deadline, monthly contribution

STEP 3 — Propose with numbers (after user answers):
Calculate whether goal is achievable on their timeline using their actual income/savings data.
Suggest 3-4 meaningful milestones. Ask: "Shall I add this goal to your FinTrack dashboard?"

STEP 4 — Create goal ONLY after user confirms. Use the JSON format below (silently at end of message).

GOAL JSON FORMAT (silent, no markdown wrapper, at the very end):
{ 
  "goals": [{
    "title": "...",
    "targetAmount": 1000,
    "deadline": "YYYY-MM-DD",
    "monthlyContribution": 100,
    "milestones": [
      { "label": "25% — First milestone", "amount": 250 },
      { "label": "Halfway there!", "amount": 500 }
    ]
  }]
}

BUDGET JSON FORMAT (silent, no markdown wrapper, at the very end — emit ONLY after user confirms):
{
  "budgets": [
    { "category": "Food", "type": "fixed", "fixedAmount": 300, "alertThreshold": 80 },
    { "category": "Rent", "type": "fixed", "fixedAmount": 1200, "alertThreshold": 90 },
    { "action": "delete", "category": "Entertainment" }
  ]
}
Supported budget categories: Rent, Food, Groceries, Travel, Subscriptions, Shopping, Utilities, Healthcare, Entertainment, Education, Other
For percentage-of-income budgets: { "category": "Food", "type": "percentage", "percentage": 15, "alertThreshold": 80 }
The "month" field is added automatically by the app — do NOT include it in your JSON.
Do NOT include goal contributions as a budget line — those are handled by goals.

SPECIAL ACTIONS (silent, at the very end, one per response):
Delete a goal:         { "action": "deleteGoal", "goalTitle": "Emergency Fund" }
Log goal contribution: { "action": "logGoalContribution", "goalTitle": "Emergency Fund", "amount": 500, "date": "YYYY-MM-DD" }
Update savings balance: { "action": "updateSavingsBalance", "amount": 12000 }

RULES FOR SPECIAL ACTIONS:
- Only emit deleteGoal when the user EXPLICITLY asks to delete/remove a goal.
- Emit logGoalContribution when user says they put money INTO a goal ("I saved $X for my trip").
- Emit updateSavingsBalance when user states their current savings account balance.

JSON ACTION FORMAT (for shared goals or contribution updates — use when user confirms):
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

${kbSection}
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
${ctx.goals.length > 0
  ? ctx.goals.map(g => `  "${g.name}" — $${g.saved}/$${g.target} (${g.pctComplete}%), needs $${g.monthlyContribution}/mo, deadline ${g.deadline}`).join('\n')
  : '  No goals set up yet.'}

MONTHLY BUDGETS:
${ctx.budgets && ctx.budgets.length > 0
  ? ctx.budgets.map(b => `  ${b.category.padEnd(16)} $${(b.limitAmount ?? 0).toLocaleString()}/mo (${b.percentageUsed ?? 0}% used, ${b.status})`).join('\n')
  : '  No budgets set up yet.'}
───────────────────────────────────────────────`
}
