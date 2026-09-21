---
name: mobile-design
description: "Pautas y mejores prácticas para el diseño UX/UI de aplicaciones móviles (Material Design 3, microinteracciones, estados de sincronización, pantallas de protección parental y experiencia amigable para niños/padres)."
risk: low
source: workspace
date_added: "2026-09-21"
---

# Mobile UX/UI Design & Architecture Principles

## 1. Material You (Material Design 3) & Visual Hierarchy
- **Paleta y Contraste**: Uso de tonos semánticos oscuros refinados (#0F172A, #1E293B, #334155) combinados con acentos vibrantes (Indigo #6366F1, Esmeralda #10B981, Ámbar #F59E0B, Carmesí #EF4444).
- **Tipografía y Legibilidad**: Escala tipográfica definida con jerarquía clara (Headline 22-26sp, Subtitle 14-16sp, Body 13-14sp, Caption 11-12sp).
- **Radio de Esquinas y Elevación**: Superficies con bordes redondeados consistentes (16dp para tarjetas, 12dp para inputs y botones, 24dp para chips/píldoras).

## 2. Flujo de Vinculación y Onboarding (Zero-Friction Pairing)
- **Escaneo QR Rápido**: El método principal de emparejamiento debe ser el escaneo directo de la pantalla del panel de padres con la cámara (ZXing / CameraX).
- **Código Alternativo Inteligente**: Código numérico corto o selector de dispositivos de la familia si no hay cámara disponible.
- **Detección Automática de Red**: Detección de IP local (LAN/Wi-Fi) vs IP de Tailscale para evitar configurar URLs manuales engorrosas.
- **Sin Valores Caducos**: Nunca precargar IDs eliminados como `KID-PHONE-01`. Si no está vinculado, mostrar un estado de bienvenida claro "Escanea el código QR de tu panel".

## 3. Experiencia Dual: Modo Niño vs Modo Administrador Parental
- **Vista Principal del Niño (Protegido)**:
  - Gráfico o indicador visual claro del tiempo disponible restante del día.
  - Estado del escudo ("🛡️ KidsShield Activo - Tu dispositivo está protegido").
  - Botón de emergencia o solicitud de tiempo extra al padre.
  - Acceso a configuración técnica protegido estrictamente con PIN parental.
- **Asistente de Permisos Paso a Paso**:
  - Indicador de progreso (ej. "4 de 5 permisos activos").
  - Tarjetas interactivas con estados claros (Verde = Concedido, Rojo = Pendiente).
  - Explicación clara y comprensible del porqué de cada permiso (accesibilidad, superposición, batería).

## 4. Feedback Háptico y Visual de Conexión
- **Badges de Estado en Tiempo Real**:
  - 🟢 En línea y sincronizado (pulso de actividad o última sincronización hace Xs).
  - 🟡 Sincronizando o esperando red (cola offline activa).
  - 🔴 Desconectado del servidor (reintentando con backoff exponencial).
- **Micro-animaciones**: Transiciones suaves al conceder permisos y al iniciar el servicio de monitoreo en primer plano.
