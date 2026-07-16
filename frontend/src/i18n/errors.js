export function translateError(err, t) {
  if (!err || !err.message) return '';
  const msg = err.message;

  const dynamicPatterns = [
    {
      regex: /^Upgrade cooldown active\. Try again in (\d+) hour/,
      key: 'errors.upgradeCooldown',
      params: (m) => ({ hours: m[1] }),
    },
    {
      regex: /^Land too small\. Minimum size required: ([\d,]+) sq ft$/,
      key: 'errors.landTooSmall',
      params: (m) => ({ size: m[1] }),
    },
    {
      regex: /^Insufficient funds\. Required: \$([\d,]+), Balance: \$([\d,]+)$/,
      key: 'errors.insufficientFundsDev',
      params: (m) => ({ required: m[1], balance: m[2] }),
    },
    {
      regex: /^Insufficient funds\. Required: \$([\d,]+)$/,
      key: 'errors.insufficientFundsSimple',
      params: (m) => ({ required: m[1] }),
    },
    {
      regex: /^Minimum offer is \$([\d,]+) \(70% of market value\)$/,
      key: 'errors.minimumOffer',
      params: (m) => ({ amount: m[1] }),
    },
    {
      regex: /^Minimum counter offer is \$([\d,]+)$/,
      key: 'errors.minimumCounterOffer',
      params: (m) => ({ amount: m[1] }),
    },
    { regex: /^Offer is already (.+)$/, key: 'errors.offerAlready', params: (m) => ({ status: m[1] }) },
    {
      regex: /^Maximum loan amount is 70% of net worth \(\$([\d,]+)\)\. Your net worth: \$([\d,]+)$/,
      key: 'errors.maxLoanAmount',
      params: (m) => ({ maxLoan: m[1], netWorth: m[2] }),
    },
    {
      regex: /^City ownership limit reached\. You can own at most (\d+) properties in (.+)$/,
      key: 'errors.cityOwnershipLimit',
      params: (m) => ({ maxAllowed: m[1], cityName: m[2] }),
    },
  ];

  for (const pattern of dynamicPatterns) {
    const match = msg.match(pattern.regex);
    if (match) {
      return t(pattern.key, pattern.params(match));
    }
  }

  const translation = t(`errors.${msg}`, { defaultValue: null });
  if (translation && translation !== msg) {
    return translation;
  }
  return msg;
}
