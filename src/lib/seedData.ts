/**
 * Demo seed data – Dec 2025 through Mar 2026
 * Profile: Software professional, ~$9,000/month gross income.
 * Realistic spending with healthy ~47–50 % savings rate.
 *
 * Used only in development / in-memory mode.
 * Remove this file and its import in financeStore.ts before production.
 */
import type { Transaction } from "@/store/financeStore";

let _id = 1;
const tx = (
  type: Transaction["type"],
  amount: number,
  category: Transaction["category"],
  date: string,
  note: string
): Transaction => ({ id: String(_id++), type, amount, category, date, note });

export const SEED_TRANSACTIONS: Transaction[] = [
  // ─── DECEMBER 2025 ─────────────────────────────────────────────────────────

  // Income
  tx("income", 8500,  "Salary",      "2025-12-01", "December salary"),
  tx("income", 1200,  "Freelance",   "2025-12-10", "Year-end consulting project"),
  tx("income",  250,  "Investments", "2025-12-15", "Stock dividend payout"),

  // Expenses
  tx("expense", 1800,   "Rent",          "2025-12-01", "December rent"),
  tx("expense",  105,   "Utilities",     "2025-12-02", "Electricity – heating season"),
  tx("expense",   15.99,"Subscriptions", "2025-12-03", "Netflix"),
  tx("expense",    9.99,"Subscriptions", "2025-12-03", "Spotify"),
  tx("expense",   14.99,"Subscriptions", "2025-12-03", "iCloud storage"),
  tx("expense",   45,   "Travel",        "2025-12-04", "Monthly transit pass"),
  tx("expense",   88,   "Food",          "2025-12-05", "Weekly groceries – Whole Foods"),
  tx("expense",  420,   "Shopping",      "2025-12-07", "Holiday gifts – family"),
  tx("expense",   55,   "Utilities",     "2025-12-08", "Internet bill"),
  tx("expense",   40,   "Food",          "2025-12-09", "Lunch with colleagues"),
  tx("expense",   95,   "Food",          "2025-12-12", "Weekly groceries"),
  tx("expense",  180,   "Entertainment", "2025-12-13", "Company holiday party + drinks"),
  tx("expense",  260,   "Shopping",      "2025-12-15", "Holiday gifts – friends"),
  tx("expense", 1500,   "Savings",       "2025-12-15", "Monthly savings transfer"),
  tx("expense",   92,   "Food",          "2025-12-16", "Holiday dinner groceries"),
  tx("expense",   38,   "Travel",        "2025-12-17", "Uber rides – week"),
  tx("expense",   85,   "Healthcare",    "2025-12-18", "Year-end prescription refill"),
  tx("expense",  340,   "Travel",        "2025-12-20", "Flight home for holidays"),
  tx("expense",   78,   "Food",          "2025-12-22", "Holiday groceries & baking"),
  tx("expense",   55,   "Entertainment", "2025-12-24", "Christmas Eve movie & dinner"),
  tx("expense",  110,   "Shopping",      "2025-12-26", "Post-holiday sale – clothing"),
  tx("expense",   42,   "Food",          "2025-12-27", "Weekly groceries"),
  tx("expense",   65,   "Entertainment", "2025-12-29", "New Year's Eve tickets"),
  tx("expense",   30,   "Other",         "2025-12-30", "Dry cleaning"),
  tx("expense",   48,   "Travel",        "2025-12-31", "Ride share – New Year's Eve"),

  // ─── JANUARY 2026 ──────────────────────────────────────────────────────────

  // Income
  tx("income", 8500, "Salary",      "2026-01-01", "January salary"),
  tx("income",  500, "Freelance",   "2026-01-15", "Website redesign project"),

  // Expenses
  tx("expense", 1800,   "Rent",          "2026-01-01", "January rent"),
  tx("expense",   95,   "Utilities",     "2026-01-02", "Electricity bill"),
  tx("expense",   15.99,"Subscriptions", "2026-01-03", "Netflix"),
  tx("expense",    9.99,"Subscriptions", "2026-01-03", "Spotify"),
  tx("expense",   14.99,"Subscriptions", "2026-01-03", "iCloud storage"),
  tx("expense",   45,   "Travel",        "2026-01-06", "Monthly transit pass"),
  tx("expense",   85,   "Food",          "2026-01-06", "Weekly groceries – Whole Foods"),
  tx("expense",   60,   "Healthcare",    "2026-01-08", "Pharmacy – vitamins & supplements"),
  tx("expense",   32,   "Food",          "2026-01-10", "Lunch takeout"),
  tx("expense",   65,   "Entertainment", "2026-01-11", "Movie night + dinner with friends"),
  tx("expense",  120,   "Shopping",      "2026-01-12", "Winter jacket sale"),
  tx("expense", 1500,   "Savings",       "2026-01-15", "Monthly savings transfer"),
  tx("expense",   80,   "Food",          "2026-01-14", "Weekly groceries"),
  tx("expense",   42,   "Food",          "2026-01-18", "Weekend brunch"),
  tx("expense",   28,   "Travel",        "2026-01-19", "Uber rides – week"),
  tx("expense",  199,   "Education",     "2026-01-20", "Udemy – AWS certification course"),
  tx("expense",   55,   "Utilities",     "2026-01-22", "Internet bill"),
  tx("expense",   88,   "Food",          "2026-01-21", "Weekly groceries"),
  tx("expense",   40,   "Entertainment", "2026-01-24", "Concert tickets"),
  tx("expense",   75,   "Shopping",      "2026-01-25", "Home essentials – Amazon"),
  tx("expense",   38,   "Food",          "2026-01-26", "Dinner out with colleagues"),
  tx("expense",   92,   "Food",          "2026-01-28", "Weekly groceries"),
  tx("expense",   35,   "Other",         "2026-01-29", "Dry cleaning"),
  tx("expense",   22,   "Travel",        "2026-01-30", "Parking fees"),

  // ─── FEBRUARY 2026 ─────────────────────────────────────────────────────────

  // Income
  tx("income", 8500, "Salary",      "2026-02-01", "February salary"),
  tx("income",  350, "Investments", "2026-02-14", "Quarterly stock dividend payout"),
  tx("income",  750, "Freelance",   "2026-02-20", "Mobile app UI design project"),

  // Expenses
  tx("expense", 1800,   "Rent",          "2026-02-01", "February rent"),
  tx("expense",   90,   "Utilities",     "2026-02-02", "Electricity bill"),
  tx("expense",   15.99,"Subscriptions", "2026-02-03", "Netflix"),
  tx("expense",    9.99,"Subscriptions", "2026-02-03", "Spotify"),
  tx("expense",   14.99,"Subscriptions", "2026-02-03", "iCloud storage"),
  tx("expense",   45,   "Travel",        "2026-02-05", "Monthly transit pass"),
  tx("expense",   90,   "Food",          "2026-02-05", "Weekly groceries – Whole Foods"),
  tx("expense",  145,   "Shopping",      "2026-02-08", "Valentine's Day gifts"),
  tx("expense",   35,   "Food",          "2026-02-10", "Lunch out"),
  tx("expense",   55,   "Utilities",     "2026-02-11", "Internet bill"),
  tx("expense",   82,   "Food",          "2026-02-12", "Weekly groceries"),
  tx("expense",  285,   "Entertainment", "2026-02-14", "Valentine's dinner & experience"),
  tx("expense", 1500,   "Savings",       "2026-02-15", "Monthly savings transfer"),
  tx("expense",  180,   "Travel",        "2026-02-16", "Weekend road trip – petrol & tolls"),
  tx("expense",   65,   "Shopping",      "2026-02-18", "Spring clothing – sale items"),
  tx("expense",   44,   "Food",          "2026-02-19", "Brunch with friends"),
  tx("expense",   88,   "Food",          "2026-02-20", "Weekly groceries"),
  tx("expense",   40,   "Healthcare",    "2026-02-22", "Dentist co-pay"),
  tx("expense",   55,   "Entertainment", "2026-02-23", "NBA game tickets"),
  tx("expense",   90,   "Food",          "2026-02-25", "Weekly groceries"),
  tx("expense",   32,   "Travel",        "2026-02-27", "Uber rides – week"),
  tx("expense",   36,   "Food",          "2026-02-28", "Dinner out"),
  tx("expense",   48,   "Other",         "2026-02-26", "Parking + miscellaneous"),

  // ─── MARCH 2026 ────────────────────────────────────────────────────────────

  // Income
  tx("income", 8500,  "Salary",      "2026-03-01", "March salary"),
  tx("income",  600,  "Freelance",   "2026-03-18", "Dashboard redesign contract"),

  // Expenses
  tx("expense", 1800,   "Rent",          "2026-03-01", "March rent"),
  tx("expense",   88,   "Utilities",     "2026-03-02", "Electricity bill"),
  tx("expense",   15.99,"Subscriptions", "2026-03-03", "Netflix"),
  tx("expense",    9.99,"Subscriptions", "2026-03-03", "Spotify"),
  tx("expense",   14.99,"Subscriptions", "2026-03-03", "iCloud storage"),
  tx("expense",   45,   "Travel",        "2026-03-04", "Monthly transit pass"),
  tx("expense",   82,   "Food",          "2026-03-05", "Weekly groceries – Whole Foods"),
  tx("expense",   55,   "Utilities",     "2026-03-06", "Internet bill"),
  tx("expense",   34,   "Food",          "2026-03-09", "Lunch out"),
  tx("expense",   86,   "Food",          "2026-03-10", "Weekly groceries"),
  tx("expense",   75,   "Healthcare",    "2026-03-11", "Annual physical co-pay"),
  tx("expense",   95,   "Shopping",      "2026-03-13", "Spring wardrobe refresh"),
  tx("expense", 1500,   "Savings",       "2026-03-15", "Monthly savings transfer"),
  tx("expense",   90,   "Food",          "2026-03-16", "Weekly groceries"),
  tx("expense",   48,   "Travel",        "2026-03-17", "St. Patrick's Day bar tab + Uber"),
  tx("expense",   62,   "Entertainment", "2026-03-20", "Comedy show tickets"),
  tx("expense",   88,   "Food",          "2026-03-21", "Weekly groceries"),
  tx("expense",  220,   "Travel",        "2026-03-22", "Weekend trip – hotel + gas"),
  tx("expense",   36,   "Food",          "2026-03-24", "Brunch with friends"),
  tx("expense",   44,   "Shopping",      "2026-03-26", "Home plants + spring décor"),
  tx("expense",   90,   "Food",          "2026-03-27", "Weekly groceries"),
  tx("expense",   28,   "Travel",        "2026-03-28", "Uber rides – week"),
  tx("expense",   40,   "Entertainment", "2026-03-29", "Board game night + snacks"),
  tx("expense",   32,   "Other",         "2026-03-30", "Dry cleaning"),
];
