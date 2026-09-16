const express = require('express');
const { sendMonthlyReportEmail } = require('../mailer');
const db = require('../db');

function createReportRouter({ devices }) {
  const router = express.Router();

  const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  // Helper para clasificar categorías normalizadas
  function normalizeCategory(cat, appName = '', pkg = '') {
    const c = (cat || '').toLowerCase();
    const n = (appName || '').toLowerCase();
    const p = (pkg || '').toLowerCase();

    if (c.includes('sistema') || p.startsWith('com.android') || p.startsWith('com.google.android')) return 'Sistema';
    if (c.includes('juego') || c.includes('game') || n.includes('roblox') || n.includes('brawl')) return 'Juegos';
    if (c.includes('social') || c.includes('red') || n.includes('instagram') || n.includes('facebook') || n.includes('twitter')) return 'Redes Sociales';
    if (c.includes('video') || c.includes('entreten') || n.includes('youtube') || n.includes('tiktok') || n.includes('netflix') || n.includes('twitch')) return 'Videos';
    if (c.includes('navega') || c.includes('web') || n.includes('chrome') || n.includes('browser')) return 'Navegación Web';
    if (c.includes('educa') || c.includes('aprende') || n.includes('duolingo') || n.includes('classroom')) return 'Educación';
    if (c.includes('comunica') || c.includes('chat') || c.includes('mensaj') || n.includes('whatsapp') || n.includes('telegram')) return 'Comunicación';
    return 'Utilidades';
  }

  // Generador de datos agregados del informe mensual
  function buildMonthlyReportData(device, year, month) {
    const monthIndex = parseInt(month, 10) - 1; // 0-based
    const monthName = MONTH_NAMES[monthIndex] || 'Mes';
    const monthPad = String(month).padStart(2, '0');
    const monthPrefix = `${year}-${monthPad}`;

    const now = new Date();
    const isCurrentMonth = (now.getFullYear() === parseInt(year, 10) && (now.getMonth() + 1) === parseInt(month, 10));

    // Consolidar minutos por aplicación a lo largo del mes
    const appAggregates = new Map();

    // 1. Datos históricos diarios si existen en dailyAppUsage
    if (device.dailyAppUsage) {
      Object.keys(device.dailyAppUsage).forEach(dateStr => {
        if (dateStr.startsWith(monthPrefix)) {
          const dayApps = device.dailyAppUsage[dateStr] || [];
          dayApps.forEach(item => {
            const key = item.package || item.name;
            const existing = appAggregates.get(key) || {
              name: item.name,
              package: item.package,
              icon: item.icon || '📱',
              category: item.category || 'Utilidades',
              totalMinutes: 0,
              daysActive: 0
            };
            existing.totalMinutes += (item.timeTodayMinutes || item.timeMinutes || 0);
            if ((item.timeTodayMinutes || item.timeMinutes || 0) > 0) {
              existing.daysActive += 1;
            }
            appAggregates.set(key, existing);
          });
        }
      });
    }

    // 2. Si es el mes actual, sumamos o incorporamos las apps del catálogo activo
    if (isCurrentMonth && device.appCatalog && device.appCatalog.length > 0) {
      device.appCatalog.forEach(app => {
        const key = app.package;
        const currentMins = app.timeTodayMinutes || 0;
        const existing = appAggregates.get(key);
        if (existing) {
          existing.totalMinutes += currentMins;
        } else if (currentMins > 0 || app.isBlocked) {
          appAggregates.set(key, {
            name: app.name,
            package: app.package,
            icon: app.icon || '📱',
            category: app.category || 'Utilidades',
            totalMinutes: currentMins,
            daysActive: currentMins > 0 ? 1 : 0
          });
        }
      });
    }

    // Si aún no hay suficiente historial acumulado, calculamos proyecciones basadas en uso actual
    if (appAggregates.size === 0 && device.appCatalog) {
      device.appCatalog.forEach(app => {
        const mins = (app.timeTodayMinutes || 0);
        if (mins > 0) {
          appAggregates.set(app.package, {
            name: app.name,
            package: app.package,
            icon: app.icon || '📱',
            category: app.category || 'Utilidades',
            totalMinutes: mins,
            daysActive: 1
          });
        }
      });
    }

    // Lista consolidada de aplicaciones
    const appsList = Array.from(appAggregates.values());
    appsList.sort((a, b) => b.totalMinutes - a.totalMinutes);

    // Totales y cálculos
    const totalMinutes = appsList.reduce((sum, a) => sum + a.totalMinutes, 0);
    const activeDaysSet = new Set();
    if (device.dailyAppUsage) {
      Object.keys(device.dailyAppUsage).forEach(d => {
        if (d.startsWith(monthPrefix)) activeDaysSet.add(d);
      });
    }
    if (isCurrentMonth && (device.screenTimeTodayMinutes || 0) > 0) {
      activeDaysSet.add(now.toISOString().split('T')[0]);
    }
    const activeDays = Math.max(1, activeDaysSet.size || (totalMinutes > 0 ? 1 : 0));
    const dailyAverageMinutes = Math.round(totalMinutes / (activeDays || 1));

    // Desglose por categorías
    const categoryTotals = {
      'Juegos': 0,
      'Redes Sociales': 0,
      'Videos': 0,
      'Navegación Web': 0,
      'Educación': 0,
      'Comunicación': 0,
      'Utilidades': 0,
      'Sistema': 0
    };

    appsList.forEach(app => {
      const canonical = normalizeCategory(app.category, app.name, app.package);
      categoryTotals[canonical] = (categoryTotals[canonical] || 0) + app.totalMinutes;
    });

    const categoryBreakdown = Object.keys(categoryTotals).map(catName => {
      const mins = categoryTotals[catName];
      const percentage = totalMinutes > 0 ? Math.round((mins / totalMinutes) * 100) : 0;
      return {
        category: catName,
        minutes: mins,
        percentage
      };
    }).sort((a, b) => b.minutes - a.minutes);

    // Top 5 Aplicaciones
    const topApps = appsList.slice(0, 5).map(app => ({
      name: app.name,
      package: app.package,
      icon: app.icon,
      category: normalizeCategory(app.category, app.name, app.package),
      minutes: app.totalMinutes,
      percentage: totalMinutes > 0 ? Math.round((app.totalMinutes / totalMinutes) * 100) : 0
    }));

    // Eventos de seguridad del mes
    const securityAlerts = [];
    if (device.activityLog && Array.isArray(device.activityLog)) {
      device.activityLog.forEach(log => {
        const logTime = log.timestamp ? new Date(log.timestamp) : null;
        if (logTime && logTime.getFullYear() === parseInt(year, 10) && (logTime.getMonth() + 1) === parseInt(month, 10)) {
          if (log.type === 'alert' || log.type === 'warning' || (log.message && (log.message.includes('Bloqueo') || log.message.includes('peligro') || log.message.includes('límite') || log.message.includes('geocerca')))) {
            securityAlerts.push({
              time: log.time || logTime.toLocaleTimeString(),
              date: logTime.toISOString().split('T')[0],
              message: log.message,
              type: log.type || 'warning'
            });
          }
        }
      });
    }

    // Diagnósticos y recomendaciones automáticas para padres
    const insights = [];
    if (dailyAverageMinutes > 180) {
      insights.push('⚠️ El tiempo promedio diario supera las 3 horas. Recomendamos activar horarios de descanso y límites estrictos.');
    } else if (dailyAverageMinutes > 0 && dailyAverageMinutes <= 120) {
      insights.push('✅ Excelente equilibrio: el promedio de uso diario se mantiene dentro de los límites saludables recomendados.');
    } else if (totalMinutes === 0) {
      insights.push('ℹ️ No se registraron actividades significativas en este dispositivo durante el mes seleccionado.');
    }

    const gamesOrSocialPct = (categoryTotals['Juegos'] + categoryTotals['Redes Sociales'] + categoryTotals['Videos']);
    const funPct = totalMinutes > 0 ? Math.round((gamesOrSocialPct / totalMinutes) * 100) : 0;
    if (funPct > 65) {
      insights.push(`📱 El ${funPct}% del tiempo se concentró en ocio (Juegos, Videos y Redes). Considera incentivar aplicaciones de Educación.`);
    }

    if (categoryTotals['Educación'] > 60) {
      insights.push('🎓 Buen aprovechamiento: se registraron más de 60 minutos de aplicaciones educativas este mes.');
    }

    return {
      deviceId: device.id,
      childName: device.childName || 'Hijo',
      avatar: device.avatar || '👦',
      deviceModel: device.model || 'Dispositivo Móvil',
      serialNumber: device.serialNumber || 'S/N: KS-PHONE-01',
      month: parseInt(month, 10),
      monthName,
      year: parseInt(year, 10),
      periodLabel: `${monthName} ${year}`,
      totalMinutes,
      totalHoursFormatted: `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`,
      activeDays,
      dailyAverageMinutes,
      dailyAverageFormatted: `${Math.floor(dailyAverageMinutes / 60)}h ${dailyAverageMinutes % 60}m`,
      categoryBreakdown,
      topApps,
      securityAlertsCount: securityAlerts.length,
      securityAlerts: securityAlerts.slice(0, 10),
      insights
    };
  }

  // 1. GET /api/reports/monthly
  router.get('/monthly', (req, res) => {
    const { deviceId, year, month } = req.query;

    if (!deviceId) {
      return res.status(400).json({ error: 'Se requiere el parámetro deviceId' });
    }

    const device = devices[deviceId];
    if (!device) {
      return res.status(404).json({ error: 'Dispositivo no encontrado' });
    }

    const now = new Date();
    const reportYear = parseInt(year, 10) || now.getFullYear();
    const reportMonth = parseInt(month, 10) || (now.getMonth() + 1);

    const report = buildMonthlyReportData(device, reportYear, reportMonth);
    return res.json(report);
  });

  // 2. POST /api/reports/monthly/send-email
  router.post('/monthly/send-email', async (req, res) => {
    try {
      const { deviceId, year, month, recipientEmail } = req.body;

      if (!deviceId) {
        return res.status(400).json({ error: 'Falta el parámetro deviceId' });
      }

      const device = devices[deviceId];
      if (!device) {
        return res.status(404).json({ error: 'Dispositivo no encontrado' });
      }

      const now = new Date();
      const reportYear = parseInt(year, 10) || now.getFullYear();
      const reportMonth = parseInt(month, 10) || (now.getMonth() + 1);

      const reportData = buildMonthlyReportData(device, reportYear, reportMonth);

      // Determinar correo destinatario
      const targetEmail = recipientEmail || process.env.SMTP_TO || 'padres@kidsshield.local';

      const emailResult = await sendMonthlyReportEmail({
        toEmail: targetEmail,
        parentName: 'Familia',
        childName: reportData.childName,
        monthName: reportData.monthName,
        year: reportData.year,
        reportData
      });

      return res.json({
        success: true,
        message: `Informe mensual de ${reportData.monthName} enviado correctamente a ${targetEmail}`,
        sentTo: targetEmail,
        previewUrl: emailResult.previewUrl,
        messageId: emailResult.messageId
      });
    } catch (err) {
      console.error('[Reports] Error al enviar informe por correo:', err);
      return res.status(500).json({
        error: 'No se pudo enviar el informe por correo electrónico',
        details: err.message
      });
    }
  });

  return router;
}

module.exports = createReportRouter;
