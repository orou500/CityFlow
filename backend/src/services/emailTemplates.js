const BRAND = {
  name: 'CityFlow',
  primaryColor: '#1E90FF',
  secondaryColor: '#0057B8',
  accentColor: '#FFA500',
  bgColor: '#f8fafc',
  textColor: '#1e293b',
  mutedColor: '#64748b',
  url: 'https://cityflow.sizops.co.il',
};

function baseLayout(title, content) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bgColor};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${BRAND.textColor};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.bgColor};padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND.primaryColor},${BRAND.secondaryColor});padding:32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;">${BRAND.name}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f1f5f9;padding:24px 32px;text-align:center;">
              <p style="margin:0 0 8px;font-size:12px;color:${BRAND.mutedColor};">
                ${BRAND.name} &mdash; Real Estate Simulation Game
              </p>
              <p style="margin:0;font-size:12px;color:${BRAND.mutedColor};">
                <a href="${BRAND.url}" style="color:${BRAND.primaryColor};text-decoration:none;">${BRAND.url}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(href, label) {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
  <tr>
    <td style="background-color:${BRAND.primaryColor};border-radius:8px;">
      <a href="${href}" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;">
        ${label}
      </a>
    </td>
  </tr>
</table>`;
}

export function passwordReset({ username, resetUrl }) {
  const content = `
<h2 style="margin:0 0 8px;font-size:22px;color:${BRAND.textColor};">Password Reset</h2>
<p style="margin:0 0 16px;color:${BRAND.mutedColor};font-size:15px;">Hi ${username},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
  We received a request to reset your password. Click the button below to set a new one.
  This link expires in <strong>1 hour</strong>.
</p>
${button(resetUrl, 'Reset Password')}
<p style="margin:16px 0 0;font-size:13px;color:${BRAND.mutedColor};line-height:1.5;">
  If you didn't request this, you can safely ignore this email. Your password will not change.
</p>`;

  return {
    subject: `Reset your ${BRAND.name} password`,
    html: baseLayout('Password Reset', content),
    text: `Hi ${username},\n\nReset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
  };
}

export function verification({ username, verifyUrl }) {
  const content = `
<h2 style="margin:0 0 8px;font-size:22px;color:${BRAND.textColor};">Verify your email</h2>
<p style="margin:0 0 16px;color:${BRAND.mutedColor};font-size:15px;">Hi ${username},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
  Thanks for signing up for ${BRAND.name}! Please verify your email address to get started.
</p>
${button(verifyUrl, 'Verify Email')}
<p style="margin:16px 0 0;font-size:13px;color:${BRAND.mutedColor};line-height:1.5;">
  This link expires in <strong>24 hours</strong>. If you didn't create an account, ignore this email.
</p>`;

  return {
    subject: `Verify your ${BRAND.name} email`,
    html: baseLayout('Verify Your Email', content),
    text: `Hi ${username},\n\nVerify your email: ${verifyUrl}\n\nThis link expires in 24 hours.`,
  };
}

export function accountActivated({ username }) {
  const content = `
<h2 style="margin:0 0 8px;font-size:22px;color:${BRAND.textColor};">Welcome to ${BRAND.name}!</h2>
<p style="margin:0 0 16px;color:${BRAND.mutedColor};font-size:15px;">Hi ${username},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
  Your account has been verified and activated. You're ready to start building your real estate empire!
</p>
${button(BRAND.url, 'Start Playing')}
<p style="margin:16px 0 0;font-size:13px;color:${BRAND.mutedColor};line-height:1.5;">
  Here are some tips to get started:
</p>
<ul style="font-size:14px;line-height:1.8;color:${BRAND.mutedColor};margin:8px 0;padding-left:24px;">
  <li>Browse the Marketplace for your first property</li>
  <li>Check the Dashboard for your portfolio overview</li>
  <li>Visit the Bank for investment loans</li>
  <li>Watch market trends in the Map view</li>
</ul>`;

  return {
    subject: `Welcome to ${BRAND.name}!`,
    html: baseLayout('Welcome to CityFlow', content),
    text: `Hi ${username},\n\nYour account is verified! Start playing: ${BRAND.url}`,
  };
}

export function systemNotification({ username, title, message }) {
  const content = `
<h2 style="margin:0 0 8px;font-size:22px;color:${BRAND.textColor};">${title}</h2>
<p style="margin:0 0 16px;color:${BRAND.mutedColor};font-size:15px;">Hi ${username || 'there'},</p>
<div style="background-color:#f8fafc;border-left:4px solid ${BRAND.primaryColor};padding:16px;margin:16px 0;border-radius:0 8px 8px 0;">
  <p style="margin:0;font-size:15px;line-height:1.6;">${message}</p>
</div>
${button(BRAND.url, 'View Details')}`;

  return {
    subject: `${BRAND.name}: ${title}`,
    html: baseLayout(title, content),
    text: `${title}\n\nHi ${username || 'there'},\n\n${message}\n\n${BRAND.url}`,
  };
}

export function friendRequest({ username, fromUsername }) {
  const content = `
<h2 style="margin:0 0 8px;font-size:22px;color:${BRAND.textColor};">New Friend Request</h2>
<p style="margin:0 0 16px;color:${BRAND.mutedColor};font-size:15px;">Hi ${username},</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
  <strong>${fromUsername}</strong> wants to connect with you on ${BRAND.name}!
</p>
${button(BRAND.url, 'View Request')}`;

  return {
    subject: `${fromUsername} wants to be your friend on ${BRAND.name}`,
    html: baseLayout('Friend Request', content),
    text: `Hi ${username},\n\n${fromUsername} wants to connect with you on ${BRAND.name}!\n\n${BRAND.url}`,
  };
}

export function adminAlert({ title, message }) {
  const content = `
<h2 style="margin:0 0 8px;font-size:22px;color:#dc2626;">${title}</h2>
<div style="background-color:#fef2f2;border-left:4px solid #dc2626;padding:16px;margin:16px 0;border-radius:0 8px 8px 0;">
  <p style="margin:0;font-size:15px;line-height:1.6;">${message}</p>
</div>
<p style="margin:16px 0 0;font-size:13px;color:${BRAND.mutedColor};line-height:1.5;">
  This is an automated admin alert from ${BRAND.name}.
</p>`;

  return {
    subject: `[Admin] ${title}`,
    html: baseLayout(`Admin: ${title}`, content),
    text: `[Admin] ${title}\n\n${message}`,
  };
}

export function testEmail({ timestamp }) {
  const content = `
<h2 style="margin:0 0 8px;font-size:22px;color:${BRAND.textColor};">SMTP Test Email</h2>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
  This is a test email from ${BRAND.name} to verify your SMTP configuration is working correctly.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;border-radius:8px;margin:16px 0;">
  <tr>
    <td style="padding:16px;">
      <p style="margin:0 0 8px;font-size:14px;"><strong>Status:</strong> <span style="color:#16a34a;">Operational</span></p>
      <p style="margin:0 0 8px;font-size:14px;"><strong>Provider:</strong> Brevo SMTP</p>
      <p style="margin:0 0 8px;font-size:14px;"><strong>Domain:</strong> sizops.co.il</p>
      <p style="margin:0;font-size:14px;"><strong>Sent at:</strong> ${timestamp}</p>
    </td>
  </tr>
</table>`;

  return {
    subject: `[Test] ${BRAND.name} SMTP Test`,
    html: baseLayout('SMTP Test', content),
    text: `SMTP Test Email from ${BRAND.name}\nSent at: ${timestamp}\nStatus: Operational`,
  };
}

export default {
  passwordReset,
  verification,
  accountActivated,
  systemNotification,
  friendRequest,
  adminAlert,
  testEmail,
};
