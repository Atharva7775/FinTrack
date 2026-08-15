import { parseCsvTransactions } from './spreadsheet';

describe('parseCsvTransactions', () => {
  it('parses a simple CSV of expenses into pending transaction drafts', () => {
    const csv = ['date,description,amount', '2026-08-08,Lunch,24.50', '2026-08-08,Taxi,-18.00'].join('\n');

    const rows = parseCsvTransactions(csv);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      type: 'expense',
      amount: 24.5,
      note: 'Lunch',
      category: 'Food',
    });
    expect(rows[1]).toMatchObject({
      type: 'expense',
      amount: 18,
      note: 'Taxi',
      category: 'Travel',
    });
  });
});
