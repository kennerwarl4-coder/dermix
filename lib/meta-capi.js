// Envia eventos server-side pra Meta Conversions API (CAPI).
// Usado pelo webhook do Pix pra garantir que o Purchase seja contado mesmo se o
// cliente nunca voltar pra ver a pagina de obrigado (o Pixel do navegador nao
// teria como disparar sozinho nesse caso).
//
// Configurar na Vercel: Project Settings > Environment Variables
//   META_PIXEL_ID = 1430862615843602 (o mesmo ID que ja esta no Pixel do site)
//   META_CAPI_ACCESS_TOKEN = <token gerado em Events Manager > Conversions API>

import { createHash } from 'crypto';

function sha256(value) {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function normalizePhone(phone) {
  var digits = (phone || '').replace(/\D/g, '');
  if (digits.length <= 11) digits = '55' + digits; // assume BR se nao tiver DDI
  return digits;
}

export async function sendPurchaseEvent(opts) {
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    return { skipped: true, reason: 'META_PIXEL_ID/META_CAPI_ACCESS_TOKEN nao configurados.' };
  }

  const userData = {};
  if (opts.email) userData.em = [sha256(opts.email)];
  if (opts.phone) userData.ph = [sha256(normalizePhone(opts.phone))];
  if (opts.clientIp) userData.client_ip_address = opts.clientIp;
  if (opts.userAgent) userData.client_user_agent = opts.userAgent;
  if (opts.fbp) userData.fbp = opts.fbp;
  if (opts.fbc) userData.fbc = opts.fbc;

  const body = {
    data: [
      {
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: opts.eventId,
        action_source: 'website',
        event_source_url: opts.sourceUrl || undefined,
        user_data: userData,
        custom_data: {
          currency: 'BRL',
          value: opts.value,
          content_ids: ['kit-dermix-antiacne'],
          content_type: 'product',
        },
      },
    ],
  };

  const res = await fetch(
    'https://graph.facebook.com/v19.0/' + pixelId + '/events?access_token=' + encodeURIComponent(accessToken),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  const data = await res.json();
  return { ok: res.ok, data: data };
}
