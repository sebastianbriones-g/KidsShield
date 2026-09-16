const nodemailer = require('nodemailer');

let cachedTransporter = null;
let isTestAccount = false;

/**
 * Obtiene o inicializa el transportador de correo.
 * Si existen variables SMTP en process.env las utiliza,
 * de lo contrario crea una cuenta de prueba en Ethereal Email.
 */
async function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  if (host && user && pass) {
    console.log(`[Mailer] 📧 Configurando transportador SMTP real (${host}:${port})...`);
    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    });
    isTestAccount = false;
    return cachedTransporter;
  }

  // Fallback: Modo Desarrollo con cuenta de prueba Ethereal
  try {
    console.log('[Mailer] 🧪 No se detectó SMTP real en .env. Generando cuenta de pruebas en Ethereal Email...');
    const testAccount = await nodemailer.createTestAccount();
    cachedTransporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    isTestAccount = true;
    console.log(`[Mailer] ✅ Cuenta de pruebas Ethereal activa (${testAccount.user})`);
    return cachedTransporter;
  } catch (err) {
    console.warn('[Mailer] ⚠️ No se pudo conectar a Ethereal, usando transportador JSON simulado:', err.message);
    cachedTransporter = nodemailer.createTransport({
      jsonTransport: true
    });
    isTestAccount = true;
    return cachedTransporter;
  }
}

/**
 * Envía el correo electrónico con el enlace de recuperación de contraseña.
 * @param {Object} options
 * @param {string} options.toEmail Correo destinatario
 * @param {string} options.userName Nombre del padre/madre
 * @param {string} options.resetUrl Enlace completo para restablecer la contraseña
 */
async function sendPasswordResetEmail({ toEmail, userName = 'Padre/Madre', resetUrl }) {
  const transporter = await getTransporter();

  const fromSender = process.env.SMTP_FROM || '"KidsShield Seguridad Familiar" <soporte@kidsshield.local>';

  const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Restablecer Contraseña - KidsShield</title>
</head>
<body style="margin:0; padding:0; background-color:#0b0f19; font-family:'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#f1f5f9; -webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0b0f19; padding: 40px 15px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background: #111827; border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 18px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6); overflow: hidden;">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%); padding: 32px 30px; text-align: center; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
              <div style="display: inline-block; background: rgba(255, 255, 255, 0.12); padding: 12px; border-radius: 14px; margin-bottom: 12px; backdrop-filter: blur(8px);">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:block;">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <path d="M9 12l2 2 4-4"/>
                </svg>
              </div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">KidsShield</h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #c7d2fe; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600;">Control Parental y Protección Digital</p>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 32px; background-color: #111827;">
              <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #ffffff;">
                Recuperación de Contraseña 🔑
              </h2>

              <p style="margin: 0 0 18px 0; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                Hola <strong>${userName}</strong>,
              </p>

              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                Recibimos una solicitud para restablecer la contraseña de acceso a tu cuenta familiar en <strong>KidsShield</strong>. Para definir una nueva contraseña segura, haz clic en el siguiente botón:
              </p>

              <!-- CTA Button -->
              <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 30px auto; width: 100%;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 14px 34px; border-radius: 12px; box-shadow: 0 8px 20px rgba(99, 102, 241, 0.35); border: 1px solid rgba(255, 255, 255, 0.2);">
                      Restablecer mi Contraseña →
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiration Warning Box -->
              <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 12px; padding: 14px 18px; margin: 24px 0;">
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #fbbf24;">
                  ⏳ <strong>Importante:</strong> Este enlace tiene una validez de <strong>60 minutos</strong> por motivos de seguridad y solo puede utilizarse una vez.
                </p>
              </div>

              <!-- Raw Link Alternative -->
              <p style="margin: 24px 0 8px 0; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                Si el botón superior no funciona, copia y pega el siguiente enlace en tu navegador web:
              </p>
              <p style="margin: 0 0 24px 0; font-size: 12px; color: #818cf8; word-break: break-all; background: rgba(0,0,0,0.3); padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); font-family: monospace;">
                ${resetUrl}
              </p>

              <!-- Security Notice -->
              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #64748b; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 20px;">
                🛡️ <em>Si no solicitaste este cambio, puedes ignorar este correo de manera segura. Tu contraseña actual no ha sido modificada y tu cuenta familiar sigue protegida.</em>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #0d121f; padding: 22px 30px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.05);">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b;">
                © ${new Date().getFullYear()} KidsShield Parental Control. Todos los derechos reservados.
              </p>
              <p style="margin: 0; font-size: 11px; color: #475569;">
                Protegiendo a tu familia en el entorno digital con cifrado de alta seguridad.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const info = await transporter.sendMail({
    from: fromSender,
    to: toEmail,
    subject: '🔐 Restablece tu contraseña - KidsShield Control Parental',
    text: `Hola ${userName},\n\nPara restablecer tu contraseña de KidsShield, ingresa al siguiente enlace (válido por 60 minutos):\n\n${resetUrl}\n\nSi no solicitaste este cambio, puedes ignorar este mensaje.\n\nEquipo KidsShield`,
    html: htmlContent
  });

  const previewUrl = isTestAccount && nodemailer.getTestMessageUrl ? nodemailer.getTestMessageUrl(info) : null;

  console.log(`[Mailer] 📧 Correo de recuperación despachado hacia ${toEmail} (ID: ${info.messageId})`);
  if (previewUrl) {
    console.log(`[Mailer] 🔗 Vista previa web del correo (Ethereal): ${previewUrl}`);
  }
  console.log(`[Mailer] 🔑 Enlace directo: ${resetUrl}`);

  return {
    success: true,
    messageId: info.messageId,
    previewUrl,
    resetUrl
  };
}

/**
 * Envía el informe mensual de uso y bienestar digital por correo electrónico.
 * @param {Object} options
 * @param {string} options.toEmail Correo destinatario
 * @param {string} options.parentName Nombre del padre/madre
 * @param {string} options.childName Nombre del menor supervisado
 * @param {string} options.monthName Nombre del mes (ej: Septiembre)
 * @param {number} options.year Año (ej: 2026)
 * @param {Object} options.reportData Métricas completas del informe mensual
 */
async function sendMonthlyReportEmail({ toEmail, parentName = 'Familia', childName = 'Hijo', monthName = 'Mes', year = 2026, reportData }) {
  const transporter = await getTransporter();
  const fromSender = process.env.SMTP_FROM || '"KidsShield Seguridad Familiar" <informes@kidsshield.local>';

  const categoryRows = (reportData.categoryBreakdown || []).map(cat => `
    <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
      <td style="padding: 10px 8px; font-weight: 600; color: #f1f5f9; font-size: 13px;">${cat.category}</td>
      <td style="padding: 10px 8px; color: #94a3b8; font-size: 13px;">${Math.floor(cat.minutes / 60)}h ${cat.minutes % 60}m</td>
      <td style="padding: 10px 8px; width: 45%;">
        <div style="background: rgba(255,255,255,0.08); border-radius: 999px; height: 8px; overflow: hidden; position: relative;">
          <div style="background: linear-gradient(90deg, #6366f1, #8b5cf6); width: ${cat.percentage}%; height: 100%; border-radius: 999px;"></div>
        </div>
      </td>
      <td style="padding: 10px 8px; text-align: right; font-weight: 700; color: #a5b4fc; font-size: 12px;">${cat.percentage}%</td>
    </tr>
  `).join('');

  const topAppRows = (reportData.topApps || []).map((app, idx) => `
    <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
      <td style="padding: 10px 8px; font-size: 13px; color: #cbd5e1;">
        <span style="font-size: 16px; margin-right: 6px;">${app.icon || '📱'}</span>
        <strong>${app.name}</strong>
      </td>
      <td style="padding: 10px 8px; font-size: 12px; color: #94a3b8;">${app.category}</td>
      <td style="padding: 10px 8px; font-size: 13px; font-weight: 600; color: #f1f5f9;">${Math.floor(app.minutes / 60)}h ${app.minutes % 60}m</td>
      <td style="padding: 10px 8px; text-align: right; font-size: 12px; font-weight: 700; color: #38bdf8;">${app.percentage}%</td>
    </tr>
  `).join('');

  const insightList = (reportData.insights || []).map(ins => `
    <li style="margin-bottom: 8px; color: #e2e8f0; font-size: 13px; line-height: 1.5;">${ins}</li>
  `).join('');

  const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Informe Mensual KidsShield - ${childName}</title>
</head>
<body style="margin:0; padding:0; background-color:#0b0f19; font-family:'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color:#f1f5f9; -webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0b0f19; padding: 30px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 620px; background: #111827; border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 18px; box-shadow: 0 20px 40px rgba(0,0,0,0.7); overflow: hidden;">
          
          <!-- Banner Superior -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4338ca 100%); padding: 30px 24px; text-align: center; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
              <div style="display: inline-block; background: rgba(255, 255, 255, 0.15); padding: 10px 16px; border-radius: 12px; margin-bottom: 10px;">
                <span style="font-size: 26px;">🛡️</span>
              </div>
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">KidsShield • Informe Mensual</h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #c7d2fe; font-weight: 500;">
                Supervisión Digital de <strong>${childName}</strong> — <strong>${monthName} ${year}</strong>
              </p>
            </td>
          </tr>

          <!-- Resumen de Métricas (4 KPIs) -->
          <tr>
            <td style="padding: 24px 20px 10px 20px;">
              <table role="presentation" width="100%" border="0" cellspacing="6" cellpadding="0">
                <tr>
                  <td width="50%" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; text-align: center;">
                    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 4px;">⏱️ Tiempo Total</div>
                    <div style="font-size: 20px; font-weight: 800; color: #ffffff;">${reportData.totalHoursFormatted}</div>
                  </td>
                  <td width="50%" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; text-align: center;">
                    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 4px;">📊 Promedio Diario</div>
                    <div style="font-size: 20px; font-weight: 800; color: #60a5fa;">${reportData.dailyAverageFormatted}</div>
                  </td>
                </tr>
                <tr>
                  <td width="50%" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; text-align: center;">
                    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 4px;">📅 Días Supervisados</div>
                    <div style="font-size: 20px; font-weight: 800; color: #34d399;">${reportData.activeDays} días</div>
                  </td>
                  <td width="50%" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 14px; text-align: center;">
                    <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 4px;">🚨 Alertas Seguridad</div>
                    <div style="font-size: 20px; font-weight: 800; color: ${reportData.securityAlertsCount > 0 ? '#f87171' : '#10b981'};">${reportData.securityAlertsCount}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Desglose por Categorías -->
          <tr>
            <td style="padding: 14px 20px;">
              <h3 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 700; color: #ffffff; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px;">
                📂 Distribución por Categoría
              </h3>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                ${categoryRows || '<tr><td style="color:#94a3b8; padding:8px;">Sin registros en este mes.</td></tr>'}
              </table>
            </td>
          </tr>

          <!-- Top Aplicaciones Más Usadas -->
          <tr>
            <td style="padding: 14px 20px;">
              <h3 style="margin: 0 0 12px 0; font-size: 15px; font-weight: 700; color: #ffffff; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px;">
                🏆 Top Aplicaciones Más Utilizadas
              </h3>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                ${topAppRows || '<tr><td style="color:#94a3b8; padding:8px;">Sin aplicaciones usadas en este mes.</td></tr>'}
              </table>
            </td>
          </tr>

          <!-- Recomendaciones e Insights -->
          ${insightList ? `
          <tr>
            <td style="padding: 14px 20px;">
              <div style="background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 12px; padding: 16px;">
                <h4 style="margin: 0 0 10px 0; font-size: 14px; font-weight: 700; color: #a5b4fc;">
                  💡 Observaciones y Sugerencias de Protección
                </h4>
                <ul style="margin: 0; padding-left: 18px;">
                  ${insightList}
                </ul>
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- Footer -->
          <tr>
            <td style="background: #0d121f; padding: 20px 24px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.06);">
              <p style="margin: 0 0 4px 0; font-size: 12px; color: #64748b;">
                © ${year} KidsShield Parental Control. Reporte generado automáticamente para la familia.
              </p>
              <p style="margin: 0; font-size: 11px; color: #475569;">
                Dispositivo supervisado: ${reportData.deviceModel} (${reportData.serialNumber})
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const info = await transporter.sendMail({
    from: fromSender,
    to: toEmail,
    subject: `📑 Informe Mensual de ${childName} (${monthName} ${year}) - KidsShield`,
    text: `Informe mensual de KidsShield para ${childName} (${monthName} ${year}).\nTiempo total: ${reportData.totalHoursFormatted}\nPromedio diario: ${reportData.dailyAverageFormatted}\nRevisa el correo en formato HTML para ver gráficos y detalles.`,
    html: htmlContent
  });

  const previewUrl = isTestAccount && nodemailer.getTestMessageUrl ? nodemailer.getTestMessageUrl(info) : null;
  console.log(`[Mailer] 📑 Informe mensual despachado hacia ${toEmail} (ID: ${info.messageId})`);
  if (previewUrl) {
    console.log(`[Mailer] 🔗 Vista previa web del informe (Ethereal): ${previewUrl}`);
  }

  return {
    success: true,
    messageId: info.messageId,
    previewUrl
  };
}

module.exports = {
  sendPasswordResetEmail,
  sendMonthlyReportEmail,
  getTransporter
};

