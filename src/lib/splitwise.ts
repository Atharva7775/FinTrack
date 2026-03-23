import type { Transaction } from "@/store/financeStore";

const SW_BASE = "/api/splitwise";

/**
 * Splitwise API client for personal API keys.
 * Since Splitwise API returns CORS errors when called from browser without proper setup,
 * we are using a Vite dev server proxy to route `/api/splitwise` -> `https://secure.splitwise.com/api/v3.0`
 */

function getSwHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };
}

export async function fetchSplitwiseUser(apiKey: string) {
  const url = `${SW_BASE}/get_current_user`;
  const res = await fetch(url, { headers: getSwHeaders(apiKey) });
  if (!res.ok) throw new Error("Failed to fetch Splitwise user");
  const data = await res.json();
  return data.user;
}

export async function fetchSplitwiseFriends(apiKey: string) {
  const url = `${SW_BASE}/get_friends`;
  const res = await fetch(url, { headers: getSwHeaders(apiKey) });
  if (!res.ok) throw new Error("Failed to fetch friends balances");
  const data = await res.json();
  return data.friends;
}

/**
 * Fetches all expenses from Splitwise, converts the user's owed_share into FinTrack transactions.
 * Excludes payments (settling up) to avoid double counting.
 */
export async function fetchAllSplitwiseExpenses(apiKey: string, currentUserId: number): Promise<Omit<Transaction, "id">[]> {
  const url = `${SW_BASE}/get_expenses?limit=0`;
  const res = await fetch(url, { headers: getSwHeaders(apiKey) });
  if (!res.ok) throw new Error("Failed to fetch Splitwise expenses");
  const data = await res.json();
  
  const expenses = data.expenses || [];
  const transactions: Omit<Transaction, "id">[] = [];

  for (const exp of expenses) {
    if (exp.deleted_at) continue; // Skip deleted
    if (exp.payment) continue;    // Skip payments/settlements

    const userShare = exp.users.find((u: any) => u.user_id === currentUserId);
    if (!userShare) continue;     // User wasn't part of this expense

    const owedShare = parseFloat(userShare.owed_share);
    // If the user's owed_share is > 0, they had an expense.
    if (owedShare > 0) {
      let category: any = "Other";
      const swCategory = exp.category?.name?.toLowerCase() || "";
      if (swCategory.includes("food") || swCategory.includes("dining") || swCategory.includes("restaurant") || swCategory.includes("groceries")) category = "Food";
      else if (swCategory.includes("flight") || swCategory.includes("hotel") || swCategory.includes("transit") || swCategory.includes("taxi")) category = "Travel";
      else if (swCategory.includes("rent")) category = "Rent";
      else if (swCategory.includes("utilities") || swCategory.includes("water") || swCategory.includes("electricity")) category = "Utilities";
      else if (swCategory.includes("entertainment") || swCategory.includes("movies") || swCategory.includes("games")) category = "Entertainment";

      const originalCurrency = exp.currency_code;
      let usdAmount = owedShare;

      if (originalCurrency !== "USD") {
        if (originalCurrency === "EUR") usdAmount = owedShare * 1.09;
        else if (originalCurrency === "GBP") usdAmount = owedShare * 1.28;
        else if (originalCurrency === "INR") usdAmount = owedShare * 0.012;
        else if (originalCurrency === "CAD") usdAmount = owedShare * 0.74;
        else if (originalCurrency === "AUD") usdAmount = owedShare * 0.65;
      }

      transactions.push({
        type: "expense",
        amount: usdAmount,
        category,
        date: exp.date.slice(0, 10),
        note: exp.description || "Splitwise Expense",
        isSplitwise: true,
        splitwiseId: exp.id,
        originalCurrency,
        originalAmount: owedShare,
        usdAmount,
        isPending: false, // The expense itself is incurred by the user
      });
    }

    // Checking for pending repayment.
    // If net_balance > 0, the user paid more than their share and is owed money back.
    const netBalance = parseFloat(userShare.net_balance);
    if (netBalance > 0) {
      const originalCurrency = exp.currency_code;
      let usdNet = netBalance;
      if (originalCurrency !== "USD") {
        if (originalCurrency === "EUR") usdNet = netBalance * 1.09;
        else if (originalCurrency === "GBP") usdNet = netBalance * 1.28;
        else if (originalCurrency === "INR") usdNet = netBalance * 0.012;
        else if (originalCurrency === "CAD") usdNet = netBalance * 0.74;
        else if (originalCurrency === "AUD") usdNet = netBalance * 0.65;
      }

      transactions.push({
        type: "income",
        amount: usdNet,
        category: "Other Income",
        date: exp.date.slice(0, 10),
        note: `Splitwise - pending repayment (${exp.description})`,
        isSplitwise: true,
        splitwiseId: exp.id + 0.1, // Hack to keep ID somewhat unique locally before the store assigns one
        originalCurrency,
        originalAmount: netBalance,
        usdAmount: usdNet,
        isPending: true, // Mark as pending repayment
      });
    }
  }

  return transactions;
}

/**
 * Calculates the user's total outstanding balances (owe vs owed) by summing the balances 
 * of all their friends, converted to USD.
 */
export async function fetchSplitwiseBalances(apiKey: string): Promise<{ owe: number; owed: number }> {
  const friends = await fetchSplitwiseFriends(apiKey);
  let owe = 0;
  let owed = 0;

  for (const f of friends) {
    if (!f.balance || !Array.isArray(f.balance)) continue;
    for (const b of f.balance) {
      const amount = parseFloat(b.amount);
      if (amount === 0 || isNaN(amount)) continue;

      const currency = b.currency_code;
      let usd = amount;
      
      if (currency !== "USD") {
        if (currency === "EUR") usd = amount * 1.09;
        else if (currency === "GBP") usd = amount * 1.28;
        else if (currency === "INR") usd = amount * 0.012;
        else if (currency === "CAD") usd = amount * 0.74;
        else if (currency === "AUD") usd = amount * 0.65;
      }

      if (usd > 0) {
        owed += usd;
      } else {
        owe += Math.abs(usd);
      }
    }
  }

  return { owe, owed };
}
