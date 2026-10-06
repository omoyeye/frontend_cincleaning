import type { BankAccountDetail } from '../../types';

/** Same fallback list as the client invoice when no active bank rows are configured. */
const FALLBACK_BANK_DETAILS: BankAccountDetail[] = [
    {
        id: 'default-bank-1',
        accountName: 'Surpluslink & co LTD',
        accountNumber: '27847158',
        sortCode: '04-06-05',
        bankName: '',
        notes: '',
        active: true,
    },
];

/** Active rows from settings, or invoice fallback — matches `InvoiceView` payout section. */
export function getPayoutBankDetailsForInvoice(bankDetails: BankAccountDetail[] | undefined): BankAccountDetail[] {
    const active = (bankDetails || []).filter((b) => b.active !== false);
    return active.length > 0 ? active : FALLBACK_BANK_DETAILS;
}

/** Plain text mirroring the invoice “Bank Transfer Details” cards (for paste / payment field). */
export function formatInvoiceBankDetailsPlainText(banks: BankAccountDetail[]): string {
    return banks
        .map((bank) => {
            const parts: string[] = [bank.accountName];
            if (bank.bankName?.trim()) parts.push(bank.bankName.trim());
            parts.push(`Account number: ${bank.accountNumber}`);
            parts.push(`Sort code: ${bank.sortCode}`);
            if (bank.notes?.trim()) parts.push(bank.notes.trim());
            return parts.join('\n');
        })
        .join('\n\n');
}
