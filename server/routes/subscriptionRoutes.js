const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const socketManager = require('../sockets/socketManager');

const router = express.Router();

const plansCatalog = [
  {
    id: 'free',
    name: 'Plan Gratuito (Starter)',
    priceClp: '$0 / mes',
    priceUsd: '$0 / mo',
    maxDevices: 1,
    features: [
      '1 Dispositivo infantil',
      'Monitoreo y bloqueo de apps',
      'Límite de tiempo global',
      'Historial de GPS (últimas 6h)',
      'Captura de pantalla (3 diarias)'
    ]
  },
  {
    id: 'pro',
    name: 'Familiar Pro ⚡',
    priceClp: '$4.990 CLP / mes',
    priceUsd: '$4.99 USD / mo',
    popular: true,
    maxDevices: 5,
    features: [
      'Hasta 5 Dispositivos infantiles',
      'Capturas de pantalla ilimitadas en vivo',
      'Clips de Video de 5s interactivos',
      'Historial GPS de 30 días con trazado continuo',
      'Límites individuales por app y Modo Noche',
      'Protección anti-desinstalación con PIN'
    ]
  },
  {
    id: 'family_total',
    name: 'Familia Total VIP 💎',
    priceClp: '$8.990 CLP / mes',
    priceUsd: '$8.99 USD / mo',
    maxDevices: 10,
    features: [
      'Hasta 10 Dispositivos (Móviles + Tablets)',
      'Todo lo de Familiar Pro',
      'Geocercas Inteligentes ilimitadas (Colegio/Casa)',
      'Detección de ciberacoso y palabras clave',
      'Reportes semanales en PDF al correo',
      'Soporte prioritario WhatsApp 24/7'
    ]
  }
];

// Obtener plan y suscripción de la familia autenticada
router.get('/', authenticateToken, async (req, res) => {
  const familyId = req.user.familyId;
  const sub = await db.getFamilySubscription(familyId);
  res.json({
    currentSubscription: sub,
    plans: plansCatalog
  });
});

// Cambiar plan de suscripción
router.post('/change-plan', authenticateToken, async (req, res) => {
  const { plan } = req.body;
  if (!['free', 'pro', 'family_total'].includes(plan)) {
    return res.status(400).json({ error: 'Plan no reconocido' });
  }

  const familyId = req.user.familyId;
  const updated = await db.updateSubscriptionPlan(familyId, plan);
  console.log(`[Subscription] 💳 Plan actualizado a "${plan}" para la familia ${familyId}`);

  socketManager.broadcastToFamily(familyId, 'SUBSCRIPTION_UPDATED', {
    familyId,
    plan: updated.plan,
    maxDevices: updated.maxDevices
  });

  res.json({ success: true, plan: updated.plan, maxDevices: updated.maxDevices });
});

// Obtener detalles de facturación y recibos
router.get('/billing', authenticateToken, async (req, res) => {
  const familyId = req.user.familyId;
  const sub = await db.getFamilySubscription(familyId);

  const invoices = [
    {
      id: `INV-2026-${familyId.slice(-4)}-01`,
      date: '11/09/2026',
      description: `Suscripción ${sub.plan === 'family_total' ? 'Familia Total VIP 💎' : sub.plan === 'pro' ? 'Familiar Pro ⚡' : 'Plan Básico (Starter)'}`,
      amount: sub.plan === 'family_total' ? '$8.990 CLP' : sub.plan === 'pro' ? '$4.990 CLP' : '$0 CLP',
      status: 'Pagado',
      paymentMethod: `${sub.cardBrand || 'Visa'} •••• ${sub.cardLast4 || '4242'}`
    },
    {
      id: `INV-2026-${familyId.slice(-4)}-02`,
      date: '11/08/2026',
      description: 'Suscripción Familiar Pro ⚡ (Período anterior)',
      amount: '$4.990 CLP',
      status: 'Pagado',
      paymentMethod: `${sub.cardBrand || 'Visa'} •••• ${sub.cardLast4 || '4242'}`
    }
  ];

  res.json({
    success: true,
    subscription: sub,
    paymentDetails: {
      cardLast4: sub.cardLast4 || '4242',
      cardBrand: sub.cardBrand || 'Visa',
      cardExp: sub.cardExp || '12/28',
      cardHolder: sub.cardHolder || req.user.name || 'Titular',
      autoRenew: sub.autoRenew !== false
    },
    invoices
  });
});

// Actualizar tarjeta de pago
router.post('/card', authenticateToken, async (req, res) => {
  const { cardNumber, cardExp, cardHolder } = req.body;
  if (!cardNumber || !cardExp) {
    return res.status(400).json({ error: 'Número de tarjeta y fecha de expiración son requeridos' });
  }

  const cleanNum = String(cardNumber).replace(/\s+/g, '');
  const last4 = cleanNum.slice(-4);
  let brand = 'Visa';
  if (cleanNum.startsWith('5') || cleanNum.startsWith('2')) brand = 'Mastercard';
  else if (cleanNum.startsWith('3')) brand = 'Amex';

  const familyId = req.user.familyId;
  const updated = await db.updateSubscriptionCard(familyId, {
    last4,
    brand,
    exp: cardExp,
    holder: cardHolder || req.user.name || 'Titular'
  });

  console.log(`[Subscription] 💳 Tarjeta bancaria actualizada (${brand} •••• ${last4}) para la familia ${familyId}`);
  socketManager.broadcastToFamily(familyId, 'PAYMENT_METHOD_UPDATED', { familyId, brand, last4, exp: cardExp });
  res.json({ success: true, ...updated });
});

// Alternar renovación automática
router.post('/auto-renew', authenticateToken, async (req, res) => {
  const { autoRenew } = req.body;
  const familyId = req.user.familyId;

  const result = await db.toggleAutoRenew(familyId, Boolean(autoRenew));
  console.log(`[Subscription] 🔄 Renovación automática ${autoRenew ? 'ACTIVADA' : 'PAUSADA'} para la familia ${familyId}`);
  socketManager.broadcastToFamily(familyId, 'AUTO_RENEW_UPDATED', { familyId, autoRenew: Boolean(autoRenew) });
  res.json({ success: true, autoRenew: result.autoRenew });
});

module.exports = router;
